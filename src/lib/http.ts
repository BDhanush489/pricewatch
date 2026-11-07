// fetch with a time limit. React Native's fetch never gives up on its own (Android has no
// default timeout), so one stalled server could hang a refresh or a background price check.
export const TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error('Timed out — check your connection');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
