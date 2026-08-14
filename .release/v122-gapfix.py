from pathlib import Path
import json


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new))


# Visible freeze: exact approved reputation wording; geometry absorbs mobile reflow.
replace_once(
    "scripts/lib/assemble-content.mjs",
    " · دریافت ${persianGregorianDate(observedAt)} — ",
    " · آخرین دریافت از Google: ${persianGregorianDate(observedAt)} — ",
)
replace_once(
    "scripts/validate-critical-hero-geometry.mjs",
    "if(source.includes('آخرین دریافت از Google:'))throw new Error('Reputation wording exceeds frozen mobile geometry footprint');\nif(!source.includes(' · دریافت ${persianGregorianDate(observedAt)} — '))throw new Error('Compact reputation observation wording missing');\nconsole.log(JSON.stringify({criticalHeroGeometry:'PASS',mobileBreakpoints:[720,430],reputationFootprint:'compact',finalComputedStyleChange:false}));",
    "if(!source.includes(' · آخرین دریافت از Google: ${persianGregorianDate(observedAt)} — '))throw new Error('Locked reputation observation wording missing');\nif(source.includes(' · دریافت ${persianGregorianDate(observedAt)} — '))throw new Error('Compact reputation wording regression detected');\nmust('.hero-caption-reputation{min-block-size:4rem','Narrow-mobile reputation geometry is not reserved');\nconsole.log(JSON.stringify({criticalHeroGeometry:'PASS',mobileBreakpoints:[720,430],reputationFootprint:'contract-exact-reserved',finalComputedStyleChange:false}));",
)
replace_once(
    "src/styles/global.css",
    ".hero-caption-reputation{padding-top:.32rem;border-top:1px solid rgb(10 107 88/.11);color:#315b50;font-size:.82rem;line-height:1.6}",
    ".hero-caption-reputation{padding-top:.32rem;border-top:1px solid rgb(10 107 88/.11);color:#315b50;font-size:.82rem;line-height:1.6;font-variant-numeric:tabular-nums}",
)
replace_once(
    "src/styles/global.css",
    ".hero-caption-reputation{font-size:.8rem}}@media(max-width:430px)",
    ".hero-caption-reputation{font-size:.8rem;min-block-size:3.8rem}}@media(max-width:430px)",
)
replace_once(
    "src/styles/global.css",
    ".hero-caption-facts,.hero-caption-reputation{font-size:.78rem}}/*DIST_CRITICAL_HERO_GEOMETRY_END*/",
    ".hero-caption-facts,.hero-caption-reputation{font-size:.78rem}.hero-caption-reputation{min-block-size:4rem}}/*DIST_CRITICAL_HERO_GEOMETRY_END*/",
)

