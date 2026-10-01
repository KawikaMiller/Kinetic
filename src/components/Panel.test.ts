import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Box, SectionTitle, Tray } from './Panel';

// Hyphenated JSX props aren't checked against declared props, so a wrapper that doesn't
// forward them drops aria-label/role/id silently. These render to HTML to prove they arrive.
const attrs = { 'aria-label': 'Order pipeline', role: 'region', id: 'p1', 'data-step': '3' };

describe('panel wrappers forward native attributes to their root element', () => {
  it.each([
    ['Box', () => createElement(Box, { ...attrs, children: 'x' })],
    ['SectionTitle', () => createElement(SectionTitle, { ...attrs, children: 'x' })],
    ['Tray', () => createElement(Tray, { ...attrs, children: 'x' })],
  ])('%s', (_, render) => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain('aria-label="Order pipeline"');
    expect(html).toContain('role="region"');
    expect(html).toContain('id="p1"');
    expect(html).toContain('data-step="3"');
  });

  it('keeps its own classes alongside the caller\'s and still honours style', () => {
    const html = renderToStaticMarkup(createElement(Box, { variant: 'sunken', className: 'mine', style: { width: 10 }, children: 'x' }));
    expect(html).toContain('class="box box-sunken mine"');
    expect(html).toContain('style="width:10px"');
  });

  it("Tray's ariaLabel prop still works", () => {
    expect(renderToStaticMarkup(createElement(Tray, { ariaLabel: 'Output', children: 'x' }))).toContain('aria-label="Output"');
  });
});
