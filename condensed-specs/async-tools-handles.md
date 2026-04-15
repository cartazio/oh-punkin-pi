## Async Tool Calls with Status Handles

**Cross-refs**: compaction-invertibility (skeletal forms, store), oracle-panel (timeline view), kage-no-bushin (shadow clones), 01-store (external store), context-dsl (context operations), codata-semantics (thunks/handles)

### Core Problem
Synchronous tool calls block inference — each call is a turn boundary requiring full context re-attention. Agent compute idles during I/O.

### Async Tool Calls
- Tool calls become **non-blocking** — agent gets back a **status handle** (lightweight reference resolving to result when ready)
- Agent continues generating, reasoning, issuing more tool calls
- Results stream back as they complete; agent incorporates on arrival

### Status Handles in Turn Marginalia
Handles live in **marginalia** — structured annotations on turns, not inline content.

**Marginalia benefits:**
- Don't pollute reasoning flow — clean CoT with structured data attached
- **Independently compactable** — tool results handled separately from reasoning during compaction
- **Own residency levels**: Inline (full) | Truncated (first N lines + handle) | Handle-only (metadata + store ref) | Evicted (page table only)
- Oracle panel renders marginalia separately (reasoning left, tool timeline right; operator can expand/pin handles)

### CarterKit Interaction
- Tool results are biggest context bloat (single bash → 5k tok, file read → 10k tok)
- Async marginalia makes them independently manageable

**Compaction priority:**
```
1. Truncate large tool results in marginalia (keep summary + handle)
2. Evict stale tool results (old reads, superseded outputs)
3. Compact reasoning turns to skeletal (preserve decisions)
```

- Reasoning stays full-fidelity longer; expendable tool output compressed first
- **Speculative compaction**: shadow clone can compact while async calls still resolving — handle serves as stable reference

### Handle Lifecycle
```
Pending → Resolved → Consumed → Evictable → Compacted
```
- **Pending**: agent issued call, waiting
- **Resolved**: result ready, in marginalia
- **Consumed**: agent has read and acted on result
- **Evictable**: result no longer referenced by live reasoning
- **Compacted**: summary in skeletal, full result in store

Tracked in page table. Eviction scorer knows which handles are live-referenced vs consumed-and-done.

## Call-by-Name Handles and Push-Down DSL

### Call-by-Name: Handles Are Thunks
A handle is a **thunk** — suspended computation that materializes only when forced. Result exists in **external store**, not context. Agent decides what/how much to materialize.

```
§α = handle(read, path="foo.rs")
-- §α is NOT file contents — it's a reference to a computation
-- Agent can:
--   1. Force: materialize(§α) → full contents enter context
--   2. Query: §α.line(47) → one line enters context
--   3. Transform: §α.grep("fn.*pub") → filtered result
--   4. Summarize: §α.count_lines() → single number
--   5. Pipe: §α.grep("error") |> §β.input → never in context
```

### Push-Down DSL
Push computation DOWN to data instead of pulling data UP into context.

```
-- Call-by-value (bad): 5k tokens in context
result = tool(bash, "cargo test")

-- Call-by-name (good): surgical materialization
§t = handle(bash, "cargo test")         -- 0 tokens in context
§t.exit_code                            -- 1 token
§t.grep("FAILED")                       -- ~50 tokens
§t.tail(20)                             -- ~200 tokens
```

**DSL Operations:**
```
Zero materialization:
  §h.exists(), §h.size(), §h.type()

Projection (minimal materialization):
  §h.line(n), §h.lines(start, end), §h.head(n), §h.tail(n), §h.slice(offset, len)

Search (filtered materialization):
  §h.grep(pattern), §h.grep_context(pat, n), §h.find(string)

Transform (computed materialization):
  §h.json_path(expr), §h.count_lines(), §h.count_matches(pat)
  §h.summary(max_tok), §h.extract(question)

Composition (handle → handle, never in context):
  §h.grep(pat) |> §g, §h.transform(fn) |> §g, merge(§a, §b)
```

