# Kage no Bushin: Shadow Warrior Hearts and Transactional Hypotheticals

**Author:** Carter Schonwald | **Date:** 2026-02-22 | **Status:** Design spec, not implemented
**Depends on:** `design.md`, `context-dsl.md`

## Naming
影武士心 (kage bushi shin) — shadow warrior's heart. Clone has own reasoning/chain-of-thought; returns results + reasoning trace.

## Overview
Kage no Bushin is the unified primitive underlying:
1. **Compaction** — clone summarizes, parent splices
2. **Subagents** — clone does subtask
3. **Speculative execution** — clone tries risky thing, parent decides
4. **Transactional edits** — clone sequence with commit/abort

## Clone Work Modes

### Narrative Compression
- **Input**: Context DSL program (inject, contract, branch, merge...)
- **Output**: Transformed program (compacted, spliced, restructured)
- **Preserves**: Operational semantics, replayability
```
clone(task: "compact this range")
  → reads program history → produces skeletal form + store refs
  → returns: contract(range, skeletal, ref)
```

### Semantic Extraction
- **Input**: Raw context content
- **Output**: Knowledge graph nodes/edges
- **Preserves**: Semantic content, reasoning structure
```
clone(task: "extract decisions from this range")
  → returns: [KGNode(decision, ...), KGEdge(depends_on, ...)]
```

### Combined
Clone does both — extract semantics AND compress narrative:
```
clone(task: "compact with knowledge extraction")
  → returns: { program_op: contract(...), knowledge: [...] }
```
Narrative layer is foundation (always). Semantic layer is enrichment.

### Isekai: Transport to Parallel World
Clone spawns with context in **branched working tree** — COW overlay, may or may not merge back.
- **Hypotheticals**: isolated risky edit, parent decides merge
- **Parallel exploration**: multiple clones try different approaches
- **Transactions**: sequence of clones, all-or-nothing merge
- Commits → merge back | Aborts → discard, parent unchanged

## Core Insight
Clone is a **branch point in three spaces simultaneously**:
1. **Context** — conversation history, working set, handles
2. **Working tree** — file system state
3. **Execution** — continuation of agent loop

