# CarterKit Design — Summary Index
**Author:** Carter Schonwald | **Status:** Active overview

---

## Thesis
Agent sessions unbounded, context windows not. Prompt caching is economic optimization, not architecture.
**Solution:** Context compaction via shadow clone — fully invertible, CoT-preserving, content-addressed store. Skeletal form = cache line, not lossy compression. Nothing destroyed, only changes residency.
→ **compaction-invertibility.md** — Core idea, CoT persistence, provider norms adversarial, reroll-forward amortization.

## Async Tools + Handles
Tool results are codata (observations), not data (values). Handles = thunks (CBN refs to stored results). Push-down DSL queries without full materialization.
→ **async-tools-handles.md** — Async exec, status handles, CBN handles, push-down DSL, materialization budget, idempotency classification.
See also: codata-semantics.md, handle-tools.md

## Oracle Panel
Operator = intelligence. Native Swift panel (SwiftUI+AppKit) ↔ Haskell core over UDS+CBOR. Operator pins/edits/injects/promotes/demotes — shapes agent memory.
→ **oracle-panel.md** — Agent↔panel protocol, views, oracle ops, context↔state mapping.

## Architecture + Formal Properties
Compaction cycle, residency levels (raw→skeletal→referential→evicted), page faults/table, eviction policy. Formal: semi-invertibility, composition, oracle monotonicity.
→ **architecture-formal.md** — System diagram, compaction composition, eviction scoring.

## Implementation Plan
Phased build (plugin-layer, no fork → harness-deep). Fork vs plugin boundary analysis.
→ **implementation-plan.md** — Phases 1-7, plugin vs harness, build order.

## Context Visualization
Menu bar minimap (context pressure at a glance), inline turn minimap for terminal. Pixel-per-chunk color by residency level.
→ **minimaps-visualization.md**

## Chunking + Knowledge Graph
Content-defined chunking via rolling hash (Rabin fingerprint). KG node types, extraction from CoT, sort disjointness. Wire: CBOR + pseudo-TOML.
→ **chunking-knowledge-graph.md**

## Related Specs
| Spec | Role |
|------|------|
| 01-store.md | Content-addressed storage (DuckDB + blobs) |
| 03-dsml.md | DSML tool call delimiters (DeepSeek convention) |
| carterkit-protocol.md | Protocol layers + CDDL wire spec |
| context-dsl.md | Context manipulation as versioned DSL program |
| codata-semantics.md | Lazy I/O — tool results as observations |
| kage-no-bushin.md | Shadow clones, hypotheticals, transactions |
| handle-tools.md | Push-down handle operations (Lean signatures) |
| tool-type-signatures.md | Dependent type signatures for all tools |
| tool-interface-design.md | Intent-first, async, reference-based tool APIs |
| metacog-hooks.md | Lifecycle hooks for agent metacognition |
| transcript-slicing.md | Coordinate system for transcript references |
| turn-boundary-rendering.md | Turn boundary format + TUI rendering |
| tool-execution-model_v1 | Parallel execution, read/write gating, shadowed-read compaction |
| typed-output-blocks-experiment.md | **EXPERIMENTAL** — typed block taxonomy (needs algebraic structure) |
