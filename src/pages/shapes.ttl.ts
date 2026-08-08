import body from '../data/semantic/shapes.ttl?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'text/turtle; charset=utf-8');}
