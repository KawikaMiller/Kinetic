import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { frames, ladder, requestStep, stepCaption, verdictOf } from './frames';
import { LINE_OF, SESSION_VALUE, activeDefences, allConfigs, evaluate, serverLines } from './model';
import { cookieLineIndex, requestLines, serverLineStates } from './panels';

const all = allConfigs();

describe('ladder and frames, across all 144 configurations', () => {
  it('has one frame per message, each with its own true caption', () => {
    for (const c of all) {
      const l = ladder(c);
      const f = frames(c);
      expect(f.length).toBe(l.length);
      f.forEach((frame, i) => {
        expect(frame.step).toBe(i);
        expectCaption(frame.say);
      });
    }
  });

  it('is 6 messages, or 7 when the browser asks first', () => {
    for (const c of all) expect(ladder(c).length).toBe(evaluate(c).preflight ? 7 : 6);
  });

  it('the last caption states the outcome the model computed', () => {
    for (const c of all) {
      const o = evaluate(c);
      const last = expectCaption(frames(c).at(-1)!.say);
      if (o.harm) expect(last).toContain('Accepted');
      else expect(last).not.toContain('Accepted');
      if (o.preflight) expect(last).toContain('Blocked by the browser');
      if (o.stoppedAt === 'origin') expect(last).toContain('Origin check');
      if (o.stoppedAt === 'token') expect(last).toContain('CSRF token check');
      if (o.stoppedAt === 'header') expect(last).toContain('no custom header');
      if (o.stoppedAt === 'no-credential') expect(last).toContain('logged out');
    }
  });

  it('the request caption and arrow note agree with whether the cookie was attached', () => {
    for (const c of all) {
      const o = evaluate(c);
      const l = ladder(c);
      const req = l[requestStep(c)];
      const caption = expectCaption(stepCaption(c, 'request'));
      if (o.preflight) continue;
      expect(caption.includes('Your cookie is attached')).toBe(o.cookieSent);
      expect(req.note?.startsWith('Cookie attached')).toBe(o.cookieSent);
      if (c.auth === 'bearer') expect(caption).toContain('by hand');
    }
  });

  it('the reply message tone and label match the verdict', () => {
    for (const c of all) {
      const o = evaluate(c);
      if (o.preflight) {
        expect(ladder(c).at(-1)!.lost).toBe(true);
        expect(verdictOf(o)).toBe('never sent');
        continue;
      }
      const reply = ladder(c).at(-1)!;
      expect(reply.tone).toBe(o.harm ? 'bad' : 'ok');
      expect(reply.label.startsWith(o.harm ? '200' : o.stoppedAt === 'no-credential' ? '401' : '403')).toBe(true);
      expect(verdictOf(o)).toBe(o.harm ? 'accepted' : 'rejected');
    }
  });
});

describe('panels', () => {
  it('the cookie header is present exactly when the model says the cookie was sent', () => {
    for (const c of all) {
      const o = evaluate(c);
      const lines = requestLines(c, o);
      expect(cookieLineIndex(lines) >= 0).toBe(o.cookieSent);
      if (o.cookieSent) expect(lines[cookieLineIndex(lines)]).toBe(`Cookie: session=${SESSION_VALUE}`);
      expect(lines.some((l) => l.includes('Cookie') && l.startsWith('('))).toBe(!o.cookieSent && !o.preflight && c.auth === 'cookie');
    }
  });

  it('a link click carries a Referer, not an Origin, and no body headers', () => {
    for (const c of all.filter((x) => x.kind === 'link' && !evaluate(x).preflight)) {
      const lines = requestLines(c, evaluate(c));
      expect(lines[0].startsWith('GET ')).toBe(true);
      expect(lines.some((l) => l.startsWith('Referer: '))).toBe(true);
      expect(lines.some((l) => l.startsWith('Origin: ') || l.startsWith('Content-Type'))).toBe(false);
    }
  });

  it('server lines: cut where the defence is off, one rejecting line when it rejects, a bad change line only on harm', () => {
    for (const c of all) {
      const o = evaluate(c);
      const arrived = serverLineStates(c, o, true);
      const before = serverLineStates(c, o, false);
      expect(arrived.length).toBe(serverLines(c.kind).length);
      const active = activeDefences(c);
      for (const [line, on] of [[LINE_OF.origin, active.origin], [LINE_OF.token, active.token], [LINE_OF.header, active.header]] as const) {
        expect(arrived[line] === 'cut').toBe(!on);
        expect(before[line] === 'cut').toBe(!on);
      }
      expect(before.filter((s) => s !== 'cut').every((s) => s === 'idle')).toBe(true);
      expect(arrived.filter((s) => s === 'now').length).toBe(o.sent && !o.harm ? 1 : 0);
      expect(arrived[LINE_OF.change]).toBe(o.harm ? 'bad' : 'idle');
    }
  });
});
