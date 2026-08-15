import {INDEXNOW_HOST,INDEXNOW_KEY,INDEXNOW_KEY_LOCATION} from './lib/indexnow.mjs';
const endpoint=process.env.INDEXNOW_ENDPOINT||'https://api.indexnow.org/indexnow';
const urls=[`https://${INDEXNOW_HOST}/`,`https://${INDEXNOW_HOST}/live-observations.jsonld`,`https://${INDEXNOW_HOST}/current-release-matrix.json`];
const keyReadback=await fetch(`${INDEXNOW_KEY_LOCATION}?verify=${Date.now()}`,{headers:{'user-agent':'ghezelbaash-indexnow-release-notifier/1.0'},signal:AbortSignal.timeout(30000)});
if(!keyReadback.ok||(await keyReadback.text()).trim()!==INDEXNOW_KEY)throw new Error(`IndexNow key readback failed ${keyReadback.status}`);
const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json; charset=utf-8','user-agent':'ghezelbaash-indexnow-release-notifier/1.0'},body:JSON.stringify({host:INDEXNOW_HOST,key:INDEXNOW_KEY,keyLocation:INDEXNOW_KEY_LOCATION,urlList:urls}),signal:AbortSignal.timeout(30000)});
if(![200,202].includes(response.status))throw new Error(`IndexNow submission failed HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
console.log(JSON.stringify({indexNow:'SUBMITTED',status:response.status,host:INDEXNOW_HOST,keyLocation:INDEXNOW_KEY_LOCATION,urls}));
