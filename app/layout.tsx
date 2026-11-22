import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quản lý phòng trọ",
  description: "Thông báo tiền phòng, điện, nước hàng tháng cho người thuê.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b6b5f",
};

// Chạy trước khi vẽ trang để không bị nháy sáng/tối.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);var f=localStorage.getItem('fs');if(f==='l'||f==='xl')document.documentElement.dataset.fs=f}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
