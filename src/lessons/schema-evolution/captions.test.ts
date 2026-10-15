import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { LESSON_HISTORY, MODES, register, type ASchema } from './avro';
import { avroCaption, protoCaption, rolloutCaption } from './captions';
import { CHANGES as PROTO_CHANGES, DEFAULT_PARAMS, crossBoth, type Format, type Verdict } from './proto';
import { CHANGES, ORDERS, rollout, totalFailures } from './rollout';

const FORMATS: Format[] = ['binary', 'json'];

/** How a caption words each verdict: independent of the model's own strings. */
const WORDS: Record<Verdict, string> = { ok: 'reads cleanly', lossy: 'reads, but a value is wrong and nothing fails', error: 'fails (' };

describe('protobuf captions state what the readings show, for every change and setting', () => {
  it('each direction is described with the words of its own verdict', () => {
    for (const { id } of PROTO_CHANGES) {
      for (const reserved of [false, true]) {
        for (const format of FORMATS) {
          for (const strict of [true, false]) {
            const params = { ...DEFAULT_PARAMS, reserved };
            const text = expectCaption(protoCaption(id, params, format, strict));
            const { crossing, evolved } = crossBoth(id, params, format, strict);
            if (!crossing) {
              expect(text, id).toContain('protoc refuses');
              expect(evolved.refusal).toBeTruthy();
              continue;
            }
            expect(text, `${id} ${format} ${strict} old to new`).toContain(`read by v2 ${WORDS[crossing.oldToNew.verdict]}`);
            expect(text, `${id} ${format} ${strict} new to old`).toContain(`read by v1 ${WORDS[crossing.newToOld.verdict]}`);
          }
        }
      }
    }
  });

  it('pins the sentence for four settings', () => {
    expect(protoCaption('add', DEFAULT_PARAMS, 'binary', true)).toBe(
      'Add a field. In the bytes, a v1 writer read by v2 reads cleanly; a v2 writer read by v1 reads cleanly.',
    );
    expect(protoCaption('rename', DEFAULT_PARAMS, 'binary', true)).toBe(
      "Rename name. In the bytes, a v1 writer read by v2 reads cleanly; a v2 writer read by v1 reads cleanly. The bytes are identical to v1's: nothing on the wire changed.",
    );
    expect(protoCaption('rename', DEFAULT_PARAMS, 'json', true)).toBe(
      'Rename name. In the JSON, a v1 writer read by v2 fails (unknown field "name"); a v2 writer read by v1 fails (unknown field "title").',
    );
    expect(protoCaption('reuse-same', DEFAULT_PARAMS, 'binary', true)).toContain('reads, but a value is wrong and nothing fails');
  });

  it('only a change whose bytes equal the v1 bytes says the bytes did not change', () => {
    for (const { id } of PROTO_CHANGES) {
      const says = protoCaption(id, DEFAULT_PARAMS, 'binary', true).includes('nothing on the wire changed');
      expect(says, id).toBe(id === 'rename');
    }
  });
});

describe('Avro captions follow the registry', () => {
  it('pins the lesson example under every mode', () => {
    const refused = 'v2 is accepted and v3 is refused (v3 cannot read v1 data: b has no default and the writer lacks it)';
    const want: Record<string, string> = {
      NONE: 'NONE: the registry checks nothing, so every version is accepted. The round trips below show what that is worth.',
      BACKWARD: 'Under BACKWARD, v2 is accepted and v3 is accepted.',
      FORWARD: 'Under FORWARD, v2 is accepted and v3 is accepted.',
      FULL: 'Under FULL, v2 is accepted and v3 is accepted.',
      BACKWARD_TRANSITIVE: `Under BACKWARD_TRANSITIVE, ${refused}.`,
      FORWARD_TRANSITIVE: 'Under FORWARD_TRANSITIVE, v2 is accepted and v3 is accepted.',
      FULL_TRANSITIVE: `Under FULL_TRANSITIVE, ${refused}.`,
    };
    for (const m of MODES) expect(expectCaption(avroCaption(m, LESSON_HISTORY)), m).toBe(want[m]);
  });

  it('says refused exactly when a registration is refused, on an edited history', () => {
    const stricter: ASchema[] = LESSON_HISTORY.map((s) => s.map((f) => ({ ...f, type: 'long' as const })));
    stricter[2] = [...stricter[2], { name: 'c', type: 'string', hasDefault: false }];
    for (const m of MODES.filter((x) => x !== 'NONE')) {
      const text = avroCaption(m, stricter);
      expect(text.includes('refused'), m).toBe([1, 2].some((n) => !register(m, stricter, n).accepted));
    }
  });
});

describe('rollout captions', () => {
  it('state the failures of the state shown and the running total, for every change, order and step', () => {
    for (const c of CHANGES) {
      for (const o of ORDERS) {
        const states = rollout(c.id, o.id);
        states.forEach((s, i) => {
          const text = expectCaption(rolloutCaption(states, i));
          if (i === 0) {
            expect(text).toContain('all nine messages decode');
            return;
          }
          expect(text).toContain(`${s.upgraded} moves to schema ${s.hop + 1}`);
          if (s.failures === 0) expect(text).toContain('all 9 messages decode');
          else expect(text).toContain(`${s.failures} of 9 messages fail`);
          const sofar = totalFailures(states.slice(0, i + 1));
          expect(text).toContain(`Failures so far: ${sofar} message${sofar === 1 ? '' : 's'}.`);
        });
      }
    }
  });

  it('pins the first failing step of add tag, no default, consumers first', () => {
    const states = rollout('add-required', 'consumers-first');
    expect(rolloutCaption(states, 1)).toBe(
      "C1 moves to schema 2: 3 of 9 messages fail (C1 cannot read P1's: reader field tag has no default and the writer did not write it). Failures so far: 3 messages.",
    );
  });
});