### Sub-Computation Engines
Push entire computations down — DSL dispatches **sub-computations** outside agent context:
- **Lua**: sandboxed text processing, agent-generated snippets
- **jq**: JSON tool results
- **SQL**: structured data queries
- **Tree-sitter**: code-aware queries without reading file into context
- **Smaller model**: summarization sub-tasks (10k → 200 tok)

Result is always a new handle (0 context cost until forced).

### Materialization Budget
Soft cap on tokens of tool results pulled into context per turn.

```
§file = handle(read, "big_file.rs")     -- 8,000 tokens
§file.materialize()                      -- DENIED: exceeds budget
§file.head(50)                           -- ok: ~500 tokens
```

**Dynamic budget by context pressure:**
- <50% context: generous, materialize freely
- 50-75%: moderate, prefer projections
- \>75%: tight, handles only, push-down DSL

Oracle panel shows budget/usage; operator can override.

### Handles in Page Table

```
HandleEntry = {
  id          : HandleId,
  source      : ToolCall,
  status      : pending | resolved | forced | evicted,
  store_ref   : StoreRef,
  materialized: TokenCount,
  total_size  : TokenCount,
  projections : List<Projection>,
  dependents  : Set<ChunkHash>,
  turn        : TurnIndex,
}
```

**Compaction interaction:**
- Never-materialized handle → evict for free
- Small projections materialized → compact projections into skeletal
- Full materialization → treat like any marginalia tool result

### Idempotent Tool Calls

**Required because:**
1. **Compaction replays** — clone re-encounters tool calls during re-derivation
2. **Page faults** — fault resolution may re-execute computation paths
3. **Handle re-materialization** — compacted projections may need re-resolution
4. **Speculative execution** — unused handles have side-effect implications
5. **Multi-agent sharing** — agent B forcing agent A's handle

**Classification:**
```
Pure (always safe to cache/re-execute):
  read(path), bash("cat/grep/find/ls/stat/..."), grep, find

Session-stable (same within session, may change across):
  bash("cargo test/check"), bash("git status"), bash("curl GET")

Non-idempotent (side effects):
  bash("rm/mv/cp/mkdir"), write(), bash("git commit"), bash("curl POST")
```

**Harness behavior by class:**
- **Pure**: aggressive caching + deduplication, clone safe to re-execute
- **Session**: snapshot semantics, cache with TTL/invalidation
- **Non-idempotent**: MUST use stored result, never re-execute; logged with before/after state; skeletal captures delta not instruction

**Handle deduplication** (free caching):
```
§a = handle(read, "foo.rs")
§b = handle(read, "foo.rs")
-- §b = §a (deduplicated, no second execution)
```

**Idempotency tagging in tool definitions:**
```
tool_def(read, {
  idempotency: "pure",
  cache_key: (path,),
})

tool_def(bash, {
  idempotency: "inferred",
  classifier: cmd → {
    /^(cat|grep|find|ls|head|tail|wc)/ → "pure",
    /^(cargo test|cargo check|cargo clippy)/ → "session",
    /^(rm|mv|cp|mkdir|write|git commit)/ → "non-idempotent",
    _ → "unknown" (treat as non-idempotent, warn)
  }
})

tool_def(write, {
  idempotency: "non-idempotent",
  captures: "before_after",
})
```

### Implementation: Async in the Harness

1. **Tool call interception**: harness intercepts tool call tokens mid-generation, executes async, injects handle token back into stream
2. **Continuation**: model continues generating after handle injection
3. **Result injection**: completed results go to marginalia of current turn; available immediately if model still generating, else next turn
4. **Handle resolution in context**: model sees `§α:pending`, `§α:resolved(847tok)`; marginalia contains full resolved data

**Model support required:** emit tool calls without stopping generation, reference handles in reasoning, access marginalia mid-turn.

**Implementation path:**
- **Short term**: simulate via rapid multi-turn — N tool calls executed in parallel, all results returned in single turn
- **Medium term**: streaming tool call protocol — harness intercepts/executes async, injects via control channel
- **Long term**: native model support for async handles + marginalia as first-class context structure
