import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Hint } from './ui';

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