Composition and transactions come from controlling how these three spaces merge back (or don't).

## Part 1: Clone Primitive

### Spawn Modes
```haskell
data SpawnMode
  = Isolated                  -- blank context, fresh working tree view
  | Bushin                    -- full context copy, COW working tree
  | BushinAt TurnId           -- context up to turn N
  deriving (Show)

-- Current subagent = Isolated | Kage no bushin = Bushin | Rollback/replay = BushinAt
```

### Clone Lifecycle
```
spawn(Clone) → Running → Completed → commit() (parent merges) | abort() (discarded)
                  ↑                        │
                  └────── (continue) ──────┘
```

### What Gets Cloned

| Resource | Isolated | Bushin |
|----------|----------|--------|
| Context (messages) | Empty | Full copy |
| System prompt | Custom | Inherited + custom suffix |
| Working tree | Shared (read-only default) | COW overlay |
| Handles | None | Copies (not aliases) |
| Tool permissions | Explicit allowlist | Inherited |
| Token budget | Explicit | Inherited remainder |

### COW Working Tree
Bushin sees parent's files, writes go to overlay:
```
Parent: /project/    Clone overlay: /tmp/clone-§c0/overlay/
Read: overlay empty → read from parent
Write: → write to overlay → parent unchanged
Delete: → whiteout in overlay → parent unchanged
```
Implementation options: **OverlayFS** (Linux, fast), **Git worktree** (portable, natural diff), **In-memory overlay** (simple, memory-hungry), **FUSE** (portable, complex).
MVP: git worktree — already have git, get diff for free.

## Part 2: Hypotheticals
A hypothetical is a bushin with **deferred commit semantics**.

### API
```haskell
data HypotheticalConfig = HypotheticalConfig
  { hcTask       :: Text
  , hcMode       :: SpawnMode           -- default: Bushin
  , hcValidate   :: Maybe Validator
  , hcAutoCommit :: Bool                -- default: False
  , hcTimeout    :: Maybe NominalDiffTime
  , hcAllowedTools :: Maybe [Text]
  }

data Validator
  = ValidatePredicate (SubagentResult -> Bool)
  | ValidateTestSuite Text              -- command, exit 0 = pass
  | ValidateDiff (Maybe Natural) (Maybe Natural)  -- maxLines, maxFiles
  | ValidateHuman                       -- wait for operator approval

data HypotheticalStatus
  = HypRunning
  | HypAwaitingValidation SubagentResult
  | HypAwaitingApproval SubagentResult Diff
  | HypCommitted SubagentResult Diff
  | HypAborted Text                     -- reason
  | HypFailed Text                      -- error
  deriving (Show)
```

### Lifecycle
```
hypothetical(config) → Running → Validating → pass → AwaitingApproval → commit()/abort()
                                             → fail → Aborted
```

### Tools for Model
- `hypothetical(task, [options])` — spawn speculative clone, returns handle. Options: `validate: "tests"|"diff:N"|"human"|none`, `autoCommit`, `timeout`
- `hypothetical_status(id)` — check status
- `hypothetical_diff(id)` — show what would change
- `hypothetical_commit(id)` — accept, merge overlay into working tree
- `hypothetical_abort(id, [reason])` — reject, discard overlay
- `hypothetical_output(id)` — get clone's output/reasoning without committing

## Part 3: Transactions
Sequence of hypotheticals with **all-or-nothing semantics**.

### API
```haskell
data TransactionConfig = TransactionConfig
  { tcSteps     :: [HypotheticalConfig]
  , tcIsolation :: TransactionIsolation
  }

data TransactionIsolation
  = Serialized      -- each step sees previous step's changes
  | Snapshot        -- all steps see original state
  | ReadCommitted   -- steps see committed changes only
  deriving (Show)

data TransactionStatus
  = TxRunning Natural             -- currentStep
  | TxAwaitingApproval Natural    -- completedSteps
  | TxCommitted
  | TxRolledBack Natural Text     -- failedStep, reason
  | TxFailed Text
  deriving (Show)

data MergeResult
  = MergeClean Overlay
  | MergeConflict [Conflict]

data Conflict = Conflict
  { conflictPath   :: FilePath
  , conflictBase   :: Maybe Text    -- parent version
  , conflictOurs   :: Maybe Text    -- overlay₁ version
  , conflictTheirs :: Maybe Text    -- overlay₂ version
  }
```

### Semantics
- **Serialized** (default): steps sequential, each sees previous. All complete → merge all. Any fails → discard all.
- **Snapshot** (parallel-safe): all clones see same parent state (concurrent). Conflicts → abort or manual resolution.

### Tools for Model
- `transaction(steps)` — execute sequence with all-or-nothing semantics
- `transaction_status(id)`, `transaction_commit(id)`, `transaction_rollback(id)`
- `transaction_step_diff(id, step)` — diff for specific step

## Part 4: Composition Patterns

### Try-Else
```
result = hypothetical("approach A")
if result.failed or not result.validates:
    abort(result)
    result = hypothetical("approach B")
commit(result)
```

### Parallel Exploration
```
clones = [hypothetical("approach A/B/C", autoCommit: false)]
await_all(clones)
best = pick_best(clones, by: "fewest lines changed")
commit(best); abort_all(others)
```

### Checkpoint Rollback
```
checkpoint = current_turn()
try_risky_thing()
if disaster: rollback_to(checkpoint)  # spawns clone at checkpoint, replaces self
```

### Self-Review
Clone reviews parent's recent work via `BushinAt(current_turn - 5)` — has full context of what parent was thinking.

### Composed Validation
```
transaction([
  { task: "implement feature", validate: "tests" },
  { task: "update docs", validate: "diff:100" },
  { task: "add changelog entry", validate: human },
])
# Fails fast, rolls back atomically
```

## Part 5: Clone Safety — Mediated Return

### Problem
Clone output risks: injection attacks, context pollution, trust boundary violations, confused deputy.

### Solution: Mediated Return
```
Clone → Results (raw, untrusted) → Mediator (filter/transform) → Parent (mediated view)
```
Mediator: automated filter, another clone, or operator checkpoint.

### Handle-Like Access
Parent gets **handle** to clone results, not raw output (codata semantics, ref: `codata-semantics.md`):
```haskell
clone_result :: Handle CloneOutput
observe clone_result query    -- filtered view
peek    clone_result n        -- first N lines
summary clone_result          -- auto-generated summary
```

### Trust Levels

| Trust Level | Clone can do | Output handling |
|-------------|-------------|----------------|
| **Sandboxed** | Read-only, no network/secrets | Auto-filter, size limits |
| **Normal** (default) | Full tools, COW filesystem | Handle-based access |
| **Elevated** | Can modify parent's files | Operator approval required |
| **Trusted** | Full access, raw output | Direct merge (rare) |

### Defense in Depth
1. Clone isolation (COW filesystem)
2. Output mediation (handle, not raw)
3. Diff review before merge
4. Operator checkpoint for dangerous ops
5. Rollback (everything invertible)

## Part 6: Implementation Considerations

### NOT Building (Yet)
1. Real overlay filesystem — use git worktree
2. Distributed clone execution — single machine only
3. Persistent transactions — in-memory, lost on crash
4. Nested transactions — flat only, no savepoints
5. Conflict resolution UI — abort on conflict

### Git Worktree Approach
```bash
git worktree add /tmp/clone-§c0 HEAD --detach    # create
# clone works in /tmp/clone-§c0/ ...
git -C /tmp/clone-§c0 diff HEAD                  # diff
git -C /tmp/clone-§c0 add -A && git -C /tmp/clone-§c0 commit -m "hypothetical: task"
git cherry-pick <sha>                             # commit (merge back)
git worktree remove /tmp/clone-§c0 --force        # abort (discard)
```
Pros: built-in diff/merge/conflict, portable, natural checkpoint/rollback.
Cons: git repos only, worktree creation cost, untracked files need handling.

### MVP Phases
- **Phase 1**: `spawn_clone`, git worktree overlay, `hypothetical` tool with manual commit/abort + diff
- **Phase 2**: Validators, `transaction` with serialized isolation, auto-rollback
- **Phase 3**: Snapshot isolation + conflict detection, parallel hypotheticals, checkpoint rollback
- **Phase 4**: Real overlay FS, persistent transaction log, nested transactions/savepoints

## Part 7: Interaction with CarterKit

### Context Branching
On spawn: clone gets copy of page table + handle table. Clone's new chunks don't affect parent.
- **Commit**: clone's new chunks merge into parent's store; context changes optionally merge
- **Abort**: clone's chunks orphaned (GC'd later); parent unchanged

