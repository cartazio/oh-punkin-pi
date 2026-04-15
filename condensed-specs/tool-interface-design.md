# Tool Interface Design Spec

Intent-first, async, reference-based tool APIs for LLM context.

**Cross-refs**: async-tools-handles (handle semantics), codata-semantics (thunk/deref model), 01-store (ref storage)

## Problem

Current: `view(path) → string`, `bash(cmd) → string` — unbounded, sync, inline. Failures: caller guesses budget, large results → O(n²) attention, no cancel/stream/checkpoint, side effects re-fire on retry.

## Design Principles

### 1. Intent Over Budget
```
Intent = exists | structure | sample | verify | full
view(path, intent) → Response
```

| Intent | Behavior |
|--------|----------|
| `exists` | metadata only |
| `structure` | outline/headers/keys, format-aware |
| `sample` | head + tail, representative |
| `verify` | hash + metadata |
| `full` | everything (explicit danger) |

Default: `sample`.

### 2. Refs Over Inline
```
view(path, intent) → Ref { id, preview: string (~100 chars), meta: { type, size, lines, mtime } }
deref(ref, range?) → Content
```
- Multiple refs open, pick which to expand
- Deref is idempotent read, not re-execution
- Attention cost only for dereferenced content
- Refs persist across turns (cacheable)

### 3. Async Over Blocking
```
start(operation) → Handle
poll(handle) → Progress { pct, preview } | Done { ref } | Error { reason, partial_ref? }
cancel(handle) → ()
```

## API Specification

### view
```
view(path: Path, intent: Intent = sample) → ViewResult

ViewResult =
  | Exists    { exists: bool, type: Mime, size: int, mtime: Timestamp }
  | Structure { outline: Ref, format: string }
  | Sample    { ref: Ref, head_preview: string, tail_preview: string, elided: int }
  | Verify    { hash: string, algo: string, size: int, mtime: Timestamp }
  | Full      { ref: Ref }
  | Refused   { reason: RefusalReason, meta: Exists }

RefusalReason = binary | too_large | unreadable | permission_denied
```
**Invariants:** `Refused` is a value not exception. Binary → always `Refused` w/ metadata. `Full` on large file → may `Refused` w/ suggestion. `ref` always includes preview.

### bash
```
bash_start(cmd: string, timeout: Duration = 30s) → Handle
bash_poll(handle: Handle) → BashProgress

BashProgress =
  | Running  { elapsed: Duration, stdout_size: int, stderr_size: int }
  | Done     { exit: int, duration: Duration, stdout: Ref, stderr: Ref }
  | Timeout  { partial_stdout: Ref, partial_stderr: Ref, at: Duration }
  | Error    { reason: string }

bash_cancel(handle: Handle) → Cancelled { partial_stdout: Ref, partial_stderr: Ref }
```
**Invariants:** Output always to ref, never inline. Partial results on timeout/cancel. `Done` includes refs even for small output.

### dir
```
dir(path: Path, intent: DirIntent = sample, depth: int = 1) → DirResult

DirIntent = exists | stats | sample | full

DirResult =
  | Exists      { exists: bool, is_dir: bool }
  | Stats       { count: int, total_size: int, by_type: Map<Mime, int> }
  | Sample      { entries: Ref, count: int, truncated: bool }
  | Full        { entries: Ref, count: int }
  | Pathological { reason: string, sample: Ref, count_estimate: int? }
```
**Invariants:** Count check before enumeration. `Pathological` on huge dirs. `Stats` uses fs metadata where possible. Glob never expands unboundedly.

### deref
```
deref(ref: Ref, range: Range? = full) → Content

Range = Full | Bytes { start, end } | Lines { start, end } | Search { pattern, context_lines }

Content = { data: string, range_actual: Range, truncated: bool, total_size: int }
```
**Invariants:** Idempotent. `Search` returns matching regions w/ context. `truncated` indicates range exceeded budget.

## Reference Lifecycle
```
Created (view/bash/dir) → Accessed (deref) → Cached (subsequent derefs)
                       → Expired (timeout)
```
- Refs valid for session duration minimum
- Content cached on first deref
- Expiration configurable
- Ref metadata always available without deref

## Recovery Semantics

**Trace** = sequence of (operation, ref) pairs.

**Replay on crash/resume:**
1. Refs valid → deref works (idempotent)
2. Refs expired → re-execute, get new ref
3. Side-effecting ops → marked in trace, replay asks confirmation

**Determinism:** Content-addressed — same inputs + unchanged file → same ref id. Enables caching, dedup, diff detection.

## Migration Path

1. **Safe Defaults**: Default intent=`sample`, binary→`Refused`, output>threshold→truncate+warn
2. **Intent Parameter**: `view(path, intent?)` — backward compatible, explicit `full` for unbounded
3. **Refs**: `view(path, intent) → Ref` + `deref(ref, range?) → Content` — breaking change
4. **Async**: `bash_start`/`bash_poll` for long ops; short ops remain sync (return `Done` immediately)

## Open Questions

1. **Ref storage** — temp filesystem vs dedicated object store?
2. **Cross-session refs** — survive restart? (enables resume, complicates cleanup)
3. **Ref sharing** — cross-session use? (security implications)
4. **Budget hints** — caller suggest budget with intent? (`sample` 1KB vs 8KB)
5. **Streaming deref** — for very large content?

## Summary

| Current | Proposed |
|---------|----------|
| Budget (guess bytes) | Intent (say why) |
| Inline (dumps to context) | Refs (content at rest) |
| Sync (block until done) | Async (poll/cancel) |
| Re-execute on retry | Idempotent deref |
| Failure = exception | Refused = value |
| Unbounded default | Safe default |
