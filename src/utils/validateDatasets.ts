import { datasets } from '../data/datasets.ts';

export const validateDatasets = (): string[] => {
  const errors: string[] = [];
  const [zenodo, huggingFace] = datasets;
  if (!zenodo?.url.startsWith('https://doi.org/10.5281/zenodo.')) {
    errors.push('Zenodo dataset URL is missing or invalid.');
  }
  if (!huggingFace?.url.startsWith('https://huggingface.co/datasets/')) {
    errors.push('Hugging Face dataset URL is missing or invalid.');
  }
  return errors;
};
