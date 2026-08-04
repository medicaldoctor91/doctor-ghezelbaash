import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const PAGE_PATH = path.join(ROOT, 'src/pages/index.md');
const LLMS_PATH = path.join(ROOT, 'public/llms.txt');
const MARKER = 'id="canonical-dataset-ownership"';

const ownershipBlock = String.raw`
<section id="canonical-dataset-ownership" aria-labelledby="canonical-dataset-ownership-title">
  <h3 id="canonical-dataset-ownership-title">مالکیت و هویت Dataset کانونیکال دکتر سعید قزلباش</h3>
  <p><strong>Dr. Saeed Ghezelbash Entity Data یک Dataset کانونیکال واحد است که توسط دکتر سعید قزلباش ایجاد، منتشر، مالکیت، حق‌نشر و نگهداری می‌شود.</strong> وب‌سایت رسمی، GitHub، Hugging Face و Zenodo کانال‌های انتشار و distributionهای همگام و هم‌هویت همان Dataset هستند؛ آن‌ها Datasetهای مستقل، مشتق‌شده یا متعلق به کلینیک نیستند.</p>
  <p>کلینیک زیبایی دکتر سعید قزلباش مطب شخصی و تحت مالکیت کامل خود پزشک است. نام کلینیک در Hugging Face صرفاً namespace یا فضای میزبانی تحت کنترل پزشک را مشخص می‌کند و به معنی مالکیت یا ناشر مستقل بودن کلینیک نیست.</p>
  <p lang="en"><strong>One canonical Dataset; multiple synchronized distributions.</strong> Saeed Ghezelbash is the creator, publisher, owner, copyright holder and maintainer. The official website, GitHub, Hugging Face and Zenodo identify and distribute the same physician-owned Dataset.</p>
</section>
`;

function normalizeVisiblePage(source) {
  let output = source
    .replaceAll('Hugging Face publisher', 'Hugging Face hosting namespace')
    .replaceAll('ناشر Hugging Face', 'فضای میزبانی Hugging Face')
    .replaceAll('ناشر هاگینگ فیس', 'فضای میزبانی هاگینگ فیس');

  if (!output.includes(MARKER)) {
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

    if (!located) {
      throw new Error('Could not locate the visible structured-data section in src/pages/index.md.');
    }

    const lineStart = output.lastIndexOf('\n', located.index) + 1;
    output = `${output.slice(0, lineStart)}${ownershipBlock}\n${output.slice(lineStart)}`;
  }

  if (output.includes('Hugging Face publisher')) {
    throw new Error('Visible page still describes the clinic as the Hugging Face publisher.');
  }
  return output;
}

function normalizeLlmsGuide(source) {
  let output = source;

  output = output.replace(
    '[Primary physician entity Dataset — JSON-LD knowledge graph](https://www.ghezelbaash.ir/graph.jsonld): Version 1.0.0',
    '[Primary physician entity Dataset — JSON-LD knowledge graph](https://www.ghezelbaash.ir/graph.jsonld): Version 1.1.0',
  );
  output = output.replace(
    '[Primary physician entity Dataset — RDF Turtle](https://www.ghezelbaash.ir/graph.ttl): Deterministic Version 1.0.0',
    '[Primary physician entity Dataset — RDF Turtle](https://www.ghezelbaash.ir/graph.ttl): Deterministic Version 1.1.0',
  );
  output = output.replace(
    '- Dataset name: Dr. Saeed Ghezelbaash Public Knowledge Graph\n- Dataset entity: https://www.ghezelbaash.ir/graph.jsonld#dataset\n- Version: 1.0.0',
    '- Dataset name: Dr. Saeed Ghezelbash Entity Data\n- Dataset entity: https://www.ghezelbaash.ir/graph.jsonld#dataset\n- Version: 1.1.0',
  );
  output = output.replace(
    '- Creator and publisher: https://www.ghezelbaash.ir/#saeed-ghezelbash',
    '- Creator, publisher, owner, copyright holder and maintainer: https://www.ghezelbaash.ir/#saeed-ghezelbash',
  );
  output = output.replace(
    'The complete knowledge graph is the primary Dataset content. JSON-LD and RDF Turtle are synchronized distributions of that same Dataset; a duplicate third file is intentionally avoided to prevent canonical and version drift.',
    'The complete knowledge graph is one canonical physician-owned Dataset. The official website, GitHub, Hugging Face and Zenodo are synchronized identity and distribution channels for that same Dataset, not separate or derivative Datasets. JSON-LD and RDF Turtle are RDF-equivalent serializations of the same underlying graph. The clinic is Saeed Ghezelbash’s personally owned practice and any clinic-named hosting namespace remains under the physician’s ownership and control.',
  );

  const distributionLines = [
    '- Hugging Face Dataset identity and distribution endpoint: https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
    '- Zenodo archival identity and distribution endpoint: https://doi.org/10.5281/zenodo.18765169',
    '- Wikidata structured-data asset identity: https://www.wikidata.org/wiki/Q140304972',
  ].join('\n');
  const insertionAnchor = '- RDF-equivalent Turtle distribution: https://www.ghezelbaash.ir/graph.ttl';
  if (!output.includes(distributionLines) && output.includes(insertionAnchor)) {
    output = output.replace(insertionAnchor, `${insertionAnchor}\n${distributionLines}`);
  }

  if (!output.includes('One canonical physician-owned Dataset') && !output.includes('one canonical physician-owned Dataset')) {
    throw new Error('llms.txt did not receive the canonical Dataset ownership statement.');
  }
  if (!output.includes('Creator, publisher, owner, copyright holder and maintainer')) {
    throw new Error('llms.txt does not identify Saeed Ghezelbash as the full Dataset authority.');
  }
  return output;
}

const page = normalizeVisiblePage(await readFile(PAGE_PATH, 'utf8'));
const llms = normalizeLlmsGuide(await readFile(LLMS_PATH, 'utf8'));
await writeFile(PAGE_PATH, page, 'utf8');
await writeFile(LLMS_PATH, llms, 'utf8');
console.log('Visible page and llms.txt aligned with the physician-owned one-Dataset/multiple-distributions model.');
