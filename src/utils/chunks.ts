import { normalizePersian } from './normalizePersian.ts';

export type RetrievalChunk = {
  id: string;
  url: string;
  sectionId: string;
  heading: string;
  type: 'definition' | 'explanation' | 'comparison' | 'faq' | 'evidence' | 'contact';
  text: string;
  entities: string[];
  topics: string[];
  wordCount: number;
};

const wordCount = (value: string): number => value.split(/\s+/u).filter(Boolean).length;

export const buildChunks = (
  sections: Array<{ id: string; title: string; text: string; type?: RetrievalChunk['type'] }>,
): RetrievalChunk[] => {
  const chunks: RetrievalChunk[] = [];
  for (const section of sections) {
    const clean = normalizePersian(section.text.replace(/^#{1,6}\s+/gmu, ''));
    if (!clean || clean.includes('TODO_VISIBLE_CONTENT')) continue;
    const paragraphs = clean.split(/\n{2,}/u).filter(Boolean);
    let buffer: string[] = [];
    let index = 1;
    const flush = (): void => {
      if (buffer.length === 0) return;
      const text = normalizePersian(buffer.join('\n\n'));
      chunks.push({
        id: `chunk-${section.id}-${String(index).padStart(3, '0')}`,
        url: `https://www.ghezelbaash.ir/#${section.id}`,
        sectionId: section.id,
        heading: section.title,
        type: section.type ?? 'explanation',
        text,
        entities: ['https://www.ghezelbaash.ir/#doctor'],
        topics: [section.id],
        wordCount: wordCount(text),
      });
      index += 1;
      buffer = [];
    };
    for (const paragraph of paragraphs) {
      buffer.push(paragraph);
      if (wordCount(buffer.join(' ')) >= 150) flush();
    }
    flush();
  }
  return chunks;
};
