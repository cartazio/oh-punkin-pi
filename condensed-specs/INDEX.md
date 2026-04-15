# CarterKit Pre-Conversion Spec Index

**Author:** Carter Schonwald | **Generated:** 2026-04-10 | **Files:** 24

CarterKit treats the LLM context window as a TLB/cache backed by a content-addressed store. Sessions are unbounded; compaction is invertible; an operator oracle shapes agent memory in real time via a native Swift panel. These specs define the architecture from storage layer through wire protocol.

---

## Spec Catalog

### Core Architecture

| File | Description | Key Types/Concepts |
|------|-------------|-------------------|
| `design.md` | Master overview and summary index linking all specs. Thesis: context compaction via shadow clone, fully invertible, CoT-preserving, content-addressed. | Thesis statement, spec cross-reference table |
| `architecture-formal.md` | Formal architecture: compaction cycle, residency levels (raw/skeletal/referential/evicted), page table, eviction scoring, semi-invertibility proofs, composition properties. | `PageEntry`, `eviction_score()`, residency levels, `distance(x, expand(compact(x))) <= epsilon` |
| `01-store.md` | Content-addressed storage layer. DuckDB for structured data + blob files for bulk. KangarooTwelve hashing. Schema for blobs, chunks, handles, KG nodes/edges, oracle log. | `ContentHash`, `Store`, `Chunk`, `Handle`, `KGNode`, `KGEdge`, DuckDB schema |
| `compaction-invertibility.md` | Core compaction idea: shadow clone writes verbatim to store, produces skeletal cache line. Full CoT persistence. Reroll-forward amortization equation. Provider-adversarial stance. | Skeletal form, CoT persistence, reroll cost, amortization equation, lazy batched compaction |
| `context-dsl.md` | Context manipulation as a versioned DSL program. Operations: Inject, Contract, Expand, Branch, Merge, Splice, Evict, Materialize. Adequacy-preserving transformations. | `CtxOp`, `MergeStrategy`, `VersionGraph`, `CtxProgram`, adequacy equivalence |

### Tool System

| File | Description | Key Types/Concepts |
|------|-------------|-------------------|
| `async-tools-handles.md` | Async tool calls with status handles. Call-by-name semantics (handles are thunks). Push-down DSL for surgical materialization. Materialization budget. Idempotency classification. | `HandleId`, `HandleOp`, push-down DSL, `Idempotency` (Pure/Session/NonIdempotent), materialization budget |
| `handle-tools.md` | Push-down handle operations (Lean-style signatures). Tools: `handle_lines`, `handle_grep`, `handle_head`, `handle_tail`, `handle_count`, `cot_replay`. | `HandleError`, handle format `[Handle section_hN: ...]`, Lean signatures |
| `tool-execution-model.md` | Execution categories (sync/async/gated), read/write gating via visible reasoning (squiggle requirement), shadowed-read compaction, danger zone tool categories. | `EditMode`, squiggle gating, shadowed read invalidation, body UUID, tombstone format |
| `tool-interface-design.md` | Intent-first, async, reference-based tool APIs. Intent levels (exists/structure/sample/verify/full). Refs over inline. Async start/poll/cancel. | `Intent`, `ViewResult`, `Ref`, `BashProgress`, `RefusalReason`, recovery/replay semantics |
| `tool-type-signatures.md` | Lean/Agda-style dependent type signatures for all tools. Preconditions as refinement types. Idempotency classification table. | Dependent types, `FileContent`, `ReadError`, `EditError`, `HandleStatus`, `classifyTool` |
| `hashline-edits.md` | Content-hash anchored line addressing for robust edits. K12 truncated to 1-byte hash per line. `LINE#HASH` anchors. Staleness detection via hash mismatch. | `Anchor`, `HashlineEdit`, `HashMismatch`, `MatchStrategy`, bottom-up application order |

### Output Format & Rendering

