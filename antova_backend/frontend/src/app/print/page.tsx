'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function PrintRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tid = searchParams.get('tender') || 'TENDER-2026-402';
    router.replace(`/print/${tid}`);
  }, [router, searchParams]);

  return null;
}

export default function PrintRedirect() {
  return (
    <Suspense fallback={null}>
      <PrintRedirectInner />
    </Suspense>
  );
}
