import body from '../data/projections/entity-facts.csv?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'text/csv; charset=utf-8');}
