// The one place extractors touch the network: fetch text with a timeout and map failures to ExtractError.
// Every extractor goes through here so errors look the same to the retry logic.
import { ExtractError, type Http } from './types';

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 15000;

export async function fetchText(
  http: Http,
  url: string,
  options: { ua?: string; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ status: number; url: string; text: string }> {
  // AbortController + setTimeout works in both React Native and Node; fetch has no timeout option.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await http(url, {
      headers: { 'User-Agent': options.ua ?? DESKTOP_CHROME_UA, ...options.headers },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      throw new ExtractError('blocked', `HTTP ${response.status} for ${url}`);
    }
    if (response.status === 404) throw new ExtractError('not_found', `HTTP 404 for ${url}`);
    if (!response.ok) throw new ExtractError('network', `HTTP ${response.status} for ${url}`);
    return { status: response.status, url: response.url || url, text: await response.text() };
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    throw new ExtractError('network', `Could not fetch ${url}: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

// Short links (t.co, bit.ly) just redirect; fetch follows them and tells us where it ended up.
// Same timeout and user agent as fetchText, so a hanging shortener cannot stall the pipeline.
export async function resolveShortLink(http: Http, url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await http(url, {
      redirect: 'follow',
      headers: { 'User-Agent': DESKTOP_CHROME_UA },
      signal: controller.signal,
    });
    return response.url || url;
  } catch (error) {
    throw new ExtractError('network', `Could not resolve ${url}: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}
