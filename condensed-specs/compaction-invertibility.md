# Compaction Invertibility

## Core Idea

Context compaction via **shadow clone**: branch agent VM → clone has full context → clone produces skeletal representation → parent splices it in. Compaction is **fully invertible**: clone writes verbatim raw content to external store. Skeletal form is in-context hot representation. Full content exists out-of-band. No information destroyed — only changes residency.

*Cross-refs: kage-no-bushin (clone primitive), oracle-panel (operator UI), async-tools-handles (store refs)*

## Invertibility = Storage Decision

Clone has full content. It:
1. Writes verbatim raw turns to external storage
2. Produces skeletal form for in-context use
3. Returns both: skeletal form + storage reference

Skeletal form = **cache line**, not lossy compression. Full content in **backing store**. Analogy: TLB entry → page. Can always fault through.

```
Context Window (TLB):
  [skeletal₁] [skeletal₂] [raw₃]    ← hot, compact
       │            │
       ▼            ▼
  [ref to store] [ref to store]
       │            │
       ▼            ▼
External Store (RAM/disk):
  [verbatim turns 1-12]              ← cold, full fidelity
  [verbatim turns 13-24]
```

## CoT Persistence

External store holds **full chain of thought** — model's internal reasoning per turn. CoT is first-class persistent artifact in CarterKit.

- **CoT = highest-fidelity agent state** — turns are public interface, CoT is private computation. Compacting turns without CoT = compacting function to return value, discarding stack frames.
- **CoT enables true full inversion** — fault back into compacted region → get original reasoning state, not just events.
- **CoT = invertibility proof** — audit any compaction against ground truth deliberation.
- **CoT compounds across compaction levels** — clone's compaction reasoning (meta-CoT) is itself stored. Informs future compaction, auditable via oracle panel.

### Store Schema per Chunk

```
{
  raw_turns:     [verbatim user/assistant turns],
  raw_cot:       [model's chain of thought for each turn],
  compact_form:  [the skeletal representation],
  compact_cot:   [clone's reasoning ABOUT the compaction],
  metadata:      { tags, deps, timestamps, ... }
}
```

Full inverse: restore `raw_turns` + `raw_cot` → agent in **exactly** prior epistemic state.

### All CoT Must Be Readable

CarterKit stance: **all CoT is readable, persistable, addressable, navigable.** Not a debugging feature — core of the system.

- CoT is agent's actual state; output turns are projection
- Compaction should derive from CoT, not from turns alone
- Operator needs agent's thinking, not its polished output, for oracle panel decisions (pin/edit/demote)
- Inter-agent communication should include CoT — receiving agent needs sender's confidence/uncertainty
- Clone's compaction CoT = audit trail for compaction itself

**Implementation requirement**: Capture/store CoT at every stage:
- Agent turn CoT → stored with turn
- Shadow clone compaction CoT → stored with compaction metadata
- Page fault expansion CoT → stored with fault resolution
- All CoT rendered in oracle panel alongside turn content

**API-level**: Extract CoT regardless of provider conventions. If provider hides thinking tokens, route around it (streaming interception, logprobs, provider-specific flags).

## Provider Stance

Providers are **dumb compute layer**. Their caching/limits/pricing are their infrastructure concerns, not design constraints:

- **Prompt caching**: provider's economic optimization, not architecture
- **Context window limits**: product decisions, not physics — CarterKit treats window as cache in a storage hierarchy
- **Token pricing**: per-input-token means provider profits from bloated contexts; zero incentive to help compact
- **CoT hiding**: extractive — compute you paid for, reasoning about your data

CarterKit API posture:
- Send prefix + new tokens → get completion + CoT
- Provider caching: nice-to-have, not designed-for
- Provider context limits: pressure signal triggering compaction, not wall
- Provider CoT hiding: routed around
- Provider pricing: input to amortization equation, not constraint

## Skeletal Form = Cache, Not Codec

Naive summary = lossy, sole representation. CarterKit skeletal = **cache line** backed by full store content.

