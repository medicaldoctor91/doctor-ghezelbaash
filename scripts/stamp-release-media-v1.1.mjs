import { readFile, writeFile } from 'node:fs/promises';

const OLD='1.0.0', CURRENT='1.1.0';
const files=[
  'public/favicon.svg',
  'public/safari-pinned-tab.svg',
  'public/media/brand/doctor-ghezelbaash-symbol.3a9e7509912d.svg'
];
for(const file of files){
  let text=await readFile(file,'utf8');
  const oldTag=`<entity:Version>${OLD}</entity:Version>`;
  const currentTag=`<entity:Version>${CURRENT}</entity:Version>`;
  if(text.includes(oldTag)) text=text.replaceAll(oldTag,currentTag);
  if(!text.includes(currentTag)) throw new Error(`Release entity metadata tag missing after stamp: ${file}`);
  if(text.includes(oldTag)) throw new Error(`Historical release tag remains in current entity media: ${file}`);
  await writeFile(file,text);
}
console.log(JSON.stringify({release:CURRENT,stamped:files,integrity:'PASS'},null,2));
