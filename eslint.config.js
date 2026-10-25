import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      globals: {
        chrome: "readonly",
        self: "readonly",
        document: "readonly",
        window: "readonly",
        location: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        Blob: "readonly",
        Buffer: "readonly",
        process: "readonly",
        TextEncoder: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-undef": "off",
    },
  },
  {
    files: [
      "src/model/**/*.ts",
      "src/processing/**/*.ts",
      "src/documents/**/*.ts",
      "src/export/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["**/browser/*", "**/source/*"] },
      ],
    },
  },
);
