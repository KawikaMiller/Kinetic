import { describe, expect, it } from 'vitest';
import { recoverRoute } from './route.mjs';

describe('recoverRoute', () => {
  it('passes ordinary routes through untouched', () => {
    expect(recoverRoute('/lesson/raft')).toEqual({ route: '/lesson/raft', rewritten: false });
    expect(recoverRoute('/')).toEqual({ route: '/', rewritten: false });
  });

  it('recovers a lesson route Git Bash turned into a Windows path', () => {
    expect(recoverRoute('C:/Program Files/Git/lesson/sorting')).toEqual({ route: '/lesson/sorting', rewritten: true });
    expect(recoverRoute('C:\\Program Files\\Git\\lesson\\dom-events')).toEqual({ route: '/lesson/dom-events', rewritten: true });
  });

  it('falls back to the home route when nothing recognisable is left', () => {
    expect(recoverRoute('C:/Program Files/Git/')).toEqual({ route: '/', rewritten: true });
  });
});
