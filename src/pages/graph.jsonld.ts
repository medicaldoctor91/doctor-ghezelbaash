import body from '../data/semantic/knowledge-graph.jsonld?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'application/ld+json; charset=utf-8');}
