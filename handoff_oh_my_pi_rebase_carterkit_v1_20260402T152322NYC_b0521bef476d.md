# Handoff: oh-my-pi rebase + CarterKit merge resolution

**Author:** Carter Schonwald  
**Date:** 2026-04-02 America/New_York  
**Repo:** `/Users/carter/local_dev/dynamic_science/oh-punkin-pi`  
**Branch:** `carter/bringin_home_punkinss`  
**HEAD:** `1d0d2dd83`

## Status

Rebase onto `origin/main` was completed successfully.

The previously conflicted files were reblended intentionally rather than resolved by taking one side wholesale.

## What changed

### 1. `packages/ai/src/types.ts`
Merged two orthogonal additions:
- upstream provider replay payload support (`OpenAIResponsesHistoryPayload`, `ProviderPayload`)
- Carter bracket identity support (`BracketId`)

Final state keeps both.

### 2. `packages/coding-agent/src/discovery/claude.ts`
Merged upstream loader growth with Carter behavioral-authority semantics.

Kept:
- MCP server `timeout` pass-through from Claude config
- hardened user prefs mode via `~/.agent/AGENT.md`
- suppression of project-local behavioral autoload when hardened mode is active
- loading `AGENT.md` as user-level context
- ancestor `.claude/skills` autoload when *not* in hardened mode

Interpretation:
- hardened mode on => user prefs are sole autoloaded behavioral authority
- hardened mode off => normal project/ancestor Claude skill discovery remains available

### 3. `packages/coding-agent/src/session/messages.ts`
Merged:
- upstream attribution + provider payload threading + OpenAI replay sanitization
- Carter role-boundary wrapping (`wrapUser`, `wrapSystem`) and turn-threading behavior

Final state keeps:
- message attribution defaults
- provider payload preservation where relevant
- `sanitizeRehydratedOpenAIResponsesAssistantMessage`
- user/system wrapping behavior for converted messages

### 4. `packages/coding-agent/src/tools/index.ts`
Resolved as a union merge.

Kept upstream tool surface, including:
- GitHub tool family
- `inspect_image`
- `search_tool_bm25`
- discoverable MCP search plumbing
- `SearchDb` / MCP discovery session hooks

Added Carter side:
- `open_squiggle`
- `close_squiggle`
- `./squiggle` exports

Rejected one accidental addition during conflict work:
- `FetchTool` integration was removed because `fetch.ts` in this tree does not export a tool class named `FetchTool`

### 5. Added CarterKit / role-boundary files
New files carried through the rebased commit include:
- `packages/ai/src/role-boundary.ts`
- `packages/coding-agent/src/core/carter_kit/index.ts`
- `packages/coding-agent/src/core/carter_kit/prompts/boot-sequence.md`
- `packages/coding-agent/src/core/carter_kit/prompts/ethos.md`
- `packages/coding-agent/src/core/carter_kit/prompts/handle-tools.md`
- `packages/coding-agent/src/core/carter_kit/prompts/hashes.toml`
- `packages/coding-agent/src/core/carter_kit/prompts/loader.ts`
- `packages/coding-agent/src/tools/squiggle.ts`
- legacy prompt archive files
- `past_AGENTS.md`

## Key semantic decisions

### Hardened user prefs mode
Adopted terminology:
- **hardened user prefs mode** rather than “lock mode”

Trigger:
- `~/.agent/AGENT.md` (case variants accepted)

Effect:
- suppress autoload of project-local behavioral sources:
  - context files
  - system prompts
  - skills
  - slash commands
  - hooks
  - custom tools
  - settings
  - extension modules

This preserves the user-level standing orders as the only autoloaded behavioral authority.

### Ancestor skill autoload
When *not* in hardened mode:
- ancestor `.claude/skills` directories are autoloaded from `cwd` upward to `repoRoot ?? home`

This preserves nested-project / monorepo convenience.

### Session rerooting (not yet implemented)
Important design thread identified during this session:
- session UX wants a distinction between execution cwd and discovery/lookup root
- “resume session here” should likely be modeled as session attachment state, not just `cd`

Proposed future split:
- `originCwd`
- `execCwd`
- `lookupRoot`

This was discussed but not implemented in this pass.

## Verification performed

### Merge verification
- rebase completed successfully
- branch now points at rebased commit `1d0d2dd83`
- repository state is clean except for this untracked handoff document

### Conflict-marker verification
Checked that the resolved files no longer contain git conflict markers.

### Install / typecheck verification
After the merge, the workspace install state was explicitly rehydrated with:
- `bun run install:dev`

Then the relevant TypeScript validation was rerun:
- `bun x tsc -p packages/ai/tsconfig.json --noEmit`
- `bun x tsc -p packages/coding-agent/tsconfig.json --noEmit`

Result:
- `packages/ai` typecheck passed
- `packages/coding-agent` typecheck passed

No direct diagnostics remained against the four resolved merge files after the final edits.

## Remaining follow-up work

### Immediate
1. inspect final diff for the rebased commit against `origin/main`
2. decide whether to split CarterKit changes into smaller commits
3. decide whether `past_AGENTS.md` belongs in-tree or should move elsewhere

### Near-term design / implementation
1. implement session reroot / attachment semantics
2. thread lookup-root separately from execution cwd through discovery
3. finish a more principled empty-response retry path
4. evaluate whether squiggle tools should remain explicit tools or become pure boundary rendering

