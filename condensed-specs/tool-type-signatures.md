# Tool Type Signatures

Lean/Agda-style dependent type signatures for pi tools. *Aspirational — preconditions document invariants the harness should enforce.*

## Notation
```
Type?  — optional    Type!  — required    { p : Prop } — precondition
→      — function    IO     — effectful   Result A E   — Either E A
∈      — element/substring  ¬ — negation  ∨/∧ — disjunction/conjunction
```

## Core Tools

### read
```lean
read : (path : FilePath!) → (offset : ℕ?) → (limit : ℕ?)
     → { _ : path.exists }
     → IO (Result FileContent ReadError)

FileContent := Text { content : String, lines : ℕ, truncated : Bool }
             | Image { format : ImageFormat, width : ℕ, height : ℕ }

ReadError := NotFound | PermissionDenied
           | Binary { detected : MimeType } | TooLarge { size : ℕ, limit : ℕ }
```

### bash
```lean
bash : (command : String!) → (timeout : ℕ?)
     → { _ : approved(command) ∨ pure(command) }
     → IO (Result BashOutput BashError)

BashOutput := { stdout : String, stderr : String, exitCode : ℤ, duration : Duration }
BashError := Timeout { partial : BashOutput } | Killed { signal : Signal }
           | NotApproved { command : String }

pure : String → Bool  -- matches readOnlyPatterns:
  [ /^(cat|head|tail|grep|rg|find|fd|ls|stat|file|which|echo|pwd|whoami)/
  , /^(sha256sum|md5sum|xxd|hexdump|wc|sort|uniq|diff|comm)/
  , /^git\s+(log|show|diff|status|branch|ls-files|blame)/ ]
```

### edit
```lean
edit : (path : FilePath!) → (oldText : String!) → (newText : String!)
     → { _ : path.exists ∧ oldText ∈ contents(path) }
     → { _ : (oldText ∈ contents(path)).count = 1 }  -- unique match
     → IO (Result Unit EditError)

EditError := NotFound | NoMatch { searched : String }
           | MultipleMatches { count : ℕ } | PermissionDenied
```

### write
```lean
write : (path : FilePath!) → (content : String!)
      → { _ : ¬path.exists ∨ approved("overwrite", path) }
      → IO (Result Unit WriteError)

WriteError := PermissionDenied | DirectoryCreationFailed { path : FilePath } | DiskFull
```

### grep
```lean
grep : (pattern : Regex!) → (path : GlobPattern?) → (contextLines : ℕ?)
     → { _ : pattern.validRegex }
     → IO (Result (List GrepMatch) GrepError)

GrepMatch := { path : FilePath, line : ℕ, column : ℕ, content : String,
               context : { before : List String, after : List String } }
GrepError := InvalidPattern { pattern : String, reason : String }
           | TooManyMatches { count : ℕ, limit : ℕ }
```

### find
```lean
find : (pattern : GlobPattern!) → (path : FilePath?) → (type : FileType?)
     → IO (Result (List FilePath) FindError)

FileType := File | Directory | Both
FindError := InvalidGlob { pattern : String } | TooManyResults { count : ℕ, limit : ℕ }
```

### ls
```lean
ls : (path : FilePath?) → (all : Bool?) → (long : Bool?)
   → { _ : path.isDirectory }
   → IO (Result (List DirEntry) LsError)

DirEntry := { name : String, type : FileType, size : ℕ, modified : Timestamp, permissions : Permissions }
LsError := NotFound | NotDirectory | PermissionDenied
```

## CarterKit Handle Tools

Tool results exceeding materialization budget return handles instead. Cross-ref: `async-tools-handles.md`, `handle-tools.md`.

```lean
Handle := { id : HandleId, sourceTool : String, totalTokens : ℕ, totalLines : ℕ,
            preview : String, status : HandleStatus }
HandleStatus := Pending | Resolved | Consumed | Evicted
HandleId := String & { _ : matches(/^§h\d+$/) }
```

### handle_lines / handle_grep / handle_head / handle_tail / handle_count
```lean
handle_lines : (handle : HandleId!) → (start : ℕ!) → (end : ℕ!)
             → { _ : handle.valid ∧ start ≤ end } → IO (Result String HandleError)

handle_grep  : (handle : HandleId!) → (pattern : String!)
             → { _ : handle.valid } → IO (Result (List String) HandleError)

handle_head  : (handle : HandleId!) → (n : ℕ!)
             → { _ : handle.valid } → IO (Result String HandleError)

handle_tail  : (handle : HandleId!) → (n : ℕ!)
             → { _ : handle.valid } → IO (Result String HandleError)

handle_count : (handle : HandleId!)
             → { _ : handle.valid } → IO (Result ℕ HandleError)
```

### cot_replay
```lean
cot_replay : (turn : ℕ!) → { _ : turn < currentTurn ∧ cotStored(turn) }
           → IO (Result String CotError)
CotError := TurnNotFound | NoCotStored
```

## Common Types
```lean
FilePath := String & { _ : validPath }
GlobPattern := String & { _ : validGlob }
Regex := String & { _ : validRegex }
Timestamp := ℕ  -- epoch ms     Duration := ℕ  -- ms
Signal := SIGTERM | SIGKILL | SIGINT | ...
MimeType := String              ImageFormat := PNG | JPEG | GIF | WEBP
Permissions := { owner : RWX, group : RWX, other : RWX }
RWX := { read : Bool, write : Bool, execute : Bool }
```

## Idempotency Classification
```lean
data Idempotency := Pure | Session | NonIdempotent
-- Pure: cache indefinitely, dedup identical calls
-- Session: stable within session, invalidate on context change
-- NonIdempotent: side effects, must execute every time

classifyTool : ToolName → Idempotency
classifyTool "read"  = Pure          classifyTool "grep"  = Pure
classifyTool "find"  = Pure          classifyTool "ls"    = Pure
classifyTool "bash"  = classifyBash(command)
classifyTool "edit"  = NonIdempotent classifyTool "write" = NonIdempotent
classifyTool _       = NonIdempotent

classifyBash : String → Idempotency
classifyBash cmd | pure(cmd)          = Pure
classifyBash cmd | sessionStable(cmd) = Session
classifyBash _                        = NonIdempotent
```

## Intent (Future)
```lean
data Intent := Exists | Structure | Sample | Verify | Full

read' : (path : FilePath!) → (intent : Intent!) → (offset : ℕ?) → (limit : ℕ?)
      → IO (Result (IntentResult intent) ReadError)

IntentResult : Intent → Type
IntentResult Exists    = { exists : Bool, type : FileType, size : ℕ }
IntentResult Structure = { outline : List Heading, format : FileFormat }
IntentResult Sample    = { head : String, tail : String, elided : ℕ }
IntentResult Verify    = { hash : ContentHash, size : ℕ, mtime : Timestamp }
IntentResult Full      = FileContent
```
