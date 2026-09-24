// web/app/layout.tsx
// 根布局：顶部 AuthBar + 主内容区 + 底部导航（4 个 tab：今日/目标/路线/进度）
// 对齐 CLAUDE.md 第 3 节：底部导航只有：今日|目标|路线|进度

import type { Metadata } from "next";
import { AuthBar } from "@/components/AuthBar";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily SOP",
  description: "把目标转化为：我现在可以马上做什么？",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div className="w-full max-w-2xl mx-auto px-4 pt-4">
          <AuthBar />
        </div>
        <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 pb-24">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
