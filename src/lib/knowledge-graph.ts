import headGraphRawSource from '../../.generated/semantic/head-graph.json?raw';
import supportGraphRawSource from '../../.generated/semantic/support-graph.json?raw';

type Graph={'@graph':unknown[];[key:string]:unknown};
function parse(source:string,label:string){
  const parsed=JSON.parse(source) as Graph;
  if(!Array.isArray(parsed['@graph']))throw new Error(`${label} lacks @graph`);
  return {parsed,raw:`${JSON.stringify(parsed)}\n`};
}
const head=parse(headGraphRawSource,'head graph');
const support=parse(supportGraphRawSource,'support graph');
export const headGraph=head.parsed;
export const headGraphRaw=head.raw;
export const supportGraphRaw=support.raw;