# Query Matrix: every publishable service gets retrieval rows; empty explicit aliases fall back to canonical registry name.
replace_once(
    "scripts/generate-v122-overlays.mjs",
    "  const aliases=[...new Set(arr(service.aliases).map(x=>String(x).trim()).filter(Boolean))];\n  if(!aliases.length)continue;",
    "  const explicitAliases=[...new Set(arr(service.aliases).map(x=>String(x).trim()).filter(Boolean))];\n  const canonicalFallback=String(service.name||service.id.split('#').pop()||'').trim().replace(/^procedure-/,'').replace(/-/g,' ');\n  const aliases=explicitAliases.length?explicitAliases:[canonicalFallback].filter(Boolean);\n  if(!aliases.length)throw new Error(`Publishable service has no retrieval label ${service.id}`);",
)
replace_once(
    "scripts/generate-v122-overlays.mjs",
    "const servicesWithAliases=publishableServices.filter(s=>arr(s.aliases).some(x=>String(x).trim())).map(s=>s.id);\nconst uncoveredServices=servicesWithAliases.filter(s=>!dedup.some(r=>arr(r.service_ids).includes(s)));\nif(uncoveredServices.length)throw new Error(`Query Matrix service alias coverage missing ${uncoveredServices.length} services`);",
    "const uncoveredServices=publishableServices.map(s=>s.id).filter(s=>!dedup.some(r=>arr(r.service_ids).includes(s)));\nif(uncoveredServices.length)throw new Error(`Query Matrix publishable service coverage missing ${uncoveredServices.length} services: ${uncoveredServices.join(', ')}`);",
)
replace_once(
    "scripts/validate-query-matrix.mjs",
    "const servicesWithAliases=publishable.filter(s=>arr(s.aliases).some(a=>String(a).trim()));\nif(policy.serviceAliasCoverage?.enabled){\n  for(const service of servicesWithAliases){\n    const serviceRows=rows.filter(r=>arr(r.service_ids).includes(service.id));\n    if(!serviceRows.length)fail(`Service alias coverage missing ${service.id}`);\n    for(const alias of [...new Set(arr(service.aliases).map(x=>String(x).trim()).filter(Boolean))]){\n      if(!serviceRows.some(r=>r.query===alias))fail(`Exact canonical service alias missing ${service.id}: ${alias}`);\n    }\n  }\n}",
    "if(policy.serviceAliasCoverage?.enabled){\n  for(const service of publishable){\n    const explicitAliases=[...new Set(arr(service.aliases).map(x=>String(x).trim()).filter(Boolean))];\n    const canonicalFallback=String(service.name||service.id.split('#').pop()||'').trim().replace(/^procedure-/,'').replace(/-/g,' ');\n    const expectedAliases=explicitAliases.length?explicitAliases:[canonicalFallback].filter(Boolean);\n    if(!expectedAliases.length)fail(`Publishable service has no retrieval label ${service.id}`);\n    const serviceRows=rows.filter(r=>arr(r.service_ids).includes(service.id));\n    if(!serviceRows.length)fail(`Publishable service coverage missing ${service.id}`);\n    for(const alias of expectedAliases){\n      if(!serviceRows.some(r=>r.query===alias))fail(`Exact service retrieval label missing ${service.id}: ${alias}`);\n    }\n  }\n}",
)
replace_once(
    "scripts/validate-query-matrix.mjs",
    "const coveredServices=new Set(rows.flatMap(r=>arr(r.service_ids)));\nconsole.log(JSON.stringify({",
    "const coveredServices=new Set(rows.flatMap(r=>arr(r.service_ids)));\nif(policy.serviceAliasCoverage?.enabled&&coveredServices.size!==publishable.length)fail(`Publishable service set coverage drift ${coveredServices.size}/${publishable.length}`);\nconsole.log(JSON.stringify({",
)
replace_once(
    "scripts/validate-query-matrix.mjs",
    "  expectedServicesWithAliases:servicesWithAliases.length,",
    "  expectedServicesWithAliases:publishable.length,\n  expectedPublishableServices:publishable.length,",
)
policy_path = Path("src/data/retrieval/query-matrix-policy.json")
policy = json.loads(policy_path.read_text())
policy["serviceAliasCoverage"]["coverage"] = "all-publishable-services"
policy["serviceAliasCoverage"]["emptyAliasFallback"] = "canonical-service-name"
policy_path.write_text(json.dumps(policy, ensure_ascii=False, indent=2) + "\n")

# Final current-serving matrix binds the exact live revision before manifests hash it.
replace_once(
    "scripts/finalize-v122-serving.mjs",
    "const linksetPath=path.join(dist,'linkset.json'),linkset=JSON.parse(await readFile(linksetPath,'utf8')),rootSet=linkset.linkset?.[0];if(!rootSet)throw new Error('linkset root missing');rootSet.describedby=rootSet.describedby||[];for(const x of [{href:`${release.canonicalUrl}query-matrix.jsonl`,type:'application/jsonl'},{href:`${release.canonicalUrl}live-observations.jsonld`,type:'application/ld+json'},{href:`${release.canonicalUrl}current-release-matrix.json`,type:'application/json'}])if(!rootSet.describedby.some(y=>y.href===x.href))rootSet.describedby.push(x);await writeFile(linksetPath,JSON.stringify(linkset,null,2)+'\\n');",
    "const linksetPath=path.join(dist,'linkset.json'),linkset=JSON.parse(await readFile(linksetPath,'utf8')),rootSet=linkset.linkset?.[0];if(!rootSet)throw new Error('linkset root missing');rootSet.describedby=rootSet.describedby||[];for(const x of [{href:`${release.canonicalUrl}query-matrix.jsonl`,type:'application/jsonl'},{href:`${release.canonicalUrl}live-observations.jsonld`,type:'application/ld+json'},{href:`${release.canonicalUrl}current-release-matrix.json`,type:'application/json'}])if(!rootSet.describedby.some(y=>y.href===x.href))rootSet.describedby.push(x);await writeFile(linksetPath,JSON.stringify(linkset,null,2)+'\\n');\nconst currentMatrixPath=path.join(dist,'current-release-matrix.json'),currentMatrix=JSON.parse(await readFile(currentMatrixPath,'utf8'));Object.assign(currentMatrix,{liveRevision,sourceCommit:liveRevision,generatedAt});await writeFile(currentMatrixPath,JSON.stringify(currentMatrix,null,2)+'\\n');",
)

