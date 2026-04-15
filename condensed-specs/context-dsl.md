# Context Manipulation DSL

**Author:** Carter Schonwald | **Date:** 2026-02-24 | **Status:** Speculative/foundational

## Core Insight

Context manipulation history is a DSL program. Current context = eval(program). History is source code.

```
ctx = empty |> inject(system_prompt) |> inject(user_0) |> inject(assistant_0)
  |> inject(user_1) |> inject(assistant_1) |> contract(0..3, skeletal_0, store_ref_0)
  |> inject(user_2) |> branch("hypothetical_0") |> ...
```

## Operations

```haskell
data CtxOp
  = Inject Content
  | Contract Range Content StoreRef       -- range, skeletal form, store ref
  | Expand StoreRef Position              -- pull content back from store
  | Branch BranchName
  | Merge BranchId MergeStrategy
  | Splice Content Position
  | Evict HandleId
  | Materialize HandleId (Maybe Natural)  -- optional budget
  deriving (Show)

data MergeStrategy
  = TakeTheirs      -- clone's final state replaces range
  | TakeOurs        -- discard clone's changes
  | SpliceAt Position  -- insert clone's output at position
  | Conflict        -- manual resolution
  deriving (Show)
```

- **Inject**: Add content to context
- **Contract**: Replace range with skeletal form; full content → store. Invertible via storeRef.
  - `contract : Range → Skeletal → StoreRef → CtxOp`
  - Invariant: `expand(storeRef) ≃ original range` (by adequacy)
- **Expand**: Inverse of contract. `expand : StoreRef → Position → CtxOp`
  - `expand ∘ contract ≃ id` (up to adequacy)
  - `contract ∘ expand = id` (strict, residency change only)
- **Branch**: Fork program, creates new version line. Clone gets context copy at branch point.
- **Merge**: Join branch back. Strategies: TakeTheirs, TakeOurs, SpliceAt, Conflict.
- **Splice**: Insert content at position (merge output, oracle edits, etc.)
- **Evict**: Remove handle from hot context, keep in store. Accessible via handle ops.
- **Materialize**: Pull handle content into context, subject to budget.

## Version Graph

States = nodes, operations = edges. Properties: append-only (log level), branching, convergent (via Merge), invertible contractions (via Expand).

```
s₀ →inject(system)→ s₁ →inject(user_0)→ s₂ →inject(assistant_0)→ s₃
  s₃ ─branch("hyp")─→ s₃' →inject(speculative_edit)→ s₃'' ─merge(splice)─→ s₄
  s₄ →contract(0..2, skel, ref)→ s₅  (s₅ ≃ s₄, adequate)
  expand(ref) → back to s₄ equivalent
```

## Adequacy

Two programs equivalent iff adequate for same tasks:
```
p₁ ≃ p₂  iff  ∀ task ∈ TaskSpace: adequate(eval(p₁), task) ↔ adequate(eval(p₂), task)
```

- Information-theoretic: mutual information with task preserved (relevant info, not all info)
- Like sufficient statistics for inference
- **Contraction adequacy**: `I(skeletal; future_tasks) ≈ I(original; future_tasks)`
- **Task-relative**: adequate for "continue conversation" ≠ adequate for "debug turn 5"
- Expansion is escape hatch when contraction wasn't adequate

## Invertibility

**Key invariant: Contractions are always invertible.** Not lossy compression — residency management. Information exists, question is where (hot context vs cold store).

```
contract(range, skeletal, storeRef)  -- range content → store, skeletal → context, NOTHING LOST
expand(storeRef, position)           -- store content → context, full fidelity restored

ctx ──contract──▶ ctx' ──expand──▶ ctx''
ctx'' ≃ ctx  (information equivalent, maybe not identical positioning)
```

## Mapping to Existing Pieces

| Current | DSL Model |
|---------|-----------|
| Session append | `Inject` |
| Compaction | `Contract` |
| Handle summary | `Contract` on tool output |
| Handle tools | Ops for observing evicted content |
| Branch/fork | `Branch` |
| Clone merge | `Merge` |
| Store (blobs) | `StoreRef` target |

Session manager becomes: version graph of states + operation log (DSL program) + evaluator (program → current context).

## Checkpoint / Replay

- **Checkpoint** = save program prefix: `checkpoint(s₅) = [op₀, op₁, ..., contract(...)]`
- **Replay** = re-evaluate: `replay(checkpoint) = eval(op₀ |> op₁ |> ... |> contract(...))`
- **Time travel** = evaluate prefix: `at_state(s₃) = eval(op₀ |> op₁ |> op₂)`

## Program Transformations (adequacy-preserving)

- **Fusion**: `inject(a) |> inject(b) |> contract(0..1, skel_ab, ref) ≃ inject(skel_ab)` (if ref exists)
- **Reordering** (independent ops): `inject(a) |> evict(h₀) ≃ evict(h₀) |> inject(a)` (if a doesn't depend on h₀)
- **Contraction hoisting**: `inject(a) |> inject(b) |> inject(c) |> contract(0..2, skel, ref) ≃ contract_at_source(a, b, c, skel, ref)` (never materialize full, go straight to skeletal)

## Evaluator

```haskell
data CtxProgram = CtxProgram
  { cpOps      :: [CtxOp]
  , cpBranches :: Map BranchId CtxProgram
  }

data VersionGraph = VersionGraph
  { vgNodes    :: Map StateId CtxState
  , vgEdges    :: Map StateId [(CtxOp, StateId)]
  , vgHead     :: StateId
  , vgBranches :: Map BranchId StateId
  }

eval :: CtxProgram -> CtxState
eval = foldl' apply emptyCtx . cpOps

apply :: CtxState -> CtxOp -> CtxState
apply st (Inject c)           = st { csContent = csContent st <> [c] }
apply st (Contract r skel sr) = contractImpl st r skel sr
apply st (Expand sr pos)      = expandImpl st sr pos
apply st (Branch _)           = st  -- branching is graph-level, not state-level
apply st _                    = st  -- ...
```

## Open Questions

1. **Adequacy oracle** — Model self-assessment? External validator? Learn from expansion patterns?
2. **Eager vs lazy contraction** — Proactive (pressure-based) or reactive (inadequacy detected)?
3. **Branch GC** — When discard abandoned branches?
4. **Merge conflict resolution** — Model's role vs operator's role?
5. **Cross-session programs** — Ops referencing other sessions? (Shared history, cross-agent knowledge)
6. **Streaming operations** — Partially applied ops? (Inject streaming content)

---

**Cross-refs**: compaction-invertibility (invertibility formalism), async-tools-handles (handle/evict/materialize), kage-no-bushin (branch/clone primitive), codata-semantics (handle-as-thunk model), 01-store (StoreRef target)

**Punchline**: Context window = eval(versioned program). Contractions invertible. Equivalence = adequacy. DSL + versioning + invertible contractions + adequacy = potent.
