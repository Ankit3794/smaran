// Test helper: a fake `fetch` that answers from fixture files by URL, so extractor tests never hit the network.
// Also records the requested URLs and headers so tests can check what the extractor asked for.
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Http } from '@/extract/types';

export function fixture(name: string): string {
  return readFileSync(join(__dirname, '../fixtures/extract', name), 'utf8');
}

export function fakeHttp(routes: Record<string, string | number>) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const http: Http = async (input, init) => {
    const url = String(input);
    requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes[url];
    if (route === undefined) return new Response('not routed', { status: 404 });
    if (typeof route === 'number') return new Response('', { status: route });
    return new Response(route, { status: 200 });
  };
  return { http, requests };
}
