const TOKEN_PATTERN=/{{(?:MAIN_CSP|404_CSP|DIGEST:[^{}\s]+)}}/g;
const ANY_TOKEN_PATTERN=/{{[^{}]+}}/g;

const countToken=(source,token)=>source.split(token).length-1;

export function compileHeadersTemplate(template,{mainCsp,csp404,digests}={}){
  const source=String(template);
  if(typeof mainCsp!=='string'||!mainCsp)throw new Error('_headers compiler: MAIN_CSP missing');
  if(typeof csp404!=='string'||!csp404)throw new Error('_headers compiler: 404_CSP missing');
  if(!digests||typeof digests!=='object'||Array.isArray(digests))throw new Error('_headers compiler: digest map missing');

  const bindings=new Map([
    ['{{MAIN_CSP}}',mainCsp],
    ['{{404_CSP}}',csp404],
    ...Object.entries(digests).map(([file,digest])=>[`{{DIGEST:${file}}}`,String(digest)]),
  ]);
  const discovered=source.match(ANY_TOKEN_PATTERN)||[];
  const unknown=[...new Set(discovered.filter(token=>!bindings.has(token)))];
  if(unknown.length)throw new Error(`_headers compiler: unknown token(s): ${unknown.join(', ')}`);

  for(const [token,value] of bindings){
    if(!value)throw new Error(`_headers compiler: empty binding for ${token}`);
    const count=countToken(source,token);
    if(count!==1)throw new Error(`_headers compiler: expected exactly one ${token}; found ${count}`);
  }
  const expectedCount=bindings.size;
  const recognized=source.match(TOKEN_PATTERN)||[];
  if(recognized.length!==expectedCount)throw new Error(`_headers compiler: token inventory mismatch; expected ${expectedCount}, found ${recognized.length}`);

  const output=source.replace(ANY_TOKEN_PATTERN,token=>bindings.get(token));
  const unresolved=output.match(ANY_TOKEN_PATTERN)||[];
  if(unresolved.length)throw new Error(`_headers compiler: unresolved token(s): ${[...new Set(unresolved)].join(', ')}`);
  return output;
}