# Preview verifier can deterministically materialize the exact local DIST if proof phase starts without one.
replace_once(
    "scripts/verify-cloudflare-pages-deployment.mjs",
    "import {readFile} from 'node:fs/promises';\nconst root=process.cwd(),base=process.env.VERIFY_BASE_URL||'https://www.ghezelbaash.ir/',stable=JSON.parse(await readFile(path.join(root,'src/data/stable-media-aliases.json'),'utf8'));",
    "import {readFile,access} from 'node:fs/promises';\nimport {execFileSync} from 'node:child_process';\nconst root=process.cwd(),base=process.env.VERIFY_BASE_URL||'https://www.ghezelbaash.ir/',stable=JSON.parse(await readFile(path.join(root,'src/data/stable-media-aliases.json'),'utf8'));\nconst ensureLocalDist=async()=>{try{await access(path.join(root,'dist','answers.txt'));return}catch{}const commit=process.env.CANDIDATE_SHA||process.env.CF_EXPECTED_COMMIT||process.env.SOURCE_COMMIT||process.env.CF_PAGES_COMMIT_SHA||'';const epoch=process.env.SOURCE_DATE_EPOCH||'';if(!/^[0-9a-f]{40}$/.test(commit)||!/^\\d+$/.test(epoch))throw new Error('Local DIST missing and exact commit/SOURCE_DATE_EPOCH unavailable');execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit',env:{...process.env,SOURCE_COMMIT:commit,CF_PAGES_COMMIT_SHA:commit,SOURCE_DATE_EPOCH:epoch,ASTRO_TELEMETRY_DISABLED:'1'}})};await ensureLocalDist();",
)
replace_once(
    "scripts/verify-cloudflare-pages-deployment.mjs",
    "return{rel,sha256:wantedSha,ordinary:ordinary.response.status,cacheBusted:fresh.response.status,cfCacheStatus:ordinary.response.headers.get('cf-cache-status'),age:ordinary.response.headers.get('age')};",
    "return{rel,sha256:wantedSha,ordinary:ordinary.response.status,cacheBusted:fresh.response.status,cacheControl:ordinary.response.headers.get('cache-control'),age:ordinary.response.headers.get('age'),etag:ordinary.response.headers.get('etag'),cfCacheStatus:ordinary.response.headers.get('cf-cache-status'),reprDigest:ordinary.response.headers.get('repr-digest')};",
)

# Release-date rollover remains reversible: keep DOI reservation, abort pre-publication if Tehran calendar day changed.
replace_once(
    "scripts/verify-release-proof-ledger.mjs",
    "const x=JSON.parse(await readFile(ledgerFile,'utf8'));\nif(x.candidateEpoch!==sourceCommit)",
    "const x=JSON.parse(await readFile(ledgerFile,'utf8'));\nconst release=JSON.parse(await readFile('src/data/release.json','utf8'));\nconst terminal=new Set(['ZENODO_PUBLISHED','PRODUCTION_PUBLISHED','HF_PUBLISHED','GITHUB_RELEASE_PUBLISHED','VERIFIED','COMPLETE']);\nif(!terminal.has(x.stage)){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));const today=`${parts.year}-${parts.month}-${parts.day}`;if(release.dateModified!==today)throw new Error(`RELEASE_DATE_ROLLOVER_REQUIRED source=${release.dateModified} Tehran=${today}; keep DOI ${release.dataset?.zenodo?.versionDoi||''} and rebuild a new exact Candidate C`);}\nif(x.candidateEpoch!==sourceCommit)",
)

