# Typed Output Blocks (Experimental)

**Author:** Carter Schonwald | **Date:** 2026-02-24 | **Status:** EXPERIMENTAL — deferred until graphical/topological context/memory is live
**Depends on:** DSML single-token delimiters (`03-dsml`), compaction engine (`compaction-invertibility`), oracle panel (`oracle-panel`)

## Status: Unprincipled Enumeration

- Block types mix speech acts (act, find, decide, ask), mechanism (tool, ref, margin), and temporality (note)
- Needs algebraic structure: product of orthogonal dimensions, not flat list
- Candidate: speech act × content type → lattice with proper meets/joins

## Single-Token Delimiters (à la DeepSeek)

```
XML: <tool_call>...</tool_call>  → 7+ tokens overhead
DeepSeek: <｜tool▁call▁begin｜>...<｜tool▁call▁end｜> → 2 tokens overhead
```

## Block Types (each begin/end pair = ONE token)

```
<｜act▁begin｜>/<｜act▁end｜>       <｜find▁begin｜>/<｜find▁end｜>
<｜decide▁begin｜>/<｜decide▁end｜> <｜fix▁begin｜>/<｜fix▁end｜>
<｜tool▁begin｜>/<｜tool▁end｜>     <｜ask▁begin｜>/<｜ask▁end｜>
<｜note▁begin｜>/<｜note▁end｜>     <｜ref▁begin｜>/<｜ref▁end｜>
<｜margin▁begin｜>/<｜margin▁end｜> <｜handle｜>  <｜cite｜>
```

## Grammar

```
Turn       ::= Block+ Marginalia?
Block      ::= ActBlock | FindBlock | DecideBlock | FixBlock
             | ToolBlock | AskBlock | NoteBlock | RefBlock
ActBlock   ::= <｜act▁begin｜> content <｜act▁end｜>
FindBlock  ::= <｜find▁begin｜> content <｜find▁end｜>
DecideBlock::= <｜decide▁begin｜> content <｜decide▁end｜>
FixBlock   ::= <｜fix▁begin｜> content <｜fix▁end｜>
ToolBlock  ::= <｜tool▁begin｜> tool_call <｜tool▁end｜>
AskBlock   ::= <｜ask▁begin｜> content <｜ask▁end｜>
NoteBlock  ::= <｜note▁begin｜> content <｜note▁end｜>
RefBlock   ::= <｜ref▁begin｜> <｜handle｜> id content <｜ref▁end｜>
Marginalia ::= <｜margin▁begin｜> HandleEntry* <｜margin▁end｜>
```

## Hypothesized Benefits

- **Compaction**: structured blocks ARE skeletal form — keep `<decide>`/`<tool>`, drop no-action `<find>`, summarize `<note>`
- **Marginalia**: harness knows output structure without heuristic parsing
- **Oracle panel**: each block type gets native visual treatment
- **Token budgeting**: precise per-block-type materialization budget
- **Inter-agent**: agents share typed blocks, not prose

## Enforcement

Every output token must be inside a typed block:
`<act>` doing | `<find>` observed | `<decide>` decision+why | `<fix>` change | `<tool>` call | `<ask>` question | `<note>` future context | `<ref §h>` handle ref

**CoT is exempt** — structured format applies to OUTPUT (enters context/compaction), not reasoning.

## Open Design Questions

1. **Algebraic structure** — speech act × content type? Something else?
2. **Disjointness** — which block types are sort-disjoint? (decision ≠ observation)
3. **Subtyping** — `fix` ⊂ `act`? `decide` ⊂ `find` + commitment?
4. **Compaction rules per type** — which survive by default?
5. **Model compliance** — can current models reliably emit structured blocks from system prompt alone?
