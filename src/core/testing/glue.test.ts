import { describe, expect, it } from 'vitest';
import { gluedSentences } from './glue';

describe('gluedSentences', () => {
  it('finds a sentence end with no space after it', () => {
    expect(gluedSentences('Wait on the port.60 s later it times out.')).toEqual(['t on the port.60 s later it']);
    expect(gluedSentences('It is done.Then the next one starts.')).toHaveLength(1);
    expect(gluedSentences('Two tries (both failed).Now what?')).toHaveLength(1);
    expect(gluedSentences('First this;Then that, and so,Finally')).toHaveLength(2);
  });

  it('leaves decimals, hosts, file names and spaced prose alone', () => {
    for (const ok of ['It takes 1.5 s.', 'Ask ns1.example.com first.', 'Open index.js. Then 60 s pass.', 'HTTP/1.1 at 10:30, 1,000 times.', 'e.g. this one',
      'Pick 1.5.0-beta.1 under ^1.4.', 'Serve on localhost:3000.', 'The MAC 00:1a:2b:3c:4d:5e', 'It loads libc.so.6.',
      'Call Intl.NumberFormat once.', 'Read process.env.API_KEY here.', 'Integer.MAX_VALUE + 1']) {
      expect(gluedSentences(ok), ok).toEqual([]);
    }
  });
});