```
Skeletal (in context):
  DECISION: auth system → JWT
    REASON: session store was scaling bottleneck
    REJECTED: [opaque tokens (no statelessness), PASETO (library immature)]
    CONSTRAINT: must support token refresh, ≤15min expiry
  STATE_CHANGES:
    src/auth/middleware.rs: session_check() → jwt_verify()
    src/auth/login.rs: +issue_jwt(), +refresh_token()
    src/auth/mod.rs: removed SessionStore dependency
    migrations/: +003_drop_sessions_table.sql
  DEPENDENCIES_INTRODUCED:
    jsonwebtoken = "9.2"
  OPEN:
    - token revocation not yet implemented (deferred)
    - refresh token rotation TBD
  ERROR_TRAIL:
    - first attempt used HS256, switched to RS256 for key rotation
    - hit lifetime issue with &Claims borrow in middleware
  STORE_REF: chunk://session_42/turns_13_24

Full content (in store):
  [verbatim turns 13-24, every token, lossless]
```

## Why Shadow Clone Produces Better Cache Lines

1. Knows which decisions actually mattered vs. noise
2. Knows which state changes are load-bearing vs. incidental
3. Knows dependency structure (it built it)
4. Can identify what future work needs from this region
5. Produces skeletal form shaped for agent's actual needs

Full content always in store as backstop regardless of skeletal quality.

## The Reroll-Forward Problem

### Prefix Cost

Splicing compacted form into context **invalidates prompt cache** for everything after modification point:

```
Before: [system | turn₁ | ... | turn₃₀ | turn₃₁ | ... | turn₄₇]
         └──────── cached prefix ────────┘

After:  [system | skeletal₁₋₃₀ | turn₃₁ | ... | turn₄₇]
         └─ new ─┘  ← entire prefix changed, cache invalidated
```

Three costs of compaction:
1. **Clone cost**: spinning up shadow clone + its inference
2. **Store cost**: writing verbatim content to external storage
3. **Reroll cost**: re-processing modified prefix on next (only next) inference call

### Amortization Equation

```
Cost of NOT compacting:
  C_attend = Σ(t=now..end) cost/tok × context_size(t)

Cost of compacting NOW:
  C_compact = clone_cost + store_cost + reroll_cost
            + Σ(t=now..end) cost/tok × compacted_size(t)

Profitable when:
  Σ(t=now..end) cost/tok × tokens_freed > clone_cost + store_cost + reroll_cost

Break-even horizon:
  H = (clone_cost + store_cost + reroll_cost) / (cost/tok × tokens_freed)
```

If expected remaining turns > H → compact now. If fewer → don't.

### Optimal Strategy: Lazy Batched Compaction

Every reroll is fixed cost regardless of compaction size → maximize tokens freed per reroll event.

```
BAD:  compact 1 chunk every 5 turns (many small rerolls)
GOOD: compact 5 chunks every 25 turns (one big reroll)
```

Strategy:
1. Monitor context pressure
2. Don't compact at first sign — keep accumulating
3. Compact LARGE batch when pressure genuinely high
4. Free max tokens per reroll event
5. Amortize single reroll over many subsequent turns

```
context tokens
     ▲
  ceiling ── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
             ╱╲         ╱╲         ╱╲
            ╱  ╲       ╱  ╲       ╱  ╲
  threshold ╱─ ─╲─ ─ ─╱─ ─╲─ ─ ─╱─ ─╲─
           ╱ drop╲   ╱ drop ╲   ╱ drop╲
          ╱       ╳         ╳        ╳
     ────┬────────┬─────────┬────────┬──► turns
         │   reroll₁   reroll₂  reroll₃
```

### Interplay with Prompt Caching

Between compaction events, prefix IS stable → caching works normally:

```
├── cached prefix (stable) ──┤── new turns (uncached) ──┤
│ Compacted skeletals +      │ New raw turns growing     │
│ recent raw turns.          │ with each interaction.    │
│ Cache hits every turn.     │                           │
│ Until next compaction      │                           │
│ invalidates prefix.        │                           │
```

CarterKit + prompt caching = complementary. Caching handles inter-compaction steady state, CarterKit handles structural pressure.

### Reroll as Opportunity

Bad compaction (naive summary): frees tokens but produces low-quality prefix → pay reroll AND worse performance. Good compaction (shadow clone skeletal): frees tokens AND produces prefix arguably BETTER than raw turns — more structured, more decision-relevant, less noise. Reroll = paying to reload a **better page table**, not just smaller.
