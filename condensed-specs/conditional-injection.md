# Conditional Injection

**Author:** Carter Schonwald — **Date:** 2026-03-17 — **Status:** Draft
**From:** oh-my-pi TTSR, CarterKit boot saliency

## Core Idea

Rules/skills/context have zero cost until relevant. Matcher watches conversation stream, injects via `Inject` op (context-dsl) when trigger predicate fires.

## Types

```haskell
data ConditionalInjection = ConditionalInjection
  { ciName     :: Text
  , ciTrigger  :: Trigger
  , ciContent  :: Content        -- skill, rule, context fragment
  , ciTiming   :: InjectionTiming
  , ciPolicy   :: FirePolicy
  , ciFired    :: IORef Bool
  }

data Trigger
  = StreamRegex Text             -- match on model output stream
  | KeywordSet [Text]            -- any keyword in user/assistant turn
  | DescriptionMatch Text        -- semantic similarity on skill description
  | ToolInvocation Text          -- specific tool called
  | Composite [Trigger] LogicOp

data LogicOp = Any | All

data InjectionTiming
  = Interrupt                    -- abort generation + inject + retry
  | NextTurn                     -- inject before next LLM call
  | Immediate                    -- inject into current system message

data FirePolicy
  = OneShot                      -- fire once per session
  | NShot Natural                -- fire up to N times
  | Repeatable                   -- always eligible
```

## Timing Semantics

- **Interrupt (TTSR):** Stream monitor regex match mid-generation → abort → inject as system reminder → retry same user msg. Cost: one wasted partial gen, amortized over sessions where most rules never fire.
- **NextTurn:** Trigger matched in completed turn → inject skill/context before next LLM call. Cost: zero wasted gen, one turn latency.
- **Immediate:** Trigger checked pre-generation (e.g. tool invocation) → inject into current system prompt. Cost: zero, but trigger must be evaluable before generation.

## Matcher Pipeline

```haskell
data MatcherState = MatcherState
  { msInjections :: [ConditionalInjection]
  , msStreamBuf  :: IORef Text
  , msFiredSet   :: IORef (Set Text)
  }

-- Each output delta during streaming
onStreamDelta :: MatcherState -> Text -> IO [ConditionalInjection]
onStreamDelta st delta = do
  modifyIORef' (msStreamBuf st) (<> delta)
  buf <- readIORef (msStreamBuf st)
  fired <- readIORef (msFiredSet st)
  let eligible = filter (canFire fired) (msInjections st)
      matched  = filter (matches buf) eligible
  for_ matched (markFired st)
  pure matched

-- At turn boundary
onTurnEnd :: MatcherState -> [Message] -> IO [ConditionalInjection]
onTurnEnd st msgs = do
  fired <- readIORef (msFiredSet st)
  let eligible = filter (canFire fired) (msInjections st)
      deferred = filter (isNextTurn . ciTiming) eligible
      matched  = filter (matchesTurn msgs) deferred
  for_ matched (markFired st)
  writeIORef (msStreamBuf st) ""
  pure matched

canFire :: Set Text -> ConditionalInjection -> Bool
canFire fired ci = case ciPolicy ci of
  OneShot    -> ciName ci `notMember` fired
  NShot n    -> countFires (ciName ci) fired < n
  Repeatable -> True
```

## Cross-References

- **context-dsl.md**: Injection = `Inject` op; trigger is predicate guard
- **boot-sequence**: Saliency concept mechanized here
- **metacog-hooks.md**: `onSegmentChange` hooks = special case where trigger is segment hash change

## Implementation Priority

1. **NextTurn + KeywordSet** — simplest, zero wasted gen
2. **StreamRegex + Interrupt** — TTSR, needs stream monitor + abort/retry
3. **DescriptionMatch** — deferred until embedding pipeline

## Open Questions

1. Interrupt cost accounting (wasted token tracking?)
2. Trigger ordering on simultaneous matches — all or priority?
3. Injection size budget to prevent context bloat?
4. Lua predicates for trigger flexibility?
