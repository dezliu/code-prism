import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { LingPrismApolloProvider } from '@lingprism/graphql';
import './globals.css';

export const metadata: Metadata = {
  title: '灵镜 — 监控平台',
  description: '健康度、架构合规、MCP 调用监控',
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
