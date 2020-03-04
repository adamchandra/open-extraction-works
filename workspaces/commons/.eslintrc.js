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
    "plugin:@typescript-eslint/recommended"
  ],
  plugins: [
    "@typescript-eslint",
    "chai-expect"
  ],

  globals: {
    expect: true,
  },

  rules: {
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