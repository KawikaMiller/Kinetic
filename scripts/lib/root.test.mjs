import { describe, expect, it } from 'vitest';
import { rootMismatch, sameCheckout } from './root.mjs';

describe('sameCheckout', () => {
  it('ignores separators, trailing slashes and case on Windows', () => {
    expect(sameCheckout('C:/Work/kinetic/', 'c:\\work\\Kinetic', 'win32')).toBe(true);
    expect(sameCheckout('C:/Work/kinetic', 'C:/Work/kinetic-wt', 'win32')).toBe(false);
  });

  it('is case-sensitive elsewhere', () => {
    expect(sameCheckout('/home/a/kinetic/', '/home/a/kinetic', 'linux')).toBe(true);
    expect(sameCheckout('/home/a/Kinetic', '/home/a/kinetic', 'linux')).toBe(false);
  });
});

describe('rootMismatch', () => {
  const url = 'http://127.0.0.1:5317';

  it('passes the server that serves this checkout', () => {
    expect(rootMismatch({ root: 'C:/Work/kinetic' }, 'C:\\Work\\kinetic', url, 'win32')).toBeNull();
  });

  it('names both checkouts when another one owns the port', () => {
    const why = rootMismatch({ root: 'C:/Work/other' }, 'C:\\Work\\kinetic', url, 'win32');
    expect(why).toContain('C:/Work/other');
    expect(why).toContain('C:\\Work\\kinetic');
    expect(why).toContain('KINETIC_URL');
  });

  it('refuses a server that cannot say which checkout it is', () => {
    expect(rootMismatch(null, '/k', url, 'linux')).toContain('/__kinetic_root');
    expect(rootMismatch({ root: 42 }, '/k', url, 'linux')).toContain('older checkout');
  });
});