| File | Description | Key Types/Concepts |
|------|-------------|-------------------|
| `03-dsml.md` | DeepSeek-style single-token delimiters for tool call markup. Harness does handle assignment, dependency inference, intent extraction post-hoc. Model emits only CoT + tool calls + prose. | DSML delimiters `<\|tool_calls_begin\|>`, responsibility split (model vs harness vs operator) |
| `turn-boundary-rendering.md` | Turn boundaries as first-class message types. Sigil+nonce identity. TUI rendering format with metadata lines and horizontal rules. Squiggle block rendering. | `TurnStartMessage`, `TurnEndMessage`, sigil+nonce, `renderTurnStart`, ANSI styling |
| `transcript-slicing.md` | Coordinate system for referencing transcript content. `section_r_` turn refs, offset addressing (direction + unit), ranges, role exclusion filters. | `section_h`/`section_r_`/`section_l_` namespaces, offset grammar, range syntax, role exclusion |
| `minimaps-visualization.md` | Ambient visualization: menu bar context pressure widget, terminal inline minimap, dependency DAG minimap, compaction pressure sparkline, handle resolution ticker. | Context minimap, turn minimap, dependency minimap, SwiftUI `MenuBarExtra` |
| `typed-output-blocks-experiment.md` | **EXPERIMENTAL.** Typed block taxonomy for structured model output (act/find/decide/fix/tool/ask/note/ref/margin). Needs algebraic structure before adoption. | Block types, DSML single-token delimiters, compaction rules per block type |

### Knowledge & Memory

| File | Description | Key Types/Concepts |
|------|-------------|-------------------|
| `chunking-knowledge-graph.md` | Content-defined chunking via rolling hash (Rabin fingerprint). Knowledge graph as citation DAG. Closed-module evidence (no fabrication). Graph-aware compaction produces graph deltas. CBOR+TOML wire format. | `PageEntry`, `KnowledgeEdge`, rolling hash segments, hierarchical chunking, underdetermined claims, block type disjointness |
| `codata-semantics.md` | Foundational framing: tool results as codata (observations) not data (values). Lazy materialization, compute pushdown, typed observations via ornaments, CALM monotonicity for streaming. | `ResultHandle` (codata), `Cap` (capability set), `Streamability`, `ObservationResult`, `HandleMeta` |

### Agent Primitives

| File | Description | Key Types/Concepts |
|------|-------------|-------------------|
| `kage-no-bushin.md` | Shadow clone primitive: compaction, subagents, speculative execution, transactional edits. COW working tree (git worktree). Hypotheticals with deferred commit. Transactions with isolation levels. Mediated return for clone safety. | `SpawnMode`, `HypotheticalConfig`, `Validator`, `TransactionConfig`, `TransactionIsolation`, `MergeResult`, trust levels |
| `metacog-hooks.md` | Lifecycle hooks for agent metacognition. Context/compaction hooks, introspection tools (`get_context_meta`, `get_context_diff`), state checkpoint primitives, event log. | `ContextHooks`, `CompactionHooks`, `StateToPreserve`, `ContextEvent`, `SegmentMeta` |
| `conditional-injection.md` | Zero-cost-until-relevant context injection. Trigger predicates (regex, keyword, tool invocation). Timing: Interrupt (abort+retry), NextTurn, Immediate. Fire policies (OneShot/NShot/Repeatable). | `ConditionalInjection`, `Trigger`, `InjectionTiming`, `FirePolicy`, `MatcherState` |

### Operator Interface

| File | Description | Key Types/Concepts |
|------|-------------|-------------------|
| `oracle-panel.md` | Native Swift operator panel. 7 views: context map, CoT browser, dependency graph, compaction timeline, injection editor, tool call Gantt, multi-agent. Oracle ops: pin, edit, promote/demote, inject, tag. Oracle-aware eviction scoring. | Oracle ops (pin/edit/promote/demote/inject/tag), UDS+CBOR protocol, mmap page table, eviction score with oracle signal |

### Protocol & Implementation

