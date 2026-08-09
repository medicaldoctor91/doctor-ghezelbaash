import fullGraphRaw from '../data/semantic/knowledge-graph.jsonld?raw';
import headGraphRawSource from '../data/semantic/head-graph.json?raw';
import supportGraphRawSource from '../data/semantic/support-graph.json?raw';
function validate(source:string,label:string){const parsed=JSON.parse(source);if(!Array.isArray(parsed['@graph']))throw new Error(`${label} lacks @graph`);return `${JSON.stringify(parsed)}\n`;}
export const canonicalGraphRaw=validate(fullGraphRaw,'canonical graph');
export const headGraphRaw=validate(headGraphRawSource,'head graph');
export const supportGraphRaw=validate(supportGraphRawSource,'support graph');
