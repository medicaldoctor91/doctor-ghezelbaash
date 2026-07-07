import { getEntry } from 'astro:content';

export type UiCopy = Record<string, unknown>;

export async function getUiCopy<T extends UiCopy = UiCopy>(): Promise<T> {
  const entry = await getEntry('uiCopy', 'site');
  if (!entry) throw new Error('Missing src/content/ui-copy/site.json content collection entry.');
  return entry.data as T;
}
