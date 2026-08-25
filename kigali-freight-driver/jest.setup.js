// Test-environment setup for the driver app.
//
// This exists because the money screens were flaky under load. Run on their
// own, cashScreen.test.tsx and the other async screens pass every time; run
// concurrently with the other suites — which is exactly what a CI runner does
// — four tests failed with React act() warnings and "render function has not
// been called". Three isolated re-runs passed.
//
// Intermittent red is worse than red. A suite that fails one run in five stops
// being read, and the screen it covers is the one where a driver decides what
// to do with cash in their hand.

const { configure } = require('@testing-library/react-native');

// Tells React it is in a test environment, so state updates from resolved
// promises are wrapped rather than warned about. React Testing Library sets
// this for the DOM renderer; the React Native preset does not.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

configure({
    // The default is 1000ms. These screens render, fetch, resolve a mocked
    // promise and re-render before their first assertion, which is comfortable
    // on an idle laptop and not on a shared runner competing with two other
    // suites. Raised rather than removed: a genuine hang should still fail,
    // just not a slow machine.
    asyncUtilTimeout: 5000,
});