# Zenodo semantics: multilingual and no identity collapse between continuing Dataset and version snapshot.
replace_once("scripts/zenodo_release.py", "'access_right':'open','license':'cc-by-4.0','language':'eng','version':version,", "'access_right':'open','license':'cc-by-4.0','language':'mul','version':version,")
replace_once("scripts/zenodo_release.py", "{'identifier':'https://www.ghezelbaash.ir/graph.jsonld#dataset','relation':'isIdenticalTo','resource_type':'dataset'},", "{'identifier':'https://www.ghezelbaash.ir/graph.jsonld#dataset','relation':'isDerivedFrom','resource_type':'dataset'},")
replace_once("scripts/zenodo_release.py", "{'identifier':'https://www.wikidata.org/entity/Q140304972','relation':'isIdenticalTo','resource_type':'dataset'},", "{'identifier':'https://www.wikidata.org/entity/Q140304972','relation':'isDescribedBy','resource_type':'dataset'},")

# Root Link header: keep high-value relations only; descriptors remain discoverable in linkset.json.
replace_once(
    "src/data/templates/headers.template",
    '  Link: <https://www.ghezelbaash.ir/linkset.json>; rel="linkset"; type="application/linkset+json", <https://www.ghezelbaash.ir/graph.jsonld>; rel="describedby"; type="application/ld+json", <https://www.ghezelbaash.ir/provenance.jsonld>; rel="describedby"; type="application/ld+json", <https://www.ghezelbaash.ir/shapes.ttl>; rel="describedby"; type="text/turtle", <https://www.ghezelbaash.ir/dcat.ttl>; rel="describedby"; type="text/turtle"\n  Link: <https://www.ghezelbaash.ir/entity-facts.csv>; rel="describedby"; type="text/csv", <https://www.ghezelbaash.ir/answers.txt>; rel="alternate"; type="text/plain", <https://www.ghezelbaash.ir/knowledge.xml>; rel="alternate"; type="application/xml", <https://www.ghezelbaash.ir/llms.txt>; rel="describedby"; type="text/plain", <https://www.ghezelbaash.ir/artifact-manifest.json>; rel="describedby"; type="application/json"\n  Link: <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="author", <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about", <https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah>; rel="about", <https://www.wikidata.org/entity/Q140287622>; rel="me", <https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e>; rel="me", <https://orcid.org/0009-0001-9346-8475>; rel="me", <https://commons.wikimedia.org/wiki/Category:Saeed_Ghezelbash>; rel="me"',
    '  Link: <https://www.ghezelbaash.ir/>; rel="canonical", <https://www.ghezelbaash.ir/linkset.json>; rel="linkset"; type="application/linkset+json", <https://www.ghezelbaash.ir/graph.jsonld>; rel="describedby"; type="application/ld+json", <https://www.ghezelbaash.ir/provenance.jsonld>; rel="describedby"; type="application/ld+json", <https://www.ghezelbaash.ir/live-observations.jsonld>; rel="describedby"; type="application/ld+json"\n  Link: <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="author", <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about", <https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah>; rel="about", <https://www.ghezelbaash.ir/graph.jsonld#dataset>; rel="about"',
)

# Global external mutation lock.
replace_once(".github/workflows/cloudflare-subdomain-redirects.yml", "  group: doctor-ghezelbaash-cloudflare-control-plane", "  group: doctor-ghezelbaash-external-mutation")
replace_once(".github/workflows/github-pages-bridge.yml", "  group: doctor-ghezelbaash-github-pages-bridge", "  group: doctor-ghezelbaash-external-mutation")

