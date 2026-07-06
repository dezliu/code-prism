import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { LingPrismApolloProvider } from '@lingprism/graphql';
import './globals.css';

export const metadata: Metadata = {
  title: '灵镜 — 管理后台',
  description: '代码源、知识库、架构图治理',
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
