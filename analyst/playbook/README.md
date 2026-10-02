# Log Pose playbook

Strategy notes the `playbook` tool serves to Claude. One file per leader, named by its card number (`OP12-001.md`), plus `general.md` for format-independent principles. Edit them like any other file; the analyst reads them at startup, so a merge and redeploy publishes a change.

```markdown
---
leader: OP12-001
name: Silvers Rayleigh
colors: [red]
format: OP17          # newest booster when the note was written; older notes are flagged as possibly stale
updated: 2026-10-02
status: draft         # draft until a player has reviewed it, then reviewed
source: who wrote it and from what
confidence: medium    # low | medium | high
---

## Game plan
## Key cards
## Mulligan
## Lines and cheese
## Matchups
### vs OP11-040 Monkey.D.Luffy
Who is favoured, what decides it, going first or second.
## Sources
```

Rules for notes:

- Card numbers must exist in `packages/rules/src/cards/cardData.json`, and quoted card text must come from it.
- Matchup calls are judgement; say what they hinge on and how thin the evidence is.
- Write in your own words. Don't paste articles or official text.
- When a note is reviewed by a player, set `status: reviewed` and update `updated`.
