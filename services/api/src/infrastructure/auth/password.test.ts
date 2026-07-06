import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('should hash and verify password correctly', async () => {
    const hash = await hashPassword('lingprism123');
    expect(hash).not.toBe('lingprism123');
    expect(await verifyPassword('lingprism123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
