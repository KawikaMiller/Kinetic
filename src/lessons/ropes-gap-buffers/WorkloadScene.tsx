import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { DEFAULT_SIZE, DEFAULT_WORKLOAD, STRUCTURES, toneIn, withCommas as n } from './tones';
import { SIZES, WORKLOADS, runWorkload, type WorkloadId } from './workloads';



/** Scene 4: the same seeded operations on all three structures, in one unit of touches. */
export function WorkloadScene({ picker }: { picker: ReactNode }) {
  const [workload, setWorkload] = useState<WorkloadId>(DEFAULT_WORKLOAD);
  const [size, setSize] = useState<number>(DEFAULT_SIZE);
  const rows = useMemo(() => WORKLOADS.map((w) => runWorkload(w.id, size)), [size]);
  const sel = rows.find((r) => r.id === workload)!;
  const info = WORKLOADS.find((w) => w.id === workload)!;
  const top = Math.max(...STRUCTURES.map((s) => sel[s.id].touches), 10);

  const intro = (
    <>
      {info.label} on {n(size)} characters: {info.what}. Touches: array {n(sel.array.touches)}, gap buffer {n(sel.gap.touches)}, rope {n(sel.rope.touches)}. Fewest: {sel.winners.map((w) => STRUCTURES.find((s) => s.id === w)!.label.toLowerCase()).join(' and ')}
      {sel.loser ? `; most: ${STRUCTURES.find((s) => s.id === sel.loser)!.label.toLowerCase()}` : ''}.
    </>
  );

  return (
    <StageFrame
      height={460}
      intro={intro}
      introKey={[workload, size]}
      stats={
        <Stats>
          {STRUCTURES.map((s) => (
            <Stat key={s.id} label={s.label} value={n(sel[s.id].touches)} color={`var(--${toneIn(sel, s.id)})`} sub={`${n(sel[s.id].perOp)} per operation, ${sel.ops} operations`} />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'fewest touches on this workload', shape: 'square' },
            { color: 'var(--bad)', label: 'most touches on this workload', shape: 'square' },
            { color: 'var(--info)', label: 'in between', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Workload" value={workload} onChange={setWorkload} options={WORKLOADS.map((w) => ({ value: w.id, label: w.label }))} />
        </>,
        <>
          <Segmented label="Text size (characters)" value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s, label: n(s) }))} />
        </>,
      ]}
    >
      <div className="rg-stage stage-pad">
        <Plot2D
          x={{ domain: [0, 3], tickValues: [0.5, 1.5, 2.5], format: (v) => STRUCTURES[Math.floor(v)].label }}
          y={{ domain: [1, top * 2], log: true, label: 'touches (log scale)' }}
          ariaLabel={`Touches for each structure on ${info.label} at ${n(size)} characters, log scale`}
        >
          <Bars bars={STRUCTURES.map((s, i) => ({ x0: i + 0.15, x1: i + 0.85, y: Math.max(1, sel[s.id].touches), tone: toneIn(sel, s.id) }))} />
        </Plot2D>
        <table className="rg-table">
          <caption>Total touches, the same operations on the same text. One touch is one character copied, or one tree node read or created; it is not wall time, because on real hardware copying a character is far cheaper than visiting a node. The best in each row is green and the worst red.</caption>
          <thead><tr><th scope="col">Workload</th>{STRUCTURES.map((s) => <th key={s.id} scope="col">{s.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === workload ? 'is-selected' : ''}>
                <th scope="row" data-label="Workload">{WORKLOADS.find((w) => w.id === r.id)!.label}</th>
                {STRUCTURES.map((s) => (
                  <td key={s.id} data-label={s.label} className={`rg-${toneIn(r, s.id)}`}>{n(r[s.id].touches)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rg-note">
          The rope rebuilt itself {sel.ropeRebuilds} {sel.ropeRebuilds === 1 ? 'time' : 'times'} on this workload under the simplified depth rule, and each rebuild is counted. Undo is nearly free for the rope because its old versions share nodes with the new one; an array or gap buffer has to apply the inverse edit. A piece table, another editor structure, keeps the original text and an append-only buffer and records edits as a list of pieces: named, not shown. Text above 60 characters is model only, not drawn.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">every touch is counted from the structure; the three end with the same text</Provenance>
        <Provenance kind="toy" seed={21}>the workload generator is seeded; the workloads are not recorded editing</Provenance>
        <Provenance kind="from-memory">Emacs uses a gap buffer, and some modern editors use a piece-tree design: common knowledge, verify against each editor's documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
