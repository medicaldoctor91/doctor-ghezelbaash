import body from '../data/projections/index.md?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'text/markdown; charset=utf-8');}