# IndexNow: one canonical public key source and actual post-production submitter.
Path("scripts/lib/indexnow.mjs").write_text("export const INDEXNOW_KEY='2d0a99837e327f6744f9184ec6d2877f';\nexport const INDEXNOW_HOST='www.ghezelbaash.ir';\nexport const INDEXNOW_KEY_LOCATION=`https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;\n")
replace_once(
    "scripts/write-indexnow-key.mjs",
    "import { mkdir, writeFile } from 'node:fs/promises';\n\nconst root = process.cwd();\nconst dist = path.resolve(root, process.argv[2] || 'dist');\nconst key = '2d0a99837e327f6744f9184ec6d2877f';",
    "import { mkdir, writeFile } from 'node:fs/promises';\nimport { INDEXNOW_KEY } from './lib/indexnow.mjs';\n\nconst root = process.cwd();\nconst dist = path.resolve(root, process.argv[2] || 'dist');\nconst key = INDEXNOW_KEY;",
)
Path("scripts/submit-indexnow.mjs").write_text(r'''import {INDEXNOW_HOST,INDEXNOW_KEY,INDEXNOW_KEY_LOCATION} from './lib/indexnow.mjs';
const endpoint=process.env.INDEXNOW_ENDPOINT||'https://api.indexnow.org/indexnow';
const urls=[`https://${INDEXNOW_HOST}/`,`https://${INDEXNOW_HOST}/live-observations.jsonld`,`https://${INDEXNOW_HOST}/current-release-matrix.json`];
const keyReadback=await fetch(`${INDEXNOW_KEY_LOCATION}?verify=${Date.now()}`,{headers:{'user-agent':'ghezelbaash-indexnow-release-notifier/1.0'},signal:AbortSignal.timeout(30000)});
if(!keyReadback.ok||(await keyReadback.text()).trim()!==INDEXNOW_KEY)throw new Error(`IndexNow key readback failed ${keyReadback.status}`);
const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json; charset=utf-8','user-agent':'ghezelbaash-indexnow-release-notifier/1.0'},body:JSON.stringify({host:INDEXNOW_HOST,key:INDEXNOW_KEY,keyLocation:INDEXNOW_KEY_LOCATION,urlList:urls}),signal:AbortSignal.timeout(30000)});
if(![200,202].includes(response.status))throw new Error(`IndexNow submission failed HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
console.log(JSON.stringify({indexNow:'SUBMITTED',status:response.status,host:INDEXNOW_HOST,keyLocation:INDEXNOW_KEY_LOCATION,urls}));
''')

# Narrow Cloudflare purge primitive for drift self-healing.
Path("scripts/purge-cloudflare-current.mjs").write_text(r'''const token=process.env.CLOUDFLARE_API_TOKEN||'',account=process.env.CLOUDFLARE_ACCOUNT_ID||'',zoneName=process.env.ZONE_NAME||'ghezelbaash.ir';
if(!token||!account)throw new Error('Cloudflare purge credentials missing');
const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const listing=await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}&account.id=${encodeURIComponent(account)}`,{headers,signal:AbortSignal.timeout(30000)});const lj=await listing.json();
if(!listing.ok||!lj.success||lj.result?.length!==1)throw new Error(`Cloudflare zone lookup failed ${listing.status}`);
const zone=lj.result[0].id;const purge=await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`,{method:'POST',headers,body:JSON.stringify({purge_everything:true}),signal:AbortSignal.timeout(30000)});const pj=await purge.json();
if(!purge.ok||!pj.success)throw new Error(`Cloudflare purge failed ${purge.status}: ${JSON.stringify(pj.errors||[])}`);
console.log(JSON.stringify({cloudflarePurge:'PASS',zone:zoneName,zoneId:zone}));
''')

