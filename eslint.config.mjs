import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import imports from 'eslint-plugin-import';
import security from 'eslint-plugin-security';

export default tseslint.config(
  { ignores: ['.next/**','node_modules/**','next-env.d.ts','eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts','**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true,tsconfigRootDir: import.meta.dirname } },
    plugins: { 'react-hooks': hooks,'jsx-a11y': a11y,import: imports,security },
    rules: { ...a11y.configs.recommended.rules,'react-hooks/rules-of-hooks': 'error','react-hooks/exhaustive-deps': 'error',
      'import/no-cycle': 'error','security/detect-eval-with-expression': 'error','security/detect-child-process': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-explicit-any': 'error','@typescript-eslint/no-non-null-assertion': 'error' },
  },
);