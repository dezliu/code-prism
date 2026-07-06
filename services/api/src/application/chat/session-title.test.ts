import { describe, expect, it } from 'vitest';
import { deriveSessionTitle, isDefaultSessionTitle } from './session-title';

describe('deriveSessionTitle', () => {
  it('uses trimmed message as title', () => {
    expect(deriveSessionTitle('  支付服务如何设计？  ')).toBe('支付服务如何设计？');
  });

  it('truncates long messages', () => {
    const long = 'a'.repeat(60);
    expect(deriveSessionTitle(long)).toBe(`${'a'.repeat(49)}…`);
  });

  it('falls back to default for empty input', () => {
    expect(deriveSessionTitle('   ')).toBe('新会话');
  });
});

describe('isDefaultSessionTitle', () => {
  it('detects default title', () => {
    expect(isDefaultSessionTitle('新会话')).toBe(true);
    expect(isDefaultSessionTitle('支付服务如何设计？')).toBe(false);
  });
});
