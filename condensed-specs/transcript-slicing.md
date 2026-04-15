# Transcript Slicing Spec

**Author:** Carter Schonwald — **Date:** 2026-03-02 — **Status:** Draft

## Coordinate Namespace

All coordinates use `§` prefix:

| Prefix | Type | Example |
|--------|------|---------|
| `§h` | Handle (tool result) | `§h7` |
| `§r` | Turn reference | `§r_🐉frost-ember-peak` |
| `§l` | Absolute line | `§l_42` |

## Turn References

Identity via sigil+nonce: `§r_🐉frost-ember-peak`, `§r_✨glacier-pine-echo`, `§r_🌿copper-drift-vale`

`§r_` prefix distinguishes structural coordinates from content.

## Offset Addressing

From turn anchor, address with direction + unit:

- **Direction:** `↓` (forward from turn start), `↑` (backward from turn end)
- **Units:** `¶` paragraph, `s` sentence, `l` line, bare number = turns
- **Special:** `first`, `last`, `all`

```
§r_🐉frost-ember-peak ↓3¶      // 3rd paragraph from start
§r_🐉frost-ember-peak ↑2s      // 2nd-to-last sentence
§r_🐉frost-ember-peak ↓1l      // first line
§r_🐉frost-ember-peak ↓first   // first element
§r_🐉frost-ember-peak ↑last    // last element
§r_🐉frost-ember-peak ↓all     // entire turn content
```

## Ranges

Start and end with `...`; cross-turn ranges valid (select all content between anchors):

```
§r_🐉frost-ember-peak ↓2¶ ... ↓5¶
§r_🧿kelp-lava-steel ↓last ... §r_🐉frost-ember-peak ↓2¶
```

## Role Exclusion

Exclude roles with `-role`. Multiple exclusions allowed.

```
§r_🐉frost-ember-peak ↓all -toolResult -turnStart -turnEnd
```

Roles: `user`, `assistant`, `toolResult`, `turnStart`, `turnEnd`

## Grammar

```
coordinate := §r_sigil-nonce [offset] [range] [exclusion*]
offset := (↓|↑)(number|first|last|all)(unit)?
unit := ¶ | s | l
range := ... coordinate
exclusion := -role
role := user | assistant | toolResult | turnStart | turnEnd
```

## Resolution

1. Find turn by sigil+nonce match
2. Apply direction (↓ from TurnStartMessage, ↑ from TurnEndMessage)
3. Count units to reach offset
4. If range, collect all content between start and end
5. Filter by role exclusions

## Collision Avoidance

`§r_` prefix reserved for structural coordinates. Parser distinguishes by position: bare in text = literal; in coordinate position (after citation marker, in slice syntax) = structural reference.

## Use Cases

- **Citation:** `Analysis complete. Key findings at §r_🐉frost-ember-peak ↓3¶.`
- **Cross-turn:** `This contradicts §r_🧿kelp-lava-steel ↓2¶.s3`
- **Highlight ranges:** `HIGHLIGHT: §r_🧙sage-dust-leaves ↓2¶ ... §r_🐉frost-ember-peak ↓4¶`
- **Context injection:** `inject(§r_🐉frost-ember-peak ↓all -toolResult)`
- **Role-filtered views:** `assistant:§r_* ↓all:squiggle`, `user:§r_*`

## Future Extensions

- `§c_` chunk refs, `§s_` squiggle block refs, `§t_` tool call refs
- Regex within slices: `§r_🐉frost-ember-peak ↓all:grep("pattern")`

## Integration

Cross-refs: turn-boundary-rendering (sigil+nonce from TurnStart/EndMessage), async-tools-handles (`§h` namespace), entity-reasoning (discourse coordinates), compaction-invertibility (stable refs survive summarization)
