import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { LingPrismApolloProvider } from '@lingprism/graphql';
import './globals.css';

export const metadata: Metadata = {
  title: '灵镜 — 用户平台',
  description: '企业知识与代码智能平台 · 用户前端',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <LingPrismApolloProvider>{children}</LingPrismApolloProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
