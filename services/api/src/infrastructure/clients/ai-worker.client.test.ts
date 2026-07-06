import { describe, it, expect } from 'vitest';
import { parseSseBuffer } from './ai-worker.client';

describe('parseSseBuffer', () => {
  it('should parse complete SSE blocks', () => {
    const input =
      'event: status\ndata: {"phase":"understanding"}\n\n' +
      'event: token\ndata: {"text":"你好"}\n\n';

    const { parsed, remainder } = parseSseBuffer(input);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      event: 'status',
      data: { phase: 'understanding' },
    });
    expect(parsed[1]).toEqual({
      event: 'token',
      data: { text: '你好' },
    });
    expect(remainder).toBe('');
  });

  it('should keep incomplete block in remainder', () => {
    const input = 'event: token\ndata: {"text":"a"}\n\n event: done';
    const { parsed, remainder } = parseSseBuffer(input);
    expect(parsed).toHaveLength(1);
    expect(remainder).toContain('event: done');
  });
});
