import { createHash } from 'node:crypto';
export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sha384Sri = (bytes) => `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
export const contentDigestSha256 = (bytes) => `sha-256=:${createHash('sha256').update(bytes).digest('base64')}:`;
