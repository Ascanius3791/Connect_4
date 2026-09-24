# Connect 4 – instructions for Claude

Browser Connect 4 (TypeScript + Vite, no UI framework), deployed to https://ascanius3791.github.io/Connect_4/. The user does not write code: Claude implements everything, the user steers through GitHub issues on `Ascanius3791/Connect_4`.

## Workflow per issue

1. Read the issue: `gh issue view <n> --comments`. Its Scope and Acceptance criteria are the contract; stay inside them. Technical notes are guidance written before the code existed: follow them unless you find a better way, and explain any deviation in the commit body.
2. Implement, with tests as described in the issue's Testing section. Tests live next to the code as `*.test.ts`.
3. `npm run check` must pass (typecheck, lint with zero warnings, Prettier, tests); `npm run format` fixes formatting.
4. Update `STATUS.md` (the user's progress overview, plain language, keep it short): date and issue number, milestone table, what works, next up. When an issue makes the game playable for the first time or adds a new way to play (bot, online, ...), write how to play in its "Can I play yet?" section and say so explicitly in your final message to the user.
5. One commit per issue, directly on `main`, including the `STATUS.md` update, message format from CONTRIBUTING.md ending in `Closes #<n>`. Push with `git push` as its own command (not chained), so the session-check hook matches it.
6. Watch CI: `gh run watch <id> --exit-status`. On failure, fix and push again; reopen the issue if needed.
7. Tick the checkboxes: `.claude/scripts/tick-issue.ps1 <n>`. When this was the milestone's last open issue, leave the milestone open: the next session reviews it (see Milestone review).
8. In your final message, list the manual steps from the issue's Testing section that you could not run yourself, so the user can try them on the deployed site.
9. Session check (below).

New issues follow the format, labels and milestones in CONTRIBUTING.md, including the Model section (see Model choice). Large issues are split into GitHub sub-issues.

## Milestone review

Started with `Review milestone <n> of Ascanius3791/Connect_4. Follow CLAUDE.md.` once all of the milestone's issues are closed.

1. Run `/code-review` (Skill `code-review`) at `high` over the code the milestone added or changed, passing its directories or files as the target.
2. For findings worth fixing, create issues in the same milestone (group small ones into one `chore` or `bug` issue) and work them with the normal workflow. Mention findings you deliberately skip, with the reason, in your message to the user.
3. Once they are closed, give the user a short play-test checklist for the whole milestone on the deployed site, and close the milestone. Problems the user reports become `bug` issues.

## Model choice

The user picks model and effort with `/model` at the start of a session; you cannot switch it. Every issue's Model section names one of these:

| Model · effort    | Use for                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Opus 5.5 · high   | Writing and splitting issues, milestone reviews, concurrency and networking (`multiplayer`), search algorithms (`bot`), hard-to-find bugs |
| Opus 5.5 · medium | Clearly specified `ui` or `game-logic` features                                                                                           |
| Sonnet 5 · high   | Small `docs` or `chore` issues, and trials on simple `ui` issues                                                                          |

Judge by cost per finished issue, not per token: a cheaper model that needs extra fix rounds is not cheaper. When an issue done with a lower tier needed several fix rounds or missed acceptance criteria, say so to the user and raise the Model of similar open issues.

## Session check

After `git push`, a hook runs `.claude/scripts/context-usage.ps1`. It is silent below 60k context tokens; above that it adds a NEW SESSION verdict to your context. The status line shows the same numbers to the user. Do not spawn agents for this check; it must stay near zero cost.

- Hook silent (below 60k): you may continue with the next issue, unless its Model section names a different model or effort than the current session's.
- Verdict NEW SESSION: stop. If the next issue builds on knowledge that exists only in this session (not in code, issues, commits or this file), first write it into a comment on that issue (`gh issue comment <next>`), or into this file if it applies to all future work.

When you stop, tell the user how to start the next session, taking the model from the next issue's Model section (or the Model choice table for a milestone review):

> New session → `/model` → **<model>**, effort **<effort>** → then send: `Work on issue #<next> of Ascanius3791/Connect_4. Follow CLAUDE.md.`

## Environment

- Windows, PowerShell. If `git`, `gh` or `node` are not found, refresh PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- `gh` uses a fine-grained token limited to this repo with no admin rights. Repo settings (Pages, About, branch rules) return 403: ask the user to change them in the web UI.
- TypeScript is pinned to `~6.0` because typescript-eslint does not support 7.x yet.
- Everything (code, comments, issues, commits, docs) is in English. Mobile support is out of scope.
