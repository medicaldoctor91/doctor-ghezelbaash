import path from 'node:path';

export function routeFileForPath(route) {
  if (route === '/') return 'index.html';
  if (!route.startsWith('/') || route.includes('..') || route.endsWith('/')) throw new Error(`Invalid canonical route: ${route}`);
  return route.slice(1) + '.html';
}

function attrValue(tag, name) {
  const match = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match?.[1] ?? match?.[2];
}

export function discoverCriticalAssets(html) {
  const css = [], js = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag=match[0], rel=attrValue(tag,'rel'), href=attrValue(tag,'href');
    if (href && rel?.split(/\s+/).includes('stylesheet')) css.push(href);
  }
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const src=attrValue(match[0],'src'); if (src) js.push(src);
  }
  return { css:[...new Set(css)], js:[...new Set(js)] };
}

export function publicPathForFile(root, file) {
  const rel=path.relative(root,file).split(path.sep).join('/');
  return '/' + rel.replace(/^index\.html$/,'').replace(/\.html$/,'');
}
