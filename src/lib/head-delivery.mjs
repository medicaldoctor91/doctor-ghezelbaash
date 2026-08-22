const fail=message=>{throw new Error(message)};

export const MAIN_HEAD_DISCOVERY_BOUNDARY=/<link\b(?=[^>]*\brel=["']describedby["'])[^>]*\/>/i;

export function deriveMainHeadStages(value){
  const source=String(value);
  const match=MAIN_HEAD_DISCOVERY_BOUNDARY.exec(source);
  if(!match||match.index<=0)fail('Main Head discovery boundary missing');
  const criticalHead=source.slice(0,match.index);
  const discoveryHead=source.slice(match.index);
  if(!criticalHead||!discoveryHead)fail('Main Head staging produced an empty lane');
  if(!/<meta\b(?=[^>]*\bname=["']viewport["'])/i.test(criticalHead))fail('Critical Head lost viewport metadata');
  if(!/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']image["'])(?=[^>]*\bfetchpriority=["']high["'])/i.test(criticalHead))fail('Critical Head lost the high-priority Hero preload');
  if(!/<title>[\s\S]*?<\/title>/i.test(criticalHead)||!/<link\b(?=[^>]*\brel=["']canonical["'])/i.test(criticalHead))fail('Critical Head lost title/canonical metadata');
  if(MAIN_HEAD_DISCOVERY_BOUNDARY.test(criticalHead))fail('Discovery metadata leaked into the Critical Head lane');
  if(!MAIN_HEAD_DISCOVERY_BOUNDARY.test(discoveryHead))fail('Discovery Head lane lost its boundary resource');
  return {criticalHead,discoveryHead,splitAt:match.index};
}
