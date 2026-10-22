import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyClassify, pickCategory, type ClassifyState } from '../core/classify';
import { ClassifyBoard, type ClassifyCategory, type ClassifyItem, type ClassifyVerdictInfo } from './ClassifyBoard';

const CATS: ClassifyCategory[] = [
  { id: 'reg', label: 'Regular' },
  { id: 'cf', label: 'Context-free' },
  { id: 'cs', label: 'Context-sensitive' },
];
const ITEMS: ClassifyItem[] = [
  { id: 'one', label: 'a*b*', explanation: 'Two loops, no counting.' },
  { id: 'two', label: createElement('em', null, 'aⁿbⁿ'), text: 'a to the n b to the n' },
  { id: 'three', label: 'aⁿbⁿcⁿ' },
];
const KEY = { one: 'reg', two: 'cf', three: 'cs' };

interface CheckOverrides {
  categories?: ClassifyCategory[];
  labelFont?: 'mono' | 'text';
  status?: 'polite' | 'off';
  groupLabel?: (item: ClassifyItem) => string;
  verdict?: (info: ClassifyVerdictInfo) => ReactNode;
}
const render = (value: ClassifyState, props: CheckOverrides = {}) =>
  renderToStaticMarkup(createElement(ClassifyBoard, { items: ITEMS, categories: CATS, answerKey: KEY, value, onChange: () => {}, ...props }));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('ClassifyBoard markup', () => {
  it('draws one radio group per item and one radio per category', () => {
    const html = render(emptyClassify(ITEMS));
    expect(count(html, 'role="radiogroup"')).toBe(3);
    expect(count(html, 'role="radio"')).toBe(9);
  });

  it('names each group from the string label, the explicit text, or the id', () => {
    const html = render(emptyClassify(ITEMS));
    expect(html).toContain('aria-label="Category of a*b*"');
    expect(html).toContain('aria-label="Category of a to the n b to the n"');
    expect(html).toContain('aria-label="Category of aⁿbⁿcⁿ"');
    expect(render(emptyClassify(ITEMS), { groupLabel: (i) => `Pick for ${i.id}` })).toContain('aria-label="Pick for one"');
  });

  it('keeps one tab stop per row: the chosen category, or the first when nothing is chosen', () => {
    const stops = (html: string) => (html.match(/<button[^>]*role="radio"[^>]*>/g) ?? []).filter((tag) => tag.includes('tabindex="0"'));
    expect(stops(render(emptyClassify(ITEMS)))).toHaveLength(3);
    const picked = render(pickCategory(emptyClassify(ITEMS), 'one', 'cs'));
    expect(stops(picked)).toHaveLength(3);
    expect(stops(picked).filter((tag) => tag.includes('aria-checked="true"'))).toHaveLength(1);
  });

  it('works with two and with five categories', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, label: `Cat ${i}` }));
    expect(count(render(emptyClassify(ITEMS), { categories: five }), 'role="radio"')).toBe(15);
    expect(count(render(emptyClassify(ITEMS), { categories: CATS.slice(0, 2) }), 'role="radio"')).toBe(6);
  });

  it('renders a node label as given and a mono label as <code>', () => {
    expect(render(emptyClassify(ITEMS))).toContain('<em>aⁿbⁿ</em>');
    expect(render(emptyClassify(ITEMS), { labelFont: 'mono' })).toContain('<code class="classify-label is-mono">');
  });

  it('offers Why only on items that have an explanation', () => {
    expect(count(render(emptyClassify(ITEMS)), 'Why?')).toBe(1);
  });
});

