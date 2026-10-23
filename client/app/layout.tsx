import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://mitemasuka.com'),
  title: 'Mitemasuka (見てますか?) — Beni Görüyor Musun? | 100m Canlı Radar Sohbet',
  description:
    'Mitemasuka (見てますか? - Beni görüyor musun?): Bulunduğun kafede, kampüste, etkinlikte veya sokakta 100 metre çapındaki kişilerle anında aynı odada buluş ve mesajlaş.',
  keywords: [
    'Mitemasuka',
    '見てますか',
    'yakın çevre sohbet',
    '100m sohbet',
    'hyper-local chat',
    'konum tabanlı tanışma',
    'anonim radar sohbet',
  ],
  manifest: '/manifest.json',
  openGraph: {
    title: 'Mitemasuka (見てますか?) — Beni Görüyor Musun?',
    description:
      '100 metre yakınındaki kişilerle anında aynı odada buluş. Kayıt yok, indirme yok, sadece gerçek yakınlık.',
    url: 'https://mitemasuka.com',
    siteName: 'Mitemasuka',
    locale: 'tr_TR',
    type: 'website',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mitemasuka',
  },
  icons: {
    icon: '/icon-512.png?v=2',
    shortcut: '/apple-touch-icon.png?v=2',
    apple: '/apple-touch-icon.png?v=2',
  },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="antialiased font-sans selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
