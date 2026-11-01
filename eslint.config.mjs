import { defineConfig, globalIgnores } from "eslint/config";
import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintReact from "@eslint-react/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [eslintJs.configs.recommended],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [eslintJs.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      eslintReact.configs["recommended-typescript"],
      reactHooks.configs.flat.recommended,
      nextPlugin.configs["core-web-vitals"],
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
