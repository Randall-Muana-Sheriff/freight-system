// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const freightConfig = require("@freight/config");

module.exports = defineConfig([
  ...freightConfig,
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "android/*", "ios/*"],
  },
  {
    // eslint-plugin-react-hooks v7 (pulled in by this SDK's
    // eslint-config-expo) ships new React Compiler-readiness rules as
    // errors by default. Adopting them means auditing/refactoring every
    // classic Animated.Value ref read during render (react-hooks/refs)
    // and every setState-in-effect data-loading pattern (purity,
    // set-state-in-effect) across the app — a deliberate, separate
    // migration, not a side effect of an SDK version bump. Disabled here
    // until that migration is actually undertaken.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);