## Architecture (Formal)

### Compaction Cycle
- Agent at context pressure → `vm_branch` → Shadow Clone with full ctx
- Clone produces skeletal compaction of old turns (invertible, re-derivable)
- Parent splices skeletal form replacing raw turns → context ~35% full

### Residency Levels
```
Level        │ Content                                    │ ~Size
raw          │ Verbatim turns                             │ 1.0x
skeletal     │ Decision tree, state deltas, dep graph,    │ 0.10-0.15x
             │ constraints, open items. Semi-invertible.  │
referential  │ One-line typed handle per chunk.            │ 0.01-0.02x
             │ Semi-invertible at tag level only.         │
evicted      │ Not in context. Page table entry only.     │ ~0
             │ Page fault required for any use.           │
```

### Page Faults
Expansion via clone: branch → clone re-derives from skeletal → splice answer → destroy clone.
```
page_fault(chunk, question):
  clone = vm_branch(parent)
  answer = task_clone(clone,
    "Using the skeletal compaction of chunk {id}, re-derive: {question}")
  splice(answer, into=parent_context)
  vm_destroy(clone)
```
Hierarchy: (1) skeletal sufficient → no fault, (2) clone re-derives from skeletal, (3) snapshot rollback (disaster recovery).

### Page Table
```
PageEntry = {
  id          : ChunkHash,
  span        : (TurnStart, TurnEnd),
  level       : raw | skeletal | referential | evicted,
  tags        : Set<SemanticTag>,
  deps        : Set<ChunkHash>,
  inverse_deps: Set<ChunkHash>,
  tokens_raw  : int,
  tokens_now  : int,
  fidelity    : float,
  pinned      : bool,             -- operator pinned
  oracle_edits: int,              -- count of operator edits
  oracle_notes: List<OracleNote>, -- operator annotations
  snapshot    : CommitId?,        -- for rollback only
}
```

### System Diagram
Operator → Oracle Panel (pin/edit/promote/demote/inject/tag) ↔ Page Table (context map) → Context Window ([skel₁📌][skel₂✏️][raw₃][raw₄][oracle₅💉]) → on pressure: Shadow Clone (vm_branch, full ctx, produces skeletal) → compacted repr flows back to parent + panel updates.

### Compaction Composition
- When oldest chunks already skeletal, clone compacts remaining raw → new skeletal
- When ALL skeletal: merge multiple skeletals into higher-order skeletal or demote to referential
- Works because skeletal forms are semi-invertible — clone understands encoding

### Eviction Policy
```
eviction_score(chunk) =
    α * recency
  + β * dep_fanout
  + γ * semantic_centrality
  + δ * access_frequency
  + ζ * oracle_signal(chunk)   -- pin/edit/view/inject
  - ε * reconstruction_cost
```
- Never evict chunk with live raw dependents
- Never evict pinned chunk
- Oracle-edited chunks get score boost

## Formal Properties

### Semi-Invertibility
```
distance(x, expand(compact(x))) ≤ ε(level)
```
`distance` = decision-relevant information loss. Shadow clone minimizes `ε(skeletal)` (max info about decision-relevance).

### Composition
```
compact(c₁ ++ c₂) ≈ merge(compact(c₁), compact(c₂))
```
Approximate: structural properties (decisions, deps, states) compose; narrative flow doesn't (and skeletal discards it).

### Oracle Monotonicity
Oracle ops only ADD information: Pin (constraint), Edit (ground truth, versioned), Inject (exogenous knowledge, tagged), Tag (semantic structure), Demote (relevance judgment, preserves compacted form). Operator cannot destroy information — only change residency/weighting.

## vs. Everything Else
| Property | Summarization | Prompt Cache | RAG | CarterKit |
|----------|---------------|-------------|-----|-----------|
| Invertible | No | N/A | No | Semi (structural) |
| Composable | Degrades | No | N/A | Yes (skeletal merges) |
| Addressable | No | By position | By embedding | By content + tag |
| Human in loop | No | No | Retrieval tuning | Full oracle panel |

---
*Cross-refs: compaction-invertibility.md (invertibility details), oracle-panel.md (operator interface), kage-no-bushin.md (vm_branch/clone primitive), 01-store.md (content-addressed storage backing page table)*
