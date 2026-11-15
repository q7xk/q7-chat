const tseslint = require("@typescript-eslint/eslint-plugin");
const tsparser = require("@typescript-eslint/parser");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const importPlugin = require("eslint-plugin-import");
const jsxA11y = require("eslint-plugin-jsx-a11y");

const ts = {
  files: ["**/*.{ts,tsx}"],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      project: "./tsconfig.json",
      tsconfigRootDir: __dirname,
    },
  },
  settings: {
    react: { version: "detect" },
    "import/resolver": { typescript: {}, node: true },
  },
  plugins: {
    "@typescript-eslint": tseslint,
    react,
    "react-hooks": reactHooks,
    import: importPlugin,
    "jsx-a11y": jsxA11y,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    "react/no-unescaped-entities": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
};

const js = {
  files: ["**/*.{js,mjs,cjs}"],
  ignores: ["node_modules/**", ".next/**", "out/**", "dist/**", "build/**"],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  settings: {
    "import/resolver": { node: true },
  },
  plugins: {
    import: importPlugin,
  },
  rules: {},
};

module.exports = [ts, js];
