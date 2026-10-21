import { describe, expect, it } from 'vitest';
import { forbiddenCalls, type ForbiddenCall } from './forbidden';

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

  it('storage and new URL are opt-in, and `allow` lifts a default', () => {
    expect(forbiddenCalls(one('localStorage.getItem("k"); new URL(x)'))).toEqual([]);
    expect(forbiddenCalls(one('localStorage.getItem("k"); new URL(x)'), { also: ['localStorage', 'sessionStorage', 'indexedDB', 'newUrl'] })).toEqual(['./a.ts: localStorage', './a.ts: newUrl']);
    expect(forbiddenCalls(one('eval(fixedProgram)'), { allow: ['eval'] })).toEqual([]);
  });
});
