import {parse} from 'parse5';
import {createHash} from 'node:crypto';
// Exclude synchronized date/author metadata, never clinical prose. The fixture
// was captured from the required starting commit's diagnostic renderer.
export function clinicalCopyFingerprint(html){
 function text(node,parent){
  const attrs=Object.fromEntries((node.attrs??[]).map(a=>[a.name,a.value]));
  if(['head','script','style','template'].includes(node.tagName)||attrs.id==='medical-review-note'||'data-medical-trust' in attrs||'data-medical-review-date' in attrs||node.tagName==='time'&&parent?.attrs?.some(a=>a.name==='class'&&a.value.split(/\s+/).includes('hero-trust-copy')))return '';
  return node.nodeName==='#text'?node.value:(node.childNodes??[]).map(child=>text(child,node)).join('');
 }
 return createHash('sha256').update(text(parse(html)).replace(/\s+/g,' ').trim()).digest('hex');
}
