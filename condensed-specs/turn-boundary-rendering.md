# Turn Boundary Rendering Spec
**Author:** Carter Schonwald | **Date:** 2026-03-02 | **Status:** Active

## Message Types

Turn boundaries are first-class message types (not text injection). Rendering is presentation, decoupled from storage.

```haskell
data TurnStartMessage = TurnStartMessage
  { tsmTurn      :: Natural       -- turn index
  , tsmSigil     :: Text          -- unicode sigil (🐉, 🌿, ✨, etc.)
  , tsmNonce     :: Text          -- three-word nonce (frost-ember-peak)
  , tsmTimestamp  :: UTCTime
  , tsmDelta     :: Maybe Text    -- time since previous turn
  }

data TurnEndMessage = TurnEndMessage
  { temTurn       :: Natural       -- matches TurnStartMessage
  , temHash       :: Text          -- SHA3-256 truncated (12 hex chars)
  , temTimestamp   :: UTCTime
  , temTokenCount  :: Maybe Natural
  , temDurationMs  :: Maybe Natural
  }
```

## TUI Rendering

- **Opening**: metadata line, then horizontal rule (toward content)
- **Closing**: horizontal rule (toward content), then metadata line
- Sigil+nonce = turn's **invariant identity**; sigil outermost: far LEFT on open, far RIGHT on close (like parentheses)

```
{sigil} {nonce} │ turn:{n} │ T={timestamp}[ │ Δ{delta}]
────────────────────────────────────────────────────────────────
<content>
────────────────────────────────────────────────────────────────
H={hash} │ Δt={duration} │ tokens:{count} │ {nonce} {sigil}
```

### Design Principles
1. **No side framing** — no box-drawing in margins; clean copy-paste
2. **Unicode box drawing** — `─` (U+2500), `│` (U+2502); no ASCII fallback
3. **Metadata outside, rules inside** — content is primary, boundaries are punctuation
4. **Copy-paste safe** — no invisible characters or margin pollution

### ANSI Styling
- Boundary metadata + rules: dim/faint — visually recessed
- Content: normal styling

### Squiggle Blocks
Squiggle tool results render inline within turn content. Delimiters are tool results rendered as text:
```
❮squiggle T=19:25:46 [NYC=EST/-05:00] turn:5❯
...reasoning...
❮/squiggle T=19:25:52 H=f7c2e9a1b3d5 Δc=6s❯
```

## Render Functions

```haskell
renderTurnStart :: Natural -> TurnStartMessage -> Text
renderTurnStart termWidth msg =
  let delta = maybe "" (\d -> " │ Δ" <> d) (tsmDelta msg)
      meta  = tsmSigil msg <> " " <> tsmNonce msg
           <> " │ turn:" <> showt (tsmTurn msg)
           <> " │ T=" <> formatTime (tsmTimestamp msg)
           <> delta
      rule  = T.replicate (max 40 (fromIntegral termWidth)) "─"
  in meta <> "\n" <> rule

renderTurnEnd :: Natural -> TurnEndMessage -> Text
renderTurnEnd termWidth msg =
  let rule     = T.replicate (max 40 (fromIntegral termWidth)) "─"
      duration = maybe "" (\d -> " │ Δt=" <> formatDuration d) (temDurationMs msg)
      tokens   = maybe "" (\t -> " │ tokens:" <> showt t) (temTokenCount msg)
      meta     = "H=" <> temHash msg <> duration <> tokens
              <> " │ " <> tsmNonce msg <> " " <> tsmSigil msg
  in rule <> "\n" <> meta
```
Rule width: `max 40 termWidth`.

## Web UI Rendering
CSS enables: collapsible headers, background tinting for turn regions, hover tooltips, sticky headers. Core principle unchanged: metadata outside, content inside.

## LLM Context Rendering
- Past turns: elide to `[system turn change]...[/system turn change]` or omit boundaries entirely for old turns (structural info lives in message array)
- Current in-progress turn: no boundaries — model sees squiggle calls naturally

## Turn Lifecycle
1. `onTurnStart` → record timestamp, assign sigil/nonce
2. Model generates content, squiggle tools, etc.
3. `onTurnEnd` → create TurnStartMessage + TurnEndMessage
4. Messages injected into history array around turn content

## Examples

### Short Turn
```
✨ glacier-pine-echo │ turn:3 │ T=14:22:01
────────────────────────────────────────────────────────────────
Yes, that file exists at `src/index.ts`.
────────────────────────────────────────────────────────────────
H=8f3a2b1c9d0e │ Δt=2s │ tokens:12 │ glacier-pine-echo ✨
```

### Turn with Reasoning
```
🌿 copper-drift-vale │ turn:7 │ T=15:03:44 │ Δ2m
────────────────────────────────────────────────────────────────
❮squiggle T=15:03:44 [NYC=EST/-05:00] turn:7❯
User wants to refactor the auth module...
❮/squiggle T=15:03:51 H=c4d5e6f7a8b9 Δc=7s❯

I'll start by examining the current auth module structure:
[tool call: read src/auth/index.ts]
...
────────────────────────────────────────────────────────────────
H=1a2b3c4d5e6f │ Δt=45s │ tokens:1247 │ copper-drift-vale 🌿
```

### Multiple Turns
```
🐲 storm-oak-prism │ turn:1 │ T=10:00:00
────────────────────────────────────────────────────────────────
Hello! I'll help you with the codebase.
────────────────────────────────────────────────────────────────
H=aaa111222333 │ Δt=3s │ tokens:15 │ storm-oak-prism 🐲

[user message]

🔮 lunar-ash-reef │ turn:2 │ T=10:00:15 │ Δ12s
────────────────────────────────────────────────────────────────
Let me search for that function...
────────────────────────────────────────────────────────────────
H=bbb444555666 │ Δt=8s │ tokens:234 │ lunar-ash-reef 🔮
```
