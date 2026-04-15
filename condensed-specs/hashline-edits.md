# Hashline Edits: Content-Hash Anchored Line Addressing

**Author:** Carter Schonwald | **Date:** 2026-03-17 | **Status:** Draft
**Inspired by:** oh-my-pi hashline (Can Bölük), CarterKit content-addressing

## Problem

`str_replace` edits are fragile: whitespace sensitivity, ambiguous matches, no staleness detection, models must reproduce large text blocks to identify location.

## Solution

Every line gets a short content hash. Model references lines by `LINE#HASH` anchor. Hash mismatch = stale = edit rejected.

## Line Hash

```haskell
-- K12 truncated to 1 byte, displayed as 2-char custom alphabet
lineHash :: Natural -> Text -> Text
lineHash lineNum content =
  let trimmed = T.stripEnd (T.filter (/= '\r') content)
      seed    = if T.any isAlphaNum trimmed then 0 else lineNum
      hash    = k12WithSeed seed (encodeUtf8 trimmed)
      byte    = BS.index hash 0
  in encodeByte byte

-- No digits, no lowercase — avoids confusion with line numbers/content
nibbleAlpha :: Vector Char
nibbleAlpha = V.fromList "ZPMQVRWSNKTXJBYH"

encodeByte :: Word8 -> Text
encodeByte b = T.pack [nibbleAlpha V.! fromIntegral (b `shiftR` 4)
                       ,nibbleAlpha V.! fromIntegral (b .&. 0x0F)]
```

## Read Display Format

Lines prefixed with `LINE#HASH:` (display-only, not in file):
```
1#VK:module Main where
2#SN:
3#HB:import System.IO
5#PM:main :: IO ()
6#WR:main = do
7#JH:  putStrLn "hello"
```

## Edit Operations

```haskell
data Anchor = Anchor
  { aLine :: Natural, aHash :: Text }

data HashlineEdit
  = Replace { hePos :: Anchor, heEnd :: Maybe Anchor, heLines :: Maybe [Text] }
  | Append  { hePos :: Maybe Anchor, heLines :: [Text] }
  | Prepend { hePos :: Maybe Anchor, heLines :: [Text] }

data HashlineEditRequest = HashlineEditRequest
  { herPath   :: FilePath
  , herEdits  :: [HashlineEdit]     -- applied bottom-up
  , herMove   :: Maybe FilePath
  , herDelete :: Bool
  }
```

- `Replace`: pos..end inclusive range; `heEnd = Nothing` → single line; `heLines = Nothing` → delete
- `Append`: insert after anchor (Nothing = EOF)
- `Prepend`: insert before anchor (Nothing = BOF)

## Validation

```haskell
validateAnchors :: Text -> [Anchor] -> Either [HashMismatch] ()
-- Computes lineHash for each anchor, rejects if any mismatch

data HashMismatch = HashMismatch
  { hmLine :: Natural, hmExpected :: Text, hmActual :: Text }
```

**Any mismatch → entire edit rejected.** No partial application. Model must re-read and retry.

## Application Order

Bottom-up (highest line first) — preserves anchor validity within batch.

```haskell
applyEdits :: Text -> [HashlineEdit] -> Either EditError Text
applyEdits content edits =
  let sorted = sortBy (comparing (Down . editLine)) edits
  in foldM applySingle content sorted
```

## Staleness Invariant

After any edit to file P, all anchors for P are invalidated. Must re-read before next edit. Enforced by read/write gating (see tool-execution-model).

## Edit Mode Spectrum

```haskell
data EditMode = StrReplace | UnifiedDiff | Hashline
defaultEditMode :: EditMode
defaultEditMode = Hashline
```

| Mode | Robustness | Model difficulty |
|------|-----------|-----------------|
| StrReplace | Low — silent corruption | Low |
| UnifiedDiff | Medium — fuzzy fallback | High |
| Hashline | High — hash validation | Low |

## Fuzzy Matching Fallback (StrReplace mode)

```haskell
data MatchStrategy
  = Exact | TrimTrailing | Trim | CommentPrefix | Unicode
  | Prefix | Substring | Fuzzy | FuzzyDominant | Character
  deriving (Show, Ord, Eq)

findMatch :: Text -> Text -> Maybe (MatchStrategy, FuzzyMatch)
```

Strategies tried in order; first match above threshold wins.

## Integration with CarterKit

- **Content addressing**: Same philosophy as store (01-store.md). Line hashes = fine-grained chunk hashes. Content determines identity.
- **Handle interaction**: Handle ops (`handle_lines`, `handle_grep`) return hashline-formatted output in Hashline mode. Model references anchors from handle output in edits.
- **Read/write gating** (tool-execution-model): Read → anchors valid → squiggle → edit with anchors → anchors invalidated → re-read required.

## Open Questions

1. **Hash algorithm** — K12 (consistency w/ store) vs xxHash32 (speed)? 1-byte output either way.
2. **Collision rate** — 256 values/line. Manageable for <1000 lines. 2 bytes (65536) for large files?
3. **Binary files** — hashline is text-only; binary uses different path.
4. **Encoding** — is `ZPMQVRWSNKTXJBYH` the right alphabet for Haskell/CarterKit?
5. **Batch size** — limit on edits per request?
