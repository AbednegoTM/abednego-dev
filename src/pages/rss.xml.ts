import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublished } from '../lib/content';

export async function GET(context: APIContext) {
  const [writing, notes] = await Promise.all([getPublished('writing'), getPublished('notes')]);
  const items = [
    ...writing.map(({ id, data }) => ({ ...data, link: `/writing/${id}` })),
    ...notes.map(({ id, data }) => ({ ...data, link: `/notes/${id}` })),
  ]
    .filter((item) => !item.draft)
    .sort((a, b) => b.date.valueOf() - a.date.valueOf())
    .map(({ title, description, date, link, tags }) => ({
      title,
      description,
      pubDate: date,
      link,
      categories: tags,
    }));

  return rss({
    title: 'Abednego Mwanza',
    description: 'Writing and notes on code, systems, life and the questions in between.',
    site: context.site!,
    items,
  });
}
