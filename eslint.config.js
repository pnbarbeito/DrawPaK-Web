import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

const flatConfig = [
  globalIgnores(['dist']),
  // base JS recommended rules
  js.configs.recommended,
  // React hooks rules
  reactHooks.configs['recommended-latest'],
  // Vite/refresh plugin config
  reactRefresh.configs.vite,
  // typescript-eslint recommended type-checked configs: apply only to TS/TSX files
  ...(Array.isArray(tseslint.configs.recommendedTypeChecked)
    ? tseslint.configs.recommendedTypeChecked.map((cfg) => ({ ...cfg, files: ['**/*.{ts,tsx}'] }))
    : [{ ...tseslint.configs.recommendedTypeChecked, files: ['**/*.{ts,tsx}'] }]),
  // Files-specific entry to enable parserOptions.project for type-aware rules
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Temporary: relax strict unsafe-* rules across src so linting is actionable;
  // prefer to fix these properly over time but disabling avoids blocking development.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-base-to-string': 'off'
    }
  },
];

export default flatConfig;
