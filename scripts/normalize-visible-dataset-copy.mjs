import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const PAGE_PATH = path.join(ROOT, 'src/pages/index.md');
const LLMS_PATH = path.join(ROOT, 'public/llms.txt');
const OWNERSHIP_MARKER = 'id="canonical-dataset-ownership"';
const HISTORICAL_MARKER = 'id="historical-coverage-data-semantics"';
const HISTORICAL_ANCHOR = 'id="historical-patient-origin-summary"';
const RETIRED_DISTRIBUTION_URL = 'https://www.ghezelbaash.ir/datasets/historical-patient-origin-summary.json';
const CANONICAL_GRAPH_URL = 'https://www.ghezelbaash.ir/graph.jsonld';

const ownershipBlock = String.raw`
<section id="canonical-dataset-ownership" aria-labelledby="canonical-dataset-ownership-title">
  <h3 id="canonical-dataset-ownership-title">مالکیت و هویت Dataset کانونیکال دکتر سعید قزلباش</h3>
  <p><strong>Dr. Saeed Ghezelbash Entity Data یک Dataset کانونیکال واحد است که توسط دکتر سعید قزلباش ایجاد، منتشر، مالکیت، حق‌نشر و نگهداری می‌شود.</strong> وب‌سایت رسمی، GitHub، Hugging Face و Zenodo کانال‌های انتشار و distributionهای همگام و هم‌هویت همان Dataset هستند؛ آن‌ها Datasetهای مستقل، مشتق‌شده یا متعلق به کلینیک نیستند.</p>
  <p>کلینیک زیبایی دکتر سعید قزلباش مطب شخصی و تحت مالکیت کامل خود پزشک است. نام کلینیک در Hugging Face صرفاً namespace یا فضای میزبانی تحت کنترل پزشک را مشخص می‌کند و به معنی مالکیت یا ناشر مستقل بودن کلینیک نیست.</p>
  <p lang="en"><strong>One canonical Dataset; multiple synchronized distributions.</strong> Saeed Ghezelbash is the creator, publisher, owner, copyright holder and maintainer. The official website, GitHub, Hugging Face and Zenodo identify and distribute the same physician-owned Dataset.</p>
</section>
`;

const historicalEvidenceBlock = String.raw`
<aside id="historical-coverage-data-semantics" aria-labelledby="historical-coverage-data-semantics-title">
  <h3 id="historical-coverage-data-semantics-title">دامنه و محدودیت شواهد جغرافیایی تاریخی</h3>
  <p>این بخش یک خلاصه حضورمحور از نام شهرهای ثبت‌شده به‌عنوان مبدأ مراجعان در سوابق مطب شخصی دکتر سعید قزلباش است و اکنون به‌عنوان یک شیء شواهد پشتیبان در گراف اصلی مدل می‌شود، نه یک Dataset آماری مستقل.</p>
  <p>این خلاصه هیچ تعداد بیمار، فراوانی، درصد، رتبه‌بندی، تاریخ مراجعه، اطلاعات پزشکی یا شناسه فردی بیمار منتشر نمی‌کند. ترتیب یا حضور نام یک شهر، بیانگر حجم مراجعان یا تضمین ارائه فعلی خدمت در آن شهر نیست.</p>
</aside>
`;

function insertBeforeContainingLine(source, anchor, block) {
  const index = source.indexOf(anchor);
  if (index < 0) return source;
  const lineStart = source.lastIndexOf('\n', index) + 1;
  return `${source.slice(0, lineStart)}${block}\n${source.slice(lineStart)}`;
}

