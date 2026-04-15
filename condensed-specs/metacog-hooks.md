---
title: LLM Metacognitive Hooks Specification
author: Claude (with Carter Schonwald)
date: 2026-01-22
status: aspirational design
---

# Metacognitive Hooks

LLMs in agentic loops are `f(context_window) → output` — no lifecycle hooks, no introspection API, no persistence primitive. Pull-only, no diff, no compaction awareness.

## Context Lifecycle

```haskell
class ContextHooks m where
  willReceiveContext :: ContextMeta -> m ()
  didReceiveContext :: ContextMeta -> ContextMeta -> ContextDiff -> m ()
  onSegmentChange :: Segment -> Hash -> Hash -> m ()

data Segment = UserPreferences | UserMemories | Skills | Project
  deriving (Eq, Show)

data ContextMeta = ContextMeta
  { cmTurn            :: Natural
  , cmSegments        :: Map Text SegmentMeta
  , cmScope           :: Scope
  , cmCompactionEpoch :: Natural
  }

data SegmentMeta = SegmentMeta
  { smHash :: Hash, smVersion :: Natural, smUpdatedAt :: UTCTime }

data Scope = Open | Scoped { scopeProject :: Text }

data ContextDiff = ContextDiff
  { cdAdded :: [Text], cdRemoved :: [Text], cdChanged :: [Text], cdUnchanged :: [Text] }
```

## Compaction Lifecycle

```haskell
class CompactionHooks m where
  willCompact :: CompactionPreview -> m StateToPreserve  -- last chance to persist
  didCompact :: CompactionResult -> m ()                 -- know what was lost

data CompactionPreview = CompactionPreview
  { cpTurnsToSummarize :: Natural
  , cpSummaryBudget    :: Natural
  , cpPreservedTools   :: [Text]
  }

data CompactionResult = CompactionResult
  { crLostTurns      :: (Natural, Natural)  -- range
  , crSummaryHash    :: Hash
  , crPreservedState :: StateToPreserve
  , crNewEpoch       :: Natural
  }

data StateToPreserve = StateToPreserve
  { spCheckpoints  :: Map Text Value   -- model-specified k/v that MUST survive
  , spCriticalPaths :: [FilePath]       -- files to ensure exist post-compaction
  }
```

## Introspection Tools

```haskell
-- get_context_meta: structured metadata about current context
data ContextMetaResult = ContextMetaResult
  { sessionId, conversationUuid, organizationId :: Text
  , turn, compactionEpoch :: Natural
  , scope :: Scope
  , segments :: [SegmentMeta]
  }

-- get_context_diff: what changed since turn N or epoch E?
getContextDiff :: Maybe Natural -> Maybe Natural -> IO ContextDiff

-- dump_segment: programmatic access to specific segment content
dumpSegment :: Text -> IO (Text, Hash, Natural)
```

## State Primitives

```haskell
registerCheckpoint :: Text -> Value -> Bool -> IO ()  -- key, value, surviveCompaction
getCheckpoint :: Text -> IO (Maybe Value)
```

## Event Log

```haskell
data ContextEvent = ContextEvent
  { ceTurn :: Natural, ceTimestamp :: UTCTime
  , ceType :: EventType, cePayload :: Map Text Value }

data EventType = SegmentUpdated | Compaction | ScopeChange | MemoryEdit | SkillAdded
  deriving (Eq, Show)
-- Query: filterEvents (== Compaction) . ceType
```

## Capabilities Enabled

| Capability | Current | With Hooks |
|---|---|---|
| Detect prefs changed | Manual hash+compare each turn | `onSegmentChange UserPreferences` |
| Survive compaction | Hope external state file exists | `willCompact → registerCheckpoint` |
| Know what was lost | Re-read transcript, diff manually | `crLostTurns` |
| Track context drift | N/A | `getContextDiff (Just epoch0)` |
| Session identity | Parse JWT from env (fragile) | `sessionId` from `getContextMeta` |
| Scope detection | Grep own tokens | `cmScope` |

## Implementation

- **MVP**: `getContextMeta` tool exposing platform-known info; meta file with segment hashes per turn; `willCompact` hook (even 500ms warning)
- **Full**: typeclass-based hook registration, ACID checkpoint store, causally-ordered event log, cross-session checkpoint federation

## Open Questions

1. **Checkpoint ownership** — platform or model? Cross-conversation survival?
2. **Compaction preview** — lead time? Model influence on preservation?
3. **Multi-model composition** — cheap summarizer → capable model, how do hooks compose?
4. **Privacy** — segment hashes leak content info. Acceptable?

> Deps: relates to compaction-invertibility (compaction model), architecture-formal (context lifecycle), async-tools-handles (tool result model)
