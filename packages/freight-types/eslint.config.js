import freightConfig from '@freight/config';

export default [
  ...freightConfig,
  {
    ignores: ['dist/', 'build/', '.turbo/', '*.config.*', '*.d.ts', 'coverage/', 'src/**/*.test.ts'],
  },
];