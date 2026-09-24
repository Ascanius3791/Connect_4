# Contributing

All work is driven by GitHub issues. Every issue follows the same format and the same definition of done, so each one has a comparable size and quality.

## Issues

### Title

Short and imperative, describing the outcome: "Detect wins in all four directions", not "Win detection" or "Fixing wins".

### Sections

Every issue body has these six sections, in this order. The [issue template](.github/ISSUE_TEMPLATE/task.md) pre-fills them.

| Section                 | Content                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **Goal**                | One or two sentences: what this delivers and why.                                         |
| **Scope**               | `In:` what is part of this issue. `Out:` what is explicitly deferred, with issue links.   |
| **Acceptance criteria** | Checkbox list of concrete, verifiable statements. The issue is done when all are checked. |
| **Technical notes**     | Approach, files or modules involved, decisions and their reasons.                         |
| **Testing**             | Automated tests to add and manual steps to verify the result.                             |
| **Dependencies**        | `Blocked by #n`, or `None`.                                                               |

### Size

An issue is sized to be completed in one focused commit. If it turns out larger, split it into sub-issues (see below).

### Labels

Each issue gets exactly one **type** label and one or more **area** labels.

| Type      | Meaning                                                    |
| --------- | ---------------------------------------------------------- |
| `feature` | New user-facing functionality                              |
| `bug`     | Something is broken                                        |
| `chore`   | Tooling, config, refactoring without behaviour change      |
| `docs`    | Documentation only                                         |

| Area          | Meaning                                  |
| ------------- | ---------------------------------------- |
| `game-logic`  | Rules, board state, win detection        |
| `ui`          | Rendering, input, visuals                |
| `bot`         | Computer opponent                        |
| `multiplayer` | Online play between two PCs              |
| `infra`       | Build, CI, deployment, repo setup        |

### Milestones

Every issue belongs to one milestone. Milestones are worked on roughly in order:

1. Setup
2. Local game
3. Random bot
4. Online play
5. GUI polish
6. Bot levels

## Sub-issues

When an issue is too large for one commit, or its parts are independently useful, it is split using GitHub's native sub-issues:

- The **parent** keeps its six sections. Its acceptance criteria describe the overall result; its Technical notes list the sub-issues.
- Each **sub-issue** is a full issue in the same format, with its own labels and the parent's milestone.
- Sub-issues are closed by their own commits. The parent is closed once all sub-issues are closed and its acceptance criteria hold; it needs no separate commit unless integration work remains.
- Sub-issues can themselves be split further, but keep nesting shallow.

## Definition of done

An issue is done when:

1. All acceptance criteria are met and checked off.
2. The automated checks pass (typecheck, lint, format, tests, build).
3. New behaviour is covered by tests where practical, as described in the issue's Testing section.
4. The deployed site works after the push (once deployment exists).
5. The commit is pushed to `main` and closes the issue.

## Commits

- One commit per issue, directly on `main`. No feature branches or pull requests.
- Message format:

  ```
  <Imperative summary, max ~70 characters>

  <Optional body: what changed and why, if not obvious from the issue.>

  Closes #<issue number>
  ```

- `Closes #n` closes the issue automatically when the commit reaches `main`.
- Language for code, comments, commits, issues and docs: English.
