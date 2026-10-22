import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EditRow } from './Controls';
import { MAX_SIDE } from './model';
import type { MatchEditor } from './useMatchEditor';

const editorWith = (workers: number, jobs: number) => ({ graph: { workers, jobs }, addWorker: () => undefined, removeWorker: () => undefined, addJob: () => undefined, removeJob: () => undefined }) as unknown as MatchEditor;
const tag = (workers: number, jobs: number, label: string) => renderToStaticMarkup(createElement(EditRow, { ed: editorWith(workers, jobs) })).match(new RegExp(`<button[^>]*>\\s*${label}`))![0];

describe('the add and remove buttons at their limits', () => {
  it('are soft-disabled (aria-disabled), never natively disabled: pressing one to reach the limit must not drop keyboard focus to the page', () => {
    expect(tag(MAX_SIDE, MAX_SIDE, 'Add worker')).toContain('aria-disabled="true"');
    expect(tag(MAX_SIDE, MAX_SIDE, 'Add job')).toContain('aria-disabled="true"');
    expect(tag(1, 1, 'Remove last worker')).toContain('aria-disabled="true"');
    expect(tag(1, 1, 'Remove last job')).toContain('aria-disabled="true"');
    for (const [w, j, label] of [[MAX_SIDE, MAX_SIDE, 'Add worker'], [MAX_SIDE, MAX_SIDE, 'Add job'], [1, 1, 'Remove last worker'], [1, 1, 'Remove last job']] as const) {
      expect(tag(w, j, label), label).not.toMatch(/\sdisabled/);
    }
  });

  it('are plain buttons between the limits', () => {
    for (const label of ['Add worker', 'Add job', 'Remove last worker', 'Remove last job']) expect(tag(3, 3, label), label).not.toContain('aria-disabled');
  });
});
