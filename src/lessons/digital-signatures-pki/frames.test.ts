import { beforeAll, describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { chainFrames, chainNodes, signCaption, statuses } from './frames';
import { EXPECTED, REASON_TEXT, makeKeys, scenario, validate, type Keys, type Preset } from './pki';

let keys: Keys;
beforeAll(async () => {
  keys = (await makeKeys())!;
});

describe('chainFrames', () => {
  it('ends every preset on a verdict computed from the validation, never the preset name', async () => {
    for (const preset of Object.keys(EXPECTED) as Preset[]) {
      const s = await scenario(preset, keys);
      const v = await validate(s.chain, s.store, s.host);
      const frames = chainFrames(s, v);
      expect(frames.length).toBe(v.checks.length + 2);
      const last = text(frames.at(-1)!.say);
      if (v.reason === null) expect(last).toContain('Chain valid for shop.example');
      else expect(last).toContain(`Rejected: ${REASON_TEXT[v.reason]}.`);
      if (v.reason !== null) expect(last).not.toContain('Chain valid');
    }
  });

  it('colours nodes from the checks run so far', async () => {
    const s = await scenario('valid', keys);
    const v = await validate(s.chain, s.store, s.host);
    const nodes = chainNodes(s);
    expect(nodes.map((n) => n.kind)).toEqual(['anchor', 'presented', 'presented']);
    expect(Object.values(statuses(nodes, v, 0, false))).toEqual(['unchecked', 'unchecked', 'unchecked']);
    expect(statuses(nodes, v, 1, false).c0).toBe('checking');
    expect(statuses(nodes, v, v.checks.length, true)).toEqual({ anchor: 'ok', c1: 'ok', c0: 'ok' });
  });

  it('marks the failing link red, and a missing intermediate as its own dashed node', async () => {
    const tampered = await scenario('tampered', keys);
    const tv = await validate(tampered.chain, tampered.store, tampered.host);
    const tn = chainNodes(tampered);
    expect(statuses(tn, tv, tv.checks.length, true).c0).toBe('bad');
    const missing = await scenario('missing-intermediate', keys);
    const mv = await validate(missing.chain, missing.store, missing.host);
    const mn = chainNodes(missing);
    expect(mn.map((n) => n.kind)).toEqual(['anchor', 'missing', 'presented']);
    expect(statuses(mn, mv, mv.checks.length, true)).toMatchObject({ missing: 'bad', anchor: 'unchecked' });
    const self = await scenario('self-signed', keys);
    expect(chainNodes(self).map((n) => n.kind)).toEqual(['presented']);
  });
});

describe('signCaption', () => {
  it('only says valid for the valid state', () => {
    expect(text(signCaption('valid'))).toContain('Signature valid');
    for (const s of ['note-edited', 'sig-edited', 'both'] as const) expect(text(signCaption(s))).toContain('Signature invalid');
  });
});
