import { describe, expect, it } from 'vitest';
import { classifyConsole, focusDropped, frozenPlayer, isCrashText, isOffPage, scanResidue, withoutTypedResidue } from './scan.mjs';

const rules = (text) => scanResidue(text).map((h) => h.rule);

describe('scanResidue', () => {
  it('flags every residue shape', () => {
    expect(rules('Load: NaN%')).toContain('NaN');
    expect(rules('limit -Infinity ms')).toContain('Infinity');
    expect(rules('value is undefined')).toContain('undefined');
    expect(rules('item [object Object]')).toContain('[object');
    expect(rules('took null ms')).toContain('null before a unit');
    expect(rules('drop of -0%')).toContain('-0%');
    expect(rules('err 0.000000 left')).toContain('0.000000');
    expect(rules('err 0.0000000000000568')).toContain('float residue (digits after the point beyond nine)');
    expect(rules('err 5.68e-14')).toContain('float residue (e-1x exponent)');
  });

  it('leaves legitimate text alone', () => {
    expect(scanResidue('A null pointer is not a string, and null is falsy. Undefined behaviour in C. 1e-5 and 3.14159, 0.5%.')).toEqual([]);
    expect(scanResidue('Round trip 12.5 ms, -0.5% change, port 8080, 2^128.')).toEqual([]);
  });

  it('a variable named b or s after null is not a unit', () => {
    expect(scanResidue('stack heap a null b null c null obj 0 freed, nulls, null x')).toEqual([]);
    expect(rules('lag null%')).toContain('null before a unit');
  });

  it('does not blame a lesson for echoing back what the sweep typed', () => {
    const echoed = withoutTypedResidue('New seed "NaN" isn\'t a seed. Estimate 4', new Set(['NaN']));
    expect(scanResidue(echoed)).toEqual([]);
    expect(rules(withoutTypedResidue('Estimate NaN', new Set(['1e400'])))).toContain('NaN');
  });

  it('keeps the text around the hit', () => {
    expect(scanResidue('Throughput is NaN requests per second today')[0].context).toContain('Throughput is NaN requests');
  });
});

describe('classifyConsole', () => {
  it('names React render loops, React warnings and everything else, and drops tooling chatter', () => {
    expect(classifyConsole('Maximum update depth exceeded. This can happen when')).toBe('render-loop');
    expect(classifyConsole('Warning: Encountered two children with the same key, `a`.')).toBe('react-warning');
    expect(classifyConsole('Cannot update a component (`A`) while rendering a different component (`B`)')).toBe('react-warning');
    expect(classifyConsole('Received NaN for the `cx` attribute.')).toBe('react-warning');
    expect(classifyConsole('React does not recognize the `fooBar` prop on a DOM element.')).toBe('react-warning');
    expect(classifyConsole('TypeError: x is undefined')).toBe('console');
    expect(classifyConsole('Download the React DevTools for a better development experience')).toBeNull();
    expect(classifyConsole('[vite] connecting...')).toBeNull();
  });
});

describe('the other detectors', () => {
  it('recognises an error boundary', () => {
    expect(isCrashText('This lesson hit an error')).toBe(true);
    expect(isCrashText('Something went wrong')).toBe(true);
    expect(isCrashText('Error handling models')).toBe(false);
  });

  it('a focus drop needs focus to have been on the control first', () => {
    expect(focusDropped({ focused: true }, { dropped: true })).toBe(true);
    expect(focusDropped({ focused: false }, { dropped: true })).toBe(false);
    expect(focusDropped({ focused: true }, { dropped: false })).toBe(false);
  });

  it('a player is frozen when its counter did not move and it is not at the end', () => {
    expect(frozenPlayer({ before: '3/9', after: '3/9', atEnd: false })).toBe(true);
    expect(frozenPlayer({ before: '3/9', after: '4/9', atEnd: false })).toBe(false);
    expect(frozenPlayer({ before: '9/9', after: '9/9', atEnd: true })).toBe(false);
  });

  it('only http(s) and ws(s) requests to other hosts leave the page', () => {
    const base = 'http://127.0.0.1:5317';
    expect(isOffPage('http://127.0.0.1:5317/src/main.tsx', base)).toBe(false);
    expect(isOffPage('ws://127.0.0.1:5317/', base)).toBe(false);
    expect(isOffPage('data:image/png;base64,AAAA', base)).toBe(false);
    expect(isOffPage('https://fonts.googleapis.com/css2?family=Inter', base)).toBe(false);
    expect(isOffPage('https://example.com/track', base)).toBe(true);
    expect(isOffPage('http://127.0.0.1:9999/x', base)).toBe(true);
  });
});
