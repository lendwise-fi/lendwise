import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tsEsLint from 'typescript-eslint'

export default defineConfig([
  eslint.configs.recommended,
  tsEsLint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        React: 'writable',
      },
    },
  },
  {
    files: ['app/**/*.{ts,tsx}'],
  },
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    ignores: [
      '**/node_modules',
      '**/database.types.ts',
      '**/.next',
      '**/public',
      'dist',
      'pnpm-lock.yaml',
    ],
  },
  {
    rules: {
      '@typescript-eslint/array-type': 'error',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/default': 'off',
      'import/named': 'off',
      'import/namespace': 'off',
      'import/no-anonymous-default-export': 'off',
      'import/no-cycle': 'off',
      'import/no-deprecated': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-unresolved': 'off',
      'import/no-unused-modules': 'off',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      'no-undef': 'off',
    },
  },
])
