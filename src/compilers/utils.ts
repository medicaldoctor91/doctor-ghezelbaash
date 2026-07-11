import { createHash } from 'node:crypto';

export function json(value: unknown, pretty = false) {
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

export function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function bytes(value: string) {
  return Buffer.byteLength(value, 'utf8');
}

export function jsonResponse(value: unknown, contentType = 'application/json; charset=utf-8') {
  return new Response(json(value, true), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function jsonlResponse(records: unknown[]) {
  return new Response(records.map((record) => json(record)).join('\n') + '\n', {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function shardByBytes<T>(records: T[], maxBytes: number): T[][] {
  const shards: T[][] = [];
  let current: T[] = [];
  let currentBytes = 2;
  for (const record of records) {
    const recordBytes = bytes(json(record)) + 2;
    if (current.length && currentBytes + recordBytes > maxBytes) {
      shards.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(record);
    currentBytes += recordBytes;
  }
  if (current.length) shards.push(current);
  return shards;
}

export function pad(index: number) {
  return String(index).padStart(3, '0');
}

