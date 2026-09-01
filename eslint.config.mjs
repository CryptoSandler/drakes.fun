import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules', 'dist', '.next', 'coverage'] },
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },
)
