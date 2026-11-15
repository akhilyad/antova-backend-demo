import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Antova — Technical Bid Evaluation & Tender Auditing',
  description: 'Automated technical bid evaluation and tender auditing engine for electrical and EPC procurement.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark bg-black text-zinc-100 antialiased">
      <body className="min-h-screen bg-black text-zinc-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
