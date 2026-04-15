---
title: Codata Semantics for LLM I/O
author: Carter Schonwald
date: 2026-01-22
status: foundational framing
sibling: llm_metacog_hooks_spec.md
---

# Codata Semantics for LLM I/O

Current model: `tool() → full result injected into context` (data semantics — eager, full materialization). Token cost = O(result size) regardless of need.

## Data vs Codata

- **Data**: defined by construction, consumed by pattern matching — `data ToolResult = ToolResult Text`
- **Codata**: defined by observations, consumed by asking questions:
```haskell
codata ResultHandle where
  .peek   : Nat → Chunk
  .count  : Nat
  .filter : Predicate → Handle
  .done   : Bool
```
- Key insight (Levy, CBPV): values are inert, computations are active. Tool results should be thunks — suspended computations forced selectively.

## Codata Properties

| Property | Data (current) | Codata (proposed) |
|----------|---------------|-------------------|
| Materialization | Eager, full | Lazy, incremental |
| Cost | O(result size) | O(actually needed) |
| Streaming | No | Yes (if monotonic) |
| Sharing | Copy each use | Reference, observe many |
| Invalidation | Silent staleness | Observable `.valid` |
| Projection | Post-hoc in context | Pushdown, pre-hoc |

## Cost Model

- Observation (query out): ~50 tokens, bounded by query complexity
- Execution: platform's problem, not tokens
- **Result (entering context): unbounded — THIS IS THE COST**

Observation count doesn't matter; result size does. The query language specifies **projections** so results are small:
```
h |> filter(.level = "error") |> group(.date) |> count() |> take(5)
-- Result: 5 numbers, not 100K rows
```

## Compute Pushdown

Helland insight: computation happens where data lives. Context window is precious; remote compute is cheap.
- Bad: materialize 100K rows → filter in context → keep 50 (99,950 tokens wasted)
- Good: ~50 token query → platform computes → 50 rows return

## Query Language Requirements

1. **Compositional**: `h |> f |> g` = pipeline fusion
2. **Typed**: result shape from query shape
3. **Projecting**: specify fields wanted
4. **Aggregating**: count/sum/group without full materialization
5. **Bounded**: explicit limits, no accidental unbounded returns

```
h |> filter(.date > "2026-01-01")
  |> group(.category)
  |> project({ category, total: sum(.amount), n: count() })
  |> sort(.total, desc)
  |> take(10)
```

## Typing Observations (Ornaments)

Handle type encodes valid observations via capability sets:
```haskell
data Handle row cap where ...

data Cap
  = Peek                       -- .peek(n), .count
  | PeekFilter                 -- + filter pushdown
  | PeekFilterProject          -- + column selection
  | PeekFilterProjectAgg       -- + group/sum/count

data Streamability = Streamable | Blocking
```
Ornaments (McBride): result type derived from query. `h |> group(.date) |> project({ date, n: count() })` yields `List<{ date: Date, n: Int }>`, not `JSON`.

## Monotonicity and Streaming

CALM theorem (Hellerstein): monotonic computations stream without coordination.

- **Monotonic** (streamable): filter, map, flatMap, union, projection, take(N)
- **Non-monotonic** (blocking): count, sum, max, distinct, sort, group+aggregate

```haskell
Handle row 'Streamable   -- incremental results
Handle row 'Blocking     -- blocks until complete
```

## Staleness and Invalidation

```haskell
data HandleMeta = HandleMeta
  { hmValid      :: Bool
  , hmObservedAt :: UTCTime
  }

refresh :: Handle row cap -> IO (Handle row cap)
```
- Model checks validity before expensive observation
- Platform pushes `onHandleInvalidated` via hook system (see `llm_metacog_hooks_spec.md`)

## Failure Modes

```haskell
data ObservationResult a
  = Ok a
  | InvalidHandle        -- data deleted/changed
  | Timeout              -- observation too slow
  | QuotaExceeded        -- result too large
  | Partial a            -- streaming died, partial data
```
All failure modes are values in result type, not exceptions.

## Minimal Viable Version

1. **Handles**: `Handle<T>` with `.peek(n)`, `.count`, `.valid`
2. **Filter pushdown**: `handle |> filter(pred)` → narrower handle
3. **Projection**: `handle |> project([f1, f2])` drops columns before return
4. **Limits**: all observations have implicit/explicit bounds

Four primitives. Everything else is optimization.

## Relation to Hooks Spec

Cross-ref: `llm_metacog_hooks_spec.md` (lifecycle events). This doc: I/O semantics. They compose:
- `willCompact` may flush pending observations
- `onHandleInvalidated` notifies of stale references
- `get_context_meta().handles` lists active handles

## Summary

| Current | Proposed |
|---------|----------|
| `tool() → Data` | `tool() → Handle` |
| Result = value | Result = observation capability |
| Cost = result size | Cost = projected result size |
| No streaming | Monotonic ops stream |
| Silent staleness | Explicit validity |
| Compute in context | Compute at data |

**Data is what you have. Codata is what you can ask. The context window is too small for data. Give us codata.**
