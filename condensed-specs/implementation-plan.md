## Implementation Plan

### Phase 1: Async Tool Calls + Marginalia
- Parallel tool execution; marginalia = tool results attached to turns, not inline
- Handle lifecycle: pending → resolved → consumed → evictable
- Short-term: batch parallel calls between turns; medium-term: streaming interception w/ async handles

### Phase 2: Shadow Clone Compaction Loop
- Context pressure monitor triggers: branch → task clone → receive skeletal → splice → kill
- Consolidation prompt: decisions, state deltas, deps, open items
- Full invertibility: clone writes verbatim + CoT to external store; all CoT persisted

### Phase 3: Page Table + Marginalia-Aware Compaction
- Page table tracks reasoning vs. marginalia separately
- Priority: tool results first, reasoning last
- Clone produces tags + dep edges during consolidation
- Handle-aware: skeletal references handles, not inline data
- Reroll amortization: batched compaction, sawtooth pressure model

### Phase 4: Native Swift Oracle Panel v1 (PRIMARY UI)
- Context map: visual rectangles, color-coded residency, pressure
- Chunk detail: skeletal + full CoT side-by-side, collapsible
- Tool call timeline: real Gantt chart
- Oracle operations: click, drag, keyboard shortcuts
- Agent ↔ Panel: UDS for commands, mmap for page table
- CoT browser: syntax highlighted, searchable, navigable
- Knowledge graph: interactive DAG, pan/zoom, click to inspect
- **Swift/SwiftUI + AppKit. Not Electron.**

### Phase 5: Full Page Fault Pipeline
- Fault detection → clone re-derives from skeletal (1st) → full inversion from store (2nd) → snapshot rollback (disaster)
- Promotion tracking: frequently faulted chunks stay hotter

### Phase 6: Oracle Panel v2 + Multi-Agent
- Metal-rendered dependency DAG; compaction timeline w/ amortization tracking
- Multi-agent view: context maps for all swarm agents; cross-agent oracle injection
- Operator attention tracking as eviction signal
- Discovery: Bonjour/mDNS local, Vers registry remote

### Phase 7: Swarm Context Protocol
- Shared page tables + skeletal forms + handle references across agents
- Cross-agent page faults (A faults into B's store)
- Compacted context as inter-agent communication primitive
- Shared external store with access control

---

## Fork vs. Plugin Boundary

### Plugin-Layer (no harness fork)

1. **External Store + Page Table** — intercept tool results, write to store, maintain page table, inject skeletal forms into system prompt between turns
2. **Shadow Clone Compaction** — `vm_branch` + `vers_swarm_task` + splice result; orchestration-layer
3. **Oracle Panel** — external Swift app reads page table + store, sends ops via UDS/HTTP to shim modifying managed context block
4. **CoT Persistence** — response interceptor captures provider CoT → store
5. **Idempotency Classification** — tool-call wrapper: classify, deduplicate pure calls, cache results
6. **Basic Handle Lifecycle** — replace large results with `[§α: read(foo.rs) → 8,247 tokens, stored]`; model materializes via `materialize(§α, lines=40-60)`. Tool-call shim.
7. **Push-Down DSL** — expose `handle_query(§α, "grep", "pattern")` as tool; harness runs against stored result
8. **Minimap** — UI over page table data, fully external

### Harness-Level (fork or deep integration)

9. **Marginalia as First-Class Turn Structure** — tool results as annotations ON turns, not separate messages. Changes message format.
   - Workaround: structured block appended to assistant turn:
     ```
     <!-- marginalia
     §α: read(foo.rs) → resolved, 847 tok [handle-only]
     §β: bash(cargo test) → resolved, 234 tok [inline: 14 pass 2 fail]
     -->
     ```
10. **True Async Tool Calls** — model continues generating after emitting tool_use. **Model-level change**, no current model supports.
    - Workaround: parallel tool batching (supported today)
    - Better: speculative tool pre-execution from streaming partial output (harness-level)
11. **Materialization Budget Enforcement** — token budget on tool result injection per turn; proper enforcement needs harness gating
12. **Streaming Handle Injection** — handle resolution tokens into generation stream. Model-level, long-term.

### Build Order

```
TODAY (plugin + prompting):
├── External store + page table
├── Shadow clone compaction via Vers
├── CoT persistence
├── Idempotency classification + caching
├── Basic handle references
├── Push-down DSL as tool calls
├── Parallel tool batching
├── DSML structured output (system prompt)
├── Marginalia via structured blocks (prompt format)
├── Handle-aware reasoning (prompt pattern)
├── Eager parallel tool call emission (behavioral prompt)
└── Oracle panel (Swift, reads store + page table)

NEAR-TERM (harness extension / moderate fork):
├── Materialization budget enforcement
├── Speculative tool pre-execution
├── Context pressure monitor + auto-compaction
├── Reroll amortization scheduler
├── Format violation detection + waste metrics
└── Block-type-aware compaction (keep <decide>, compress <find>)

LONG-TERM (deep integration):
├── True streaming async (handle injection mid-gen)
├── Block-level attention hints
└── Handle-aware KV cache management
```

**~90% of CarterKit is buildable today as plugins + prompting.** Remaining 10% is harness optimization (streaming interception, budget enforcement, attention hints) — polish, not prerequisites.

Cross-refs: async-tools-handles, compaction-invertibility, oracle-panel, minimaps-visualization, kage-no-bushin, 03-dsml, handle-tools
