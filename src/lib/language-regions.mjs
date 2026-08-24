import {MULTILINGUAL_HEADING_BOUNDARIES,MULTILINGUAL_RETURN_TO_PRIMARY} from './language-contract.mjs';

const LANGUAGE_BLOCK_TAGS='h1|h2|h3|h4|h5|h6|p|li|dt|dd|th|td|caption|summary|figcaption|blockquote|address|pre';
const blockTagPattern=new RegExp(`<(${LANGUAGE_BLOCK_TAGS})\\b([^>]*)>`,'gi');
const hasAttribute=(attrs,name)=>new RegExp(`(?:^|\\s)${name}\\s*=`,'i').test(attrs);

const headingStart=(source,marker)=>{
  const markerIndex=source.indexOf(marker);
  if(markerIndex<0)throw new Error(`Language boundary marker missing: ${marker}`);
  const start=source.lastIndexOf('<h2',markerIndex);
  const close=start<0?-1:source.indexOf('>',start);
  if(start<0||close<0||close>markerIndex)throw new Error(`Language boundary is not inside an H2: ${marker}`);
  return start;
};

const annotateSegment=(segment,{lang,dir})=>segment.replace(blockTagPattern,(tag,tagName,attrs)=>{
  let next=attrs;
  if(!hasAttribute(next,'lang'))next+=` lang="${lang}"`;
  if(!hasAttribute(next,'dir'))next+=` dir="${dir}"`;
  return `<${tagName}${next}>`;
});

export function bindLanguageRegions(content){
  const source=String(content);
  const starts=MULTILINGUAL_HEADING_BOUNDARIES.map(boundary=>headingStart(source,boundary.startsWith));
  const returnStart=headingStart(source,MULTILINGUAL_RETURN_TO_PRIMARY.startsWith);
  for(let index=1;index<starts.length;index++)if(starts[index]<=starts[index-1])throw new Error('Multilingual boundary order drift');
  if(returnStart<=starts.at(-1))throw new Error('Persian return boundary must follow Sorani content');

  const regions=MULTILINGUAL_HEADING_BOUNDARIES.map((boundary,index)=>({
    boundary,
    start:starts[index],
    end:index+1<starts.length?starts[index+1]:returnStart,
  }));
  let output=source;
  for(const region of [...regions].reverse()){
    const segment=output.slice(region.start,region.end);
    const annotated=annotateSegment(segment,region.boundary);
    output=output.slice(0,region.start)+annotated+output.slice(region.end);
  }
  return output;
}
