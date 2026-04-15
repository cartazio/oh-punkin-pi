# Tool Execution Model & Reasoning Gates

**Author:** Carter Schonwald | **v1** | 2026-02-24T14:15:15 NYC | DRAFT

## Execution Categories

- **Sync (inline):** `start_squiggle`, `end_squiggle` — execute immediately, generation waits
- **Async (parallel default):** dispatch immediately, results via handles
  - Pure: `read`, `grep`, `find`, `ls`
  - Impure/gated: `edit`, `write`
  - Impure/sequential: `bash` (strictly sequential chain, each waits for all prior bash)

## Dependency Inference

- **Default:** parallel
- **Bash:** strictly sequential (all bash calls form chain)
- **Path-based:**
  - Pure → Pure (same path): parallel OK
  - Impure → Any (same path): sequential (read waits for edit)
  - Any → Impure (same path): see read/write gating

| Tool | Purity | Notes |
|------|--------|-------|
| `read`, `grep`, `find`, `ls` | Pure | Read-only |
| `edit`, `write` | Impure | Modifies/creates file |
| `bash` | Impure | Arbitrary side effects |
| `start_squiggle`, `end_squiggle` | Pure | Annotation only |

## Read/Write Gating via Visible Reasoning

### Core Invariant

**Edit/write to path P requires:**
1. Unshadowed read of P covering affected region
2. Completed squiggle block AFTER read and BEFORE edit/write

### Unshadowed Read

Write/edit to P invalidates (shadows) prior reads of P.

```
read(foo.txt)        → reads[foo.txt] = valid
squiggle(...)        → reasoning
edit(foo.txt, 10-20) → OK; reads[foo.txt] = INVALIDATED
edit(foo.txt, 25-30) → BLOCKED (read shadowed/stale)
# Must re-read to edit again
```

### Squiggle Requirement

Squiggle between read and write = **proof of cognition**. Prevents blind edits, "trust me" edits, cargo cult edits (read → immediate edit), stale edits.

```
read(foo.txt) → edit(foo.txt)           → BLOCKED (no squiggle)
read(foo.txt) → squiggle → edit(foo.txt) → OK
```

## Execution Flow

- Tool calls processed **as they appear in stream**, not batched at end
- Async tools return handles: `await(h)`, `await_any([h1,h2])`, `await_all([h1,h2])`

### Gate Enforcement on edit/write

1. Check unshadowed read exists for path → No: auto-inject read, edit waits
2. Check completed squiggle after most recent read → No: block, emit error
3. Dispatch edit

## Squiggle Tools

### start_squiggle
- **Sync** | No params
- Returns: timestamp (NYC), turn number, inter-turn delta, sigils from USER_CODEBOOK + SQUIGGLE_CODEBOOK (disjoint), word nonces
- Format: `{userSigil} {squiggleSigil} {userNonce} {squiggleNonce} T=2026-02-24T14:15:15 [NYC=EST/-05:00] turn:3 Δ2m {`

### end_squiggle
- **Sync** | Param: `content` (reasoning text)
- Returns: end timestamp (short), SHA3-256 hash of content (12 hex), cognition duration, mirrored nonces/sigils
- Format: `} T=14:15:45 H=f7c2e9a1b3d5 Δc=30s {squiggleNonce} {userNonce} {squiggleSigil} {userSigil}`

### Codebook Separation

| Codebook | Used For | Theme |
|----------|----------|-------|
| USER_CODEBOOK | Role boundary wrapping (API messages) | Nature (amber, glacier, moss...) |
| ASSISTANT_CODEBOOK | Role boundary wrapping (API messages) | Tools (chisel, lathe, anvil...) |
| SQUIGGLE_CODEBOOK | Squiggle block markers | Celestial (zenith, parallax, syzygy...) |

Pools disjoint — prevents confusion between message wrapping and reasoning blocks.

## Compaction: Shadowed Read Contraction

### Rule

**Writes invalidate reads. 2 turns after shadowing, compact read out of context.**

```
turn N:   read(foo.txt) → 500 lines enter context
turn N+2: edit(foo.txt) → read[foo.txt] SHADOWED
turn N+4: compaction fires → remove read content from turn N
```

- Writes shadow reads (not vice versa)
- **Bash shadows ALL reads** (cannot statically determine touched paths) — context nuke

### Why 2 turns: model may still be mid-reasoning; but stale content is waste after reasoning completes. Principled trigger (semantic invalidity) vs heuristic.

### Implementation

Track per-read: `path`, `turn`, `bodyId` (§body:... content-addressable), `shadowedAt`

```
for read in reads:
  if read.shadowedAt and (currentTurn - read.shadowedAt) >= 2:
    compact(read)  # replace body with tombstone, preserve brackets + bodyId
```

### Preserve Brackets, Invalidate Body

**Critical invariant:** Compaction removes content but preserves structural markers (turn boundaries, squiggle delimiters, timestamps, hashes, sigils).

```
# Before:
🐉 amber-beacon-frost T=... turn:3 {
§body:f7c2e9a1b3d5
[500 lines of content]
} T=... H=f7c2e9a1b3d5 amber-beacon-frost 🐉

# After:
🐉 amber-beacon-frost T=... turn:3 {
§body:f7c2e9a1b3d5 [COMPACTED: read(foo.txt) 500 lines - shadowed at turn:5]
} T=... H=f7c2e9a1b3d5 amber-beacon-frost 🐉
```

`H=` in closing tag = body UUID = integrity hash. `§body:` prefix = content-addressable ID.

### Body UUID Properties
- Content-addressable: hash(content) = ID
- Stable across compaction (survives tombstoning)
- Reference target, dedup key, existence witness

### Tombstone Format
```
[COMPACTED: {tool}({args}) {size} - {reason} at turn:{N}]
```

## Danger Zone Tools

### Categories
1. **Pure** — read, grep, find, ls, pwd, which: no side effects, parallel, no gating
2. **Tracked mutation** — edit, write, mkdir, touch, mv, cp: parseable side effects, squiggle-gated
3. **Danger zone** — rm, chmod, chown: destructive, requires interactive `allow` confirmation
4. **Untrackable** — bash: nukes all read context

### Interactive Confirmation
- Danger zone: user types full word `allow` (friction is the feature)
- Critical paths (`.git`, `~`, `/`, outside cwd): requires `allow` then `yes`
- Batch: one confirmation for multiple paths; encourage glob/list

### Batch Operations
- List multiple paths in one call (one confirmation > five)
- Batching enables internal parallelism: `read([a,b,c])` > 3× `read(a)`
- Returns individual handles: `§h1, §h2, §h3 = read(["a.txt", "b.txt", "c.txt"])`

## Open Questions

1. Squiggle content validation: verify it references the file, or existence sufficient?
2. Auto-inject reads on blocked edit, or error and let model retry?
3. Partial reads: read lines 1-50 but edit 60-70 — valid? Need coverage check?
4. Bash squiggle gating? Arguably more dangerous than edit.
5. Write (new file): exempt from read requirement? Require squiggle with intent?
6. Handle naming: auto `§h1` vs model-bound `§myhandle = read(...)` — cleaner semantics vs more syntax

## Cross-References

- **context-dsl.md** — Context manipulation DSL, versioned context graph
- **compaction-invertibility.md** — Token budget, compaction summary generation
- This spec defines: compaction trigger (shadowed reads → tombstone after 2 turns), compaction invariant (preserve brackets, invalidate body)
