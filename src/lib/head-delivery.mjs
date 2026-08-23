const fail=message=>{throw new Error(message)};

export const MAIN_HEAD_DISCOVERY_BOUNDARY='<link href="https://www.ghezelbaash.ir/graph.jsonld" rel="describedby"';
export const MAIN_HEAD_CRITICAL_PREFIX='<meta content="width=device-width,initial-scale=1,viewport-fit=cover" name="viewport"/><link as="image" fetchpriority="high"';

export function deriveMainHeadStages(value){
  const source=String(value);
  const first=source.indexOf(MAIN_HEAD_DISCOVERY_BOUNDARY);
  if(first<=0)fail('Main Head discovery boundary missing');
  if(source.indexOf(MAIN_HEAD_DISCOVERY_BOUNDARY,first+MAIN_HEAD_DISCOVERY_BOUNDARY.length)!==-1)fail('Main Head discovery boundary is not unique');
  const criticalHead=source.slice(0,first);
  const discoveryHead=source.slice(first);
  if(!criticalHead||!discoveryHead)fail('Main Head staging produced an empty lane');
  if(!criticalHead.startsWith(MAIN_HEAD_CRITICAL_PREFIX))fail('Critical Head prefix/order drift');
  if(!criticalHead.includes('<title>')||!criticalHead.includes('rel="canonical"'))fail('Critical Head lost title/canonical metadata');
  if(criticalHead.includes(MAIN_HEAD_DISCOVERY_BOUNDARY))fail('Discovery metadata leaked into the Critical Head lane');
  if(!discoveryHead.startsWith(MAIN_HEAD_DISCOVERY_BOUNDARY))fail('Discovery Head lane lost its boundary resource');
  return {criticalHead,discoveryHead,splitAt:first};
}
