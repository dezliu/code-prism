import { Suspense } from 'react';
import DocsContent from './DocsContent';

export default function DocsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>加载中...</div>}>
      <DocsContent />
    </Suspense>
  );
}
