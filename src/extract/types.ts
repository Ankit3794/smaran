// Shared shapes for the extractors: the fetch function they receive, the error they throw,
// and the function signature each source (web, Reddit, GitHub) implements.
// Sits between the share pipeline and the network: the pipeline calls an Extractor, gets Extracted back.
import type { Extracted, Http } from '@/core/types';

export type { Extracted, Http };

export interface ExtractCtx {
  http: Http;
  allowMirrors: boolean;
}

// `kind` lets the retry logic tell a temporary problem (network) from a permanent one (not_found).
export class ExtractError extends Error {
  constructor(public kind: 'network' | 'blocked' | 'not_found' | 'parse', message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}

export type Extractor = (url: string, ctx: ExtractCtx) => Promise<Extracted>;
