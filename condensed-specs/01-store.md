# 01: Store + Persistence

Content-addressed storage for CarterKit. Lossless backing store making compaction fully invertible.
Stores: verbatim turns, CoT, skeletal forms, metadata, page table, handle registry, knowledge graph.

**Dependencies:** None (leaf node).

## Architecture: DuckDB + Blob Files

- **DuckDB**: all structured data (metadata, page table, handles, graph edges, indices)
- **Blob files**: bulk content (verbatim turns, CoT, large tool results)
- Embeddable single-file DB, no server. Haskell + Swift share same `.duckdb` via C API.
- SQL for ad-hoc queries; columnar/analytical for eviction scoring, pressure calc, graph queries
- Struct/list/map column types; Parquet export for archival
- Swap to custom K12 content-addressed blob store later if needed (data volumes small)

## Content Hash

```
ContentHash = K12(content, 32)  -- KangarooTwelve, 32 bytes
Display:     hex(hash[:8])      -- "a7f3e2b1"
```

KangarooTwelve: Keccak family, XOF, tree hashing, 6-7 GB/s. FFI to XKCP reference C impl.

## Schema

```sql
CREATE TABLE blobs (
  hash         BLOB PRIMARY KEY,   -- K12 content hash, 32 bytes
  type         TEXT NOT NULL,       -- 'raw_turns', 'cot', 'skeletal', 'tool_result', 'graph_delta'
  size_bytes   INTEGER NOT NULL,
  created_at   TIMESTAMP DEFAULT now(),
  session_id   TEXT,
  ref_count    INTEGER DEFAULT 1,
  inline_data  BLOB,               -- if size < 64KB
  file_path    TEXT                 -- else path to blob file
);

CREATE TABLE chunks (
  id           BLOB PRIMARY KEY,   -- content hash of chunk
  level        TEXT NOT NULL,       -- 'raw', 'skeletal', 'referential', 'evicted'
  turn_start   INTEGER,
  turn_end     INTEGER,
  tags         TEXT[],
  tokens_raw   INTEGER,
  tokens_now   INTEGER,
  pinned       BOOLEAN DEFAULT false,
  pin_reason   TEXT,
  oracle_edits INTEGER DEFAULT 0,
  snapshot_id  TEXT,
  created_at   TIMESTAMP DEFAULT now(),
  accessed_at  TIMESTAMP DEFAULT now(),
  raw_hash     BLOB REFERENCES blobs(hash),
  skeletal_hash BLOB REFERENCES blobs(hash),
  cot_hash     BLOB REFERENCES blobs(hash)
);

CREATE TABLE chunk_deps (
  from_chunk   BLOB REFERENCES chunks(id),
  to_chunk     BLOB REFERENCES chunks(id),
  dep_type     TEXT NOT NULL,       -- 'depends_on', 'feeds', 'coreference'
  PRIMARY KEY (from_chunk, to_chunk, dep_type)
);

CREATE TABLE handles (
  id           TEXT PRIMARY KEY,    -- '§h7', '§mw_read', etc.
  source_tool  TEXT NOT NULL,
  source_args  TEXT,                -- JSON
  status       TEXT NOT NULL,       -- 'pending', 'resolved', 'consumed', 'evicted'
  idempotency  TEXT NOT NULL,       -- 'pure', 'session', 'non_idempotent'
  result_hash  BLOB REFERENCES blobs(hash),
  total_tokens INTEGER,
  materialized_tokens INTEGER DEFAULT 0,
  chunk_id     BLOB REFERENCES chunks(id),
  turn_index   INTEGER,
  created_at   TIMESTAMP DEFAULT now(),
  resolved_at  TIMESTAMP,
  consumed_at  TIMESTAMP
);

CREATE TABLE kg_nodes (
  id           BLOB PRIMARY KEY,
  node_type    TEXT NOT NULL,       -- 'decision', 'finding', 'entity', 'state_change', 'constraint'
  content      TEXT NOT NULL,
  attributes   TEXT,                -- JSON map
  session_id   TEXT,
  created_at   TIMESTAMP DEFAULT now()
);

CREATE TABLE kg_edges (
  from_node    BLOB REFERENCES kg_nodes(id),
  to_node      BLOB REFERENCES kg_nodes(id),
  relation     TEXT NOT NULL,       -- 'reason', 'rejects', 'changes', 'depends_on',
                                   -- 'attributed_to', 'must_link', 'cannot_link'
  provenance   TEXT,
  created_at   TIMESTAMP DEFAULT now(),
  PRIMARY KEY (from_node, to_node, relation)
);

CREATE TABLE oracle_log (
  id           INTEGER PRIMARY KEY,
  op           TEXT NOT NULL,       -- 'pin', 'edit', 'inject', 'promote', 'demote', 'tag', 'retag'
  target_chunk BLOB,
  target_node  BLOB,
  payload      TEXT,                -- JSON
  created_at   TIMESTAMP DEFAULT now()
);

CREATE TABLE compaction_log (
  id           INTEGER PRIMARY KEY,
  chunks_in    BLOB[],
  chunk_out    BLOB,
  tokens_freed INTEGER,
  reroll_cost  INTEGER,
  clone_session TEXT,
  pressure_before FLOAT,
  pressure_after  FLOAT,
  created_at   TIMESTAMP DEFAULT now()
);
```

