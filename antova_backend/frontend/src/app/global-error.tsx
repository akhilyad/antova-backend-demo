'use client';

import { useEffect } from 'react';
import { clearChunkReloadFlag, reloadOnceForChunkError } from '@/lib/chunkReload';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!reloadOnceForChunkError(error)) console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
        <h2>The workbench failed to load</h2>
        <p>{error.message || 'Unexpected error.'}</p>
        <button onClick={() => { clearChunkReloadFlag(); window.location.reload(); }}>Reload page</button>
      </body>
    </html>
  );
}
