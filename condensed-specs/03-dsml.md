# 03: DSML — Tool Call Markup

## DeepSeek Single-Token Delimiters

```
<｜tool▁calls▁begin｜>  <｜tool▁call▁begin｜>  <｜tool▁sep｜>
<｜tool▁call▁end｜>    <｜tool▁calls▁end｜>
<｜tool▁outputs▁begin｜> <｜tool▁output▁begin｜>
<｜tool▁output▁end｜>  <｜tool▁outputs▁end｜>
```

- ~5-8 structural tokens/call vs ~15-30 for JSON/XML framing

## CarterKit Adoption

Adopt DeepSeek `<｜ ｜>` delimiter convention for tool call structure. Model emits only:
- **CoT** (free reasoning, persisted to store)
- **Tool calls** (DSML-framed)
- **Prose** (user-facing)

Model does NOT: annotate intent, assign handles, declare dependencies, emit typed blocks, avoid prose.

## Responsibility Split

### Harness (deterministic, post-hoc)
- **Handle assignment**: auto-assigns `§hN` to tool calls, no model participation
- **Dependency inference**: watches which handles model references in subsequent CoT → infers edges
- **Intent extraction**: reads persisted CoT before tool call as intent; cheap classifier extracts post-hoc
- **Projection inference**: from CoT ("need line 47") + tool call → inferred; or full result returned, materialization budget handles rest
- **Block typing**: classifies KG nodes from CoT + action patterns (decision detection, etc.), not model declarations

### Operator (via oracle panel)
- **Readable CoT**: raw model reasoning = intent metadata (more honest than structured annotations)
- **Handle browser**: all tool calls, results, handle assignments
- **Graph editor**: harness builds draft KG from CoT + tool patterns; operator corrects (merge/split nodes, fix edges)
- **Pin/edit/inject**: operator shapes context directly; sees dependencies, pins accordingly

## Output Format Summary

```
Harness adds:       Handle IDs, status tracking, CoT intent extraction,
                    dependency edges (inferred), block/node typing (classified)
Oracle panel shows: Context map + pressure, CoT browser, KG (harness-built,
                    operator-corrected), tool timeline (Gantt)
Compaction uses:    Handle lifecycle (consumed→evictable), inferred deps,
                    operator signals (pins/edits/attention), CoT tags
```

## Design Properties
- **Low model burden**: CoT + tool calls only (already trained behavior)
- **Mess-tolerant**: post-hoc analysis + operator correction → graph converges without fragile output contracts
- **Graceful degradation**: every failure mode (misclassified intent, missed dep edge, confused lifecycle) has operator recovery path

## One Model-Side Ask

System prompt: `Be concise. No filler. No "Sure!", "I'd be happy to", "Let me". State what you're doing and do it.`
Saves 20-40 tokens/turn. No new format.

## Open Questions
1. **CoT intent extraction quality** — cheap classifier accuracy for compaction decisions vs manual operator tagging
2. **Dependency inference accuracy** — false/missed edges from reference-watching heuristic; operator correction load
3. **When model-side structure pays off** — fine-tuned intent metadata as optimization on working harness-centric system, not prerequisite

## Cross-references
- Depends on: `01-store` (handle storage), `architecture-formal` (handle lifecycle, KG)
- Related: `handle-tools` (handle assignment), `oracle-panel` (operator UI), `chunking-knowledge-graph` (KG construction), `metacog-hooks` (CoT extraction), `compaction-invertibility` (eviction using deps/lifecycle)
