import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Box, SectionTitle, Tray } from './Panel';

// Hyphenated JSX props aren't checked against declared props, so a wrapper that doesn't
// forward them drops aria-label/role/id silently. These render to HTML to prove they arrive.
// The wrappers are stateless, so the tests call them directly.
const attrs = { 'aria-label': 'Order pipeline', role: 'region', id: 'p1', 'data-step': '3' };
const html = (el: ReturnType<typeof Box>) => renderToStaticMarkup(el);

describe('panel wrappers forward native attributes to their root element', () => {
  it.each([
    ['Box', () => Box({ ...attrs, children: 'x' })],
    ['SectionTitle', () => SectionTitle({ ...attrs, children: 'x' })],
    ['Tray', () => Tray({ ...attrs, children: 'x' })],
  ])('%s', (_, render) => {
    const out = html(render());
    expect(out).toContain('aria-label="Order pipeline"');
    expect(out).toContain('role="region"');
    expect(out).toContain('id="p1"');
    expect(out).toContain('data-step="3"');
  });

  it("keeps its own classes alongside the caller's and still honours style", () => {
    const out = html(Box({ variant: 'sunken', className: 'mine', style: { width: 10 }, children: 'x' }));
    expect(out).toContain('class="box box-sunken mine"');
    expect(out).toContain('style="width:10px"');
  });

  it("Tray's ariaLabel prop still works", () => {
    expect(html(Tray({ ariaLabel: 'Output', children: 'x' }))).toContain('aria-label="Output"');
  });
});
