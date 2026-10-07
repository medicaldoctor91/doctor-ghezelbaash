import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function importModuleFromSourceDirectory(moduleSource, sourceFile, label = 'derived-module') {
  const sourceDir = path.dirname(sourceFile);
  const temporaryModule = path.join(
    sourceDir,
    `.${label}.${process.pid}.${randomUUID()}.mjs`
  );

  await fs.writeFile(temporaryModule, moduleSource, 'utf8');
  try {
    return await import(pathToFileURL(temporaryModule).href);
  } finally {
    await fs.rm(temporaryModule, { force: true });
  }
}
