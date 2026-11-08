import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BuildAI — от снимка до план за обновяване',
  description: 'BuildAI — AI асистент за анализ на сгради, планове за обновяване, изпълнители и европейско финансиране.',
  icons: { icon: '/buildai-icon.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bg">
      <head>
        <script dangerouslySetInnerHTML={{ __html: "if ('scrollRestoration' in history) history.scrollRestoration = 'manual';" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
