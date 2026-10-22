import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Player } from '../core/usePlayer';
import type { Frame } from '../core/types';
import { Transport } from './Transport';

const COUNT = 5;
const player = (index: number): Player<Frame> => ({
  frame: {}, index, count: COUNT, playing: false, atEnd: index === COUNT - 1, speed: 1,
  setSpeed: () => undefined, play: () => undefined, pause: () => undefined, toggle: () => undefined,
  step: () => undefined, seek: () => undefined, restart: () => undefined, queueNext: () => undefined,
});

/** The opening tag of the button with this title. */
const tag = (index: number, title: string) => renderToStaticMarkup(createElement(Transport, { player: player(index) })).match(new RegExp(`<button[^>]*title="${title}[^"]*"[^>]*>`))![0];

describe('Transport step buttons at the ends', () => {
  it('are soft-disabled (aria-disabled), never natively disabled: a native disabled button drops keyboard focus to the body', () => {
    for (const [index, title] of [[0, 'Step back'], [COUNT - 1, 'Step forward']] as const) {
      expect(tag(index, title)).toContain('aria-disabled="true"');
      expect(tag(index, title)).not.toMatch(/\sdisabled/);
    }
  });

  it('are plain buttons in the middle of the run', () => {
    for (const title of ['Step back', 'Step forward']) {
      expect(tag(2, title)).not.toContain('aria-disabled');
    }
  });

  it('only the end that has run out is soft-disabled', () => {
    expect(tag(0, 'Step forward')).not.toContain('aria-disabled');
    expect(tag(COUNT - 1, 'Step back')).not.toContain('aria-disabled');
  });
});
