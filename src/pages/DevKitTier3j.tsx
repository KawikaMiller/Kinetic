import { useState } from 'react';
import { HeapObject } from '../components/memory';
import { SectionTitle } from '../components/Panel';
import { bitLength } from '../core/bits';
import { ksAgainstSorted, ksCritical2, ksTwoSample } from '../core/distributions';
import { ipToString, ipv4, longestPrefixMatch, type Route } from '../core/ipv4';
import { parseBoundedList, parseKitRows, type TokenRule } from '../core/parseKit';
import { bootstrapMeanInterval, gini } from '../core/stats';
import { bm25Scores, buildTermIndex, tfidfScores } from '../core/tfidf';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 7 to 8, agent J (#/dev/kit). */

const PDA_TOKENS: TokenRule[] = [
  { kind: 'arrow', pattern: /->/ },
  { kind: 'word', pattern: /[\p{L}\p{N}_]+/u },
];
const PDA_START = 'q0 a Z -> q0 AZ\nq0 b A -> q1\n  q1 ? A -> q1';
const PDA_LIMITS = { maxRows: 5, maxLineChars: 30, noun: { one: 'transition', many: 'transitions' } };
const EDITOR_ROWS = 4;

function RowsDemo() {
  const [text, setText] = useState(PDA_START);
  const read = parseKitRows(text, {
    ...PDA_LIMITS,
    tokens: PDA_TOKENS,
    row: (cursor) => {
      const from = cursor.accept('word');
      const input = cursor.accept('word');
      const pop = cursor.accept('word');
      if (!from || !input || !pop) return cursor.fail('expected: state input pop -> state push');
      if (!cursor.accept('arrow')) return cursor.fail('expected "->" after the pop symbol');
      const to = cursor.accept('word');
      if (!to) return cursor.fail('a transition needs a next state');
      return { ok: true, value: `${from.text}, ${input.text}, ${pop.text} -> ${to.text}${cursor.accept('word')?.text ?? ''}` };
    },
  });
  return (
    <>
      <textarea className="mono" aria-label="PDA transition rows" rows={EDITOR_ROWS} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', maxWidth: 360 }} />
      <p className="mono">{read.ok ? `${read.rows.length} transitions read` : read.error}</p>
    </>
  );
}

function ListDemo() {
  const asked = ['3, 1, 4', '3', '3, 1, 99', 'a, b'];
  return (
    <>
      {asked.map((text) => {
        const r = parseBoundedList(text, { min: 2, max: 6, lo: 0, hi: 50, noun: 'values' });
        return (
          <p className="mono" key={text}>
            {text} {'->'} {r.ok ? `[${r.value.join(', ')}]` : r.error}
          </p>
        );
      })}
    </>
  );
}

type Hop = Route & { via: string };
const TABLE: Hop[] = [
  { net: ipv4('0.0.0.0'), prefix: 0, via: 'default' },
  { net: ipv4('10.0.0.0'), prefix: 8, via: 'core' },
  { net: ipv4('10.1.0.0'), prefix: 16, via: 'site' },
  { net: ipv4('10.1.2.7'), prefix: 32, via: 'host' },
];

function RouteDemo() {
  return (
    <>
      {['10.1.2.7', '10.1.9.9', '10.200.0.1', '8.8.8.8'].map((a) => (
        <p className="mono" key={a}>
          {a} {'->'} {longestPrefixMatch(TABLE, ipv4(a))?.via ?? 'no route'} (of {TABLE.map((r) => `${ipToString(r.net)}/${r.prefix}`).join(' ')})
        </p>
      ))}
    </>
  );
}

const SAMPLE_A = [0.1, 0.4, 0.4, 0.9, 1.3, 2.2];
const SAMPLE_B = [0.5, 0.8, 1.9, 2.4, 3.1, 3.3, 4];
const BOOTSTRAP_RESAMPLES = 500;
const BOOTSTRAP_SEED = 3;

function StatsDemo() {
  const ci = bootstrapMeanInterval(SAMPLE_A, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED);
  return (
    <>
      <p className="mono">
        ksTwoSample = {ksTwoSample(SAMPLE_A, SAMPLE_B).toFixed(3)} · presorted baseline = {ksAgainstSorted(SAMPLE_A, SAMPLE_B).toFixed(3)} · 5% critical = {ksCritical2(SAMPLE_A.length, SAMPLE_B.length).toFixed(3)}
      </p>
      <p className="mono">
        bootstrap mean of A: {ci.lo.toFixed(2)} to {ci.hi.toFixed(2)} · gini [5, 5, 5, 5] = {gini([5, 5, 5, 5]).toFixed(2)} · gini [20, 0, 0, 0] = {gini([20, 0, 0, 0]).toFixed(2)}
      </p>
    </>
  );
}

const BIT_SAMPLES: (number | bigint)[] = [0, 1, 255, 256, 2 ** 40 - 1, 10n ** 30n];

const DOCS = [['cat', 'sat'], ['cat', 'cat', 'dog'], ['bird']];

function ScoreDemo() {
  const index = buildTermIndex(DOCS);
  const query = ['cat'];
  return (
    <>
      <p className="mono">bitLength: {BIT_SAMPLES.map((x) => `${x} -> ${bitLength(x)}`).join(' · ')}</p>
      <p className="mono">tfidf for "cat": {tfidfScores(index, query).map((s) => s.toFixed(3)).join(' ')}</p>
      <p className="mono">bm25 for "cat": {bm25Scores(index, query).map((s) => s.toFixed(3)).join(' ')}</p>
    </>
  );
}

const HEAP_FIELDS = [{ name: 'len', value: 16 }];
const HEAP_W = 140;
const HEAP_GAP = 170;

export function DevKitTier3j() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 7 to 8 round, agent J</SectionTitle>
      <Section title="core/parseKit parseKitRows · edit the PDA rows: refusals name the line and the column (a 5-row, 30-character limit)">
        <RowsDemo />
      </Section>
      <Section title="core/parseKit parseBoundedList · a typed list refused by reason (2 to 6 values, 0 to 50)">
        <ListDemo />
      </Section>
      <Section title="core/ipv4 longestPrefixMatch · most specific route wins, /0 is the fallback">
        <RouteDemo />
      </Section>
      <Section title="core/distributions two-sample KS · core/stats bootstrapMeanInterval and gini">
        <StatsDemo />
      </Section>
      <Section title="core/bits bitLength (number and bigint) · core/tfidf TF-IDF and BM25 scorers">
        <ScoreDemo />
      </Section>
      <Section title="HeapObject freedTone · a freed block is --bad unless the lesson says otherwise (a correct free reads --ok)">
        <svg viewBox="0 0 320 70" width="100%" style={{ maxWidth: 360 }} role="img" aria-label="Two freed heap blocks, one red and one green">
          <HeapObject at={{ x: 8, y: 8 }} w={HEAP_W} title="freed (bug)" fields={HEAP_FIELDS} variant="freed" />
          <HeapObject at={{ x: 8 + HEAP_GAP, y: 8 }} w={HEAP_W} title="freed (correct)" fields={HEAP_FIELDS} variant="freed" freedTone="ok" />
        </svg>
      </Section>
    </>
  );
}
