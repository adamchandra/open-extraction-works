module.exports = {
  root: true,
  env: {
    node: true,
    mocha: true,
    es6: true
  },
  parser: '@typescript-eslint/parser',
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  plugins: [
    "@typescript-eslint",
    "chai-expect"
    // 'prettier',
  ],

  globals: {
    expect: true,
  },

  rules: {
    "no-empty-pattern": ["off"],
    "@typescript-eslint/no-non-null-assertion": ["off"],
    "@typescript-eslint/no-empty-interface": ["off"],
    "@typescript-eslint/no-explicit-any": ["off"],
    "@typescript-eslint/explicit-function-return-type": ["off"],
    "@typescript-eslint/no-inferrable-types": ["off"],
    "@typescript-eslint/no-use-before-define": ["off"],
    "@typescript-eslint/no-unused-vars": ["off"],
    "@typescript-eslint/no-this-alias": ["error", {
      allowDestructuring: true, // Allow `const { props, state } = this`; false by default
      allowedNames: ['self'], // Allow `const self = this`; `[]` by default
    }]
  },

  "overrides": [
    {
      "files": ["*.ts"],
      "excludedFiles": ["*.d.ts"],
      "rules": {
        "indent": "off"
      }
    }
  ]
}