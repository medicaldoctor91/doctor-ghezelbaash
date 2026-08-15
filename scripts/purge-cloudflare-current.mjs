const token=process.env.CLOUDFLARE_API_TOKEN||'',account=process.env.CLOUDFLARE_ACCOUNT_ID||'',zoneName=process.env.ZONE_NAME||'ghezelbaash.ir';
if(!token||!account)throw new Error('Cloudflare purge credentials missing');
const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const listing=await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}&account.id=${encodeURIComponent(account)}`,{headers,signal:AbortSignal.timeout(30000)});const lj=await listing.json();
if(!listing.ok||!lj.success||lj.result?.length!==1)throw new Error(`Cloudflare zone lookup failed ${listing.status}`);
const zone=lj.result[0].id;const purge=await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`,{method:'POST',headers,body:JSON.stringify({purge_everything:true}),signal:AbortSignal.timeout(30000)});const pj=await purge.json();
if(!purge.ok||!pj.success)throw new Error(`Cloudflare purge failed ${purge.status}: ${JSON.stringify(pj.errors||[])}`);
console.log(JSON.stringify({cloudflarePurge:'PASS',zone:zoneName,zoneId:zone}));
