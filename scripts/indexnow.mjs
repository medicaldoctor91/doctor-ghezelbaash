import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';

const KEY='2d0a99837e327f6744f9184ec6d2877f';
const HOST='www.ghezelbaash.ir';
const KEY_LOCATION=`https://${HOST}/${KEY}.txt`;
const action=process.argv[2];

if(action==='prepare'){
  const root=process.cwd(),dist=path.resolve(root,process.argv[3]||'dist');
  await mkdir(dist,{recursive:true});
  await writeFile(path.join(dist,`${KEY}.txt`),`${KEY}\n`,'utf8');
  console.log(JSON.stringify({indexNowKeyFile:`${KEY}.txt`,generated:true}));
}else if(action==='submit'){
  const endpoint=process.env.INDEXNOW_ENDPOINT||'https://api.indexnow.org/indexnow';
  const urls=[`https://${HOST}/`,`https://${HOST}/live-observations.jsonld`,`https://${HOST}/current-release-matrix.json`];
  const keyReadback=await fetch(`${KEY_LOCATION}?verify=${Date.now()}`,{headers:{'user-agent':'ghezelbaash-indexnow-release-notifier/1.0'},signal:AbortSignal.timeout(30000)});
  if(!keyReadback.ok||(await keyReadback.text()).trim()!==KEY)throw new Error(`IndexNow key readback failed ${keyReadback.status}`);
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json; charset=utf-8','user-agent':'ghezelbaash-indexnow-release-notifier/1.0'},body:JSON.stringify({host:HOST,key:KEY,keyLocation:KEY_LOCATION,urlList:urls}),signal:AbortSignal.timeout(30000)});
  if(![200,202].includes(response.status))throw new Error(`IndexNow submission failed HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
  console.log(JSON.stringify({indexNow:'SUBMITTED',status:response.status,host:HOST,keyLocation:KEY_LOCATION,urls}));
}else{
  throw new Error('Usage: node scripts/indexnow.mjs <prepare [dist]|submit>');
}
