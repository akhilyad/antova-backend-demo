import type { Metadata } from 'next';
import './globals.css';

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
      className="bg-zinc-50 text-zinc-900 antialiased"
    >
      <body className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-[#C4552D]/25">
        {children}
      </body>
    </html>
  );
}
