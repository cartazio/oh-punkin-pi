# Handle Tools — Push-Down DSL

Tool results exceeding materialization threshold → stored, replaced with **handles** (compact refs).

## Handle Format
```
[Handle §h7: read result, 2500 tokens, 847 lines]
Preview: first few lines...
... (843 more lines)
Use handle_lines("§h7", start, end) to read specific lines.
```

## Tools

```lean
handle_lines : (handle : HandleId!) → (start : ℕ!) → (end : ℕ!)
             → { _ : handle.valid } → { _ : start ≤ end }
             → IO (Result String HandleError)

handle_grep : (handle : HandleId!) → (pattern : String!)  -- regex or literal
            → { _ : handle.valid }
            → IO (Result (List MatchLine) HandleError)

handle_head : (handle : HandleId!) → (n : ℕ!)
            → { _ : handle.valid } → IO (Result String HandleError)

handle_tail : (handle : HandleId!) → (n : ℕ!)
            → { _ : handle.valid } → IO (Result String HandleError)

handle_count : (handle : HandleId!)
             → { _ : handle.valid } → IO (Result ℕ HandleError)

cot_replay : (turn : ℕ!) → { _ : turn < currentTurn } → { _ : cotStored(turn) }
           → IO (Result String CotError)
```

## HandleError
```haskell
data HandleError
  = HandleNotFound HandleId
  | HandleEvicted HandleId Text
  | InvalidRange Natural Natural Natural   -- start, end, total
  | PatternError Text Text                 -- pattern, reason
```

## Usage
- Large reads → handle_grep to find, handle_lines to extract
- Under `<context_pressure>` → prefer handle ops over materialization
- Search before read: handle_grep first, handle_lines on matches
- **Anti-pattern**: materializing full handle content; re-reading file ignoring handle; full materialization under pressure

Cross-refs: extends codata semantics from **codata-semantics.md** (handles as thunks/observations); handle lifecycle tied to **01-store.md** (content-addressed store); context pressure from **compaction-invertibility.md**.
