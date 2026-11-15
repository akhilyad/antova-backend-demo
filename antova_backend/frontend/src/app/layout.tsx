import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Antova: bid evaluation for electrical tenders',
  description: 'Antova compares electrical bids with your spec and prices every gap.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-zinc-50 text-zinc-900 antialiased">
      <body className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
