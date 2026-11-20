import type { Metadata } from 'next';
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';

// Same type families as the Antova landing page, so the handoff from it looks like one product.
const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-geist-mono' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '500'], style: ['normal', 'italic'], variable: '--font-source-serif' });

export const metadata: Metadata = {
  title: 'Antova Workbench: bid audits for electrical tenders',
  description: 'See a real bid audit: every gap in each bid, priced against the spec and cited to its page.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${sourceSerif.variable} bg-zinc-50 text-zinc-900 antialiased`}
    >
      <body className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-[#C4552D]/25">
        {children}
      </body>
    </html>
  );
}
