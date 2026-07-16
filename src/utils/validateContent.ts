import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requiredVisibleFiles } from '../data/sections.ts';

export type ValidationResult = { errors: string[]; warnings: string[] };

export const validateContentInputs = (root = process.cwd()): ValidationResult => {
  const errors: string[] = [];
  for (const file of requiredVisibleFiles) {
    const path = resolve(root, 'src/content/visible', file);
    if (!existsSync(path)) {
      errors.push(`Missing visible-content file: ${file}`);
      continue;
    }
    const text = readFileSync(path, 'utf8');
    if (text.includes('TODO_VISIBLE_CONTENT')) {
      errors.push(`Unresolved visible-content placeholder: ${file}`);
    }
  }
  return { errors, warnings: [] };
};