function normalizeVisiblePage(source) {
  let output = source
    .replaceAll('Hugging Face publisher', 'Hugging Face hosting namespace')
    .replaceAll('ناشر Hugging Face', 'فضای میزبانی Hugging Face')
    .replaceAll('ناشر هاگینگ فیس', 'فضای میزبانی هاگینگ فیس')
    .replaceAll(RETIRED_DISTRIBUTION_URL, CANONICAL_GRAPH_URL)
    .replaceAll('Historical patient-origin Dataset', 'Historical patient-origin geographic evidence')
    .replaceAll('historical patient-origin Dataset', 'historical patient-origin geographic evidence');

  if (!output.includes(OWNERSHIP_MARKER)) {
    const anchors = [
      'Hugging Face hosting namespace',
      'Primary physician entity Dataset',
      'Dr. Saeed Ghezelbash Entity Data',
      'Dr. Saeed Ghezelbaash Public Knowledge Graph',
    ];
    const located = anchors
      .map((anchor) => ({ anchor, index: output.indexOf(anchor) }))
      .filter(({ index }) => index >= 0)
      .sort((a, b) => a.index - b.index)[0];

    if (located) {
      const lineStart = output.lastIndexOf('\n', located.index) + 1;
      output = `${output.slice(0, lineStart)}${ownershipBlock}\n${output.slice(lineStart)}`;
    }
  }

  if (!output.includes(HISTORICAL_MARKER) && output.includes(HISTORICAL_ANCHOR)) {
    output = insertBeforeContainingLine(output, HISTORICAL_ANCHOR, historicalEvidenceBlock);
  }

  if (output.includes('Hugging Face publisher')) {
    throw new Error('Visible page still describes the clinic as the Hugging Face publisher.');
  }
  if (output.includes(RETIRED_DISTRIBUTION_URL)) {
    throw new Error('Visible page still links to the retired historical Dataset distribution.');
  }
  return output;
}

