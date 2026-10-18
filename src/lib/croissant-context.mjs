// MLCommons Croissant JSON-LD terms (mlcroissant 1.1.1).
// Source: https://github.com/mlcommons/croissant/blob/main/python/mlcroissant/mlcroissant/_src/core/rdf.py
// MLCommons Association and contributors; Apache-2.0.
export const croissantContext = {
  // mlcroissant requires this key; PyLD 3.3 rejects its null initial value.
  // Term-level nulls preserve the existing untagged RDF literals in both readers.
  "@language": "en",
  "@vocab": "https://schema.org/",
  "citeAs": {"@id": "cr:citeAs", "@language": null},
  "column": {"@id": "cr:column", "@language": null},
  "conformsTo": {"@id": "dct:conformsTo", "@language": null},
  "name": {"@id": "sc:name", "@language": null},
  "description": {"@id": "sc:description", "@language": null},
  "contentSize": {"@id": "sc:contentSize", "@language": null},
  "contentUrl": {"@id": "sc:contentUrl", "@language": null},
  "encodingFormat": {"@id": "sc:encodingFormat", "@language": null},
  "propertyID": {"@id": "sc:propertyID", "@language": null},
  "sha256": {"@id": "sc:sha256", "@language": null},
  "value": {"@id": "sc:value", "@language": null},
  "cr": "http://mlcommons.org/croissant/",
  "rai": "http://mlcommons.org/croissant/RAI/",
  "data": {
    "@id": "cr:data",
    "@type": "@json"
  },
  "dataType": {
    "@id": "cr:dataType",
    "@type": "@vocab"
  },
  "dct": "http://purl.org/dc/terms/",
  "equivalentProperty": "cr:equivalentProperty",
  "examples": {
    "@id": "cr:examples",
    "@type": "@json"
  },
  "extract": "cr:extract",
  "field": "cr:field",
  "fileProperty": "cr:fileProperty",
  "fileObject": "cr:fileObject",
  "fileSet": "cr:fileSet",
  "format": "cr:format",
  "includes": "cr:includes",
  "isLiveDataset": "cr:isLiveDataset",
  "jsonPath": "cr:jsonPath",
  "key": "cr:key",
  "md5": "cr:md5",
  "parentField": "cr:parentField",
  "path": "cr:path",
  "recordSet": "cr:recordSet",
  "references": "cr:references",
  "regex": "cr:regex",
  "repeated": "cr:repeated",
  "replace": "cr:replace",
  "samplingRate": "cr:samplingRate",
  "sc": "https://schema.org/",
  "separator": "cr:separator",
  "source": "cr:source",
  "subField": "cr:subField",
  "transform": "cr:transform"
};
