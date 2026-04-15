# Chunking & Knowledge Graph

Cross-refs: `01-store` (content-addressed store), `compaction-invertibility` (skeletal forms), `oracle-panel` (operator editing), `kage-no-bushin` (shadow clones), `codata-semantics` (handles), `03-dsml` (block types), `architecture-formal` (page table)

## Page Table Entries

```
PageEntry = {
  id          : ContentHash,           -- canonical identity
  claims      : Set<ContentHash>,      -- claims in this chunk
  level       : skeletal,
  tags        : {auth, jwt},
  ...
}

KnowledgeEdge = {
  from        : ContentHash,
  to          : ContentHash,
  relation    : RelationType,
  provenance  : Provenance,
}
```

- Knowledge graph is a content-addressed DAG — stable identity regardless of position
- Compaction, injection, reordering, cross-agent sharing all work because nothing depends on position
- Dual addressing: hashes for machines, coordinates (`@7.¶2`) for operators, semantic paths for agents
- Panel shows both coordinate AND hash; coordinate → navigate, hash → verify in store

## Rolling Hash Segments

Content-defined chunking via rolling hash (Rabin/Buzhash), not fixed turn boundaries.

```
H(window) mod M == 0 → chunk boundary

M controls average chunk size:
  M = 2^8  → ~256 token chunks (fine-grained)
  M = 2^10 → ~1024 token chunks (medium)
  M = 2^12 → ~4096 token chunks (coarse)
```

**Key properties:**

1. **Edit stability** — insertion rehashes only the affected chunk; chunks before/after keep hashes. Fixed chunking breaks ALL references on any insertion.

2. **Natural semantic boundaries** — rolling hashes split on distinctive token patterns at topic transitions, tool call boundaries, structural breaks.

3. **Dedup across sessions/agents** — same content → same hash → store deduplicates automatically.

4. **Variable-size chunks match variable-density content** — dense `<decide>` block stays compact, verbose tool output gets its own chunks.

5. **DSML block-boundary bias:**
```
if token ∈ {</act>, </find>, </decide>, ...}:
  hash_threshold *= 0.25  -- prefer splitting at block boundaries
```

**Hierarchical chunking** — three simultaneous granularities:
```
Fine:   M = 2^8   → ~256 tok  (handle projections, grep)
Medium: M = 2^10  → ~1024 tok (skeletal compaction)
Coarse: M = 2^12  → ~4096 tok (page table entries)

Coarse: [================|================|================]
Medium: [====|====|=====|====|=====|====|=====|====|======]
Fine:   [==|==|==|==|===|==|==|===|==|==|===|==|==|==|===]
```

Each level refines the one above. Page table indexes coarse; handle projections operate fine; compaction targets medium.

**Implementation:** Rabin fingerprint in GF(2^64). DSML block-boundary bias is multiplicative modifier on split threshold. Chunk size bounds: min 64 tokens, max 8192 tokens.

## Mentions vs Handles → Raw vs Compacted References

