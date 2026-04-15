# CarterKit Protocol Spec (v0)

**Author:** Carter Schonwald | **Date:** 2026-02-27 | **Status:** Proposed

## Layers

### L1: Model-Facing Protocol

Prompt-level contracts: boot sequence (`boot-sequence.md`), handle tools (`handle-tools.md`), pressure signals (`pressure-*.md`), turn brackets (system-generated).

- Brackets are system/tool-generated — model must not synthesize them
- Large tool results → handles; prefer surgical access (`handle_lines`, `handle_grep`) over full rematerialization
- Pressure warnings = hard steering signals for concision

#### L1.1 Structured Output (target)

DSML-style block output with single-token delimiters (`design.md`):
- Block types: `act`, `find`, `decide`, `tool`, `note`, `ref`, `margin`
- No filler prose in output channel; free-form CoT unconstrained
- Incremental introduction with enforcement checks

### L2: Tool Interception + Handle Protocol

#### Decision Protocol (pre-exec)

```haskell
data ToolDecision
  = UseCached HandleId Text
  | Execute HandleId Idempotency
```

#### Capture Protocol (post-exec)

Always persist full result. Choose presentation:

```haskell
data CaptureResult
  = Materialized Text      -- under budget
  | Summarized HandleId Text -- over budget
```

#### Push-Down Operations

```haskell
data HandleOp
  = HLines Natural Natural    -- start, end (1-indexed, inclusive)
  | HGrep Text                -- pattern (regex or literal)
  | HHead Natural             -- first N lines
  | HTail Natural             -- last N lines
  | HCount                    -- line count
  | HCountMatches Text        -- count lines matching pattern
  | HSlice Natural Natural    -- byte offset, length
  | CotReplay Natural         -- turn index
```

- Execute against stored blob; never inject full blob unless explicit
- Return bounded, operation-scoped output

#### Idempotency

```haskell
data Idempotency = Pure | Session | NonIdempotent
```

- `Pure`: dedup + replay-safe
- `Session`: snapshot-safe within session, conservative replay
- `NonIdempotent`: never replay semantically
- Default for unknown: `NonIdempotent`

### L3: Store Protocol

1. Content-addressed blob ops (`putBlob`/`getBlob`)
2. Page table updates (chunks, handles, deps, pressure)
3. Dedup cache (`cacheKey -> handleId`)
4. Oracle log append
5. Compaction log append

Backend replaceable; protocol semantics fixed.

### L4: Wire Protocol

- Transport: Unix domain socket (stream)
- Frame: `u32be length` + CBOR payload (deterministic)
- Schema: CDDL
- Clients: compiled Haskell core + Swift UI

## CDDL Schema (v0)

```cddl
frame = command / response / event

command = {
  "t": "cmd", "v": uint, "id": uint,
  "name": cmd-name, ? "params": any
}

response = {
  "t": "res", "v": uint, "id": uint,
  "ok": bool, ? "data": any, ? "err": err
}

event = {
  "t": "evt", "v": uint,
  "name": evt-name, ? "data": any
}

err = { "code": err-code, "msg": tstr, ? "details": any }

cmd-name = "hello" / "tool.decide" / "tool.capture" / "handle.exec"
         / "cot.capture" / "turn.end" / "pressure.eval"
         / "compaction.enrich" / "oracle.apply" / "watch.subscribe"

evt-name = "handle.updated" / "pressure.changed" / "cot.captured"
         / "compaction.enriched" / "oracle.applied"

err-code = "bad_request" / "not_found" / "conflict"
         / "forbidden" / "timeout" / "internal"
```

### Command Payloads (v0)

```cddl
tool-decide-params = { "toolName": tstr, "args": any }
tool-decide-data = {
  "decision": "use_cached" / "execute",
  ? "handleId": tstr, ? "resultText": tstr,
  ? "idempotency": "pure" / "session" / "non_idempotent"
}

tool-capture-params = {
  "handleId": tstr, "resultText": tstr,
  "contextTokens": uint, "contextWindow": uint, "turnIndex": uint
}
tool-capture-data = {
  "capture": "materialized" / "summarized",
  ? "text": tstr, ? "summary": tstr
}

handle-exec-params = { "handleId": tstr, "op": handle-op }
handle-op =
    { "tag": "HLines", "start": uint, "end": uint }
  / { "tag": "HGrep", "pattern": tstr }
  / { "tag": "HSlice", "offset": uint, "length": uint }
  / { "tag": "HHead", "n": uint }
  / { "tag": "HTail", "n": uint }
  / { "tag": "HCount" }
  / { "tag": "HCountMatches", "pattern": tstr }
handle-exec-data = { "result": tstr }

cot-capture-params = { "turnIndex": uint, "content": [* cot-block] }
cot-block = { "type": tstr, ? "thinking": tstr }
cot-capture-data = { ? "cotHash": tstr }

pressure-eval-params = { "contextTokens": uint, "contextWindow": uint }
pressure-eval-data = {
  "level": "Low" / "Medium" / "High" / "Critical",
  ? "warningText": tstr
}

hello-data = { "name": tstr, "protocolVersion": uint, "capabilities": [* tstr] }
```

## Ordering + Concurrency

1. `tool.decide` before tool execution
2. `tool.capture` exactly once per executed call with `handleId`
3. `turn.end` monotonic by turn index
4. Handle ops are read-only, parallelizable
5. `oracle.apply` serialized for deterministic page-table state

## Error Contract

Failed responses require: `ok: false`, structured `err.code`, actionable `err.msg`.

Error codes: `bad_request` (malformed/unsupported), `not_found` (missing handle/blob/chunk), `conflict` (version mismatch/invalid transition), `forbidden` (policy violation), `timeout`, `internal` (runtime/storage failure).

## Versioning

- `v` in every frame; major bump for incompatible changes
- Additive fields allowed within same major
- Feature negotiation via `hello` capability set

## Conformance Tests

1. Pure call dedup → `use_cached`
2. Over-budget capture → `summarized`; under-budget → `materialized`
3. Each handle op matches expected output on fixtures
4. `turn.end` captures CoT hashes for assistant turns only
5. Pressure thresholds map correctly
6. Frame decode rejects malformed `v/id/name`
7. Error codes stable for not-found/bad-request paths

## Open Questions

1. Handle IDs: text (`§h7`) on wire vs tagged CBOR type?
2. `turn.end`: include bracket metadata directly or keep local to client?
3. `cot.capture`: accept provider-native reasoning payloads?
4. `oracle.apply`: split into typed commands (`oracle.pin`, `oracle.edit`) in v1?

## Cross-references

- `boot-sequence.md` — boot protocol
- `handle-tools.md` — handle tool definitions
- `pressure-*.md` — pressure signals
- `design.md` — DSML block output format