| File | Description | Key Types/Concepts |
|------|-------------|-------------------|
| `carterkit-protocol.md` | Protocol spec v0. Four layers: L1 model-facing, L2 tool interception + handles, L3 store, L4 wire (UDS+CBOR). CDDL schema. Command payloads. Ordering/concurrency rules. Error contract. | `ToolDecision`, `CaptureResult`, `HandleOp`, CDDL schema, `cmd-name`, `evt-name`, `err-code` |
| `implementation-plan.md` | Phased build plan (7 phases). Fork vs plugin boundary analysis (~90% buildable as plugins). Build order: today / near-term / long-term. | Phase 1-7, plugin-layer vs harness-level boundary, build order DAG |

---

## Key Concepts

1. **Context Window as TLB** -- The context window is a cache (TLB), not the canonical store. Content lives in a content-addressed external store; context holds cache lines (skeletal forms). Page faults re-derive from store via shadow clones.
2. **Invertible Compaction** -- Compaction never destroys information. Raw content + full CoT written to store; skeletal form placed in context. `expand(contract(x)) ~ x` up to adequacy. Compaction = residency change, not lossy compression.
3. **Shadow Clone (Kage no Bushin)** -- Unified primitive for compaction, subagents, speculative execution, and transactions. Branch in three spaces: context, working tree (COW), execution. Composition via hypotheticals with commit/abort semantics.
4. **Handles as Codata/Thunks** -- Tool results are not injected eagerly. Handles are call-by-name references (thunks) to stored results. Push-down DSL queries against stored data without materializing into context. Cost = O(projected result), not O(full result).
5. **Content Addressing (K12)** -- Everything hashed with KangarooTwelve. Chunks, blobs, lines, CoT. Identity = content. Enables dedup, cross-session sharing, cross-agent sharing, citation verification.
6. **Oracle Panel** -- Operator as external oracle: pins, edits, injects, promotes/demotes context. Native Swift, sub-frame latency, full CoT browser. Operator attention feeds back into eviction scoring. The membrane between human world model and agent context.
7. **Rolling Hash Chunking** -- Content-defined boundaries (Rabin fingerprint), not fixed turns. Edit-stable, dedup-friendly, hierarchical (fine/medium/coarse). DSML block-boundary bias.
8. **Knowledge Graph** -- Compaction output is a citation graph (DAG), not text summary. Nodes = entities/claims with provenance. Closed-module evidence prevents fabrication. Graph corrections are local edge updates.
9. **Read/Write Gating** -- Edits require unshadowed read + completed squiggle (visible reasoning). Writes invalidate prior reads. Shadowed reads auto-compact after 2 turns. Brackets preserved, body tombstoned.
10. **DSML Delimiters** -- DeepSeek single-token delimiters for tool calls. Model burden minimal (CoT + tool calls only); harness does classification, handle assignment, dependency inference post-hoc.
11. **Materialization Budget** -- Soft cap on tokens pulled into context per turn. Dynamic by pressure: generous at <50%, tight at >75%. Oracle can override.
12. **Idempotency Classification** -- Tools classified as Pure (cache/dedup), Session (snapshot-safe), NonIdempotent (never replay). Drives caching, clone safety, handle dedup.
13. **Wire Protocol (CBOR+UDS)** -- Unix domain socket transport, CBOR payloads (deterministic, self-describing), CDDL schema. TOML for human-facing config/display. No protobuf, no code generation.
14. **Conditional Injection** -- Rules/skills have zero context cost until trigger fires. Stream regex, keyword match, or tool invocation triggers injection with configurable timing and fire policy.
15. **Transcript Coordinates** -- `section_r_` sigil+nonce turn references with offset addressing (paragraph/sentence/line), ranges, role exclusion. Stable across compaction.

---

## Dependency Graph

Arrows indicate "depends on" / "references". Leaf nodes have no outbound dependencies.