- **Mentions/Raw references**: specific content in store, content-addressed
- **Handles/Compacted references**: equivalence classes of mentions (skeletal form's summary citing content hashes)

```
handle: AUTH_DECISION = {
  claim:a7f3e2 ("switching to JWT"),
  claim:b2c4d1 ("PASETO rejected"),
  claim:e8f1a3 ("implementing JWT middleware"),
  claim:d4e9c7 (tool: edit middleware.rs)
}
```

Full invertibility: given handle → retrieve mentions by hash from store, regardless of subsequent context mutations.

## Closed Module Evidence → CoT as Closed Module

Compaction output is a closed citation of original content, not a generative summary.

```
module Chunk_abc123 : sig
  val claim_a7f3e2 : "switching to JWT because sessions don't scale"
  val claim_b2c4d1 : "PASETO library is immature"
  (* closed — no other exports *)
end
```

- Skeletal form can cite existing claims only; cannot fabricate claims without resolvable hashes
- Shadow clone has original turns in context; output format requires content-addressed citations
- Any claim without resolvable hash → flagged as potentially fabricated
- Oracle panel verifies: click claim → resolve hash → confirm citation accuracy (works across arbitrary compaction/injection/reorder cycles)

## Dependency Graph

Mirrors Carter's constraint graph:
- `depends-on(chunk_a, chunk_b)` — a references content from b
- `independent(chunk_a, chunk_b)` — safe to evict independently
- `underdetermined` — not yet analyzed

Dependencies are defeasible with audit trail + downstream recomputation. Oracle can retract incorrect dependencies; panel shows downstream decisions affected.

## Knowledge Is a Citation Graph, Not a Token Sequence

```
Node: entity or claim
Edge: citation, attribution, derivation, dependency
Attributes: properties on nodes, each with provenance
```

Skeletal compaction = **subgraph** of knowledge graph with edges intact and provenance preserved. Full graph in store, queryable.

```
JWT_Decision ──decides──► AuthSystem
    │                        │
    ├──reason──► SessionBottleneck (@5.¶1.s3)
    ├──rejects─► PASETO (reason: "library immature" @7.¶3)
    ├──constraint──► TokenRefresh
    ├──constraint──► MaxExpiry(15min)
    │
    ├──changes──► middleware.rs::session_check → jwt_verify
    ├──changes──► login.rs::+issue_jwt, +refresh_token
    ├──introduces──► Dep(jsonwebtoken, "9.2")
    │
    └──defers──► TokenRevocation
                 └──defers──► RefreshRotation
```

## Stability Under Identity Corrections

Graph corrections are **local edge updates**; text corrections are global find-and-replace.

```
1. Attribute correction: local (one node, one attribute)
2. Identity merge: merge nodes, union edges; check must-link constraints
3. Identity split: split node, partition edges; add cannot-link, check conflicts
4. Provenance correction: update edge source
5. Dependency correction: remove edge; may make chunks evictable (lower fanout)
```

**Invariant:** Graph absorbs corrections without cascading. Text degrades on every correction. Corrections are the normal case, not the exception.

## Oracle Panel Operates on the Graph

Panel is a **graph editor** rendering as text for agent consumption:
- **Edit attribute**: click property → change value → all serializations update
- **Merge entities**: drag handle onto another → constraint check (cannot-links?) → merge or show conflicts
- **Split entity**: create two handles → operator partitions mentions → constraint graph updated → skeletal forms re-serialized
- **Correct provenance**: edge update → citation coordinates updated

## Graph-Aware Compaction

Shadow clone produces **graph deltas**, not text summaries:

```
Shadow clone output:
  ADD_NODE: JWT_Decision (type: decision, hash: c3f2a1)
  ADD_EDGE: JWT_Decision --reason--> SessionBottleneck
  ADD_EDGE: JWT_Decision --rejects--> PASETO
  ADD_ATTR: PASETO.rejection_reason = "library immature"
  ADD_ATTR: PASETO.rejection_confidence = 0.6
  ADD_EDGE: JWT_Decision --changes--> middleware.rs
  ...
```

- Skeletal form in context = serialization of graph nodes/edges
- Graph itself in store; compaction levels (skeletal → referential → evicted) remove from in-context serialization but always exist in stored graph
- Composition: `compact(chunk_a) ∪ compact(chunk_b) = merged graph` (well-defined graph union with constraint checking)

## Underdetermined as First-Class

```
Compaction fidelity per claim:
  grounded    — cited with discourse coordinate, verifiable
  inferred    — derived from context but not directly cited
  undetermined — clone wasn't confident about claim's accuracy
```

Oracle panel renders undetermined claims distinctly (dimmed/dashed). Operator knows what to trust vs audit.

## Block Type Disjointness

```
disjoint(<decide>, <find>)   — decision ≠ observation
disjoint(<tool>, <note>)     — tool call ≠ note
disjoint(<act>, <ask>)       — action ≠ question
```

Structural types preserved through compaction — decisions never downgraded to observations.

## Wire Format: CBOR + TOML

### CBOR for Machine-to-Machine

CBOR (RFC 8949) for structured data between processes.

```
Properties:
  - Self-describing (schema-optional, unlike protobuf)
  - Binary with human-readable diagnostic notation
  - Native: bytes, tags, indefinite-length, maps
  - Content hashes = raw bytes (not hex strings)
  - Handles = tagged values: tag(37, h'a7f3e2...')
  - Tiny library footprint
  - No code generation step

Rejected alternatives:
  protobuf — schema compilation, not self-describing, illegible on wire
  capnproto — zero-copy irrelevant for 200-byte messages, schema compilation
```

CBOR diagnostic notation IS the debug format: `cbor2diag` on UDS stream.

### TOML for Human-Facing Config + Display

```toml
[chunk.a7f3e2b1]
level = "skeletal"
span = "turns 13-24"
tags = ["auth", "jwt", "migration"]
tokens_raw = 4200
tokens_now = 410
pinned = true
pin_reason = "compliance-relevant"

[chunk.a7f3e2b1.deps]
depends_on = ["b2c4d1f8"]
depended_by = ["e8f1a390", "d4e9c7a2"]

[chunk.a7f3e2b1.handle.α]
source = "read(src/auth/middleware.rs)"
status = "consumed"
materialized = 120  # tokens pulled into context
total = 847
```

Content hashes: hex in TOML (human-readable), raw bytes in CBOR (machine-efficient). Panel reads CBOR → renders TOML for operator → parses TOML edits back to CBOR. One canonical data model (CBOR), one human presentation (TOML).

### Bulk Data

External store for verbatim turns, CoT, full tool results — NOT on the wire.

```
store/
  a7f3e2b1.raw    # verbatim turns, raw bytes
  a7f3e2b1.cot    # chain of thought, raw bytes
  a7f3e2b1.skel   # skeletal form, CBOR
  a7f3e2b1.meta   # metadata, CBOR
```

Content-addressed blobs. `mmap` for reads, append for writes. Optional: single append-only file with CBOR index.

### Protocol Summary

```
┌────────────────────────┬──────────────┬─────────────┐
│ Channel                │ Format       │ Why         │
├────────────────────────┼──────────────┼─────────────┤
│ Harness internals      │ Haskell ADTs │ typed, pure │
│ Harness ↔ Store        │ Haskell IO   │ in-process  │
│ Harness ↔ Clone        │ CBOR         │ structured  │
│ Harness ↔ Panel (cmds) │ CBOR on UDS  │ typed ops   │
│ Harness ↔ Panel (state)│ CBOR on UDS  │ queryable   │
│ Panel ↔ Operator       │ native Swift │ UI          │
│ Config files           │ TOML         │ editable    │
│ Bulk storage           │ raw blobs    │ mmap        │
│ Bulk storage index     │ CBOR         │ queryable   │
│ Debug / tailing        │ CBOR diag    │ readable    │
│ In-context (model)     │ DSML         │ token-tight │
│ Cross-agent sharing    │ CBOR         │ portable    │
└────────────────────────┴──────────────┴─────────────┘
```

## Summary

Context window = TLB. Skeletal compaction = page table entry (semi-invertible, compact). Shadow clone = MMU (translation with full knowledge). Snapshots = disk (last resort). Oracle panel = human as runtime context editor (pin, edit, inject, shape). Every claim cites its discourse coordinate. Every coordinate resolves to stored ground truth. Every handle traces to its mentions. Structure in, structure through, structure out.
