import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly", Buffer: "readonly", console: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
        fetch: "readonly", AbortController: "readonly", Response: "readonly", URL: "readonly",
      },
    },
  },
];
