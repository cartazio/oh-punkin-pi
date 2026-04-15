## Minimaps

Ambient visualization layer for context state. Complements oracle panel (see `oracle-panel`). Always visible without opening full panel.

### Context Minimap (macOS menu bar)

Menu bar widget showing context pressure at a glance:
```
┌──────────────────────────────────────────┐
│  ░░▓▓▓████████████████░░░░░░  67% │ π   │
└──────────────────────────────────────────┘
```
- Each pixel-column = one chunk; color = residency level; width ∝ token count
- Click expands to richer view:
```
┌────────────────────────────────────────────────┐
│  Context: 67%  (134k / 200k tokens)            │
│  ░░░│▓▓▓▓│▓▓│████│████████│████████████│       │
│  sk₁│sk₂ │s₃│ r₄ │  r₅    │    r₆      │       │
│  Handles: 12 resolved, 3 pending               │
│  Materialized: 4,200 / 8,000 budget            │
│  Last compaction: 8 turns ago                   │
│  Next compaction: ~6 turns (est.)               │
│  ████ raw  ▓▓ skeletal  ░░ referential          │
│  [Open Panel]                                  │
└────────────────────────────────────────────────┘
```

### Turn Minimap (terminal inline)

Side panel in pi TUI alongside conversation, like Vim/VS Code scroll minimap but for context structure:
```
┌─ conversation ─────────────────────┐ ┌─ minimap ─┐
│ > user: let's fix the auth bug     │ │ ░ sk₁     │
│ assistant: I'll look at the        │ │ ▓ sk₃     │
│ > tool: read(src/auth/mid.rs)      │ │ █ RAW₆ ◄  │
│   § resolved, 847 tok [handle-only]│ │ hdl: 12/3 │
│ assistant: The verify function...  │ │ mat: 52%  │
└────────────────────────────────────┘ │ prs: 67%  │
                                       └───────────┘
```
- Each chunk: colored block (░ skeletal, ▓ compressed, █ raw)
- Current position indicator (◄)
- Handle counts (resolved/pending), materialization budget %, context pressure %
- Scrolling conversation moves minimap indicator

### Dependency Minimap

Tiny ASCII DAG of chunk dependency graph:
```
┌─ deps ──────┐
│ ●─●─●       │
│ │ └─●─●     │
│ └───●─●─◉   │
│       └─●   │
│ ◉ = current │
│ 9 nodes     │
│ 11 edges    │
└─────────────┘
```
- Red = high-fanout (many dependents); blue = leaf (safe to evict); pulsing = currently accessed

### Compaction Pressure Minimap

Sparkline of context pressure over time:
```
pressure: ▁▂▃▄▅▆▅▃▂▃▄▅▆▇▅▃▂▃▄▅▆ 67%
                  ↑         ↑
              compact₁  compact₂
```
- Sawtooth pattern shows compaction rhythm, frequency, freed amount
- Lengthening sawteeth = improving compaction ratio (amortization working)

### Handle Resolution Minimap

Live ticker of handle I/O activity:
```
handles: §a✓ §b✓ §c✓ §d⏳ §e✓ §f⏳ §g⏳
         resolved: 4  pending: 3  budget: 52%
```

### Implementation

All minimaps share common data source: **page table + handle registry + pressure monitor**.

Rendering targets:
- **Menu bar**: SwiftUI `MenuBarExtra` (macOS 13+), always visible, click to expand
- **Terminal**: ANSI escape codes, pi TUI side panel (needs TUI extension point for custom panel rendering)
- **Oracle panel**: SwiftUI views in sidebar/footer, always visible regardless of active main view

### Integration: Entity Reasoning

Carter's `datentity.skill` provides formal structures CarterKit should adopt directly.
