// Calls `reload` when the app returns to the foreground or when one of the given SQLite tables changes.
// Shared by the Timeline hooks; this is how rows written by the Kotlin share receiver show up on screen.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { addDatabaseChangeListener } from 'expo-sqlite';

export function useReloadOnChange(reload: () => void, tables: string[]) {
  // A joined string keeps the effect from re-subscribing every render when callers pass a fresh array.
  const tableKey = tables.join(',');
  useEffect(() => {
    const watched = tableKey.split(',');
    const dbSubscription = addDatabaseChangeListener((change) => {
      if (watched.includes(change.tableName)) reload();
    });
    const appSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => {
      dbSubscription.remove();
      appSubscription.remove();
    };
  }, [reload, tableKey]);
}
