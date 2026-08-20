const compact=value=>String(value).replace(/\s+/g,'').toLowerCase();

function findBoundary(source,start){
  let quote='',escape=false,round=0,square=0;
  for(let index=start;index<source.length;index++){
    const char=source[index];
    if(quote){
      if(escape)escape=false;
      else if(char==='\\')escape=true;
      else if(char===quote)quote='';
      continue;
    }
    if(char==='"'||char==="'"){quote=char;continue}
    if(char==='(')round++;
    else if(char===')')round=Math.max(0,round-1);
    else if(char==='[')square++;
    else if(char===']')square=Math.max(0,square-1);
    else if(round===0&&square===0&&(char==='{'||char===';'))return {index,char};
  }
  return null;
}

function closingBrace(source,open){
  let depth=1,quote='',escape=false;
  for(let index=open+1;index<source.length;index++){
    const char=source[index];
    if(quote){
      if(escape)escape=false;
      else if(char==='\\')escape=true;
      else if(char===quote)quote='';
      continue;
    }
    if(char==='"'||char==="'"){quote=char;continue}
    if(char==='{')depth++;
    else if(char==='}'&&--depth===0)return index;
  }
  throw new Error('Unclosed CSS block');
}

function splitTopLevel(value,delimiter){
  const parts=[];let start=0,quote='',escape=false,round=0,square=0;
  for(let index=0;index<value.length;index++){
    const char=value[index];
    if(quote){if(escape)escape=false;else if(char==='\\')escape=true;else if(char===quote)quote='';continue}
    if(char==='"'||char==="'"){quote=char;continue}
    if(char==='(')round++;else if(char===')')round=Math.max(0,round-1);else if(char==='[')square++;else if(char===']')square=Math.max(0,square-1);
    else if(char===delimiter&&round===0&&square===0){parts.push(value.slice(start,index));start=index+1}
  }
  parts.push(value.slice(start));return parts;
}

function declarations(body){
  const out={};
  for(const entry of splitTopLevel(body,';')){
    let quote='',escape=false,round=0,square=0,colon=-1;
    for(let index=0;index<entry.length;index++){
      const char=entry[index];
      if(quote){if(escape)escape=false;else if(char==='\\')escape=true;else if(char===quote)quote='';continue}
      if(char==='"'||char==="'"){quote=char;continue}
      if(char==='(')round++;else if(char===')')round=Math.max(0,round-1);else if(char==='[')square++;else if(char===']')square=Math.max(0,square-1);else if(char===':'&&round===0&&square===0){colon=index;break}
    }
    if(colon<0)continue;
    const property=entry.slice(0,colon).trim().toLowerCase();
    const value=entry.slice(colon+1).trim();
    if(property)out[property]=value;
  }
  return out;
}

export function parseCssRules(css){
  const source=String(css).replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=[];let order=0;
  const parse=(segment,conditions=[])=>{
    let cursor=0;
    while(cursor<segment.length){
      while(/\s/.test(segment[cursor]||''))cursor++;
      const boundary=findBoundary(segment,cursor);if(!boundary)break;
      const prelude=segment.slice(cursor,boundary.index).trim();
      if(boundary.char===';'){cursor=boundary.index+1;continue}
      const close=closingBrace(segment,boundary.index),body=segment.slice(boundary.index+1,close);
      if(prelude.startsWith('@')){
        if(/^@(media|supports|layer|container)\b/i.test(prelude))parse(body,[...conditions,prelude]);
      }else{
        const decl=declarations(body);
        for(const selector of splitTopLevel(prelude,',').map(value=>value.trim()).filter(Boolean))rules.push({selector,conditions:[...conditions],declarations:{...decl},order:order++});
      }
      cursor=close+1;
    }
  };
  parse(source);return rules;
}

export function selectorRules(rules,selector){
  return rules.filter(rule=>compact(rule.selector)===compact(selector));
}

export function isMaxWidthRule(rule,widthPx){
  return rule.conditions.some(condition=>compact(condition).includes(`max-width:${widthPx}px`));
}

export function mediaRuleAppliesAtWidth(rule,widthPx,{rootFontPx=16}={}){
  const media=rule.conditions.filter(condition=>/^\s*@media\b/i.test(condition));
  if(!media.length)return false;
  const toPx=(number,unit)=>Number(number)*(unit.toLowerCase()==='rem'?rootFontPx:1);
  let widthConstraintCount=0;
  const applies=media.every(condition=>{
    const matches=[...condition.matchAll(/\((min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px|rem)\)/gi)];
    widthConstraintCount+=matches.length;
    for(const match of matches){
      const boundary=toPx(match[2],match[3]);
      if(match[1].toLowerCase()==='min'&&widthPx<boundary)return false;
      if(match[1].toLowerCase()==='max'&&widthPx>boundary)return false;
    }
    return true;
  });
  return applies&&widthConstraintCount>0;
}

export function compactCssValue(value){return compact(value)}
