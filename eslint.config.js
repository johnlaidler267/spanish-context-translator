import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import checkFile from 'eslint-plugin-check-file'
import { defineConfig, globalIgnores } from 'eslint/config'

// supabase/functions/** are Deno Edge Functions — a separate runtime with
// its own lint story (`deno lint`), not this frontend config's concern.
const UNUSED_ARGS = { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' }

export default defineConfig([
  globalIgnores(['**/dist', '.claude', 'supabase/**']),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', UNUSED_ARGS],
    },
  },
  {
    // Was previously missing entirely — this project is ~99% .ts/.tsx, so
    // without this block `npm run lint` only ever checked main.jsx.
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', UNUSED_ARGS],

      // eslint-plugin-react-hooks v7 adds React-Compiler-readiness rules on
      // top of the classic hook-correctness ones. The classic rules
      // (rules-of-hooks, exhaustive-deps) catch real bugs and stay errors.
      // These newer ones flag patterns that are safe today without the
      // compiler — e.g. the common "latest ref" idiom (`ref.current = x`
      // during render, read later in an effect/handler) — but are widespread
      // and intentional in this codebase. Kept visible as warnings rather
      // than silenced, so they're tracked without blocking lint/CI on a
      // React Compiler migration nobody has decided to make yet.
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Same rationale: flags mutating a ref-typed prop's .current (the
      // standard "controlled ref" pattern — a parent hands a child a ref to
      // write into) as "modifying a prop." Already used elsewhere in this
      // codebase via the direct `propRef.current = x` shape without
      // tripping this rule; only a local-variable alias to the same prop
      // triggers it, which is a syntactic gap in the rule, not a real bug.
      'react-hooks/immutability': 'warn',
      // Fast Refresh reliability, not a correctness issue.
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // Filenames in src/ are kebab-case, e.g. `text-chunk.tsx`, `chunk-merges.ts`.
    // App.tsx and main.jsx keep their conventional Vite/React entry-point names.
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/App.tsx', 'src/main.jsx'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.{js,jsx,ts,tsx}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
])
