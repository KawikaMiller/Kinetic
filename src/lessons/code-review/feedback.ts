/** What makes a review comment useful. Each rewrite option is judged on all four. */
export const QUALITIES = [
  { id: 'what', label: 'Says what is wrong' },
  { id: 'why', label: 'Says why it matters' },
  { id: 'fix', label: 'Suggests a way forward' },
  { id: 'kind', label: 'About the code, not the person' },
] as const;

export type Quality = (typeof QUALITIES)[number]['id'];

export interface Option {
  text: string;
  has: Quality[];
}

export interface HarshComment {
  id: string;
  line: string;
  harsh: string;
  options: Option[];
}

export const HARSH: HarshComment[] = [
  {
    id: 'page',
    line: 'const start = page * PAGE_SIZE;',
    harsh: 'This is wrong. Did you even test this?',
    options: [
      { text: 'Fix the pagination.', has: ['kind'] },
      {
        text: 'page starts at 1, so page 1 skips the newest 20 orders. Could this be (page - 1) * PAGE_SIZE, with a test that checks the first order?',
        has: ['what', 'why', 'fix', 'kind'],
      },
      { text: 'Obviously broken. I would never write it like this.', has: [] },
      { text: 'Pagination is off by one here.', has: ['what', 'kind'] },
    ],
  },
  {
    id: 'name',
    line: 'const d = await db.orders.byUser(userId);',
    harsh: 'Terrible name.',
    options: [
      { text: 'nit: `orders` instead of `d`? The next lines would read more easily.', has: ['what', 'why', 'fix', 'kind'] },
      { text: 'Rename this.', has: ['kind'] },
      { text: 'You always pick bad names.', has: [] },
      { text: '`d` is unclear.', has: ['what', 'kind'] },
    ],
  },
];

/** The option that has every quality: the rewrite to aim for. */
export function bestOption(c: HarshComment): number {
  return c.options.findIndex((o) => QUALITIES.every((q) => o.has.includes(q.id)));
}
