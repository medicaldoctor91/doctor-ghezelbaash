import body from '../data/projections/void.ttl?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'text/turtle; charset=utf-8');}
