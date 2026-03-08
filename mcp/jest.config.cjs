'use strict';

const tsJestTransform = ['ts-jest', { tsconfig: './tsconfig.test.json', diagnostics: false }];

const sharedBase = {
  testEnvironment: 'node',
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.tsx?$': tsJestTransform },
};

/** @type {import('jest').Config} */
module.exports = {
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: { global: { lines: 80 } },
  projects: [
    { ...sharedBase, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.ts'] },
    { ...sharedBase, displayName: 'contract', testMatch: ['<rootDir>/tests/contract/**/*.test.ts'] },
    { ...sharedBase, displayName: 'integration', testMatch: ['<rootDir>/tests/integration/**/*.test.ts'] },
    {
      ...sharedBase,
      displayName: 'e2e',
      roots: ['<rootDir>/../tests/e2e'],
      testMatch: ['**/*.test.ts'],
    },
  ],
};
