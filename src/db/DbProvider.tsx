// The one shared object screens need: the open database. The root layout opens it once and provides it here;
// screens call useDb() instead of opening their own connection.
import { createContext, useContext } from 'react';
import type { Db } from '@/db/db';

export const DbContext = createContext<Db | null>(null);

export function useDb(): Db {
  const db = useContext(DbContext);
  if (db === null) throw new Error('useDb must be used inside the root layout, which provides the database');
  return db;
}
