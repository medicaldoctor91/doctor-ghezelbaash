import headGraphRawSource from '../../.generated/semantic/head-graph.json?raw';
import supportGraphRawSource from '../../.generated/semantic/support-graph.json?raw';

type ContextValue=string|number|boolean|Record<string,unknown>;
type Graph={'@context'?:Record<string,ContextValue>;'@graph':unknown[];[key:string]:unknown};
const schemaContext=(context:Graph['@context'])=>Object.fromEntries(Object.entries(context??{}).filter(([key,value])=>{
  if(key==='@version'||key==='@vocab'||key==='schema')return true;
  return typeof value==='object'&&value!==null&&typeof value['@id']==='string'&&value['@id'].startsWith('https://schema.org/');
}));
function parse(source:string,label:string){
  const parsed=JSON.parse(source) as Graph;
  if(!Array.isArray(parsed['@graph']))throw new Error(`${label} lacks @graph`);
  const context=schemaContext(parsed['@context']);
  parsed['@context']=context;
  if(context['@vocab']!=='https://schema.org/'||context.schema!=='https://schema.org/')throw new Error(`${label} lost Schema.org context authority`);
  return {parsed,raw:`${JSON.stringify(parsed)}\n`};
}
const head=parse(headGraphRawSource,'head graph');
const support=parse(supportGraphRawSource,'support graph');
export const headGraph=head.parsed;
export const headGraphRaw=head.raw;
export const supportGraphRaw=support.raw;
