import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { createGenerator, FORMAT_NAMES, groupsOf, show, type Generator } from './anatomy';
import { anatomyCaption } from './captions';
import { cryptoBits, LAYOUTS, type FormatId } from './formats';
import { TRADEOFFS } from './tradeoffs';

const FORMATS = (Object.keys(FORMAT_NAMES) as FormatId[]).map((value) => ({ value, label: FORMAT_NAMES[value] }));
const AUTO_MS = 200;
const KEPT = 6;
const BURST = 5;
const HONEST =
  "The bit layouts are the real formats, but this page's generator is for teaching, not production: it reads your browser's clock and crypto.getRandomValues, and the auto-increment is a counter in this tab.";

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'timestamp' },
      { color: 'var(--violet)', label: 'machine ID' },
      { color: 'var(--orange)', label: 'sequence' },
      { color: 'var(--sky)', label: 'random bits' },
      { color: 'var(--hi)', label: 'version / variant' },
    ]}
  />
);

/** The list is newest first, so each ID should be above the one after it. */
const inCreationOrder = (ids: readonly bigint[]) => ids.every((id, i) => i === 0 || id < ids[i - 1]);

interface Run {
  format: FormatId;
  gen: Generator;
  /** Newest first. */
  list: bigint[];
}

const startRun = (format: FormatId): Run => {
  const gen = createGenerator(format, Date.now, cryptoBits());
  return { format, gen, list: [gen.next()] };
};

export function AnatomyScene({ picker }: { picker: ReactNode }) {
  const [run, setRun] = useState<Run>(() => startRun('uuidv7'));
  const [auto, setAuto] = useState(false);
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });

  const add = (count: number) => {
    const cur = latest.current;
    const made = Array.from({ length: count }, () => cur.gen.next());
    setRun({ ...cur, list: [...made.reverse(), ...cur.list].slice(0, KEPT) });
  };

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => add(1), AUTO_MS);
    return () => clearInterval(t);
  }, [auto]);

  const { format, list } = run;
  useIntroCaption(anatomyCaption(format), [format]);

  const shown = show(format, list[0]);
  const row = TRADEOFFS.find((r) => r.id === format)!;
  const ordered = list.length > 1 ? inCreationOrder(list) : null;

  return (
    <StageFrame
      height={420}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Size" value={`${LAYOUTS[format].bits} bits`} sub={format === 'uuidv4' ? '122 of them random' : undefined} />
          <Stat
            label="Newest sorts last"
            value={ordered === null ? '–' : ordered ? 'yes' : 'no'}
            color={ordered === null ? undefined : ordered ? 'var(--ok)' : 'var(--orange)'}
            sub="over the IDs listed below"
          />
          <Stat label="Coordination" value={row.coordination} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Format" value={format} onChange={(f) => setRun(startRun(f))} options={FORMATS} />
        </>,
        <>
          <Button variant="primary" onClick={() => add(1)}>Generate</Button>
          <Button onClick={() => add(BURST)}>Generate {BURST} at once</Button>
          <Toggle label="Auto" value={auto} onChange={setAuto} off="Off" on="Every 200 ms" />
        </>,
      ]}
    >
      <div className="stage-pad idg">
        <p className="idg-text">{shown.text}</p>
        <BitStrip key={format} bits={shown.bits} size="sm" groups={groupsOf(format)} ariaLabel={`${FORMAT_NAMES[format]} bits`} />
        <dl className="idg-fields">
          {shown.decoded.map((d) => (
            <div key={d.label} className="idg-field" style={{ '--c': `var(--${d.tone})` } as CSSProperties}>
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
        <SectionTitle weight="regular" hint="newest first">Recent IDs</SectionTitle>
        <ul className="idg-recent">
          {list.map((id, i) => (
            <li key={`${list.length - i}-${id}`}>{show(format, id).text}</li>
          ))}
        </ul>
        {format === 'ulid' && (
          <p className="idg-note">
            Five ULIDs made in one millisecond share a timestamp and differ only in random bits, so their order is not guaranteed unless the generator also counts
            (the ULID spec has an optional monotonic mode, which this page does not use).
          </p>
        )}
        {format === 'uuidv7' && (
          <p className="idg-note">
            Within one millisecond the counter keeps IDs in order (the counter method of RFC 9562 section 6.2), so five made at once still sort in the order they were made.
          </p>
        )}
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
