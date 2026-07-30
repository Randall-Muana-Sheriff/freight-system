import freightConfig from '@freight/config';

export default [
  ...freightConfig,
  {
    ignores: ['node_modules/', 'dist/', 'build/', '.turbo/', '*.config.*', '*.d.ts', 'coverage/'],
  },
];