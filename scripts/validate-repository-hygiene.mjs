import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'buffer'}).toString('utf8').split('\0').filter(Boolean).sort();
if(!tracked.length)throw new Error('Tracked-source inventory is empty');

const forbiddenGeneratedPrefixes=['dist/','release/','node_modules/','.python-deps/','.release/runtime/','.release/huggingface/'];
const forbiddenExternalMaintenancePrefixes=['wikimedia/','wikiversity/','wikijournal/','wikisource/'];
const forbiddenPrControlPaths=new Set(['.github/CODEOWNERS','.github/dependabot.yml']);
const forbiddenExactNames=new Set(['notes.md','dev-notes.md','internal-notes.md']);
const forbiddenNamePrefixes=['audit-','backup-','draft-','scratch-','temp-','tmp-'];
const forbiddenSuffixes=['.bak','.old','.orig','.rej','.tmp','~'];
const oneShotWorkflowPattern=/(?:^|\/)[._-]*(?:one[-_]?time|temporary|temp[-_]|tmp[-_]|audit[-_]|clean[-_]?slate|patch[-_]|cleanup[-_]|normalize[-_].*fixtures).*\.ya?ml$/i;
const runtimeWrapperPattern=/_entry\.py$/i;
const externalOperationScriptPattern=/^scripts\/(?:commons_|wiki(?:media|journal|source|versity)_)/i;
const textExtensions=new Set(['.astro','.cff','.css','.csv','.html','.ini','.js','.json','.jsonld','.md','.mjs','.py','.toml','.ts','.tsv','.ttl','.txt','.xml','.yaml','.yml']);
const textExactNames=new Set(['.gitignore','.npmrc','.nvmrc','LICENSE']);
const devMarker=/\b(?:TODO|FIXME|HACK)\b/g;
const [npmrc,packageJson]=await Promise.all([
  readFile(path.join(root,'.npmrc'),'utf8'),
  readFile(path.join(root,'package.json'),'utf8').then(JSON.parse),
]);
if(!/^audit=true$/m.test(npmrc)||/^audit=false$/m.test(npmrc))throw new Error('npm advisory reporting must remain enabled');
if(packageJson.scripts?.['audit:dependencies']!=='npm audit --audit-level=high')throw new Error('High-severity dependency advisory gate drift');
if(packageJson.overrides?.nanoid!=='3.3.18')throw new Error('Patched nanoid override drift');

for(const name of tracked){
  const normalized=name.replaceAll('\\','/');
  if(forbiddenGeneratedPrefixes.some(prefix=>normalized.startsWith(prefix)))throw new Error(`Generated/runtime material must not be tracked: ${normalized}`);
  if(forbiddenExternalMaintenancePrefixes.some(prefix=>normalized.startsWith(prefix)))throw new Error(`External one-shot maintenance material must not remain canonical: ${normalized}`);
  if(forbiddenPrControlPaths.has(normalized))throw new Error(`PR-only control file must not remain canonical: ${normalized}`);
  if(oneShotWorkflowPattern.test(normalized))throw new Error(`One-shot maintenance workflow must not remain canonical: ${normalized}`);
  if(runtimeWrapperPattern.test(normalized))throw new Error(`Runtime source wrapper must not remain canonical: ${normalized}`);
  if(externalOperationScriptPattern.test(normalized))throw new Error(`External one-shot operation script must not remain canonical: ${normalized}`);
  const base=path.posix.basename(normalized).toLowerCase();
  const semanticBase=base.replace(/^[._-]+/,'');
  if(forbiddenExactNames.has(base))throw new Error(`Internal note/planning file must not be tracked: ${normalized}`);
  if(forbiddenNamePrefixes.some(prefix=>semanticBase.startsWith(prefix)))throw new Error(`Temporary/audit file must not be tracked: ${normalized}`);
  if(forbiddenSuffixes.some(suffix=>base.endsWith(suffix)))throw new Error(`Backup/editor residue must not be tracked: ${normalized}`);
}

const canonicalContent=tracked.filter(name=>name.startsWith('src/content-source/'));
if(canonicalContent.length!==1||canonicalContent[0]!=='src/content-source/page.md')throw new Error(`Canonical content-source topology drift: ${canonicalContent.join(', ')}`);
const styles=tracked.filter(name=>name.startsWith('src/styles/'));
const allowedStyles=['src/styles/global.css'];
if(styles.length!==allowedStyles.length||styles.some((name,index)=>name!==allowedStyles[index]))throw new Error(`Stylesheet topology drift: ${styles.join(', ')}`);
const workflows=tracked.filter(name=>name.startsWith('.github/workflows/'));
const allowedWorkflows=[
  '.github/workflows/ci.yml',
  '.github/workflows/cloudflare-pages-deploy.yml',
  '.github/workflows/github-pages-bridge.yml',
  '.github/workflows/hugging-face-authority.yml',
  '.github/workflows/reputation-refresh.yml',
  '.github/workflows/stack-monitor.yml',
];
if(workflows.length!==allowedWorkflows.length||workflows.some((name,index)=>name!==allowedWorkflows[index]))throw new Error(`Workflow topology drift: ${workflows.join(', ')}`);

