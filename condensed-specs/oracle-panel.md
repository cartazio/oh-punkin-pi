## The Oracle Panel (Native Swift)

### Why Native
- **Latency**: Real-time bidirectional editing of agent cognitive state needs sub-frame latency (drag reorder, click expand, type inject)
- **Text rendering**: CoT traces = tens of thousands of tokens, syntax-highlighted, searchable, collapsible — requires native `NSTextView` with lazy rendering
- **Memory**: Full external store in memory for instant fault resolution (page table, dependency graph, per-chunk CoT)
- **Keyboard-driven**: Vim-style nav, shortcuts for all oracle ops, command palette, fuzzy search over tags/CoT
- **System integration**: Menu bar pressure alerts, compaction notifications, drag-and-drop file injection, Spotlight-indexed CoT
- **Process isolation**: Separate process from agent. Crash isolation. Can monitor multiple agents. Agent exposes state via local protocol, panel renders.

### Architecture: Agent ↔ Panel Protocol

```
Agent Process ←──mmap/UDS──→ Oracle Panel (Swift)
  Context Window    ↔  Context Map UI
  Page Table        ↔  Page Table View
  External Store    ↔  CoT Browser
  Event Stream      →  Live Feed
```

- **Commands** (pin, edit, inject, promote, demote, tag): Unix domain socket
- **Page table + context map**: Memory-mapped / shared memory (read-heavy, zero-copy)
- **Events** (compaction, pressure, faults): UDS event stream

### Panel Views

**1. Context Map** (primary) — Horizontal bar of all chunks, colored by residency level, sized by token count. Spatial overview of agent's mind.
- Click chunk → detail view; right-click → oracle ops; drag → reorder priority (affects eviction scoring)
- Chunks pulse on agent access; red glow near pressure threshold

**2. Chunk Detail / CoT Browser** — Split pane: skeletal form (left) + full CoT from external store (right). Syntax highlighted, collapsible reasoning blocks, `⌘F` search across all CoT.
- Operator sees gap between what agent thought (CoT) vs what compaction preserved (skeletal), acts on the gap

**3. Dependency Graph** — Interactive DAG. Nodes = chunks, edges = dependencies. Click node → highlight dependents/dependencies. Color by residency, size by token count, cluster by semantic tag.
- Built with Core Animation / Metal for smooth interaction with large graphs

**4. Compaction Timeline** — Vertical timeline of every compaction event:
  - When fired (pressure level), what was compacted (which chunks, raw→skeletal)
  - Clone's compaction CoT (why those choices), tokens freed, reroll cost paid
  - Amortization status (has reroll cost been recovered?)

**5. Oracle Injection Editor** — Full text editor for injections. Markdown, tag autocomplete, dependency linking, preview before commit.

**6. Tool Call Timeline** — Gantt chart of async tool calls per turn. Shows wall time, agent reasoning overlap, handle lifecycle (pending→resolved→consumed→evicted). Click handle → full result. Right-click → pin/evict/re-run. Integrates with context map (tool results colored by residency level).

**7. Multi-Agent View** — All agents side-by-side (swarm mode). Each agent = row with context map. Cross-agent dependencies visible. Operator can inject/view CoT/trigger cross-agent page faults for any agent.

### Swift Implementation

- **Framework**: SwiftUI layout + AppKit `NSTextView` for CoT (volume). Metal for dependency graph.
- **Data layer**: Page table + chunk metadata as `Codable` Swift structs, synced via shared memory/UDS. External store via mmap for zero-copy reads.
- **Reactivity**: Combine publishers on UDS event stream. Page table changes → UI update within single frame. Smooth animations on compaction (skeletal slides in, raw shrinks out).
- **Performance targets**:
  - Launch to first render: <200ms
  - Chunk click to CoT display: <50ms (mmap)
  - Oracle injection to agent context update: <100ms
  - Dependency graph 100 chunks: 60fps
  - CoT scroll 50k tokens: 60fps (lazy `NSTextView`)
- **Distribution**: Standalone notarized .app. Connects via UDS (local) or TCP (remote/Vers VMs). Agent discovery via Bonjour/mDNS (local) or Vers registry (remote).

### Why Oracle Intervention Matters

Autonomous compaction is limited — agent's model of what matters is incomplete. Operator has **exogenous knowledge**:
- Business context ("CTO is about to mandate PASETO")
- Cross-session state, future intent, judgment calls
- Ground truth corrections ("compaction hallucinated this rejection")

The panel is the **membrane** between operator's world model and agent's context. Operator = oracle in computational sense: external source of truth the computation cannot derive internally.

### Oracle Operations

**1. Pin** — Lock chunk at current residency. Exempt from eviction scoring. Agent treats as immovable ground truth.
```
pin(chunk_id, reason="compliance-relevant, keep verbatim")
```

**2. Edit** — Modify compacted representation directly. Fix hallucinated compaction, add missed context, remove noise. Tagged oracle-sourced (higher confidence than agent compactions).
```
edit(chunk_id, field="REJECTED", old=["opaque tokens", "PASETO"],
     new=["opaque tokens"], oracle_note="PASETO is back on the table")
```

**3. Promote / Demote** — Change residency level. Promotion triggers shadow clone fault if needed (branch, expand, splice). Demotion by parent directly or via clone.
```
promote(chunk_id, to=skeletal)   -- expand for more detail
demote(chunk_id, to=referential) -- compress harder
```

**4. Inject** — Insert exogenous content not from any conversation turn. Most powerful operation: correct world model, inject external decisions, provide cross-session info, override compaction. Tagged `oracle` so agent knows it's external ground truth.
```
inject(content="CTO mandated PASETO for Q3...",
       tags=["auth", "paseto", "executive-mandate"],
       position=after(chunk_id), type=oracle)
```

**5. Tag / Retag** — Modify semantic tags. Operator tagging overrides clone's. Affects eviction policy (semantic centrality scoring) and page fault relevance.
```
retag(chunk_id, add=["compliance", "audit-trail"], remove=["experimental"])
```

### Bidirectional Mapping

Panel is a **state/text editor for agent's mind**:
- Oracle edits flow directly into agent context
- Compaction events flow to panel display
- Operator's exogenous knowledge enters agent context through panel
- Agent's compaction decisions are visible to operator through panel

### Oracle-Aware Eviction

Operator interactions adjust eviction policy:

```
eviction_score(chunk) =
    α * recency
  + β * dep_fanout
  + γ * semantic_centrality
  + δ * access_frequency
  + ζ * oracle_signal(chunk)   -- pin/edit/view/inject history
  - ε * reconstruction_cost
```

| Signal | Effect |
|---|---|
| Pinned | score = ∞ (never evict) |
| Oracle-edited | score boost |
| Oracle-injected | inherits priority from injection type |
| Operator-viewed | mild score boost (attention = relevance) |
| Operator-demoted | score penalty |

Operator's attention pattern is signal — what they look at, edit, pin feeds back into eviction.

Cross-refs: compaction-invertibility (residency levels, skeletal forms), async-tools-handles (handle lifecycle), kage-no-bushin (shadow clone faults, clone-based promotion), architecture-formal (page table, external store, eviction scoring).
