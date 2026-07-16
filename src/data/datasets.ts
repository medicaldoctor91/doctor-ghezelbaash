import { SITE_URL } from './doctor.ts';

export const datasets = [
  {
    id: `${SITE_URL}#dataset-zenodo`,
    name: 'Zenodo dataset record for ghezelbaash.ir',
    url: 'https://doi.org/10.5281/zenodo.18765169',
    catalogName: 'Zenodo',
    catalogUrl: 'https://zenodo.org/',
    wikidata: 'https://www.wikidata.org/entity/Q140304972',
  },
  {
    id: `${SITE_URL}#dataset-huggingface`,
    name: 'Hugging Face dataset repository for ghezelbaash.ir',
    url: 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
    catalogName: 'Hugging Face',
    catalogUrl: 'https://huggingface.co/',
  },
] as const;
