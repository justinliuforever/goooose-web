import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MotionConfig } from "framer-motion";
import type { Metadata } from "next";
import { Caveat, Inter, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TRPCProvider } from "@/lib/trpc";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

// ZCOOL KuaiLe subset: only the four wordmark glyphs (搬砖小鹅), 1.2KB self-hosted.
const kuaile = localFont({
  src: "./fonts/kuaile-wordmark.woff2",
  variable: "--font-brand-cjk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "搬砖小鹅 Goooose",
  description: "AI 内容教练——帮内容创作者看对标、出选题、写稿的全链路工具。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${inter.variable} ${caveat.variable} ${jetbrainsMono.variable} ${kuaile.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCProvider>
            <MotionConfig reducedMotion="user">
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster />
            </MotionConfig>
          </TRPCProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
