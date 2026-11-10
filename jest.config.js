// Two Jest projects: pure logic runs in plain Node (fast), UI tests run with the Android RN preset.
// Both map the `@/` import alias to src/, matching tsconfig.json.
const aliasToSource = { '^@/(.*)$': '<rootDir>/src/$1' };

// Packages Babel must still convert: jest-expo's own list (Expo and React Native ship untranspiled code)
// plus htmlparser2 and its helpers, @noble/hashes (PKCE) and FlashList, which ship as ES modules that Jest can only run after conversion.
const esmPackages =
  '.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|' +
  '@shopify/flash-list|@noble/hashes|htmlparser2|domhandler|domutils|domelementtype|entities|dom-serializer';

module.exports = {
  projects: [
    { displayName: 'core', preset: 'jest-expo/node', moduleNameMapper: aliasToSource, transformIgnorePatterns: [`/node_modules/(?!(${esmPackages}))`], testMatch: ['<rootDir>/test/core/**/*.test.ts'] },
    { displayName: 'ui', preset: 'jest-expo/android', moduleNameMapper: aliasToSource, transformIgnorePatterns: [`/node_modules/(?!(${esmPackages}))`], testMatch: ['<rootDir>/test/ui/**/*.test.{ts,tsx}'] },
  ],
};
