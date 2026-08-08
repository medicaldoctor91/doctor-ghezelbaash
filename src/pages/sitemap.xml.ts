import body from '../data/projections/sitemap.xml?raw';
import { staticResponse } from '../lib/static-endpoint';
export const prerender=true;
export function GET(){return staticResponse(body,'application/xml; charset=utf-8');}
