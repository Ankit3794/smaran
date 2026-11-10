// Shared types used across the app's pure logic (src/core) and the screens.
// Kept in one small file so every layer agrees on the same names.

// Where a saved item came from; decides which fetcher runs and which icon shows.
export type Source = 'x' | 'reddit' | 'github' | 'instagram' | 'web' | 'text';
