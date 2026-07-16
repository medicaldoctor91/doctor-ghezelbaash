import type { RetrievalChunk } from './chunks.ts';

export const buildLlmsTxt = (): string => `# دکتر سعید قزلباش

> Canonical static entity page for Dr. Saeed Ghezelbaash and the supporting clinic entity in Kermanshah, Iran.

- Canonical: https://www.ghezelbaash.ir/
- Knowledge graph: https://www.ghezelbaash.ir/knowledge-graph.jsonld
- Full retrieval text: https://www.ghezelbaash.ir/llms-full.txt
- Zenodo: https://doi.org/10.5281/zenodo.18765169
- Hugging Face: https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data
`;

export const buildLlmsFullTxt = (chunks: RetrievalChunk[]): string =>
  [
    '# دکتر سعید قزلباش — Full retrieval corpus',
    '',
    'Canonical: https://www.ghezelbaash.ir/',
    '',
    ...chunks.flatMap((chunk) => [
      `## ${chunk.heading}`,
      `URL: ${chunk.url}`,
      '',
      chunk.text,
      '',
    ]),
  ].join('\n');
