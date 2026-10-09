// Shared ESLint flat config. Usage in a package's eslint.config.js:
//   import { config } from '@repo/config/eslint';
//   export default config({ react: true });
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @param {{ react?: boolean, ignores?: string[] }} [options] */
export function config({ react = false, ignores = [] } = {}) {
  return tseslint.config(
    {
      ignores: [
        'dist/**',
        '.wrangler/**',
        '.turbo/**',
        'coverage/**',
        '**/*.gen.ts',
        'worker-configuration.d.ts',
        ...ignores,
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: react ? globals.browser : globals.worker,
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': 'error',
      },
    },
    {
      // Node-run files: build/dev configs and scripts.
      files: ['**/*.config.{js,ts,mjs}', 'scripts/**/*.{js,mjs,ts}'],
      languageOptions: { globals: globals.node },
    },
    ...(react ? [reactHooks.configs.flat['recommended-latest']] : []),
  );
}