### Compaction as Hypothetical
```haskell
mkCompactionHypothetical :: HypotheticalConfig
mkCompactionHypothetical = HypotheticalConfig
  { hcTask       = "produce skeletal summary of context"
  , hcMode       = Bushin
  , hcValidate   = Just (ValidatePredicate validateCompaction)
  , hcAutoCommit = False           -- parent reviews before splicing
  , hcTimeout    = Nothing
  , hcAllowedTools = Nothing
  }
-- Clone produces summary → parent inspects via hypothetical_output → commit or abort
```

### Handle Forking
Handles in clone are **copies, not aliases**:
```
Parent has §h0 (Resolved, 5000 tokens)
Clone spawns → clone has §h0' (copy)
Clone evicts §h0' → parent's §h0 unchanged
Clone creates §h1 → on commit: copied to parent as §h2 (new id, avoid collision)
                   → on abort: §h1 discarded
```

## Open Questions
1. Git worktree sufficient for MVP or need real overlay FS?
2. Clone token budget — inherit parent's remainder or fresh allocation?
3. Nested hypotheticals — can clone spawn its own? How deep?
4. Handle identity across commit — remap IDs or namespace?
5. Context merge on commit — append, summarize, or discard clone's conversation?
6. Concurrent parent execution — can parent continue while clone runs?
