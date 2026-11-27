// A tab left open across a redeploy asks for JS chunks that no longer exist.
// Reload once to pick up the new build; the session flag stops reload loops.
const KEY = 'antova:chunk-reload';

export function isChunkError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ''} ${e?.message ?? ''}`;
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text);
}

export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === 'undefined' || !isChunkError(error)) return false;
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}
