import { createHmac, timingSafeEqual } from 'crypto';

export function computeHmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyHmac(secret: string, payload: string, signature: string): boolean {
  const expected = computeHmac(secret, payload);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
