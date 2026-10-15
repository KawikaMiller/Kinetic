import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { setsCaption } from './captions';
import { N_RANGE, alwaysOverlap, missProbability, missingPairs } from './quorum';
import {
  DEFAULT_SETS, disjointSets, latestVersion, read, readBlocked, sharedNow, toggleMember, withN, withSizes, write, writeBlocked, type SetsState,
} from './sets';
import { randomSet } from './storeView';
import { pctText } from '../../core/format';

const NAMES = 'ABCDEFG';
const PICK_OPTIONS = [{ value: 'write' as const, label: 'Write set' }, { value: 'read' as const, label: 'Read set' }];
const RANDOM_SEED_STEP = 7;

export function SetsScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<SetsState>(DEFAULT_SETS);
  const [note, setNote] = useState('');
  const [draws, setDraws] = useState(0);
  const q = { n: s.n, w: s.w, r: s.r };
  const { missing, total } = missingPairs(q);
  const latest = latestVersion(s);
  const shared = sharedNow(s);
  const bothPicked = s.writeSet.length === s.w && s.readSet.length === s.r;
  const wBlocked = writeBlocked(s);
  const rBlocked = readBlocked(s);
  const disjoint = disjointSets(s.n, s.w, s.r);

  useIntroCaption(setsCaption(s), [s]);

  const press = (i: number) => {
    const r = toggleMember(s, i);
    if ('refused' in r) setNote(r.refused);
    else {
      setS(r.state);
      setNote('');
    }
  };
  const fill = () => {
    setDraws((d) => d + 1);
    const seed = draws * RANDOM_SEED_STEP + s.n;
    setS({ ...s, [s.pick === 'write' ? 'writeSet' : 'readSet']: randomSet(s.n, s.pick === 'write' ? s.w : s.r, seed), lastRead: null });
    setNote('');
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Pairs that miss" value={`${missing.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`} color={missing === 0n ? 'var(--ok)' : 'var(--bad)'} sub={`C(${s.n},${s.w}) × C(${s.n - s.w},${s.r}) of C(${s.n},${s.w}) × C(${s.n},${s.r})`} />
          <Stat label="A random read set misses" value={pctText(missProbability(q), 1)} color={missing === 0n ? 'var(--ok)' : 'var(--bad)'} sub={`C(${s.n - s.w},${s.r}) / C(${s.n},${s.r})`} />
          <Stat label="R + W against N" value={`${s.r + s.w} ${alwaysOverlap(q) ? '>' : '≤'} ${s.n}`} sub={alwaysOverlap(q) ? 'the sets must overlap' : 'the sets can miss'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'write set' },
            { color: 'var(--info)', label: 'read set' },
            { color: 'var(--hi)', label: 'in both: the intersection' },
            { color: 'var(--ok)', label: 'newest version' },
            { color: 'var(--orange)', label: 'stale replica' },
            { color: 'var(--bad)', label: 'no overlap' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Replicas N" value={s.n} min={N_RANGE.min} max={N_RANGE.max} onChange={(n) => { setS(withN(s, n)); setNote(''); }} />
          <Slider label="Write quorum W" value={s.w} min={1} max={s.n} onChange={(w) => setS(withSizes(s, w, s.r))} />
          <Slider label="Read quorum R" value={s.r} min={1} max={s.n} onChange={(r) => setS(withSizes(s, s.w, r))} />
        </>,
        <>
          <Segmented label="A press changes the" value={s.pick} onChange={(pick) => setS({ ...s, pick })} options={PICK_OPTIONS} />
          <Button onClick={fill}>Random {s.pick} set</Button>
          <Button disabled={disjoint === null} onClick={() => { if (disjoint) setS({ ...s, ...disjoint, lastRead: null }); }}>Pick sets that miss</Button>
          {disjoint === null && <Hint>no such sets: R + W &gt; N</Hint>}
        </>,
        <>
          <Button variant="primary" disabled={wBlocked !== null} onClick={() => setS(write(s))}>Write</Button>
          <Button variant="primary" disabled={rBlocked !== null} onClick={() => setS(read(s))}>Read</Button>
          <Hint>{wBlocked ?? rBlocked ?? 'Write sets the write set to the next version; Read returns the highest version in the read set.'}</Hint>
        </>,
      ]}
    >
      <div className="qr-stage stage-pad">
        <div className="qr-replicas" role="group" aria-label={`Replicas: pressing one changes the ${s.pick} set`}>
          {Array.from({ length: s.n }, (_, i) => {
            const inW = s.writeSet.includes(i);
            const inR = s.readSet.includes(i);
            const both = inW && inR;
            const v = s.versions[i];
            const tone = both ? 'hi' : inW ? 'violet' : inR ? 'info' : 'none';
            return (
              <button
                key={i}
                type="button"
                className={`qr-replica is-${tone} ${v === latest && latest > 0 ? 'is-newest' : v < latest ? 'is-stale' : ''}`}
                aria-pressed={s.pick === 'write' ? inW : inR}
                aria-label={`Replica ${NAMES[i]}, version ${v}${inW ? ', in the write set' : ''}${inR ? ', in the read set' : ''}`}
                onClick={() => press(i)}
              >
                <b>{NAMES[i]}</b>
                <span className="qr-version">v{v}</span>
                <span className="qr-member">{both ? 'W and R' : inW ? 'W' : inR ? 'R' : ''}</span>
              </button>
            );
          })}
        </div>
        <p className={`qr-status ${bothPicked && shared.length === 0 ? 'is-bad' : ''}`} role="status">
          {note || (bothPicked ? (shared.length > 0 ? `The two sets share ${shared.map((i) => NAMES[i]).join(', ')}.` : 'The two sets share no replica: a read can miss the write.') : `Pick ${s.w} replicas for the write set and ${s.r} for the read set.`)}
        </p>
        {s.lastRead && (
          <p className={`qr-status ${s.lastRead.returned < s.lastRead.latest ? 'is-bad' : 'is-ok'}`} role="status">
            The read returned version {s.lastRead.returned}; the latest written is {s.lastRead.latest}.
          </p>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">one register, no failures here, no concurrent writers: the counting is exact and the picture is a model</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
