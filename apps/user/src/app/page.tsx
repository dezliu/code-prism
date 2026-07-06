'use client';

import { Suspense } from 'react';
import ChatPageInner from './ChatPageInner';

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