# Public Discovery Freshness Gate: ordinary + cache-busted exact bytes and response metadata.
Path("scripts/verify-public-discovery-freshness.mjs").write_text(r'''import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root=process.cwd(),dist=path.resolve(root,process.argv[2]||'dist'),base=process.env.VERIFY_BASE_URL||'https://www.ghezelbaash.ir/';
const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8')),matrix=JSON.parse(await readFile(path.join(dist,'current-release-matrix.json'),'utf8'));
for(const [k,v] of Object.entries({release:release.release,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,recordId:String(release.dataset.zenodo.recordId),personWikidata:release.primaryEntity.wikidata,clinicWikidata:release.dataset.supportingClinicWikidata,datasetWikidata:release.dataset.wikidata}))if(String(matrix[k])!==String(v))throw new Error(`Current release matrix ${k} drift ${matrix[k]} != ${v}`);
const semantic=['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','llms-full.txt','index.md','datapackage.json','croissant.json','dcat.ttl','void.ttl','linkset.json','provenance.jsonld','evidence-snapshot.json','query-matrix.jsonl'];
const mutable=['artifact-manifest.json','live-observations.jsonld','current-release-matrix.json','live-serving-attestation.json'];
const endpoints=[...semantic,...mutable],noDigest=new Set(['live-serving-attestation.json']),sha=b=>createHash('sha256').update(b).digest('hex'),b64=b=>createHash('sha256').update(b).digest('base64');
const parseMaxAge=v=>{const m=String(v||'').match(/(?:^|,)\s*max-age=(\d+)/i);return m?Number(m[1]):null};
const fetchBytes=async url=>{const r=await fetch(url,{headers:{'user-agent':'ghezelbaash-public-discovery-freshness/1.0',accept:'*/*'},redirect:'follow',signal:AbortSignal.timeout(45000)});return{r,b:Buffer.from(await r.arrayBuffer())}};
const rows=[];
for(const rel of endpoints){const expected=Buffer.from(await readFile(path.join(dist,rel))),expectedSha=sha(expected),url=new URL(rel,base),ordinary=await fetchBytes(url),bust=new URL(url);bust.searchParams.set('__discovery_freshness',`${Date.now()}-${Math.random()}`);const fresh=await fetchBytes(bust);for(const [lane,x] of [['ordinary',ordinary],['cacheBusted',fresh]]){if(x.r.status!==200||sha(x.b)!==expectedSha)throw new Error(`${rel} ${lane} byte drift status=${x.r.status} got=${sha(x.b)} expected=${expectedSha}`);const cc=x.r.headers.get('cache-control')||'',maxAge=parseMaxAge(cc);if(!/must-revalidate/i.test(cc))throw new Error(`${rel} ${lane} missing must-revalidate: ${cc}`);if(mutable.includes(rel)){if(maxAge!==0)throw new Error(`${rel} ${lane} mutable max-age drift: ${cc}`)}else if(maxAge===null||maxAge>3600)throw new Error(`${rel} ${lane} semantic max-age drift: ${cc}`);const rd=x.r.headers.get('repr-digest');if(!noDigest.has(rel)){const wanted=`sha-256=:${b64(expected)}:`;if(rd!==wanted)throw new Error(`${rel} ${lane} Repr-Digest drift ${rd} != ${wanted}`)}rows.push({resource:rel,lane,status:x.r.status,sha256:expectedSha,cacheControl:cc,age:x.r.headers.get('age'),etag:x.r.headers.get('etag'),cfCacheStatus:x.r.headers.get('cf-cache-status'),reprDigest:rd,release:matrix.release,conceptDoi:matrix.conceptDoi,versionDoi:matrix.versionDoi,sourceCommit:matrix.sourceCommit||matrix.liveRevision||null});}}
console.log(JSON.stringify({publicDiscoveryFreshness:'PASS',base,resources:endpoints.length,lanes:rows.length,currentMatrix:{release:matrix.release,conceptDoi:matrix.conceptDoi,versionDoi:matrix.versionDoi,recordId:String(matrix.recordId),sourceCommit:matrix.sourceCommit||matrix.liveRevision||null},rows},null,2));
''')

