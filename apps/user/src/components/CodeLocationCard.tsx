'use client';

import { useCallback, useState } from 'react';
import { message as antMessage } from 'antd';
import type { CodeLocation } from '@lingprism/graphql';

export type { CodeLocation };

export interface CodeLocationCardProps {
  location: CodeLocation;
  title?: string;
}

export function CodeLocationCard({ location, title }: CodeLocationCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(location.qualifiedRef);
      setCopied(true);
      antMessage.success('已复制符号引用');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      antMessage.error('复制失败');
    }
  }, [location.qualifiedRef]);

  const lineText =
    location.startLine === location.endLine
      ? String(location.startLine)
      : `${location.startLine}–${location.endLine}`;

  return (
    <div className="user-code-location-card">
      {title ? <div className="user-code-location-card__title">{title}</div> : null}
      <div className="user-code-location-card__row">
        <span className="user-code-location-card__label">仓库</span>
        <span>{location.repoName}</span>
      </div>
      {location.className ? (
        <div className="user-code-location-card__row">
          <span className="user-code-location-card__label">类名</span>
          <span>{location.className}</span>
        </div>
      ) : null}
      <div className="user-code-location-card__row">
        <span className="user-code-location-card__label">方法名</span>
        <span>{location.methodName}</span>
      </div>
      <div className="user-code-location-card__row">
        <span className="user-code-location-card__label">行数</span>
        <span>{lineText}</span>
      </div>
      <div className="user-code-location-card__row">
        <span className="user-code-location-card__label">文件</span>
        <span>{location.filePath}</span>
      </div>
      <div className="user-code-location-card__ref">
        <code>{location.qualifiedRef}</code>
        <button type="button" className="user-code-location-card__copy" onClick={handleCopy}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      {location.docComment ? (
        <div className="user-code-location-card__comment">{location.docComment}</div>
      ) : null}
    </div>
  );
}
