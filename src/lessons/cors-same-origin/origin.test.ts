import { describe, expect, it } from 'vitest';
import { compareOrigins, originOf } from './origin';

const SCHEMES = ['http', 'https', 'ws', 'wss', 'ftp'];
const HOSTS = ['example.com', 'api.example.com', 'EXAMPLE.com', 'localhost', '127.0.0.1', '[::1]', 'xn--bcher-kva.example'];
const PORTS = ['', ':80', ':443', ':3000', ':21', ':8080'];
const PATHS = ['', '/', '/a/b?x=1#frag'];

const urls = SCHEMES.flatMap((s) => HOSTS.flatMap((h) => PORTS.flatMap((p) => PATHS.map((path) => `${s}://${h}${p}${path}`))));

describe('originOf agrees with the URL API', () => {
  it(`serialises every one of ${urls.length} URLs exactly like URL.origin`, () => {
    for (const url of urls) expect(originOf(url)!.serialized).toBe(new URL(url).origin);
  });
  it('treats non-tuple schemes as opaque ("null"), like URL.origin', () => {
    for (const url of ['file:///C:/app/index.html', 'data:text/html,hi', 'about:blank', 'mailto:a@b.c']) {
      expect(originOf(url)!.opaque).toBe(true);
      expect(originOf(url)!.serialized).toBe(new URL(url).origin);
    }
  });
  it('rejects text that is not an absolute URL', () => {
    expect(originOf('example.com/path')).toBeNull();
  });
});

describe('same-origin comparison', () => {
  it('matches "both origins serialise the same and neither is opaque", for every pair', () => {
    const sample = urls.filter((_, i) => i % 7 === 0);
    for (const a of sample) {
      for (const b of sample) {
        const expected = new URL(a).origin === new URL(b).origin && new URL(a).origin !== 'null';
        expect(compareOrigins(originOf(a)!, originOf(b)!).same).toBe(expected);
      }
    }
  });
  it('fills in default ports: https://a.com and https://a.com:443 are the same origin', () => {
    const c = compareOrigins(originOf('https://a.com')!, originOf('https://a.com:443/x')!);
    expect(c.same).toBe(true);
  });
  it('names the part that differs', () => {
    expect(compareOrigins(originOf('http://a.com')!, originOf('https://a.com')!)).toMatchObject({ same: false, scheme: false, port: false });
    expect(compareOrigins(originOf('http://localhost:3000')!, originOf('http://localhost:5173')!)).toMatchObject({ same: false, host: true, port: false });
    expect(compareOrigins(originOf('https://www.example.com')!, originOf('https://api.example.com')!)).toMatchObject({ same: false, host: false });
  });
  it('never calls an opaque origin the same, even as itself', () => {
    const f = originOf('file:///index.html')!;
    expect(compareOrigins(f, f).same).toBe(false);
  });
});
