'use client';

import dynamic from 'next/dynamic';
import { Segmented } from 'antd';
import { useMemo, useState } from 'react';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

export interface MarkdownEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  height?: number;
  placeholder?: string;
}

export function MarkdownEditor({
  value = '',
  onChange,
  height = 360,
  placeholder,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const normalized = value ?? '';

  const editor = useMemo(() => (
    <MDEditor
      value={normalized}
      onChange={(next) => onChange?.(next ?? '')}
      height={height}
      preview={mode === 'preview' ? 'preview' : 'edit'}
      textareaProps={{ placeholder }}
      visibleDragbar={false}
    />
  ), [height, mode, normalized, onChange, placeholder]);

  return (
    <div data-color-mode="light">
      <Segmented
        size="small"
        style={{ marginBottom: 8 }}
        value={mode}
        onChange={(v) => setMode(v as 'edit' | 'preview')}
        options={[
          { label: '编辑（源码）', value: 'edit' },
          { label: '预览', value: 'preview' },
        ]}
      />
      {editor}
    </div>
  );
}
