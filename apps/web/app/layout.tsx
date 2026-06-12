import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MotionConfig } from "framer-motion";
import type { Metadata } from "next";
import { Caveat, Inter, JetBrains_Mono } from "next/font/google";

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

export const metadata: Metadata = {
  title: "Singularity",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${caveat.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TRPCProvider>
          <MotionConfig reducedMotion="user">
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </MotionConfig>
        </TRPCProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
