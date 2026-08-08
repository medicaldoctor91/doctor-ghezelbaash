import body from '../data/projections/evidence-snapshot.json?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'application/json; charset=utf-8');}
