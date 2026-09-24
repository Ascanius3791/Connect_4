# Connect 4

[![CI](https://github.com/Ascanius3791/Connect_4/actions/workflows/ci.yml/badge.svg)](https://github.com/Ascanius3791/Connect_4/actions/workflows/ci.yml)

A browser-based Connect 4 game. Play against a friend on the same PC, against a bot, or live against a friend on another PC by sending them a link.

## Planned features

Development is tracked with [GitHub issues](https://github.com/Ascanius3791/Connect_4/issues), grouped into [milestones](https://github.com/Ascanius3791/Connect_4/milestones):

1. **Setup** – project scaffold, tooling, CI and automatic deployment to GitHub Pages
2. **Local game** – two players on the same PC can play a full game in the browser
3. **Random bot** – play against a computer opponent that makes random legal moves
4. **Online play** – two players on different PCs play live via a shareable link
5. **GUI polish** – animations, visual design and game-over screens
6. **Bot levels** – selectable bot difficulty levels

Mobile devices are out of scope for now.

## Development

Requires [Node.js](https://nodejs.org/) 24 (LTS) or newer. CI uses the version in `.nvmrc`.

```sh
npm install      # install dependencies
npm run dev      # start local dev server with hot reload
npm run build    # typecheck and build the production site into dist/
npm run preview  # serve the production build locally
```

Quality checks:

```sh
npm run check         # typecheck + lint + format check + tests (run before every commit)
npm run typecheck     # TypeScript type check only
npm run lint          # ESLint, zero warnings allowed
npm run format        # format all files with Prettier
npm run format:check  # fail if any file is not formatted
npm test              # run tests once
npm run test:watch    # run tests in watch mode
```

Tests live next to the code as `*.test.ts`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue format, labels and the definition of done.