# Context-aware current-vs-history scanner.
Path("scripts/validate-current-context.mjs").write_text(r'''import path from 'node:path';
import {readFile} from 'node:fs/promises';
const root=process.cwd(),dist=path.resolve(root,process.argv[2]||'dist'),release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
const fail=m=>{throw new Error(m)},readJson=async f=>JSON.parse(await readFile(path.join(dist,f),'utf8'));
if(release.release!=='1.2.2'||release.dataset.zenodo.conceptDoi!=='10.5281/zenodo.18765168'||release.dataset.zenodo.versionDoi!=='10.5281/zenodo.21930954'||String(release.dataset.zenodo.recordId)!=='21930954')fail('Canonical release identity drift');
for(const k of ['state','draftApi','publishedApi','previousVersion','historicalVersion'])if(k in release)fail(`Operational/legacy release field leaked into release.json: ${k}`);
const history=release.dataset.zenodo.releaseHistory||[],expected=['1.0.0','1.2.0','1.2.1','1.2.2'];if(JSON.stringify(history.map(x=>x.release))!==JSON.stringify(expected))fail('Release history sequence drift');
const matrix=await readJson('current-release-matrix.json'),manifest=await readJson('artifact-manifest.json'),att=await readJson('live-serving-attestation.json'),dp=await readJson('datapackage.json'),cr=await readJson('croissant.json');
const exact={release:release.release,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,recordId:String(release.dataset.zenodo.recordId),datasetIri:release.dataset.id,personWikidata:release.primaryEntity.wikidata,clinicWikidata:release.dataset.supportingClinicWikidata,datasetWikidata:release.dataset.wikidata};for(const [k,v] of Object.entries(exact))if(String(matrix[k])!==String(v))fail(`Current matrix ${k} drift`);
if(matrix.servicesWithAliasCoverage!==matrix.serviceCount||matrix.serviceCount!==124)fail(`Service retrieval coverage drift ${matrix.servicesWithAliasCoverage}/${matrix.serviceCount}`);
if(manifest.baseRelease!==release.release||manifest.dataset?.versionDoi!==release.dataset.zenodo.versionDoi||manifest.dataset?.conceptDoi!==release.dataset.zenodo.conceptDoi)fail('Serving manifest release/DOI drift');
if(matrix.sourceCommit!==manifest.liveRevision||att.sourceCommit!==manifest.liveRevision)fail('Current source revision binding drift');
if(dp.version!==release.release||!String(dp.title||'').startsWith(release.dataset.name))fail('Data Package current identity drift');
if(cr.version!==release.release||cr.name!==release.dataset.name)fail('Croissant current identity drift');
const forbidden=['Doctor Ghezelbash Structured Data Repository','Doctor Ghezelbash structured data repository','Dr. Saeed Ghezelbash Entity Knowledge Graph'];for(const f of ['artifact-manifest.json','datapackage.json','croissant.json','dcat.ttl','answers.txt','llms.txt','llms-full.txt','index.md','current-release-matrix.json']){const text=await readFile(path.join(dist,f),'utf8');for(const token of forbidden)if(text.includes(token))fail(`Legacy Dataset naming leaked into current ${f}: ${token}`);if(['answers.txt','llms.txt','llms-full.txt','index.md'].includes(f)&&!text.includes(release.release))fail(`Current release marker missing from ${f}`);}
const volatile=JSON.parse(await readFile(path.join(root,'src/data/volatile-facts.json'),'utf8'));if(volatile.placeId!==release.clinic.placeId)fail('Current Place ID drift');
console.log(JSON.stringify({currentContextScanner:'PASS',release:release.release,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,recordId:String(release.dataset.zenodo.recordId),history:expected,serviceCoverage:`${matrix.servicesWithAliasCoverage}/${matrix.serviceCount}`,liveRevision:matrix.liveRevision}));
''')

# Persistent monitor: every six hours after COMPLETE, exact current build -> ordinary/cache-busted check -> one purge -> reverify.
Path(".github/workflows/stack-monitor.yml").write_text(r'''name: Public stack integrity monitor

on:
  schedule:
    - cron: '47 */6 * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: doctor-ghezelbaash-external-mutation
  cancel-in-progress: false

env:
  CONTROL_BRANCH: release-control/v1.2.2
  CLOUDFLARE_ACCOUNT_ID: 884d1d90bd1fb6ecca14992c6c60d677
  ZONE_NAME: ghezelbaash.ir

jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          ref: main
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: 24.18.0
          cache: npm
      - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97
        with:
          python-version: '3.12'
      - name: Require completed v1.2.2 before mutable drift recovery
        id: gate
        shell: bash
        run: |
          set -euo pipefail
          git fetch origin "$CONTROL_BRANCH"
          STAGE=$(git show "origin/$CONTROL_BRANCH:.release/control/v1.2.2.json" | jq -r .stage)
          if [ "$STAGE" = COMPLETE ]; then echo 'active=true' >> "$GITHUB_OUTPUT"; else echo 'active=false' >> "$GITHUB_OUTPUT"; fi
          echo "STACK_MONITOR_STAGE=$STAGE"
      - if: steps.gate.outputs.active == 'true'
        run: npm ci --ignore-scripts
      - name: Build exact current source
        if: steps.gate.outputs.active == 'true'
        shell: bash
        run: |
          set -euo pipefail
          C=$(git rev-parse HEAD); export SOURCE_COMMIT="$C" CF_PAGES_COMMIT_SHA="$C" SOURCE_DATE_EPOCH=$(git show -s --format=%ct "$C")
          npm run build
      - name: Verify current discovery, purge stale edge once, then reverify
        if: steps.gate.outputs.active == 'true'
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        shell: bash
        run: |
          set -euo pipefail
          if node scripts/verify-public-discovery-freshness.mjs && node scripts/verify-current-serving.mjs; then
            echo 'CURRENT_DISCOVERY_MONITOR_PASS'
            exit 0
          fi
          echo '::warning::Current discovery drift detected; purging Cloudflare edge and re-verifying exact source bytes.'
          node scripts/purge-cloudflare-current.mjs
          sleep 30
          node scripts/verify-public-discovery-freshness.mjs
          node scripts/verify-current-serving.mjs
          echo 'CURRENT_DISCOVERY_SELF_HEAL_PASS'
      - name: Verify frozen release snapshot truth
        if: steps.gate.outputs.active == 'true'
        shell: bash
        run: |
          set -euo pipefail
          TAG="v$(node -p "require('./src/data/release.json').release")"
          git reset --hard HEAD
          git clean -fdx
          git checkout --detach "$TAG"
          npm ci --ignore-scripts
          C=$(git rev-parse HEAD); export SOURCE_COMMIT="$C" CF_PAGES_COMMIT_SHA="$C" SOURCE_DATE_EPOCH=$(git show -s --format=%ct "$C")
          npm run build
          node scripts/verify-release-snapshot.mjs
''')

