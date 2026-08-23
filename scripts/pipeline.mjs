import {spawnSync} from 'node:child_process';

const command=process.argv[2];
const passthrough=process.argv.slice(3);
const node=process.execPath;
const python=process.env.PYTHON||'python';
const astro=process.platform==='win32'?'astro.cmd':'astro';
const env={...process.env,ASTRO_TELEMETRY_DISABLED:'1'};

const fail=message=>{throw new Error(message)};
const run=(label,bin,args=[],options={})=>{
  console.log(`\n=== ${label} ===`);
  const result=spawnSync(bin,args,{stdio:'inherit',env:{...env,...(options.env||{})},shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)fail(`${label} failed with exit code ${result.status}`);
};
const js=(label,file,args=[])=>run(label,node,[file,...args]);
const py=(label,file,args=[],extraEnv={})=>run(label,python,[file,...args],{env:extraEnv});

const validateRelease=()=>js('release contract','scripts/validate-release-contract.mjs');
const prepareGenerated=()=>{
  js('media reference preflight','scripts/validate-media-references.mjs');
  js('reset generated workspace','scripts/generated-workspace.mjs',['reset']);
  js('generate canonical RDF','scripts/generate-rdf.mjs');
  js('generate canonical projections','scripts/generate-projections.mjs');
  js('generate retrieval projections','scripts/generate-retrieval-projections.mjs');
  js('generate descriptors','scripts/generate-descriptors.mjs');
};
const validateQuery=target=>js('query matrix', 'scripts/validate-query-matrix.mjs',target?[target]:[]);
const validateSource=()=>{
  js('repository hygiene','scripts/validate-repository-hygiene.mjs');
  js('architecture contract','scripts/validate-architecture.mjs');
  js('media manifest preflight','scripts/enrich-image-metadata-manifest.mjs',['--preflight-only']);
  js('platform contract','scripts/platform-contract.mjs',['validate']);
  js('source semantic contract','scripts/validate-source.mjs');
  js('critical source path','scripts/validate-critical-path.mjs');
  js('head authority','scripts/validate-head-authority.mjs');
  js('critical hero geometry','scripts/validate-critical-hero-geometry.mjs');
  js('contract tests','scripts/test-contracts.mjs');
  js('critical CTAs','scripts/validate-critical-ctas.mjs');
  js('subdomain redirects','scripts/validate-subdomain-redirects.mjs');
  js('GitHub Pages bridge self-test','scripts/github-pages-bridge.mjs',['self-test']);
};
const ensureRdfDeps=()=>{
  const probe=spawnSync(python,['-c','import rdflib'],{stdio:'ignore',env:{...env,PYTHONPATH:'.python-deps'},shell:false});
  if(probe.status===0)return;
  run('install RDF validation dependencies',python,['-m','pip','install','--disable-pip-version-check','--no-input','--target','.python-deps','-r','requirements-rdf.txt']);
};
const validateReleaseEvidence=()=>{
  js('media contract','scripts/validate-media.mjs');
  js('evidence contract','scripts/validate-evidence.mjs');
  ensureRdfDeps();
  py('SHACL validation','scripts/validate-shacl.py',[],{PYTHONPATH:'.python-deps'});
  js('generated reproducibility','scripts/validate-reproducibility.mjs');
  js('RDF byte reproducibility','scripts/validate-rdf-byte-repro.mjs');
  js('deterministic ZIP contract','scripts/validate-deterministic-zip.mjs');
};
const astroCheck=()=>run('Astro check',astro,['check','--minimumFailingSeverity','warning']);
const buildDist=()=>{
  run('Astro static build',astro,['build']);
  js('materialize static artifacts','scripts/materialize-static-artifacts.mjs');
  js('prepare IndexNow key','scripts/indexnow.mjs',['prepare']);
  js('finalize descriptors','scripts/generate-descriptors.mjs',['--dist','dist']);
  js('finalize DIST','scripts/finalize-dist.mjs');
  py('Cloudflare edge self-test','scripts/configure-cloudflare-edge.py',['--self-test']);
  py('Cloudflare edge reconciliation test','scripts/test-cloudflare-edge-reconciliation.py');
  js('DIST semantic contract','scripts/validate-dist.mjs');
  js('critical DIST path','scripts/validate-critical-path.mjs',['dist']);
  validateQuery('dist/query-matrix.jsonl');
  js('current serving context','scripts/validate-current-context.mjs',['dist']);
  py('Cloudflare preflight','scripts/preflight-cloudflare-edge.py',['--if-configured']);
};
const prepareRelease=()=>{
  validateRelease();
  prepareGenerated();
  validateQuery();
  astroCheck();
  validateSource();
  validateReleaseEvidence();
};
const buildStandalone=()=>{
  validateRelease();
  prepareGenerated();
  validateQuery();
  validateSource();
  buildDist();
};
const packageSource=()=>js('package canonical source','scripts/package-dist.mjs',['source']);
const completeRelease=()=>{
  js('release attestation','scripts/write-release-attestation.mjs');
  js('package DIST','scripts/package-dist.mjs');
  packageSource();
  js('package complete release','scripts/package-dist.mjs',['complete']);
};

switch(command){
  case 'dev': prepareGenerated(); run('Astro dev',astro,['dev',...passthrough]); break;
  case 'preview': run('Astro preview',astro,['preview',...passthrough]); break;
  case 'check': validateRelease(); prepareGenerated(); validateQuery(); astroCheck(); break;
  case 'prepare': prepareRelease(); break;
  case 'build': buildStandalone(); break;
  case 'ci': prepareRelease(); buildDist(); packageSource(); break;
  case 'release': prepareRelease(); buildDist(); completeRelease(); break;
  default: fail(`Unknown pipeline command: ${command||'(missing)'}. Expected dev, preview, check, prepare, build, ci, or release.`);
}
