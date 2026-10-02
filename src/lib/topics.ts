export const TOPICS = {
  engineering: 'Engineering',
  life: 'Life',
  'philosophy-faith': 'Philosophy & faith',
  'science-universe': 'Science & the universe',
} as const;

export type Topic = keyof typeof TOPICS;

export const TOPIC_SLUGS = Object.keys(TOPICS) as [Topic, ...Topic[]];
