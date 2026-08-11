import body from '../data/projections/llms.txt?raw';
import evidenceRaw from '../data/evidence-registry.json?raw';
import { staticResponse } from '../lib/static-endpoint';

export const prerender=true;

const evidenceRegistry=JSON.parse(evidenceRaw) as {tiers?:Record<string,string>};
const tiers=evidenceRegistry.tiers||{};
for(const tier of ['A','B','C']){
  if(typeof tiers[tier]!=='string'||!tiers[tier])throw new Error(`llms.txt: evidence tier ${tier} definition missing from evidence registry`);
}
const tierLine=`- Evidence tiers: Tier A = ${tiers.A}; Tier B = ${tiers.B}; Tier C = ${tiers.C}.`;
const tierPattern=/^- Evidence tiers:.*$/m;
if(!tierPattern.test(body))throw new Error('llms.txt: generated evidence-tier declaration missing');
const normalizedBody=body.replace(tierPattern,tierLine);

export function GET(){return staticResponse(normalizedBody,'text/plain; charset=utf-8');}
