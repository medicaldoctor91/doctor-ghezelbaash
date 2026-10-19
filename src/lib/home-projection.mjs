/** Page-scoped browser schema; the standalone graph remains the full corpus. */
export function projectHomeGraph(graph, origin) {
  const datasetId = origin + '/graph.jsonld/dataset';
  const keys = {
    [datasetId]: ['@id','@type','name','description','url','identifier','version','creator','publisher','license','isAccessibleForFree','inLanguage','sameAs','distribution'],
    [origin + '/identifier-dataset-zenodo-concept']: ['@id','@type','propertyID','name','value','url'],
    [origin + '/identifier-dataset-zenodo-current-archive']: ['@id','@type','propertyID','name','value','url'],
    [origin + '/webpage']: ['@id','@type','url','name','description','mainEntity','author','publisher','isPartOf','inLanguage','primaryImageOfPage','about','lastReviewed','dateModified'],
    [origin + '/#saeed-ghezelbash']: ['@id','@type','name','givenName','familyName','jobTitle','url','mainEntityOfPage','image','sameAs','practicesAt','workLocation','owns','medicalSpecialty','description','disambiguatingDescription','telephone','address','honorificPrefix','knowsLanguage'],
    [origin + '/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah']: ['@id','@type','name','url','address','telephone','owner','founder','geo','openingHoursSpecification','hasMap','sameAs','medicalSpecialty','description'],
    [origin + '/website']: ['@id','@type','name','url','publisher','about','inLanguage'],
  };
  const byId = new Map(graph['@graph'].map(n => [n['@id'], n]));
  // Identity/image/place nodes are selected only as referenced support, never
  // through reverse edges that import services, answers or machine metadata.
  const supportTypes = new Set(['ImageObject','PostalAddress','GeoCoordinates','OpeningHoursSpecification','Place','City','Country','State','AdministrativeArea']);
  const downloadIds = new Set(graph['@graph'].filter(n => [n['@type']].flat().includes('DataDownload') && [n.contentUrl].flat().includes(origin + '/entity-facts.csv')).map(n => n['@id']));
  const nodes = new Map();
  for (const [id, fields] of Object.entries(keys)) {
    const source = byId.get(id);
    if (!source) throw new Error('Missing home identity ' + id);
    nodes.set(id, Object.fromEntries(fields.filter(k => k in source).map(k => [k, structuredClone(source[k])])));
  }
  const OMIT = Symbol('omit');
  function clean(value) {
    if (Array.isArray(value)) {const result=value.map(clean).filter(v=>v!==OMIT);return result.length?result:OMIT;}
    if (!value || typeof value !== 'object') return value;
    if (Object.keys(value).length===1 && value['@id']?.startsWith(origin+'/')) {
      const id=value['@id'];
      if (!nodes.has(id)) {
        const source=byId.get(id);
        if (!source || (!downloadIds.has(id) && ![source['@type']].flat().some(t=>supportTypes.has(t)))) return OMIT;
        const fields=['@id','@type','name','url','contentUrl','encodingFormat','contentSize','description','caption','width','height','license','acquireLicensePage','creator','copyrightHolder','creditText','address','geo','latitude','longitude','streetAddress','addressLocality','addressRegion','addressCountry','postalCode','dayOfWeek','opens','closes'];
        nodes.set(id,Object.fromEntries(fields.filter(k=>k in source).map(k=>[k,structuredClone(source[k])])));
      }
    }
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='@id'?v:clean(v)]).filter(([,v])=>v!==OMIT));
  }
  for (const [id,node] of nodes) nodes.set(id,clean(node));
  return {'@context':structuredClone(graph['@context']),'@graph':[...nodes.values()]};
}

