// Delivery and materialization policy. Distribution facts are resolved from the graph.
export const machineResourcePolicy = [
  {
    "path": "index.html",
    "source": "dist/index.html",
    "mediaType": "text/html",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "graph.jsonld",
    "rdf": {
      "role": "canonical",
      "format": "json-ld"
    },
    "distributionIri": "https://www.ghezelbaash.ir/graph.jsonld/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "publishInHttpHeader": true,
    "source": "src/data/semantic/knowledge-graph.jsonld",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby",
      "title": "Canonical full knowledge graph — JSON-LD"
    },
    "footerLabel": "JSON-LD"
  },
  {
    "path": "graph.ttl",
    "rdf": {
      "role": "serialization",
      "format": "turtle",
      "isomorphicWith": "graph.jsonld"
    },
    "distributionIri": "https://www.ghezelbaash.ir/graph.ttl/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/semantic/knowledge-graph.ttl",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby",
      "title": "Canonical full knowledge graph — Turtle"
    },
    "footerLabel": "RDF/Turtle",
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "shapes.ttl",
    "rdf": {
      "role": "shapes",
      "format": "turtle"
    },
    "distributionIri": "https://www.ghezelbaash.ir/shapes.ttl/distribution",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/semantic/shapes.ttl",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby",
      "title": "SHACL entity constitution"
    },
    "footerLabel": "SHACL",
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "entity-facts.csv",
    "distributionIri": "https://www.ghezelbaash.ir/entity-facts.csv/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/entity-facts.csv",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby"
    },
    "footerLabel": "CSV facts",
    "mediaTypeParameters": {
      "charset": "utf-8",
      "header": "present"
    }
  },
  {
    "path": "entity-facts.csv-metadata.json",
    "source": ".generated/projections/entity-facts.csv-metadata.json",
    "mediaType": "application/csvm+json",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby",
      "title": "CSVW companion metadata for entity facts"
    }
  },
  {
    "path": "answers.txt",
    "distributionIri": "https://www.ghezelbaash.ir/answers.txt/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/answers.txt",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "alternate"
    },
    "footerLabel": "Answer corpus",
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "fact-map.json",
    "distributionIri": "https://www.ghezelbaash.ir/fact-map.json/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "publishInHttpHeader": true,
    "source": ".generated/projections/fact-map.json",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby",
      "title": "Canonical fact map — answer and evidence bindings"
    },
    "footerLabel": "Fact map"
  },
  {
    "path": "knowledge.xml",
    "distributionIri": "https://www.ghezelbaash.ir/knowledge.xml/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/knowledge.xml",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "alternate"
    },
    "footerLabel": "XML",
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "llms.txt",
    "distributionIri": "https://www.ghezelbaash.ir/llms.txt/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/llms.txt",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby",
      "title": "Machine-readable entity guide"
    },
    "footerLabel": "LLM guide",
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "index.md",
    "distributionIri": "https://www.ghezelbaash.ir/index.md/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/index.md",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "alternate",
      "title": "Markdown projection"
    },
    "mediaTypeParameters": {
      "charset": "utf-8",
      "variant": "GFM"
    }
  },
  {
    "path": "llms-full.txt",
    "distributionIri": "https://www.ghezelbaash.ir/llms-full.txt/download",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/llms-full.txt",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "alternate",
      "title": "Full text projection"
    },
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "provenance.jsonld",
    "rdf": {
      "role": "provenance",
      "format": "json-ld"
    },
    "distributionIri": "https://www.ghezelbaash.ir/provenance.jsonld/distribution",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "publishInHttpHeader": true,
    "source": ".generated/projections/provenance.jsonld",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby",
      "title": "Claim and passage provenance graph"
    },
    "footerLabel": "Provenance"
  },
  {
    "path": "evidence-snapshot.json",
    "distributionIri": "https://www.ghezelbaash.ir/evidence-snapshot.json/distribution",
    "descriptorRoles": [
      "dcat",
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/evidence-snapshot.json",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby",
      "title": "Evidence registry projection"
    }
  },
  {
    "path": "doctor.vcf",
    "source": ".generated/public/doctor.vcf",
    "mediaType": "text/vcard",
    "targets": [
      "website"
    ],
    "materialize": true,
    "head": {
      "rel": "related",
      "title": "Physician vCard"
    },
    "mediaTypeParameters": {
      "charset": "utf-8",
      "version": "4.0"
    }
  },
  {
    "path": "clinic.vcf",
    "source": ".generated/public/clinic.vcf",
    "mediaType": "text/vcard",
    "targets": [
      "website"
    ],
    "materialize": true,
    "head": {
      "rel": "related",
      "title": "Clinic vCard"
    },
    "mediaTypeParameters": {
      "charset": "utf-8",
      "version": "4.0"
    }
  },
  {
    "path": "sitemap.xml",
    "source": ".generated/projections/sitemap.xml",
    "mediaType": "application/xml",
    "targets": [
      "website"
    ],
    "materialize": true,
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "robots.txt",
    "source": "public/robots.txt",
    "mediaType": "text/plain",
    "mediaTypeParameters": {
      "charset": "utf-8"
    },
    "targets": [
      "website"
    ]
  },
  {
    "path": "site.webmanifest",
    "source": "public/site.webmanifest",
    "mediaType": "application/manifest+json",
    "targets": [
      "website"
    ]
  },
  {
    "path": "linkset.json",
    "distributionIri": "https://www.ghezelbaash.ir/linkset.json/download",
    "descriptorRoles": [
      "data-package",
      "croissant"
    ],
    "publishInHttpHeader": true,
    "source": ".generated/projections/linkset.json",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "linkset"
    },
    "footerLabel": "Linkset"
  },
  {
    "path": "datapackage.json",
    "distributionIri": "https://www.ghezelbaash.ir/datapackage.json/download",
    "source": ".generated/projections/datapackage.json",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby"
    },
    "footerLabel": "Data Package"
  },
  {
    "path": "void.ttl",
    "rdf": {
      "role": "void",
      "format": "turtle"
    },
    "distributionIri": "https://www.ghezelbaash.ir/void.ttl/download",
    "descriptorRoles": [
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/void.ttl",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby"
    },
    "footerLabel": "VoID",
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "dcat.ttl",
    "rdf": {
      "role": "dcat",
      "format": "turtle"
    },
    "distributionIri": "https://www.ghezelbaash.ir/dcat.ttl/download",
    "descriptorRoles": [
      "data-package",
      "croissant"
    ],
    "source": ".generated/projections/dcat.ttl",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby"
    },
    "footerLabel": "DCAT 3",
    "mediaTypeParameters": {
      "charset": "utf-8"
    }
  },
  {
    "path": "croissant.json",
    "rdf": {
      "role": "croissant",
      "format": "json-ld"
    },
    "distributionIri": "https://www.ghezelbaash.ir/croissant.json/download",
    "source": ".generated/projections/croissant.json",
    "targets": [
      "website",
      "huggingFace",
      "zenodo"
    ],
    "materialize": true,
    "head": {
      "rel": "describedby"
    },
    "footerLabel": "Croissant 1.1"
  }
];
