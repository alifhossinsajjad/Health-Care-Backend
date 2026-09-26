import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { createRequire } from "module";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);



export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
);