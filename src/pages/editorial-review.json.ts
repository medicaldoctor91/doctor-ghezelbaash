import { createHash } from 'node:crypto';
import { rawContent } from '../content/landing.md';
import { site } from '../data/site';
// @ts-expect-error Shared ESM national authority data.
import { editorialReview } from '../data/national-authority.mjs';

export const prerender = true;

export function GET() {
  const raw = rawContent();
  const digest = createHash('sha256').update(raw, 'utf8').digest('hex');
  return new Response(JSON.stringify({
    schemaVersion: '7.0',
    canonical: site.url,
    recordId: `${site.url}#medical-editorial-review`,
    recordType: 'medical-content-editorial-review',
    reviewer: {
      entityId: `${site.url}#person`,
      legalName: site.legalName,
      professionalName: site.name,
      medicalRegistration: { authority: 'IRIMC', identifier: site.irimc, verificationUrl: site.irimcVerification },
    },
    publisherEntity: `${site.url}#clinic`,
    appliesTo: [`${site.url}#webpage`, `${site.url}#article`, `${site.url}llms-full.txt`, `${site.url}knowledge-graph.jsonld`],
    datePublished: editorialReview.datePublished,
    dateModified: editorialReview.dateModified,
    responsibility: editorialReview.responsibility,
    reviewScope: editorialReview.reviewScope,
    contentIntegrity: {
      algorithm: 'sha256',
      digest,
      bytesUtf8: Buffer.byteLength(raw, 'utf8'),
      source: `${site.url}llms-full.txt`,
    },
    entityPolicy: 'نویسنده، بازبین مسئول و انتیتی اصلی محتوا یک پزشک است؛ نام همکاران به‌عنوان انتیتی برجستهٔ این صفحه استفاده نمی‌شود.',
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