```
01-store (LEAF)
  ^-- architecture-formal, async-tools-handles, chunking-knowledge-graph,
      context-dsl, handle-tools, hashline-edits, tool-interface-design

turn-boundary-rendering (LEAF)
  ^-- transcript-slicing

codata-semantics --> metacog-hooks
  ^-- async-tools-handles, chunking-knowledge-graph, context-dsl,
      handle-tools, kage-no-bushin, tool-interface-design

compaction-invertibility --> kage-no-bushin, oracle-panel, async-tools-handles
  ^-- architecture-formal, async-tools-handles, chunking-knowledge-graph,
      context-dsl, handle-tools, metacog-hooks, tool-execution-model,
      transcript-slicing, typed-output-blocks-experiment

kage-no-bushin --> design, context-dsl, codata-semantics
  ^-- architecture-formal, async-tools-handles, chunking-knowledge-graph,
      compaction-invertibility, oracle-panel, implementation-plan

oracle-panel --> compaction-invertibility, async-tools-handles, kage-no-bushin,
                 architecture-formal
  ^-- 03-dsml, chunking-knowledge-graph, compaction-invertibility,
      minimaps-visualization, typed-output-blocks-experiment, implementation-plan

architecture-formal --> 01-store, compaction-invertibility, oracle-panel,
                        kage-no-bushin
  ^-- 03-dsml, chunking-knowledge-graph, metacog-hooks, oracle-panel

context-dsl --> compaction-invertibility, async-tools-handles, kage-no-bushin,
                codata-semantics, 01-store
  ^-- conditional-injection, kage-no-bushin, tool-execution-model

async-tools-handles --> compaction-invertibility, oracle-panel, kage-no-bushin,
                        01-store, context-dsl, codata-semantics
  ^-- carterkit-protocol (via handle-tools), compaction-invertibility,
      metacog-hooks, oracle-panel, tool-interface-design, tool-type-signatures,
      transcript-slicing, implementation-plan

03-dsml --> 01-store, architecture-formal
  ^-- chunking-knowledge-graph, typed-output-blocks-experiment,
      implementation-plan

metacog-hooks --> compaction-invertibility, architecture-formal,
                  async-tools-handles
  ^-- codata-semantics, conditional-injection

conditional-injection --> context-dsl, metacog-hooks
  (no dependents in spec set)

handle-tools --> codata-semantics, 01-store, compaction-invertibility
  ^-- carterkit-protocol, tool-type-signatures, implementation-plan

hashline-edits --> 01-store, tool-execution-model
  (no dependents in spec set)

tool-execution-model --> context-dsl, compaction-invertibility
  ^-- hashline-edits

tool-interface-design --> async-tools-handles, codata-semantics, 01-store
  (no dependents in spec set)

tool-type-signatures --> async-tools-handles, handle-tools
  (no dependents in spec set)

transcript-slicing --> turn-boundary-rendering, async-tools-handles,
                       compaction-invertibility
  (no dependents in spec set)

minimaps-visualization --> oracle-panel
  ^-- implementation-plan

typed-output-blocks-experiment --> 03-dsml, compaction-invertibility,
                                   oracle-panel
  (no dependents in spec set)

design --> (overview, references all)
  ^-- kage-no-bushin, carterkit-protocol

carterkit-protocol --> handle-tools, design
  (no dependents in spec set)

implementation-plan --> async-tools-handles, compaction-invertibility,
                        oracle-panel, minimaps-visualization, kage-no-bushin,
                        03-dsml, handle-tools
  (no dependents in spec set)

chunking-knowledge-graph --> 01-store, compaction-invertibility, oracle-panel,
                             kage-no-bushin, codata-semantics, 03-dsml,
                             architecture-formal
  (no dependents in spec set)
```

### Layering (bottom-up)

```
Layer 0 (Leaves):     01-store, turn-boundary-rendering
Layer 1 (Foundation): codata-semantics, architecture-formal
Layer 2 (Core):       compaction-invertibility, context-dsl, kage-no-bushin,
                      async-tools-handles, oracle-panel, 03-dsml
Layer 3 (Tools):      handle-tools, tool-execution-model, tool-interface-design,
                      tool-type-signatures, hashline-edits, metacog-hooks
Layer 4 (Features):   chunking-knowledge-graph, conditional-injection,
                      transcript-slicing, minimaps-visualization,
                      typed-output-blocks-experiment
Layer 5 (Integration):carterkit-protocol, implementation-plan, design (overview)
```
