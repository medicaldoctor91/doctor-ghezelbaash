import {readFile,writeFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';

const replaceRequired=(source,from,to,label)=>{
  if(!source.includes(from))throw new Error(`Migration anchor missing: ${label}`);
  return source.replace(from,to);
};
const write=async(file,transform)=>{
  const before=await readFile(file,'utf8');
  const after=transform(before);
  if(after===before)throw new Error(`Migration produced no change: ${file}`);
  await writeFile(file,after);
};

const baseline=await assembleCanonicalContent();
await writeFile('/tmp/canonical-before.md',baseline.content);

await write('src/lib/site-data.mjs',source=>{
  let s=replaceRequired(source,
    "const normalizePhone=value=>`+${String(value??'').replace(/\\D/g,'')}`;\n",
    "const normalizePhone=value=>`+${String(value??'').replace(/\\D/g,'')}`;\nconst groupLocalPhone=value=>`${value.slice(0,4)} ${value.slice(4,7)} ${value.slice(7)}`;\nconst groupInternationalPhone=value=>`+${value.slice(1,3)} ${value.slice(3,6)} ${value.slice(6,9)} ${value.slice(9)}`;\n",
    'site phone grouping');
  s=replaceRequired(s,
    "    phoneDisplay:faDigits(localPhone),\n",
    "    phoneDisplay:faDigits(localPhone),\n    phoneDisplayGrouped:faDigits(groupLocalPhone(localPhone)),\n    phoneDisplayInternational:groupInternationalPhone(phone),\n",
    'site display phone projection');
  s += `\nconst siteTokenPattern=/{{(?:CLINIC_[A-Z0-9_]+|OFFICIAL_[A-Z0-9_]+)}}/g;\n\nexport function siteTokenValues(site){\n  if(!site?.telHref||!site?.instagramUrl||!site?.chatUrl||!site?.mapsUrl)throw new Error('Invalid canonical site token source');\n  const hours=String(site.hoursDisplay||'').match(/^شنبه تا پنجشنبه (\\S+) تا (\\S+) و جمعه تعطیل$/);\n  if(!hours)throw new Error(\`Unsupported canonical site hours display: \${site.hoursDisplay}\`);\n  return Object.freeze({\n    '{{CLINIC_TEL_HREF}}':site.telHref,\n    '{{CLINIC_PHONE_FA}}':site.phoneDisplayGrouped,\n    '{{CLINIC_PHONE_INTL}}':site.phoneDisplayInternational,\n    '{{OFFICIAL_INSTAGRAM_URL}}':site.instagramUrl,\n    '{{OFFICIAL_CHAT_URL}}':site.chatUrl,\n    '{{CLINIC_MAPS_URL}}':site.mapsUrl,\n    '{{CLINIC_POSTAL_CODE_FA}}':faDigits(site.postalCode),\n    '{{CLINIC_HOURS_COMPACT_FA}}':\`شنبه تا پنجشنبه \${hours[1].replace(':۰۰','')}–\${hours[2].replace(':۰۰','')}؛ جمعه تعطیل\`,\n    '{{CLINIC_HOURS_WEEKDAYS_FA}}':\`شنبه تا پنجشنبه، \${hours[1]} تا \${hours[2]}\`,\n    '{{CLINIC_FRIDAY_CLOSED_FA}}':'جمعه تعطیل.',\n  });\n}\n\nexport function bindSiteTokens(content,site){\n  const source=String(content);\n  const values=siteTokenValues(site);\n  const seen=new Set(source.match(siteTokenPattern)||[]);\n  for(const token of seen)if(!Object.hasOwn(values,token))throw new Error(\`Unknown site token: \${token}\`);\n  const bound=source.replace(siteTokenPattern,token=>String(values[token]));\n  const unresolved=bound.match(siteTokenPattern)||[];\n  if(unresolved.length)throw new Error(\`Unresolved site token: \${[...new Set(unresolved)].join(', ')}\`);\n  return bound;\n}\n`;
  return s;
});

await write('src/lib/release-tokens.mjs',source=>{
  let s=replaceRequired(source,
    'const releaseTokenPattern=/{{(?:CURRENT_[A-Z0-9_]+|MEDICAL_REVIEW_DATE_EN)}}/g;',
    'const releaseTokenPattern=/{{(?:CURRENT_[A-Z0-9_]+|MEDICAL_REVIEW_DATE_(?:EN|ISO|FA))}}/g;',
    'release token inventory');
  s=replaceRequired(s,
    "const englishDate=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));",
    "const englishDate=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));\nconst persianGregorianDate=value=>new Intl.DateTimeFormat('fa-IR-u-ca-gregory',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));",
    'medical review date formatter');
  s=replaceRequired(s,
    "    '{{MEDICAL_REVIEW_DATE_EN}}':englishDate(release.medicalReviewedAt)\n",
    "    '{{MEDICAL_REVIEW_DATE_EN}}':englishDate(release.medicalReviewedAt),\n    '{{MEDICAL_REVIEW_DATE_ISO}}':release.medicalReviewedAt,\n    '{{MEDICAL_REVIEW_DATE_FA}}':persianGregorianDate(release.medicalReviewedAt)\n",
    'medical review release tokens');
  return s;
});

await write('scripts/lib/assemble-content.mjs',source=>{
  let s=replaceRequired(source,
    "import {bindReleaseTokens} from '../../src/lib/release-tokens.mjs';",
    "import {bindReleaseTokens} from '../../src/lib/release-tokens.mjs';\nimport {bindSiteTokens,deriveSiteData} from '../../src/lib/site-data.mjs';",
    'site binding import');
  s=replaceRequired(s,
    "export async function assembleCanonicalContent({root=process.cwd()}={}){\n  const names=await canonicalSourceNames(root);\n  const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));\n  let content=await readFile(path.join(root,'src/content-source/page.md'),'utf8');\n  content=bindHeroPictureSizes(content);\n  content=bindReleaseTokens(content,release);\n",
    "export async function assembleCanonicalContent({root=process.cwd(),graph}={}){\n  const names=await canonicalSourceNames(root);\n  const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));\n  const canonicalGraph=graph??JSON.parse(await readFile(path.join(root,'src/data/semantic/knowledge-graph.jsonld'),'utf8'));\n  const site=deriveSiteData(release,canonicalGraph);\n  let content=await readFile(path.join(root,'src/content-source/page.md'),'utf8');\n  content=bindHeroPictureSizes(content);\n  content=bindReleaseTokens(content,release);\n  content=bindSiteTokens(content,site);\n",
    'canonical content site binding');
  return s;
});

await write('src/content-source/page.md',source=>{
  let s=source;
  for(const line of [
    'canonical: "https://www.ghezelbaash.ir/"\n',
    'about: "https://www.ghezelbaash.ir/#saeed-ghezelbash"\n',
    'dateModified: "2026-08-13"\n',
    'reviewedBy: "https://www.ghezelbaash.ir/#saeed-ghezelbash"\n',
  ])s=replaceRequired(s,line,'',line.trim());
  const replacements=[
    ['tel:+989308209494','{{CLINIC_TEL_HREF}}'],
    ['۰۹۳۰ ۸۲۰ ۹۴۹۴','{{CLINIC_PHONE_FA}}'],
    ['+98 930 820 9494','{{CLINIC_PHONE_INTL}}'],
    ['https://www.instagram.com/doctor.ghezelbaash/','{{OFFICIAL_INSTAGRAM_URL}}'],
    ['https://ig.me/m/doctor.ghezelbaash','{{OFFICIAL_CHAT_URL}}'],
    ['https://www.google.com/maps?cid=12350483144643112463','{{CLINIC_MAPS_URL}}'],
    ['۶۷۱۴۶۵۷۴۱۲','{{CLINIC_POSTAL_CODE_FA}}'],
    ['شنبه تا پنجشنبه ۱۶–۲۲؛ جمعه تعطیل','{{CLINIC_HOURS_COMPACT_FA}}'],
    ['شنبه تا پنجشنبه، ۱۶:۰۰ تا ۲۲:۰۰','{{CLINIC_HOURS_WEEKDAYS_FA}}'],
    ['جمعه تعطیل.','{{CLINIC_FRIDAY_CLOSED_FA}}'],
    ['datetime="2026-08-13"','datetime="{{MEDICAL_REVIEW_DATE_ISO}}"'],
    ['۱۳ اوت ۲۰۲۶','{{MEDICAL_REVIEW_DATE_FA}}'],
  ];
  for(const [from,to] of replacements){
    if(!s.includes(from))throw new Error(`Canonical operational literal missing before migration: ${from}`);
    s=s.split(from).join(to);
  }
  return s;
});

await write('scripts/validate-architecture.mjs',source=>{
  const anchor="const pageSurface=(await readdir(path.join(root,'src/pages'),{withFileTypes:true})).map(entry=>entry.name).sort();\nassert(JSON.stringify(pageSurface)===JSON.stringify(['404.astro','index.astro']),`Astro route surface drift: ${pageSurface.join(', ')}`);\n";
  const checks=`${anchor}\nconst pageSource=await read('src/content-source/page.md');\nconst frontmatterBlock=pageSource.match(/^---\\n([\\s\\S]*?)\\n---\\n/);\nassert(frontmatterBlock,'Canonical Markdown frontmatter missing');\nconst frontmatterKeys=frontmatterBlock[1].split(/\\r?\\n/).map(line=>line.match(/^([A-Za-z][A-Za-z0-9_-]*):/)?.[1]).filter(Boolean);\nassert(JSON.stringify(frontmatterKeys)===JSON.stringify(['title','description','lang','dir','robots']),\`Canonical frontmatter authority drift: \${frontmatterKeys.join(', ')}\`);\nfor(const token of ['{{CLINIC_TEL_HREF}}','{{CLINIC_PHONE_FA}}','{{CLINIC_PHONE_INTL}}','{{OFFICIAL_INSTAGRAM_URL}}','{{OFFICIAL_CHAT_URL}}','{{CLINIC_MAPS_URL}}','{{CLINIC_POSTAL_CODE_FA}}','{{CLINIC_HOURS_COMPACT_FA}}','{{MEDICAL_REVIEW_DATE_ISO}}','{{MEDICAL_REVIEW_DATE_FA}}'])assert(pageSource.includes(token),\`Canonical page operational token missing: \${token}\`);\nfor(const forbidden of ['canonical:','about:','dateModified:','reviewedBy:','tel:+989308209494','۰۹۳۰ ۸۲۰ ۹۴۹۴','+98 930 820 9494','https://www.instagram.com/doctor.ghezelbaash/','https://ig.me/m/doctor.ghezelbaash','https://www.google.com/maps?cid=12350483144643112463','۶۷۱۴۶۵۷۴۱۲','شنبه تا پنجشنبه ۱۶–۲۲؛ جمعه تعطیل','شنبه تا پنجشنبه، ۱۶:۰۰ تا ۲۲:۰۰','datetime="2026-08-13"','۱۳ اوت ۲۰۲۶'])assert(!pageSource.includes(forbidden),\`Duplicate page authority reintroduced: \${forbidden}\`);\n`;
  let s=replaceRequired(source,anchor,checks,'canonical page authority gate');
  s=replaceRequired(s,
    "contentMetadataAuthority:'markdown-frontmatter',canonicalUrlAuthority:'release.json'",
    "contentMetadataAuthority:'exact-markdown-frontmatter',contentOperationalAuthority:'release+graph-token-binding',canonicalUrlAuthority:'release.json'",
    'architecture telemetry authority');
  return s;
});

await write('package.json',source=>{
  const pkg=JSON.parse(source);
  if(pkg.devDependencies?.astro!=='7.2.2')throw new Error(`Unexpected Astro baseline: ${pkg.devDependencies?.astro}`);
  pkg.devDependencies.astro='7.2.4';
  return `${JSON.stringify(pkg,null,2)}\n`;
});

console.log(JSON.stringify({stage:'FINAL_SOURCE_AUTHORITY_MIGRATION',baselineBytes:Buffer.byteLength(baseline.content),astro:'7.2.4',integrity:'STAGED'},null,2));
