# Connect 4 – instructions for Claude

Browser Connect 4 (TypeScript + Vite, no UI framework), deployed to https://ascanius3791.github.io/Connect_4/. The user does not write code: Claude implements everything, the user steers through GitHub issues on `Ascanius3791/Connect_4`.

## Workflow per issue

1. Read the issue: `gh issue view <n>`. Its Scope and Acceptance criteria are the contract; stay inside them.
2. Implement, with tests as described in the issue's Testing section. Tests live next to the code as `*.test.ts`.
3. `npm run check` must pass (typecheck, lint with zero warnings, Prettier, tests); `npm run format` fixes formatting.
4. One commit per issue, directly on `main`, message format from CONTRIBUTING.md ending in `Closes #<n>`. Push.
5. Watch CI: `gh run watch <id> --exit-status`. On failure, fix and push again; reopen the issue if needed.
6. Tick the checkboxes: `.claude/scripts/tick-issue.ps1 <n>`. Close the milestone when its last issue closes.
7. Run the `session-advisor` agent with a brief (finished issue, next issue, in-session knowledge not in the repo) and tell the user its verdict. If it says NEW SESSION or COMPACT, stop and give the user the starter prompt or `/compact` command instead of continuing.

New issues follow the format, labels and milestones in CONTRIBUTING.md. Large issues are split into GitHub sub-issues.

## Environment

- Windows, PowerShell. If `git`, `gh` or `node` are not found, refresh PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- `gh` uses a fine-grained token limited to this repo with no admin rights. Repo settings (Pages, About, branch rules) return 403: ask the user to change them in the web UI.
- TypeScript is pinned to `~6.0` because typescript-eslint does not support 7.x yet.
- Everything (code, comments, issues, commits, docs) is in English. Mobile support is out of scope.
