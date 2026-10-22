import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EditRow } from './Controls';
import { MAX_NODES } from './model';
import type { ColorEditor } from './useColorEditor';

const editorWith = (nodes: number) => ({ graph: { names: Array.from({ length: nodes }, (_, i) => `n${i}`) }, added: 0, addNode: () => undefined, undo: () => undefined }) as unknown as ColorEditor;
const addNodeTag = (nodes: number) => renderToStaticMarkup(createElement(EditRow, { ed: editorWith(nodes) })).match(/<button[^>]*>\s*Add node/)![0];

describe('the Add node button at the node limit', () => {
  it('is soft-disabled (aria-disabled), never natively disabled: pressing it to reach the limit must not drop keyboard focus to the page', () => {
    expect(addNodeTag(MAX_NODES)).toContain('aria-disabled="true"');
    expect(addNodeTag(MAX_NODES)).not.toMatch(/\sdisabled/);
  });

  it('is a plain button below the limit', () => {
    expect(addNodeTag(MAX_NODES - 1)).not.toContain('aria-disabled');
  });
});