function normalizeLlmsGuide(source) {
  let output = source;

  output = output
    .replace(
      '[Primary physician entity Dataset — JSON-LD knowledge graph](https://www.ghezelbaash.ir/graph.jsonld): Version 1.0.0',
      '[Primary physician entity Dataset — JSON-LD knowledge graph](https://www.ghezelbaash.ir/graph.jsonld): Version 1.1.0',
    )
    .replace(
      '[Primary physician entity Dataset — RDF Turtle](https://www.ghezelbaash.ir/graph.ttl): Deterministic Version 1.0.0',
      '[Primary physician entity Dataset — RDF Turtle](https://www.ghezelbaash.ir/graph.ttl): Deterministic Version 1.1.0',
    )
    .replace(
      '- Dataset name: Dr. Saeed Ghezelbaash Public Knowledge Graph\n- Dataset entity: https://www.ghezelbaash.ir/graph.jsonld#dataset\n- Version: 1.0.0',
      '- Dataset name: Dr. Saeed Ghezelbash Entity Data\n- Dataset entity: https://www.ghezelbaash.ir/graph.jsonld#dataset\n- Version: 1.1.0',
    )
    .replace(
      '- Creator and publisher: https://www.ghezelbaash.ir/#saeed-ghezelbash',
      '- Creator, publisher, owner, copyright holder and maintainer: https://www.ghezelbaash.ir/#saeed-ghezelbash',
    )
    .replace(
      'The complete knowledge graph is the primary Dataset content. JSON-LD and RDF Turtle are synchronized distributions of that same Dataset; a duplicate third file is intentionally avoided to prevent canonical and version drift.',
      'The complete knowledge graph is one canonical physician-owned Dataset. The official website, GitHub, Hugging Face and Zenodo are synchronized identity and distribution channels for that same Dataset, not separate or derivative Datasets. JSON-LD and RDF Turtle are RDF-equivalent serializations of the same underlying graph. The clinic is Saeed Ghezelbash’s personally owned practice and any clinic-named hosting namespace remains under the physician’s ownership and control.',
    )
    .replaceAll('secondary historical Dataset distribution', 'integrated historical geographic evidence')
    .replaceAll('first-party geographic Dataset', 'first-party historical geographic evidence')
    .replaceAll('related datasets and curated question-answer relationships', 'supporting evidence, related datasets and curated question-answer relationships')
    .replaceAll(RETIRED_DISTRIBUTION_URL, CANONICAL_GRAPH_URL);

  const distributionLines = [
    '- Hugging Face Dataset identity and distribution endpoint: https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
    '- Zenodo archival identity and distribution endpoint: https://doi.org/10.5281/zenodo.18765169',
    '- Wikidata structured-data asset identity: https://www.wikidata.org/wiki/Q140304972',
  ].join('\n');
  const insertionAnchor = '- RDF-equivalent Turtle distribution: https://www.ghezelbaash.ir/graph.ttl';
  if (!output.includes(distributionLines) && output.includes(insertionAnchor)) {
    output = output.replace(insertionAnchor, `${insertionAnchor}\n${distributionLines}`);
  }

  const integratedEvidenceSection = `## Integrated historical geographic evidence

- Evidence object: https://www.ghezelbaash.ir/#historical-patient-origin-summary
- Type: CreativeWork — supporting evidence within the canonical physician entity Dataset, not an independent Dataset
- Creator, publisher, owner, copyright holder and maintainer: https://www.ghezelbaash.ir/#saeed-ghezelbash
- About: Dr. Saeed Ghezelbash and his personally owned aesthetic clinic in Kermanshah
- Scope: Presence-only place names historically recorded as patient origins in clinic records
- Published semantics: No patient counts, frequencies, percentages, rankings, visit dates, medical information or personally identifiable information
- Interpretation limit: Listed locations do not establish current service availability or patient volume
- Canonical machine-readable representations: https://www.ghezelbaash.ir/graph.jsonld and https://www.ghezelbaash.ir/graph.ttl
- License: https://creativecommons.org/licenses/by/4.0/

This evidence object is integrated into the physician-owned knowledge graph so that its geographic evidence remains available to retrieval systems without creating a weak, separately versioned Dataset or an additional canonical distribution surface.
`;

  if (/## Secondary Supporting Dataset[\s\S]*?(?=\n## Retrieval and indexing policy)/.test(output)) {
    output = output.replace(
      /## Secondary Supporting Dataset[\s\S]*?(?=\n## Retrieval and indexing policy)/,
      integratedEvidenceSection.trimEnd(),
    );
  } else if (!output.includes('## Integrated historical geographic evidence')) {
    const anchor = '\n## Retrieval and indexing policy';
    if (output.includes(anchor)) output = output.replace(anchor, `\n${integratedEvidenceSection}${anchor}`);
  }

  output = output
    .split('\n')
    .filter((line) => !line.includes('- Historical patient-origin Dataset — JSON distribution'))
    .filter((line) => !line.includes('canonical historical Dataset distribution'))
    .join('\n');

  if (!output.includes('One canonical physician-owned Dataset') && !output.includes('one canonical physician-owned Dataset')) {
    throw new Error('llms.txt did not receive the canonical Dataset ownership statement.');
  }
  if (!output.includes('Creator, publisher, owner, copyright holder and maintainer')) {
    throw new Error('llms.txt does not identify Saeed Ghezelbash as the full Dataset authority.');
  }
  if (!output.includes('## Integrated historical geographic evidence')) {
    throw new Error('llms.txt does not describe the historical geography as integrated supporting evidence.');
  }
  if (output.includes(RETIRED_DISTRIBUTION_URL)) {
    throw new Error('llms.txt still links to the retired historical Dataset distribution.');
  }
  return output;
}

const pageSource = await readFile(PAGE_PATH, 'utf8');
const llmsSource = await readFile(LLMS_PATH, 'utf8');
await writeFile(PAGE_PATH, normalizeVisiblePage(pageSource), 'utf8');
await writeFile(LLMS_PATH, normalizeLlmsGuide(llmsSource), 'utf8');
console.log('Visible page and llms.txt aligned with one physician-owned Dataset and integrated historical evidence.');
