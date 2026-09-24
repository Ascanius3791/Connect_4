# Connect 4 – instructions for Claude

Browser Connect 4 (TypeScript + Vite, no UI framework), deployed to https://ascanius3791.github.io/Connect_4/. The user does not write code: Claude implements everything, the user steers through GitHub issues on `Ascanius3791/Connect_4`.

## Workflow per issue

1. Read the issue: `gh issue view <n>`. Its Scope and Acceptance criteria are the contract; stay inside them.
2. Implement, with tests as described in the issue's Testing section. Tests live next to the code as `*.test.ts`.
3. `npm run check` must pass (typecheck, lint with zero warnings, Prettier, tests); `npm run format` fixes formatting.
4. Update `STATUS.md` (the user's progress overview, plain language, keep it short): date and issue number, milestone table, what works, next up. When an issue makes the game playable for the first time or adds a new way to play (bot, online, ...), write how to play in its "Can I play yet?" section and say so explicitly in your final message to the user.
5. One commit per issue, directly on `main`, including the `STATUS.md` update, message format from CONTRIBUTING.md ending in `Closes #<n>`. Push with `git push` as its own command (not chained), so the session-check hook matches it.
6. Watch CI: `gh run watch <id> --exit-status`. On failure, fix and push again; reopen the issue if needed.
7. Tick the checkboxes: `.claude/scripts/tick-issue.ps1 <n>`. Close the milestone when its last issue closes.
8. Session check. After `git push`, a hook runs `.claude/scripts/context-usage.ps1`. It is silent below 60k context tokens; above that it adds a verdict to your context. Then decide yourself whether the next issue builds on knowledge that exists only in this session (not in code, issues, commits or this file):
   - No → stop and tell the user to start a new session with: `Work on issue #<next> of Ascanius3791/Connect_4. Follow CLAUDE.md.`
   - Yes, and the verdict says COMPACT (above 120k) → stop and give the user a `/compact <what to keep>` command.
   - Yes, below 120k → continue.
     Do not spawn agents for this check; it must stay near zero cost. The status line shows the same numbers to the user.

New issues follow the format, labels and milestones in CONTRIBUTING.md. Large issues are split into GitHub sub-issues.

## Environment

- Windows, PowerShell. If `git`, `gh` or `node` are not found, refresh PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- `gh` uses a fine-grained token limited to this repo with no admin rights. Repo settings (Pages, About, branch rules) return 403: ask the user to change them in the web UI.
- TypeScript is pinned to `~6.0` because typescript-eslint does not support 7.x yet.
- Everything (code, comments, issues, commits, docs) is in English. Mobile support is out of scope.
