import { plural } from '../../core/format';
import { register, type ASchema, type Mode, type Registration } from './avro';
import { CHANGES as PROTO_CHANGES, V1, V1_MESSAGE, crossBoth, encode, type ChangeId, type ChangeParams, type Format, type Reading } from './proto';
import { totalFailures, type State } from './rollout';

/** Captions as plain text, computed from the same readings the screen shows. */

const verdictWords = (r: Reading): string =>
  r.verdict === 'ok' ? 'reads cleanly' : r.verdict === 'lossy' ? 'reads, but a value is wrong and nothing fails' : `fails (${r.findings[0]?.text ?? 'unreadable'})`;

export function protoCaption(change: ChangeId, params: ChangeParams, format: Format, strictJson: boolean): string {
  const label = PROTO_CHANGES.find((c) => c.id === change)!.label;
  const { evolved, crossing } = crossBoth(change, params, format, strictJson);
  if (!crossing || !evolved.schema) return `${label}: ${evolved.refusal ?? 'refused'}.`;
  const where = format === 'binary' ? 'In the bytes' : 'In the JSON';
  const same =
    format === 'binary' && encode(evolved.schema, evolved.message).bytes.join() === encode(V1, V1_MESSAGE).bytes.join()
      ? ' The bytes are identical to v1\'s: nothing on the wire changed.'
      : '';
  return `${label}. ${where}, a v1 writer read by v2 ${verdictWords(crossing.oldToNew)}; a v2 writer read by v1 ${verdictWords(crossing.newToOld)}.${same}`;
}

const registrationWords = (r: Registration): string => {
  if (r.accepted) return `v${r.version + 1} is accepted`;
  const bad = r.checks.find((c) => c.problems.length > 0)!;
  return `v${r.version + 1} is refused (v${bad.reader + 1} cannot read v${bad.writer + 1} data: ${bad.problems[0]})`;
};

export function avroCaption(mode: Mode, versions: readonly ASchema[]): string {
  if (mode === 'NONE') return 'NONE: the registry checks nothing, so every version is accepted. The round trips below show what that is worth.';
  const regs = versions.slice(1).map((_, i) => register(mode, versions, i + 1));
  return `Under ${mode}, ${regs.map((r) => registrationWords(r)).join(' and ')}.`;
}

export function rolloutCaption(states: readonly State[], at: number): string {
  const s = states[at];
  const sofar = totalFailures(states.slice(0, at + 1));
  if (!s.upgraded) return 'All six services run the first schema, and all nine messages decode. Press play to upgrade them one at a time.';
  const first = s.messages.find((m) => m.failed);
  const lost = s.failures === 0 ? 'all 9 messages decode' : `${s.failures} of 9 messages fail (${first!.to} cannot read ${first!.from}'s: ${first!.error})`;
  return `${s.upgraded} moves to schema ${s.hop + 1}: ${lost}. Failures so far: ${plural(sofar, 'message')}.`;
}
