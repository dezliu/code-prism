'use client';

import { Suspense } from 'react';
import ChatPageInner from '../ChatPageInner';

export default function ChatRoutePage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
