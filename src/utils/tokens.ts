import crypto from 'crypto';

export function generateSecureToken(length: number = 8): string {
  // Generates clean alphanumeric random tokens like X7k92Lm
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function generateSessionNumber(): string {
  // Generates 4-6 digit dining session numbers like #8291
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function generateTransactionId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DFPAY-${dateStr}-${rand}`;
}

export function generateInvoiceNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  return `INV-${timestamp}`;
}
