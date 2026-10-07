import { CANONICAL } from '../index.astro';
export const prerender = true;
export function getStaticPaths() {
  return CANONICAL.assets.map(asset => ({params:{asset:asset.path.slice('/assets/'.length)},props:{asset}}));
}
export function GET({props}) {
  return new Response(props.asset.content,{headers:{'Content-Type':props.asset.type}});
}
