import body from '../data/projections/llms-full.txt?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'text/plain; charset=utf-8');}
