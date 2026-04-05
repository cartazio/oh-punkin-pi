# Handoff: CoT persistence + context meter fix + design threads

**Author:** Carter Schonwald
**Date:** 2026-04-03 America/New_York
**Repo:** `/Users/carter/local_dev/dynamic_science/oh-punkin-pi`
**Branch:** `carter/bringin_home_punkinss`
**HEAD at session start:** `de06ca031`

## Changes made this session

### 1. CoT-to-squiggle reification (`packages/coding-agent/src/session/messages.ts`)

**Problem:** Thinking blocks are opaque to the model. The API preserves them (signatures, replay) but the model cannot reference their content in subsequent turns. The model loses its own reasoning trace between turns.

**Solution:** New function `reifyThinkingAsSquiggle` in `convertToLlm`. For each non-empty `ThinkingContent` block in an assistant message, emits an additional `TextContent` block containing the thinking text wrapped in squiggle markers (using `openSquiggleBracket`/`closeSquiggleBracket` from `role-boundary.ts`). The original `ThinkingContent` block is preserved for API/signature correctness.

**Design decisions:**
- Text-wrapping approach, not synthetic tool-call/tool-result pairs (lighter, same information)
- Squiggle-wrapped text block emitted BEFORE the original thinking block in the content array
- Transform is unconditional (default enabled). Opt-out flag deferred -- would require threading a param through `convertToLlm`'s 6+ call sites
- Empty thinking blocks are skipped
- `RedactedThinkingContent` is not touched (no readable content to reify)

**Interaction with `transformMessages`:** Clean. The squiggle TextContent blocks are treated as normal text by the provider boundary. The original ThinkingContent blocks are handled by their own logic as before.

**Files changed:**
- `packages/coding-agent/src/session/messages.ts` (+37 lines, imports + helper + wire-up)

### 2. Context meter fix (`packages/ai/src/model-manager.ts`)

**Problem:** Status line shows `146.1%/200K` for Opus 4.6, which has a 1M context window. The context usage meter computes percentage against 200K, making it appear the session is over capacity when it's actually at ~29%.

**Root cause:** `preferDiscoveryLimit` (line 268) prefers dynamically discovered context window values over catalog values. If the Anthropic API model listing reports a stale 200K for `claude-opus-4-6`, the discovery layer overrides the correct catalog value of 1000000.

**Fix:** Changed `preferDiscoveryLimit` to return `Math.max(discoveryLimit, fallbackLimit)`. Context windows only grow; stale discovery metadata should never downgrade a known-correct catalog value. The existing special cases (invalid discovery, 4096 placeholder) are preserved.

**Files changed:**
- `packages/ai/src/model-manager.ts` (+3 lines, -1 line)

## Verification

- `bun x tsc -p packages/ai/tsconfig.json --noEmit` -- clean
- `bun x tsc -p packages/coding-agent/tsconfig.json --noEmit` -- clean
- `bun x biome check` on both changed files -- clean

## Design threads discussed (not implemented)

### Read coverage tracking
Instrument the tool pipeline to track which lines/ranges the model has read per file. On edit, compute coverage of the edited range against the read map and surface it in the tool result. The data is already available (every `read`, `grep`, `lsp`, `ast_grep` call passes through the tool system). Implementation surface: the CarterKit interceptor seam (handoff payload #2).

### Content-defined chunking for artifact/read tracking
Rolling hash (Rabin/gear fingerprint) to segment file content into stable chunks. Enables: edit-stable coverage tracking, dedup across overlapping reads, bridging the artifact wrapper boundary (tracking what was produced vs what was delivered to the model's context window). Foundation for aspirational attention-mass visibility.

### OMP system prompt imperativism vs principle-based ethos
The OMP base system prompt uses heavy RFC 2119 imperatives to prevent known LLM failure modes. Carter's ethos doc (63 lines) covers the same ground with principles. The imperatives earn their keep for "read before editing" / "no test suppression" but produce mechanical compliance where judgment would be better. The real fix is legibility (read coverage, attention mass) rather than prescription. Principles scale; imperatives don't.

### `wrapAssistant` echoing risk
The `wrapAssistant` function in `role-boundary.ts` is not yet wired into `convertToLlm`. The comment flags "echoing risk in multi-turn settings." If assistant content is replayed, it must go in a `system` message role, not `assistant`, or the model's self-model gets corrupted. The four codebooks map to content ORIGIN (provenance), not transport ROLE. These are orthogonal axes.

## Remaining follow-up from previous handoff (still open)

1. Turn boundary / bracket semantics (types, rendering, suppression) -- from punkin-pi
2. CarterKit handle / pushdown layer (handle store, interceptor, runtime, CoT capture)
3. Carter prompt stack (boot-seq, ethos, handle-tools, hash/loader)
4. Empty-response retry hardening
5. Session reroot / attachment semantics
6. Hardened user prefs beyond Claude discovery

## Notes for next session

Profitable next threads:
1. Read coverage tracker (high value, moderate effort, uses interceptor seam)
2. Wire `wrapAssistant` correctly as system-role injection
3. Test the CoT-to-squiggle reification in a live session -- does the model actually reference its prior reasoning?
4. Evaluate whether `preferDiscoveryLimit` change should also apply to `maxTokens` (same `Math.max` logic -- output limits also only grow)
