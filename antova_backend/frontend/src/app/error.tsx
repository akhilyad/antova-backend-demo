'use client';

import { useEffect } from 'react';
import { clearChunkReloadFlag, reloadOnceForChunkError } from '@/lib/chunkReload';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!reloadOnceForChunkError(error)) console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl p-8 text-sm">
      <h2 className="mb-2 text-lg font-semibold">This page failed to load</h2>
      <p className="mb-4 opacity-80">{error.message || 'Unexpected error.'}</p>
      <div className="flex gap-3">
        <button className="rounded border px-3 py-1.5" onClick={() => { clearChunkReloadFlag(); reset(); }}>
          Try again
        </button>
        <button className="rounded border px-3 py-1.5" onClick={() => { clearChunkReloadFlag(); window.location.reload(); }}>
          Reload page
        </button>
      </div>
    </div>
  );
}
