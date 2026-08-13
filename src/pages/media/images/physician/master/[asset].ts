import path from 'node:path';
import {readFile} from 'node:fs/promises';
import type {APIRoute,GetStaticPaths} from 'astro';
import inventory from '../../../../../data/stable-media-aliases.json';

type StableAlias={path:string;target:string};
const aliases=(inventory.aliases as StableAlias[]).filter(item=>item.path.startsWith('media/images/physician/master/'));

export const prerender=true;

export const getStaticPaths=(function(){
  return aliases.map(item=>({
    params:{asset:path.basename(item.path)},
    props:{target:item.target},
  }));
}) satisfies GetStaticPaths;

export const GET:APIRoute=async({props})=>{
  const target=String(props.target||'');
  const body=await readFile(path.join(process.cwd(),'public',target));
  const contentType=target.endsWith('.webp')?'image/webp':'image/jpeg';
  return new Response(body,{headers:{'Content-Type':contentType}});
};
