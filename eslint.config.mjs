import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules', 'dist', '.next', 'coverage'] },
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Node runs the `.ts` in this repository by STRIPPING types, and
      // `constructor(readonly x: T)` is syntax it refuses outright:
      // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX, at import, before any code runs.
      // vitest transpiles the same file without complaint, so the failure mode
      // is a green test suite and a script that will not start -- which is
      // exactly how it was found, in `src/lib/bot/sink.ts` on 2026-09-02.
      // Nothing else in the toolchain notices, so the linter is where it goes.
      '@typescript-eslint/parameter-properties': 'error',
    },
  },
)
