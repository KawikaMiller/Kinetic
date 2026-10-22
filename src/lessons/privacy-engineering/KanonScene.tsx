import { useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { plural } from '../../core/format';
import { plainTone } from '../../core/tone';
import { kanonCaption } from './captions';
import { AGE_LEVELS, ZIP_LEVELS, generaliseYear, generaliseZip, keyOf, makePublicList, makeTable, viewOf, type AgeLevel, type ZipLevel } from './kanon';
import { SUPPRESS_RANGE, initialKanon } from './opening';
import { NotLegalAdviceChip } from './NotLegalAdviceChip';

const ZIP_LABEL: Record<ZipLevel, string> = { 5: '5 digits', 3: '3 digits', 0: 'none' };
const AGE_LABEL: Record<AgeLevel, string> = { exact: 'Exact year', decade: 'Decade', range: '25-year range' };

/** Scene 2: generalise and suppress a synthetic table, and watch k, l, unique rows and linkage. */
export function KanonScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialKanon);
  const table = useMemo(() => makeTable(), []);
  const list = useMemo(() => makePublicList(table), [table]);
  const view = viewOf(table, list, { zip: state.zip, age: state.age }, state.suppressBelow);
  const groupIndex = new Map(view.groups.map((g, i) => [g.key, i]));
  const r = view.readouts;
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  return (
    <StageFrame
      height={470}
      intro={kanonCaption(view)}
      introKey={[state.zip, state.age, state.suppressBelow]}
      stats={
        <Stats>
          <Stat label="k (smallest group)" value={r.k ?? '-'} color="var(--info)" sub={`${plural(r.groups, 'group')} of ${r.kept} rows kept`} />
          <Stat label="Unique rows" value={r.unique} color={r.unique > 0 ? 'var(--bad)' : 'var(--ok)'} sub="alone in their group" />
          <Stat label="l-diversity" value={r.l ?? '-'} color={r.l === 1 ? 'var(--bad)' : 'var(--ok)'} sub="fewest conditions in a group" />
          <Stat label="Information loss" value={`${Math.round(view.loss * 100)}%`} color="var(--muted)" sub="0 = untouched, 100 = nothing left" />
          <Stat label="Linked to a name" value={view.linkedNow} color={view.linkedNow > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`${view.linkedExact} with nothing generalised`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'a group (colours repeat)', shape: 'square' },
            { color: 'var(--bad)', label: 'a unique, re-identifiable row', shape: 'square' },
            { color: 'var(--dim)', label: 'a suppressed row', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<ZipLevel> label="ZIP code" value={state.zip} onChange={(v) => set({ zip: v })} options={ZIP_LEVELS.map((z) => ({ value: z, label: ZIP_LABEL[z] }))} />
          <Segmented<AgeLevel> label="Birth year" value={state.age} onChange={(v) => set({ age: v })} options={AGE_LEVELS.map((a) => ({ value: a, label: AGE_LABEL[a] }))} />
        </>,
        <>
          <Slider label="Suppress groups smaller than" value={state.suppressBelow} {...SUPPRESS_RANGE} step={1} onChange={(v) => set({ suppressBelow: v })} format={(v) => (v === 1 ? 'none' : String(v))} />
        </>,
      ]}
    >
      <div className="pe-stage stage-pad">
        <SectionTitle>A synthetic table of {table.length} invented people (quasi-identifiers generalised as set)</SectionTitle>
        <div className="pe-table-scroll" role="region" aria-label="The synthetic table" tabIndex={0}>
          <table className="data-table pe-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ZIP</th>
                <th>Birth</th>
                <th>Sex</th>
                <th>Condition</th>
                <th>Group</th>
              </tr>
            </thead>
            <tbody>
              {table.map((p) => {
                const key = keyOf(p, view.generalisation);
                const gone = view.suppressed.has(p.id);
                const g = groupIndex.get(key);
                const unique = !gone && view.groups[g!].members.length === 1;
                return (
                  <tr key={p.id} className={gone ? 'pe-gone' : unique ? 'pe-unique' : undefined}>
                    <td>{p.id + 1}</td>
                    <td>{generaliseZip(p.zip, state.zip)}</td>
                    <td>{generaliseYear(p.year, state.age)}</td>
                    <td>{p.sex}</td>
                    <td>{p.condition}</td>
                    <td>
                      {gone ? (
                        'suppressed'
                      ) : (
                        <span className={`chip tone-${unique ? 'bad' : plainTone(g!)}`}>
                          {view.groups[g!].members.length === 1 ? 'unique' : `group of ${view.groups[g!].members.length}`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ProvenanceRow>
        <NotLegalAdviceChip />
        <Provenance kind="simulated">synthetic people, invented attributes and an invented public list; nothing describes a real population</Provenance>
        <Provenance kind="illustrative">the information-loss score is this lesson's own simple formula</Provenance>
        <Provenance kind="from-memory">a well-known study found that a large share of the US population is unique on ZIP, birth date and sex (Sweeney, 2000; the often-quoted figure is about 87%): verify. That study used the full birth date; this table uses the birth year only</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
