import {readFile,writeFile} from 'node:fs/promises';

const invPath='src/data/release-invariants.json';
const validatorPath='scripts/validate-dist.mjs';
const inv=JSON.parse(await readFile(invPath,'utf8'));
inv.googleInlineSemanticClipCount=13;
inv.googleInlineSupportNodeTarget=129;
inv.googleInlineKurdishClipCount=0;
await writeFile(invPath,`${JSON.stringify(inv,null,2)}\n`);

let text=await readFile(validatorPath,'utf8');
const replacements=[
  ["supportClips.length!==inv.inlineSemanticClipCount","supportClips.length!==inv.googleInlineSemanticClipCount"],
  ["supportClips.filter(c=>String(c['@id']).includes('kurdish-patient-experience')).length!==3","supportClips.filter(c=>String(c['@id']).includes('kurdish-patient-experience')).length!==inv.googleInlineKurdishClipCount"],
  ["support['@graph'].length!==inv.supportNodeTarget","support['@graph'].length!==inv.googleInlineSupportNodeTarget"]
];
for(const [from,to] of replacements){
  const count=text.split(from).length-1;
  if(count!==1)throw new Error(`Expected exactly one validator contract occurrence for ${from}; found ${count}`);
  text=text.replace(from,to);
}
await writeFile(validatorPath,text);
console.log(JSON.stringify({patched:true,sourceSupport:{clips:inv.inlineSemanticClipCount,nodes:inv.supportNodeTarget},googleInline:{clips:inv.googleInlineSemanticClipCount,nodes:inv.googleInlineSupportNodeTarget,kurdishClips:inv.googleInlineKurdishClipCount}},null,2));
