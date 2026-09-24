import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // PeerJS stays behind the Channel interface so it can be replaced later.
    ignores: ['src/net/connection.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'peerjs',
              message: 'Use src/net/connection.ts and the Channel interface instead.',
            },
          ],
        },
      ],
    },
  },
  // Must stay last: turns off rules that conflict with Prettier.
  prettier,
);
