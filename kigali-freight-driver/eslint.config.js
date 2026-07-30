// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const freightConfig = require("@freight/config");

module.exports = defineConfig([
  ...freightConfig,
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "android/*", "ios/*"],
  }
]);