const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const refId=value=>typeof value==='string'?value:value?.['@id'];

export function nodeTypes(node){
  return new Set(asArray(node?.['@type']).filter(Boolean));
}

export function isCurrentReleaseBoundNode(node,datasetId){
  const types=nodeTypes(node);
  return (types.has('DataDownload')&&refId(node?.isPartOf)===datasetId)
    ||(types.has('DigitalDocument')&&refId(node?.isBasedOn)===datasetId);
}

export function selectCurrentReleaseBoundNodes(graphOrNodes,datasetId){
  const nodes=Array.isArray(graphOrNodes)?graphOrNodes:(graphOrNodes?.['@graph']||[]);
  return nodes.filter(node=>isCurrentReleaseBoundNode(node,datasetId));
}

export function currentReleaseMetadataMismatches(graphOrNodes,{datasetId,release,dateModified}){
  return selectCurrentReleaseBoundNodes(graphOrNodes,datasetId)
    .filter(node=>node.version!==release||node.dateModified!==dateModified)
    .map(node=>({id:node['@id'],version:node.version??null,dateModified:node.dateModified??null}));
}

export function applyCurrentReleaseMetadata(graphOrNodes,{datasetId,release,dateModified}){
  const selected=selectCurrentReleaseBoundNodes(graphOrNodes,datasetId);
  for(const node of selected){
    node.version=release;
    node.dateModified=dateModified;
  }
  return selected;
}

export function releaseHistoryNodeId(canonicalUrl,release){
  return `${canonicalUrl}graph.jsonld#release-${String(release).replaceAll('.','-')}`;
}
