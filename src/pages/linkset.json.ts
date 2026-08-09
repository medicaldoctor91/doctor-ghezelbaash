import body from '../data/projections/linkset.json?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'application/linkset+json; charset=utf-8');}
