import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { ChipButton, Hint, Segmented } from './ui';

describe('ChipButton onClick', () => {
  it('hands the click event to the handler, so it can read e.currentTarget instead of document.activeElement', () => {
    const seen: unknown[] = [];
    const chip = ChipButton({ onClick: (e) => seen.push(e.currentTarget), children: 'x' });
    const target = { id: 'chip' };
    chip.props.onClick({ currentTarget: target });
    expect(seen).toEqual([target]);
  });
});

describe('Segmented with boolean values', () => {
  const html = (value: boolean) =>
    renderToStaticMarkup(createElement(Segmented<boolean>, { value, onChange: () => undefined, options: [{ value: true, label: 'Right' }, { value: false, label: 'Wrong' }] }));

  it('marks the option equal to the value, and false is a real choice rather than "no value"', () => {
    expect(html(true)).toMatch(/class="on"[^>]*>Right/);
    expect(html(false)).toMatch(/class="on"[^>]*>Wrong/);
    expect(html(false)).not.toMatch(/class="on"[^>]*>Right/);
  });
});

describe('Hint tone', () => {
  const classOf = (props: Parameters<typeof Hint>[0]) => renderToStaticMarkup(Hint(props)).match(/class="([^"]*)"/)![1].split(' ');

  it('is faint by default and has a class only for the other tones', () => {
    expect(classOf({ children: 'x' })).toEqual(['hint']);
    expect(classOf({ tone: 'muted', children: 'x' })).toEqual(['hint', 'is-muted']);
    expect(classOf({ tone: 'bad', children: 'x' })).toEqual(['hint', 'is-bad']);
  });

  it('keeps block and the caller class next to the tone', () => {
    expect(classOf({ tone: 'bad', block: true, className: 'mine', children: 'x' })).toEqual(['hint', 'is-bad', 'is-block', 'mine']);
  });
});