for(const workflow of workflows){
  const content=await readFile(path.join(root,workflow),'utf8');
  if(/^\s*pull_request_target\s*:/m.test(content))throw new Error(`Canonical workflows must never use pull_request_target: ${workflow}`);
  const hasPullRequest=/^\s*pull_request\s*:/m.test(content);
  if(hasPullRequest){
    if(workflow!=='.github/workflows/ci.yml')throw new Error(`Only the canonical read-only CI workflow may use pull_request: ${workflow}`);
    if(!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(content))throw new Error('Pull-request CI must declare top-level contents: read permissions');
    if(/^\s*(?:actions|checks|contents|deployments|id-token|issues|packages|pages|pull-requests|statuses):\s*write\s*$/m.test(content))throw new Error('Pull-request CI must not grant write permissions');
    if(/\$\{\{\s*secrets\./.test(content))throw new Error('Pull-request CI must not consume repository secrets');
    if(/^\s*environment\s*:/m.test(content))throw new Error('Pull-request CI must not bind a deployment environment');
  }
  if(/\bgithub\.(?:head_ref|base_ref)\b|refs\/pull\//.test(content))throw new Error(`Canonical workflows must not depend on pull-request refs: ${workflow}`);
  if(/^\s+persist-credentials:\s*true\s*$/m.test(content))throw new Error(`Checkout credentials must never persist across workflow steps: ${workflow}`);
  if(/^ {4}env:\s*\n(?: {6}[^\n]*\n)*? {6}[^:\n]+:\s*\$\{\{\s*(?:secrets\.|github\.token)/m.test(content))throw new Error(`Job-level secret/token exposure is forbidden: ${workflow}`);
  if(/https:\/\/[^\s"']*(?:\$\{\{\s*secrets\.|\$\{(?:HF|HUGGING_FACE|HUGGINGFACE|GITHUB|CLOUDFLARE|ZENODO)[A-Z_]*TOKEN)/.test(content))throw new Error(`Credential-bearing remote URL is forbidden: ${workflow}`);
  const installCount=(content.match(/\bnpm ci\b/g)||[]).length;
  const auditCount=(content.match(/\bnpm (?:run audit:dependencies|audit --audit=true --audit-level=high)\b/g)||[]).length;
  if(installCount!==auditCount)throw new Error(`Every npm ci must be followed by the explicit dependency advisory gate: ${workflow} (${installCount}/${auditCount})`);
  for(const match of content.matchAll(/^\s*branches:\s*\[([^\]]*)\]\s*$/gm)){
    const branches=match[1].split(',').map(value=>value.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean);
    if(branches.some(branch=>branch!=='main'))throw new Error(`Canonical workflow branch trigger must be main-only: ${workflow} -> ${branches.join(', ')}`);
  }
}

const deletedInWorktree=new Set(execFileSync('git',['diff','--name-only','--diff-filter=D','-z'],{cwd:root,encoding:'buffer'}).toString('utf8').split('\0').filter(Boolean));
const forbiddenControlByte=byte=>(byte<=0x08)||(byte>=0x0b&&byte<=0x0c)||(byte>=0x0e&&byte<=0x1f)||byte===0x7f;
for(const name of tracked){
  const ext=path.posix.extname(name).toLowerCase();
  if(!textExtensions.has(ext)&&!textExactNames.has(path.posix.basename(name)))continue;
  let raw;
  try{raw=await readFile(path.join(root,name));}
  catch(error){
    if(error?.code==='ENOENT'&&deletedInWorktree.has(name))continue;
    throw error;
  }
  const controlOffset=raw.findIndex(forbiddenControlByte);
  if(controlOffset!==-1)throw new Error(`Forbidden ASCII control byte 0x${raw[controlOffset].toString(16).padStart(2,'0')} in tracked text source: ${name} at byte ${controlOffset}`);
  if(name==='scripts/validate-repository-hygiene.mjs')continue;
  const content=raw.toString('utf8');
  if(devMarker.test(content))throw new Error(`Development marker leaked into tracked source: ${name}`);
  devMarker.lastIndex=0;
}

console.log(JSON.stringify({repositoryHygiene:'PASS',trackedFiles:tracked.length,canonicalContent:'src/content-source/page.md',styles:allowedStyles,workflows:allowedWorkflows,generatedRuntimeTracked:false,externalMaintenanceTracked:false,temporaryOrBackupFilesTracked:false,oneShotMaintenanceWorkflowsTracked:false,runtimeSourceWrappersTracked:false,prOnlyControlFilesTracked:false,pullRequestTargetWorkflowCoupling:false,pullRequestValidationWorkflow:'.github/workflows/ci.yml',pullRequestValidationReadOnly:true,nonMainWorkflowBranchTriggers:false,persistentCheckoutCredentials:false,jobLevelSecrets:false,credentialBearingRemoteUrls:false,dependencyAdvisoryGate:'high',developmentMarkers:false,forbiddenAsciiControlBytes:false,intentionalTrackedDeletionsHandled:true},null,2));
