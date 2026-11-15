'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import SignIn1 from '@/components/ui/modern-stunning-sign-in';

export default function LoginPage() {
  return (
    <div className="relative min-h-screen bg-[#090A0C]">
      <Link
        href="/"
        className="absolute top-6 left-6 z-30 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Workbench
      </Link>
      <SignIn1 />
    </div>
  );
}