describe('ClassifyBoard verdicts and live region', () => {
  const checked: ClassifyState = { answers: { one: 'reg', two: 'reg', three: null }, checked: true };

  it('shows a verdict per item only after Check, and marks right and wrong rows', () => {
    const html = render(checked);
    expect(html).toContain('Right.');
    expect(html).toContain('Not quite: it is context-free.');
    expect(html).toContain('Not sorted: it is context-sensitive.');
    expect(count(html, 'is-right')).toBe(1);
    expect(count(html, 'is-wrong')).toBe(2);
    expect(render({ ...checked, checked: false })).not.toContain('Not quite');
  });

  it('announces once: the score line is the only live region, whatever the item count', () => {
    const html = render(checked);
    expect(count(html, 'role="status"')).toBe(1);
    expect(html).toContain('1 of 3 right');
    expect(render(emptyClassify(ITEMS))).toContain('0 of 3 sorted');
  });

  it("status 'off' removes the live region", () => {
    expect(render(checked, { status: 'off' })).not.toContain('role="status"');
  });

  it('lets a lesson word its own verdicts', () => {
    const html = render(checked, { verdict: ({ right, correct }) => (right ? 'yes' : `no, ${correct.id}`) });
    expect(html).toContain('no, cf');
    expect(html).toContain('>yes<');
  });
});

describe('ClassifyBoard explore mode (K4-10): no key, no score, no verdict', () => {
  const renderExplore = (value: ClassifyState, props: { reference?: Record<string, string>; status?: 'polite' | 'off'; statusText?: (info: { placed: number; total: number }) => string } = {}) =>
    renderToStaticMarkup(createElement(ClassifyBoard, { mode: 'explore', items: ITEMS, categories: CATS, value, onChange: () => {}, ...props }));
  const placedAll: ClassifyState = { answers: { one: 'cs', two: 'reg', three: 'cf' }, checked: false };

  it('draws the same radio rows as check mode but no Check button, and reports placements instead of a score', () => {
    const html = renderExplore(emptyClassify(ITEMS));
    expect(count(html, 'role="radiogroup"')).toBe(3);
    expect(count(html, 'role="radio"')).toBe(9);
    expect(html).not.toContain('>Check<');
    expect(html).toContain('>Reset<');
    expect(html).toContain('0 of 3 placed');
    expect(html).not.toMatch(/right|sorted|Not quite|Not sorted/);
    expect(renderExplore(placedAll)).toContain('3 of 3 placed');
  });

  it('statusText replaces the status line, and the default stays "N of M placed"', () => {
    const html = renderExplore(placedAll, { statusText: ({ placed, total }) => `${placed} of ${total} moved` });
    expect(html).toContain('3 of 3 moved');
    expect(html).not.toContain('3 of 3 placed');
  });

  it('never marks a row right or wrong, not even when a stale checked flag is passed in', () => {
    const html = renderExplore({ ...placedAll, checked: true });
    expect(html).not.toContain('is-right');
    expect(html).not.toContain('is-wrong');
    expect(html).not.toMatch(/Right\.|Not quite|Not sorted|of 3 right/);
  });

  it('keeps one tab stop per row and still offers Why? where an item has an explanation', () => {
    const html = renderExplore(placedAll);
    const stops = (html.match(/<button[^>]*role="radio"[^>]*>/g) ?? []).filter((tag) => tag.includes('tabindex="0"'));
    expect(stops).toHaveLength(3);
    expect(count(html, 'Why?')).toBe(1);
  });

  it('has no reference button unless a reference is given', () => {
    expect(renderExplore(placedAll)).not.toContain('reference');
    expect(renderExplore(placedAll)).not.toContain('claim-label');
  });

  it('with a reference, the button is there but inert (aria-disabled, still focusable) until everything is placed, and says why', () => {
    const reference = { one: 'reg', two: 'cf', three: 'cs' };
    const early = renderExplore(pickCategory(emptyClassify(ITEMS), 'one', 'reg'), { reference });
    expect(early).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Show one reference<\/button>/);
    expect(early).toContain('1 of 3 placed: place every item to see a reference');
    const full = renderExplore(placedAll, { reference });
    expect(full).toContain('>Show one reference<');
    expect(full).not.toMatch(/<button[^>]*aria-disabled="true"[^>]*>Show one reference/);
    expect(full).toContain('3 of 3 placed');
    expect(full).not.toContain('Reference:');
    expect(full).not.toContain('claim-label');
  });

  it("status 'off' removes the live region in explore mode too", () => {
    expect(renderExplore(placedAll, { status: 'off' })).not.toContain('role="status"');
    expect(count(renderExplore(placedAll), 'role="status"')).toBe(1);
  });
});
