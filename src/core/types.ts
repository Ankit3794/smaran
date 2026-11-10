// Shared types used across the app's pure logic (src/core) and the screens.
// Kept in one small file so every layer agrees on the same names.

// The fetch function: callers pass the global `fetch`; tests pass a fake. Shared by the extract and ai layers.
export type Http = typeof fetch;

// Where a saved item came from; decides which fetcher runs and which icon shows.
export type Source = 'x' | 'reddit' | 'github' | 'instagram' | 'web' | 'text';

// Where a save is in the fetch-then-enrich pipeline.
export type SaveStatus = 'fetching' | 'waiting_ai' | 'partial' | 'done';
// Why a save is waiting; the UI turns this into a plain-language message.
export type StatusReason = 'offline' | 'not_connected' | 'quota' | 'auth_expired' | 'provider_error' | 'fetch_failed' | null;

// What a fetcher could read from the saved link.
export interface Extracted {
  title?: string;
  author?: string;
  text?: string;
  imageUrl?: string;
  publishedAt?: number;
  extra?: Record<string, unknown>;
}

// What the AI returns for one save (see the AI output contract).
export interface Enrichment {
  summary: string;
  brief: string;
  topic: string;
  tags: string[];
}

// A save as the screens and the pipeline see it, with topic and tags already joined in.
export interface Save {
  id: number;
  url: string | null;
  canonicalUrl: string | null;
  source: Source;
  sourceApp: string | null;
  sharedText: string;
  title: string | null;
  author: string | null;
  extractedText: string | null;
  imageUrl: string | null;
  thumbPath: string | null;
  summary: string | null;
  brief: string | null;
  topicId: number | null;
  topicName: string | null;
  topicColor: string | null;
  tags: string[];
  note: string | null;
  status: SaveStatus;
  statusReason: StatusReason;
  statusDetail: string | null;
  attempts: number;
  nextRetryAt: number | null;
  createdAt: number;
  lastSavedAt: number;
  openedAt: number | null;
  extra: Record<string, unknown>;
}
