import {readFile} from 'node:fs/promises';
const contract=JSON.parse(await readFile('.release/policy/platform-contract.json','utf8')),cf=contract.cloudflare;
const env={CF_PROJECT:cf.pagesProject,CLOUDFLARE_ACCOUNT_ID:cf.accountId,CF_PRODUCTION_BRANCH:cf.productionBranch,CF_EXPECTED_ENVIRONMENT:cf.expectedEnvironment,ZONE_NAME:contract.zoneName,CANONICAL_HOST:contract.canonicalHost};
for(const [key,value] of Object.entries(env)){if(!String(value||'').trim())throw new Error(`Platform contract missing ${key}`);console.log(`${key}=${value}`)}
