/**
 * Jest configuration for TypeScript tests with ESM support
 * 
 * NOTE: This file uses .cjs extension because the project uses ES modules
 * ("type": "module" in package.json). Jest config files must use CommonJS
 * syntax when the project is in ESM mode.
 * 
 * DO NOT create jest.config.js - it would conflict with this file and cause
 * Jest to fail with "Multiple configurations found" error.
 * 
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
};