### Cleanup
1. if broader confidence is desired, run repo-level checks (`bun run check`) now that install state has been rehydrated
2. inspect whether `bun run install:dev` changed any generated artifacts or links that should be committed or ignored
3. regenerate `Cargo.lock` / JS lockfiles only if subsequent package operations require it

## Migration target from `punkin-pi` into `oh-punkin-pi`

This section is the intended payload to carry over from `punkin-pi`, regardless of whether the implementation origin was Carter-direct, Noah-over-specs, or inherited host harness.

### 1. Turn boundary / bracket semantics
Wanted payload:
- first-class turn-boundary message types
- sigil / nonce identity
- open/close rendering in conversation history
- suppression of empty-turn boundary noise

Relevant `punkin-pi` surfaces:
- `packages/ai/src/turn-boundary-types.ts`
- `packages/coding-agent/src/core/carter_kit/turn-boundary.ts`
- `packages/coding-agent/src/core/messages.ts`
- `packages/coding-agent/src/core/agent-session.ts`

### 2. CarterKit handle / pushdown layer
Wanted payload:
- handle IDs and handle store
- result capture / materialization budgeting
- pushdown handle ops (`handle_lines`, `handle_grep`, etc.)
- CoT capture / replay
- tool interception seam around normal tools

Relevant `punkin-pi` surfaces:
- `packages/coding-agent/src/core/carter_kit/types.ts`
- `packages/coding-agent/src/core/carter_kit/store.ts`
- `packages/coding-agent/src/core/carter_kit/interceptor.ts`
- `packages/coding-agent/src/core/carter_kit/runtime.ts`
- `packages/coding-agent/src/core/carter_kit/session-hook.ts`
- `packages/coding-agent/src/core/agent-session.ts`

### 3. Carter prompt stack
Wanted payload:
- boot sequence
- ethos block
- handle-tools prompt fragment
- prompt hash/loader discipline
- Carter-specific prompt append path into the host harness

Relevant `punkin-pi` surfaces:
- `packages/coding-agent/src/core/carter_kit/prompts/boot-sequence.md`
- `packages/coding-agent/src/core/carter_kit/prompts/ethos.md`
- `packages/coding-agent/src/core/carter_kit/prompts/handle-tools.md`
- `packages/coding-agent/src/core/carter_kit/prompts/hashes.toml`
- `packages/coding-agent/src/core/carter_kit/prompts/loader.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/agent-session.ts`

### 4. More principled empty-response handling
Wanted payload:
- explicit empty-assistant-response detection
- retry budget / retry window / jitter
- optional include-empty-in-next-request behavior
- no ghost-turn persistence

Relevant `punkin-pi` surfaces:
- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/agent.ts`
- `packages/agent/src/types.ts`
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/src/core/sdk.ts`
- `packages/coding-agent/src/core/agent-session.ts`

### 5. Squiggle tools / visible reasoning plumbing
Wanted payload:
- explicit squiggle tool surface if kept as tools
- squiggle state / turn association
- possible future collapse into pure boundary rendering if tools prove too clunky

Relevant `punkin-pi` surfaces:
- `packages/coding-agent/src/core/carter_kit/squiggle-tools.ts`
- `packages/coding-agent/src/tools/squiggle.ts`
- `packages/coding-agent/src/core/messages.ts`
- `packages/coding-agent/src/core/carter_kit/session-hook.ts`

### 6. Session-root / reroot semantics (design target, not finished payload)
Wanted payload:
- resume-here / fork-here semantics
- separation of execution cwd vs lookup/discovery root
- session attachment state rather than plain cwd mutation

Relevant current discussion threads:
- discovery context (`LoadContext`)
- session metadata / picker / resume UX
- provider discovery loaders that currently assume cwd is both execution and lookup root

## Follow-up work surface area

### Session reroot / attachment semantics
Expected touch points:
- `packages/coding-agent/src/capability/types.ts` (`LoadContext` / discovery context shape)
- `packages/coding-agent/src/sdk.ts` (session creation + discovery wiring)
- session metadata / persistence layer (where session cwd/root affinity is stored)
- session picker / resume UX code paths
- discovery providers that currently assume `cwd` is both execution root and lookup root, especially:
  - `packages/coding-agent/src/discovery/claude.ts`
  - `packages/coding-agent/src/discovery/codex.ts`
  - `packages/coding-agent/src/discovery/builtin.ts`
  - other provider-specific discovery loaders as needed

### Hardened user prefs mode beyond Claude
Expected touch points:
- discovery providers that autoload behavioral sources from project directories
- capability loaders for skills, hooks, prompts, context files, settings, extension modules, and custom tools
- any shared helper that walks parent directories for project-level sources

### Empty-response retry / continuation hardening
Expected touch points:
- the agent loop / streaming runtime that currently owns retry behavior
- provider-specific response handling if empty-response bugs are transport-specific
- session/message persistence if ghost turns need suppression
- TUI / UI surfaces if retries should become visible state

### Squiggle / boundary evolution
Expected touch points:
- `packages/coding-agent/src/tools/squiggle.ts`
- `packages/coding-agent/src/session/messages.ts`
- `packages/ai/src/types.ts`
- any system-prompt or renderer code that decides whether squiggle is explicit-tool driven or pure boundary formatting

## Notes for next session

If resuming work here, the next profitable thread is probably:
1. session reroot / “resume here” semantics
2. then hardened user prefs mode plumbing into other discovery providers beyond Claude if needed
3. then a handoff of which CarterKit semantics should become first-class vs remain overlay behavior
