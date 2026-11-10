// Two Jest projects: pure logic runs in plain Node (fast), UI tests run with the Android RN preset.
// Both map the `@/` import alias to src/, matching tsconfig.json.
const aliasToSource = { '^@/(.*)$': '<rootDir>/src/$1' };

module.exports = {
  projects: [
    { displayName: 'core', preset: 'jest-expo/node', moduleNameMapper: aliasToSource, testMatch: ['<rootDir>/test/core/**/*.test.ts'] },
    { displayName: 'ui', preset: 'jest-expo/android', moduleNameMapper: aliasToSource, testMatch: ['<rootDir>/test/ui/**/*.test.{ts,tsx}'] },
  ],
};
