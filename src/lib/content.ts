import { getCollection, type CollectionEntry } from 'astro:content';

export type DatedCollection = 'writing' | 'notes' | 'projects' | 'lab';

/** Published entries, newest first. Drafts are visible in `astro dev` only. */
export async function getPublished<C extends DatedCollection>(
  collection: C,
): Promise<CollectionEntry<C>[]> {
  const entries = await getCollection(collection, ({ data }) => import.meta.env.DEV || !data.draft);
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

export function readingMinutes(body: string | undefined): number {
  const words = body?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return Math.max(1, Math.round(words / 230));
}

export const SECTION_LABELS: Record<DatedCollection, string> = {
  writing: 'Writing',
  notes: 'Note',
  projects: 'Project',
  lab: 'Experiment',
};
