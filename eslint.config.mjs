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
    ".taste-skill/**",
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
  {
    files: ["src/shared/**/*.{ts,tsx}", "src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/**", "@/app/**"],
              message:
                "Shared code and infrastructure must not depend on application features or routes.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/features/listening-room/components/**/*.{ts,tsx}",
      "src/features/listening-room/hooks/**/*.ts",
      "src/features/listening-room/api/**/*.ts",
      "src/features/listening-room/model/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/server/**",
                "@/features/*/server",
                "@/features/*/server/**",
                "../server",
                "../server/**",
                "node:*",
              ],
              message:
                "Client code and contracts must not import server implementation or Node APIs.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/workers/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/features/*/components/**",
                "@/features/*/hooks/**",
                "@/features/*/api/**",
                "@/features/*/model/**",
                "@/features/*/server/*",
              ],
              message:
                "Use the feature's client, contracts, or server public entrypoint.",
            },
          ],
        },
      ],
    },
  },
]);