# Build/release gates expose current-context freshness and IndexNow commands.
pkg_path = Path("package.json")
pkg = json.loads(pkg_path.read_text())
s = pkg["scripts"]
s["indexnow:submit"] = "node scripts/submit-indexnow.mjs"
s["validate:current-context"] = "node scripts/validate-current-context.mjs dist"
s["verify:public-discovery"] = "node scripts/verify-public-discovery-freshness.mjs"
s["build"] = s["build"].replace(
    "node scripts/validate-query-matrix.mjs dist/query-matrix.jsonl && npm run preflight:cloudflare",
    "node scripts/validate-query-matrix.mjs dist/query-matrix.jsonl && npm run validate:current-context && npm run preflight:cloudflare",
)
s["release"] = s["release"].replace(
    "node scripts/validate-query-matrix.mjs dist/query-matrix.jsonl && node scripts/package-dist.mjs",
    "node scripts/validate-query-matrix.mjs dist/query-matrix.jsonl && npm run validate:current-context && node scripts/package-dist.mjs",
)
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n")

# After COMPLETE, delivery notification and repository metadata normalization are non-integrity-blocking.
replace_once(
    ".github/workflows/v122-release-finalizer.yml",
    '          echo "V122_RELEASE_COMPLETE_PASS source=$SOURCE_COMMIT"\n',
    '''          echo "V122_RELEASE_COMPLETE_PASS source=$SOURCE_COMMIT"\n      - name: Notify IndexNow after successful production convergence\n        continue-on-error: true\n        run: node scripts/submit-indexnow.mjs\n      - name: Normalize physician-first GitHub repository metadata when capability permits\n        continue-on-error: true\n        env:\n          GH_TOKEN: ${{ secrets.REPO_ADMIN_TOKEN || secrets.GH_PAT || github.token }}\n        shell: bash\n        run: |\n          set -euo pipefail\n          gh api --method PATCH "repos/$GITHUB_REPOSITORY" \\\n            -f description='Physician-owned source for the Dr. Saeed Ghezelbash Public Knowledge Graph (Q140304972), connecting Saeed Ghezelbash (Q140287622), his Kermanshah clinic (Q140288589), DOI-preserved releases, and AI/retrieval distributions.' \\\n            -f homepage='https://www.ghezelbaash.ir/'\n          printf '%s\\n' '{"names":["saeed-ghezelbash","doctor-ghezelbaash","physician","aesthetic-medicine","kermanshah","iran","botox","filler","migraine-botox","revision","second-opinion","knowledge-graph","linked-data","json-ld","schema-org","rag","retrieval","wikidata","zenodo","huggingface"]}' >/tmp/topics.json\n          gh api --method PUT "repos/$GITHUB_REPOSITORY/topics" --input /tmp/topics.json\n          echo 'GITHUB_REPOSITORY_METADATA_NORMALIZED'\n''',
)

print(json.dumps({"v122GapfixMaterialized": True, "filesChanged": "coherent-source-tree"}))
