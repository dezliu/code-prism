'use client';

import dynamic from 'next/dynamic';
import '@uiw/react-markdown-preview/markdown.css';

const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), { ssr: false });

export interface ChatMarkdownProps {
  content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  if (!content.trim()) {
    return null;
  }

  return (
    <div className="user-md-preview" data-color-mode="light">
      <MarkdownPreview source={content} style={{ background: 'transparent' }} />
    </div>
  );
}