## Blob Storage Layout

```
$CARTERKIT_DATA/
  carterkit.duckdb
  blobs/
    a7/f3e2b1...       -- git-style sharded dirs
```

- Small blobs (<64KB): inline in DuckDB BLOB column
- Large blobs (CoT, file reads): on disk, referenced by path
- Threshold configurable. Metadata/skeletal/graph deltas → inline. Verbatim turns/CoT → disk.

## Haskell Interface

```haskell
module MMU.Store where

data Store  -- opaque, holds DuckDB connection + blob dir path

openStore   :: FilePath -> IO Store
closeStore  :: Store -> IO ()

putBlob     :: Store -> BlobType -> ByteString -> IO ContentHash
getBlob     :: Store -> ContentHash -> IO (Maybe ByteString)
hasBlob     :: Store -> ContentHash -> IO Bool

getChunk    :: Store -> ContentHash -> IO (Maybe Chunk)
putChunk    :: Store -> Chunk -> IO ()
listChunks  :: Store -> ChunkQuery -> IO [Chunk]
updateChunk :: Store -> ContentHash -> (Chunk -> Chunk) -> IO ()

getHandle   :: Store -> HandleId -> IO (Maybe Handle)
putHandle   :: Store -> Handle -> IO ()
listHandles :: Store -> HandleQuery -> IO [Handle]

addNode     :: Store -> KGNode -> IO ContentHash
addEdge     :: Store -> KGEdge -> IO ()
queryGraph  :: Store -> GraphQuery -> IO [KGNode]
neighbors   :: Store -> ContentHash -> IO [(KGEdge, KGNode)]

logOracleOp   :: Store -> OracleOp -> IO ()
logCompaction :: Store -> CompactionEvent -> IO ()
evictionScores :: Store -> IO [(ContentHash, Float)]
```

## Swift Access

- Opens same `.duckdb` **read-only** via official `DuckDB` Swift package
- Concurrent readers supported; Haskell writes, Swift reads. No custom IPC for data.
- Oracle ops (panel→harness): UDS + CBOR. Panel sends commands, harness writes DB, panel re-reads on refresh.

```swift
let db = try Database(store: .file(path: carterkitDataPath + "/carterkit.duckdb"),
                      access: .readOnly)
let conn = try db.connect()
let result = try conn.query("SELECT id, level, tags, tokens_now, pinned FROM chunks ORDER BY turn_start")
```

## Implementation Modules

- **Haskell**: `MMU.Store` (DuckDB C API FFI), `MMU.Store.Hash` (K12 via XKCP FFI), `MMU.Store.Schema` (table creation/migrations). Deps: `duckdb-haskell` or raw FFI, XKCP, `bytestring`.
- **Swift**: `DuckDB` Swift package, XKCP linked as C lib for hash verification. Read-only.

## Tests

- Blob put/get round-trip (inline + file-backed)
- Content-addressing dedup (same content → same hash)
- Page table CRUD; handle lifecycle state transitions
- KG node/edge queries; eviction score calculation
- Concurrent read (Swift) + write (Haskell)
- DuckDB corruption recovery; K12 hash consistency cross-language
