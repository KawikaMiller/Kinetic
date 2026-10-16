import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeapObject } from './HeapObject';

type Props = Partial<Parameters<typeof HeapObject>[0]>;
const render = (props: Props) =>
  renderToStaticMarkup(createElement('svg', null, createElement(HeapObject, { at: { x: 0, y: 0 }, w: 100, title: 'block', fields: [], ...props })));

describe('HeapObject tone on a freed block', () => {
  it('is always --bad, whatever tone it was given', () => {
    expect(render({ variant: 'freed' })).toContain('tone-bad');
    expect(render({ variant: 'freed', tone: 'muted' })).toContain('tone-bad');
    expect(render({ variant: 'freed', tone: 'muted' })).not.toContain('tone-muted');
  });

  it('takes freedTone instead when one is given, keeping the dashed freed look', () => {
    const html = render({ variant: 'freed', tone: 'muted', freedTone: 'ok' });
    expect(html).toContain('tone-ok');
    expect(html).not.toContain('tone-bad');
    expect(html).toContain('is-freed');
  });

  it('ignores freedTone on live and collectable blocks', () => {
    expect(render({ variant: 'live', tone: 'violet', freedTone: 'ok' })).toContain('tone-violet');
    expect(render({ variant: 'collectable', freedTone: 'ok' })).toContain('tone-info');
  });
});
