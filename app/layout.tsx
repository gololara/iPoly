import type { Metadata, Viewport } from "next";
import {cookies} from 'next/headers';
import {UiLocaleProvider} from '@/components/ui-locale';
import {uiLocale,uiLocaleCookie} from '@/lib/ui-locale';
import "./globals.css";

const baseMetadata: Metadata = {
  title: "iPoly · Tu memoria de idiomas",
  description: "Captura, comprende y recupera lo que aprendes.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "iPoly", statusBarStyle: "default" },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
    shortcut: "/logo.png",
  },
};

export async function generateMetadata():Promise<Metadata>{
 const locale=uiLocale((await cookies()).get(uiLocaleCookie)?.value);
 return locale==='en'?{...baseMetadata,manifest:'/manifest-en.webmanifest',title:'iPoly · Your language memory',description:'Capture, understand, and find what you learn.'}:baseMetadata;
}

export const viewport: Viewport = {width:"device-width",initialScale:1,themeColor:"#566b48"};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale=uiLocale((await cookies()).get(uiLocaleCookie)?.value);
  return (
    <html lang={locale}>
      <body className="antialiased"><UiLocaleProvider locale={locale}>{children}</UiLocaleProvider></body>
    </html>
  );
}
