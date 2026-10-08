import { describe, expect, it } from 'vitest';
import {
  ALL_OFF, LAYER_COMBINATIONS, LAYER_IDS, LONG_SESSION_MIN, SHORT_SESSION_MIN, activeStoppers, layersFromMask, reach, reachedCount, windowText,
  type Layers, type OutcomeId,
} from './defence';
import { SAMPLES } from './contexts';
import { ROUTES, SINKS, hrefVerdict, isWebUrl, keptAsData, throughSink } from './sinks';

const outcome = (l: Layers, id: OutcomeId) => reach(l).find((o) => o.id === id)!;

describe('the reach table, over all 16 layer combinations', () => {
  const all = Array.from({ length: LAYER_COMBINATIONS }, (_, m) => layersFromMask(m));

  it('covers every combination exactly once', () => {
    expect(new Set(all.map((l) => JSON.stringify(l))).size).toBe(LAYER_COMBINATIONS);
  });

  it('with nothing on, everything is reached and a copied session lasts weeks', () => {
    expect(reach(ALL_OFF).every((o) => o.reached)).toBe(true);
    expect(outcome(ALL_OFF, 'reuse').windowMin).toBe(LONG_SESSION_MIN);
  });

  it('a strict CSP keeps the script from running, so nothing else is reached, whatever the other layers say', () => {
    for (const l of all.filter((x) => x.csp)) {
      expect(reachedCount(l)).toBe(0);
      expect(reach(l).every((o) => o.stoppedBy === 'csp')).toBe(true);
    }
  });

  it('HttpOnly hides the cookie but does not stop the script acting as the user', () => {
    for (const l of all.filter((x) => !x.csp && x.httpOnly)) {
      expect(outcome(l, 'readsCookie')).toMatchObject({ reached: false, stoppedBy: 'httpOnly' });
      expect(outcome(l, 'reuse')).toMatchObject({ reached: false, stoppedBy: 'httpOnly' });
      expect(outcome(l, 'actsAsUser').reached).toBe(true);
      expect(outcome(l, 'readsPage').reached).toBe(true);
    }
  });

  it('SameSite changes nothing about what an on-page script reaches', () => {
    for (const l of all) expect(reach({ ...l, sameSite: true })).toEqual(reach({ ...l, sameSite: false }));
  });

  it('short sessions only change how long a copied session works, and only when the cookie was readable', () => {
    for (const l of all) {
      const short = reach({ ...l, shortSession: true });
      const long = reach({ ...l, shortSession: false });
      expect(short.map((o) => o.reached)).toEqual(long.map((o) => o.reached));
      expect(outcome({ ...l, shortSession: true }, 'reuse').windowMin).toBe(outcome({ ...l, shortSession: true }, 'reuse').reached ? SHORT_SESSION_MIN : undefined);
    }
  });

  it('a blocked outcome always names the layer that is on and responsible; a reached one names none', () => {
    for (const l of all) {
      for (const o of reach(l)) {
        if (o.reached) expect(o.stoppedBy).toBeNull();
        else if (o.id !== 'runs' || l.csp) expect(l[o.stoppedBy!]).toBe(true);
      }
    }
  });

  it('the layers credited as active are exactly those that are on and blocked something', () => {
    for (const l of all) {
      const credited = activeStoppers(l);
      for (const id of LAYER_IDS) {
        if (credited.includes(id)) expect(l[id]).toBe(true);
      }
      expect(credited.includes('sameSite')).toBe(false);
      expect(credited.includes('shortSession')).toBe(false);
    }
  });

  it('turning a stopper layer on never reaches more', () => {
    for (const l of all) for (const id of ['csp', 'httpOnly'] as const) expect(reachedCount({ ...l, [id]: true })).toBeLessThanOrEqual(reachedCount({ ...l, [id]: false }));
  });

  it('formats the windows', () => {
    expect(windowText(SHORT_SESSION_MIN)).toBe('15 minutes');
    expect(windowText(LONG_SESSION_MIN)).toBe('30 days');
  });
});

describe('sinks', () => {
  it('safe sinks keep every sample as data and unsafe ones are exactly those that parse it', () => {
    for (const sink of SINKS) {
      for (const s of SAMPLES) {
        const result = throughSink(sink.id, s.value);
        expect(result.parsed).toBe(['innerHTML', 'documentWrite', 'escapeHatch'].includes(sink.id));
        if (sink.safe) expect(keptAsData(sink.id, s.value)).toBe(true);
      }
    }
  });

  it('a parsing sink changes the page only for the sample with tags in it', () => {
    const changed = SAMPLES.filter((s) => !keptAsData('innerHTML', s.value)).map((s) => s.id);
    expect(changed).toEqual(['bold']);
    expect(throughSink('innerHTML', 'use <b>bold</b>').pieces).toEqual([
      { kind: 'element', text: '<b>' },
      { kind: 'text', text: 'use bold' },
    ]);
  });

  it('every unsafe sink offers a replacement and every safe one does not need one', () => {
    for (const sink of SINKS) expect(sink.fix === '').toBe(sink.safe);
  });

  it('the link allow-list accepts web addresses and relative paths, and refuses other schemes', () => {
    expect(isWebUrl('https://shop.example/a?b=1&c=2')).toBe(true);
    expect(isWebUrl('http://shop.example')).toBe(true);
    expect(isWebUrl('/orders/42')).toBe(true);
    expect(isWebUrl('ftp://files.example/readme')).toBe(false);
    expect(isWebUrl('custom-scheme:anything')).toBe(false);
    expect(hrefVerdict('ftp://files.example/readme')).toEqual({ kind: 'other', scheme: 'ftp:' });
    expect(hrefVerdict('see https://shop.example/a').kind).toBe('relative');
    expect(hrefVerdict('https://shop.example/a').kind).toBe('web');
  });

  it('the three routes name where the fix belongs', () => {
    expect(ROUTES.map((r) => r.id)).toEqual(['stored', 'reflected', 'dom']);
    expect(ROUTES.find((r) => r.id === 'dom')!.fixAt).toContain('textContent');
  });
});
