const { FlatCompat } = require("@eslint/eslintrc");
const js = require("@eslint/js");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended
});

module.exports = [
  {
    ignores: ["_next", "next-env.d.ts", ".storybook/**/*"]
  },
  ...compat.config({
    overrides: [
      {
        files: ["**/__tests__/**/*.{ts,tsx}", "src/test-utils/**/*.{ts,tsx}"],
        rules: { "react/display-name": "off" }
      },
      {
        files: ["**/*.js"],
        parser: "espree",
        extends: ["eslint:recommended", "plugin:prettier/recommended"],
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: "module"
        },
        env: {
          node: true,
          jest: true
        }
      },
      {
        files: ["src/icons/_template.js"],
        rules: {
          "no-unused-vars": "off"
        }
      }
    ],
    root: true,
    env: {
      browser: true,
      node: true
    },
    parser: "@typescript-eslint/parser",
    parserOptions: {
      project: ["tsconfig.json", "cypress/tsconfig.json"],
      sourceType: "module",
      ecmaFeatures: { jsx: true }
    },
    plugins: [
      "react",
      "@typescript-eslint",
      "jsx-a11y",
      "prettier",
      "react-hooks"
    ],
    extends: [
      "plugin:@typescript-eslint/eslint-recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:react/recommended",
      "plugin:jsx-a11y/strict",
      "plugin:@next/next/recommended-legacy",
      "plugin:prettier/recommended",
      "prettier"
    ],
    rules: {
      "jsx-a11y/label-has-for": 0,
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-empty-interface": 0,
      "@typescript-eslint/no-use-before-define": [
        "error",
        { functions: false, variables: false }
      ],
      "react/prop-types": 0,
      "@typescript-eslint/no-empty-object-type": 0,
      "@typescript-eslint/no-require-imports": 0,
      "@typescript-eslint/no-unused-expressions": 0,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
          argsIgnorePattern: "^_.*",
          varsIgnorePattern: "^jsx$|^React$|^_.*",
          ignoreRestSiblings: true
        }
      ],
      "no-underscore-dangle": 0,
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "@typescript-eslint/explicit-function-return-type": 0,
      "@typescript-eslint/explicit-module-boundary-types": 0,
      "@typescript-eslint/no-explicit-any": 0,
      "@typescript-eslint/no-var-requires": 0,
      camelcase: "error",
      "@typescript-eslint/camelcase": 0,
      "@typescript-eslint/prefer-namespace-keyword": "error",
      eqeqeq: ["error", "smart"],
      "id-blacklist": [
        "error",
        "any",
        "Number",
        "number",
        "String",
        "string",
        "Boolean",
        "boolean",
        "Undefined"
      ],
      "id-match": "error",
      "no-eval": "error",
      "no-redeclare": "error",
      "no-var": "error",
      "@next/next/no-img-element": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["sx", "jsx", "global"] }
      ]
    },
    settings: {
      react: {
        version: "detect"
      }
    }
  })
];
