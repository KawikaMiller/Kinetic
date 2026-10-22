import { describe, expect, it } from 'vitest';
import { forbiddenCalls, NO_CLOCK_OR_TIMER, stripComments, type ForbiddenCall } from './forbidden';

const one = (text: string) => ({ './a.ts': text });

describe('forbiddenCalls', () => {
  it('passes clean source and names the file and the call for each violation', () => {
    expect(forbiddenCalls(one('const x = 1;'))).toEqual([]);
    expect(forbiddenCalls({ './a.ts': 'await fetch(url)', './b.ts': 'new Function("return 1")', './c.ts': 'ok' })).toEqual(['./a.ts: fetch', './b.ts: newFunction']);
  });

  it('flags each default call shape', () => {
    const cases: [string, ForbiddenCall][] = [
      ['fetch("/x")', 'fetch'],
      ['new XMLHttpRequest()', 'xhr'],
      ['new WebSocket(u)', 'webSocket'],
      ['navigator.sendBeacon(u)', 'beacon'],
      ['eval(code)', 'eval'],
      ['new Function(code)', 'newFunction'],
    ];
    for (const [text, kind] of cases) expect(forbiddenCalls(one(text))).toEqual([`./a.ts: ${kind}`]);
  });

  it('does not mistake a word that merely contains the name for the call', () => {
    expect(forbiddenCalls(one('prefetch(x); const medieval = 1; retrieval(2)'))).toEqual([]);
  });

  it('clock and timer are opt-in (NO_CLOCK_OR_TIMER), and each call shape is named', () => {
    const text = 'const t = performance.now(); Date.now(); new Date(); setTimeout(f, 1); setInterval(f, 1); requestAnimationFrame(f);';
    expect(forbiddenCalls(one(text))).toEqual([]);
    expect(forbiddenCalls(one(text), { also: NO_CLOCK_OR_TIMER })).toEqual(['./a.ts: clock', './a.ts: timer']);
    for (const call of ['performance.now()', 'Date.now()', 'new Date()']) expect(forbiddenCalls(one(call), { also: ['clock'] })).toEqual(['./a.ts: clock']);
    for (const call of ['setTimeout(f)', 'setInterval(f)', 'requestAnimationFrame(f)']) expect(forbiddenCalls(one(call), { also: ['timer'] })).toEqual(['./a.ts: timer']);
  });

  it('ignoreComments drops block and whole-line comments, but not a call that merely trails code', () => {
    const text = '/* we never call setTimeout */\n// nor Date.now\nconst x = 1; // new Date later\n';
    expect(forbiddenCalls(one(text), { also: NO_CLOCK_OR_TIMER })).toEqual(['./a.ts: clock', './a.ts: timer']);
    expect(forbiddenCalls(one(text), { also: NO_CLOCK_OR_TIMER, ignoreComments: true })).toEqual(['./a.ts: clock']);
    expect(stripComments('a\n  // b\nc /* d */ e')).toBe('a\nc  e');
  });

  it('storage and new URL are opt-in, and `allow` lifts a default', () => {
    expect(forbiddenCalls(one('localStorage.getItem("k"); new URL(x)'))).toEqual([]);
    expect(forbiddenCalls(one('localStorage.getItem("k"); new URL(x)'), { also: ['localStorage', 'sessionStorage', 'indexedDB', 'newUrl'] })).toEqual(['./a.ts: localStorage', './a.ts: newUrl']);
    expect(forbiddenCalls(one('eval(fixedProgram)'), { allow: ['eval'] })).toEqual([]);
  });
});
