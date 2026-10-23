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
    icon: '/icon-512.png?v=3',
    shortcut: '/apple-touch-icon.png?v=3',
    apple: '/apple-touch-icon.png?v=3',
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
      <head>
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KDLCF858');`,
          }}
        />
        {/* End Google Tag Manager */}

        {/* Google Analytics (gtag.js) */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-LTBD8V80GW"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-LTBD8V80GW');`,
          }}
        />
      </head>
      <body className="antialiased font-sans selection:bg-blue-600 selection:text-white">
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KDLCF858"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        {children}
      </body>
    </html>
  );
}
