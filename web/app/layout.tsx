import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { NxSessionProvider } from "@/lib/nx/session";
import { SessionProvider } from "@/lib/session";
import { THEME_BOOT } from "@/lib/prefs";
// 舊版 IEP 的樣式（調查表、小通知單、QR 小單的列印版面）：直接用 repo 根目錄同一份，印出來才會和舊版一模一樣
import "../../iep.css";
import "./globals.css";

// 中文字形很大，不預先載入，由瀏覽器依 unicode-range 分段下載
const sans = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "資源班管理系統", template: "%s｜資源班管理系統" },
  description: "資源班排課、名冊、段考考場與老師個人頁面",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#15171c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className={sans.variable} suppressHydrationWarning>
      <head>
        {/* 深色／字級在畫面出來之前先套上，不會閃一下 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        <SessionProvider>
          <NxSessionProvider>{children}</NxSessionProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
