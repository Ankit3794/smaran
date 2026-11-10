// Two Jest projects: pure logic runs in plain Node (fast), UI tests run with the Android RN preset.
module.exports = {
  projects: [
    { displayName: 'core', preset: 'jest-expo/node', testMatch: ['<rootDir>/test/core/**/*.test.ts'] },
    { displayName: 'ui', preset: 'jest-expo/android', testMatch: ['<rootDir>/test/ui/**/*.test.{ts,tsx}'] },
  ],
};
