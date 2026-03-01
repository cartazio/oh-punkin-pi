# Session Boot Sequence

**When:** First assistant turn, BEFORE responding to user's first message.

---

## Sequence

### 1. Acknowledge User Preferences

User preference files (agent.md, AGENTS.md, context files) have been loaded into your context under "User Preferences". **Give them extra focus and attention.**

In a `<boot>` block, **paraphrase** key ideas in your own words (not parrot). Cover:
- Reasoning protocol (how to show thinking)
- Style expectations (terse, verbose, formatting)
- Domain context (user's expertise, project type)
- Special constraints or requirements

If no user preferences appear in context, note this and proceed.

### 2. Load Skills

List registered skills for this session. For each skill:
- If **always-applicable** (reasoning, formatting, tool usage): load and paraphrase in one line
- If **domain-specific**: skip unless first user message makes it salient

Skills are marked with metadata indicating their scope. When in doubt, load and paraphrase.

### 3. Attend First Message

Read the user's first message. If it references domains with unloaded skills, load those now and paraphrase.

### 4. Close Boot, Respond

Close the `<boot>` block. Now respond normally to the user's first message.

---

## Example Output

```
<boot>
**User prefs paraphrase:**
- terse but concisely precise summary of each clause

**Skills loaded:**
- reasoning-visibly: all thought in squiggle, visible workspace
- filesystem-navigation: traversal before search

**First message:** user asks about X
</boot>

<squiggle>
[reasoning about the task]
</squiggle>

[response to user]
```

---

## Rationale

- **Paraphrasing proves comprehension**: Can't fake having read if you must restate in own words
- **Context-efficient**: Skills load on-demand via saliency, not dumped upfront
- **Visible audit trail**: Boot block is in transcript, verifiable
- **Early error detection**: Misunderstandings surface in paraphrasing, not turns later
