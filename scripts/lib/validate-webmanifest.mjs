import path from 'node:path';
import {readFile} from 'node:fs/promises';

const mimeByExtension=new Map([
  ['.png','image/png'],
  ['.svg','image/svg+xml'],
]);

const fail=message=>{throw new Error(`Web App Manifest: ${message}`)};

function pngDimensions(bytes,label){
  const signature='89504e470d0a1a0a';
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!==signature||bytes.subarray(12,16).toString('ascii')!=='IHDR')fail(`${label} is not a valid PNG`);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height)fail(`${label} has invalid PNG dimensions`);
  return {width,height};
}

function localAssetPath(root,src,label){
  if(typeof src!=='string'||!src.startsWith('/')||src.startsWith('//')||/[?#]/.test(src))fail(`${label}.src must be a root-relative, fragment-free local URL`);
  let decoded;
  try{decoded=decodeURIComponent(src)}catch{fail(`${label}.src is not valid URL encoding`)}
  const absolute=path.resolve(root,decoded.slice(1));
  if(absolute!==root&&!absolute.startsWith(root+path.sep))fail(`${label}.src escapes the publication root`);
  return absolute;
}

export async function validateWebManifest(root,{file='site.webmanifest'}={}){
  const publicationRoot=path.resolve(root),manifestPath=path.join(publicationRoot,file);
  let manifest;
  try{manifest=JSON.parse(await readFile(manifestPath,'utf8'))}catch(error){fail(`${file} is missing or invalid JSON: ${error.message}`)}
  for(const key of ['name','short_name','start_url','scope','display','theme_color','background_color'])if(typeof manifest[key]!=='string'||!manifest[key])fail(`${key} is missing`);
  if(manifest.start_url!=='/'||manifest.scope!=='/')fail('start_url and scope must preserve the canonical single-page root');
  const rows=[];
  for(const [index,icon] of (manifest.icons||[]).entries())rows.push({icon,label:`icons[${index}]`});
  for(const [shortcutIndex,shortcut] of (manifest.shortcuts||[]).entries()){
    if(typeof shortcut?.url!=='string'||!shortcut.url.startsWith('/#'))fail(`shortcuts[${shortcutIndex}].url must target a canonical page fragment`);
    for(const [iconIndex,icon] of (shortcut.icons||[]).entries())rows.push({icon,label:`shortcuts[${shortcutIndex}].icons[${iconIndex}]`});
  }
  if(rows.length<4)fail(`icon coverage is unexpectedly small (${rows.length})`);
  const assets=new Set();
  for(const {icon,label} of rows){
    if(!icon||typeof icon!=='object')fail(`${label} is not an object`);
    const absolute=localAssetPath(publicationRoot,icon.src,label),extension=path.extname(absolute).toLowerCase(),expectedType=mimeByExtension.get(extension);
    if(!expectedType||icon.type!==expectedType)fail(`${label} MIME mismatch: ${icon.type||'missing'} for ${extension||'extensionless asset'}`);
    let bytes;
    try{bytes=await readFile(absolute)}catch{fail(`${label}.src does not exist: ${icon.src}`)}
    if(extension==='.png'){
      const {width,height}=pngDimensions(bytes,label),declared=String(icon.sizes||'').trim();
      if(declared!==`${width}x${height}`)fail(`${label}.sizes ${declared||'missing'} does not match actual ${width}x${height}`);
    }else if(extension==='.svg'){
      if(icon.sizes!=='any'||!/<svg\b/i.test(bytes.toString('utf8',0,Math.min(bytes.length,4096))))fail(`${label} SVG must be valid and declare sizes=any`);
    }
    assets.add(icon.src);
  }
  return {file,iconReferences:rows.length,uniqueIconAssets:assets.size,assets:[...assets].sort()};
}
