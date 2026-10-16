import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { pipelineCaption } from './captions';
import { initialPipelineScene } from './init';
import { COUNTRIES, INGESTED, PURGED_IDS, SOURCE_NOW, equalToTruth, run, sourceChange, type Mode } from './pipeline';

const MODES: { value: Mode; label: string }[] = [
  { value: 'etl', label: 'ETL: transform, then load' },
  { value: 'elt', label: 'ELT: load, then transform' },
];

export function PipelineScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialPipelineScene);
  const { mode, rule } = state;

  const r = useMemo(() => run(mode, rule), [mode, rule]);
  const first = useMemo(() => run(mode, 'v1'), [mode]);
  const rows = rule === 'v1' ? INGESTED : SOURCE_NOW;
  const changed = rule === 'v2';

  useIntroCaption(pipelineCaption(mode, rule, r), [mode, rule]);

  return (
    <StageFrame
      height={540}
      stats={
        <Stats>
          <Stat label="Raw rows kept" value={r.rawKept} color={r.rawKept > 0 ? 'var(--ok)' : undefined} sub={mode === 'elt' ? 'in the lake, as extracted' : 'discarded after the transform'} />
          <Stat label="Source reads" value={r.extracts} sub="times the pipeline extracted" />
          <Stat label="Totals right" value={changed ? (equalToTruth(r) ? 'yes' : `${r.wrong.length} wrong`) : 'yes'} color={changed && !equalToTruth(r) ? 'var(--bad)' : 'var(--ok)'} sub="against the rule applied to the data as it arrived" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'source and ingest', shape: 'square' },
            { color: 'var(--violet)', label: 'raw zone and curated tables', shape: 'square' },
            { color: 'var(--ok)', label: 'right totals', shape: 'square' },
            { color: 'var(--bad)', label: 'wrong totals, a purged source row', shape: 'square' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Segmented label="Pipeline" value={mode} onChange={(m) => setState((s) => ({ ...s, mode: m }))} options={MODES} />
          <Button variant="primary" onClick={() => setState((s) => ({ ...s, rule: 'v2' }))} softDisabled={changed}>Business rule changed</Button>
          <Button onClick={() => setState((s) => ({ ...s, rule: 'v1' }))} softDisabled={!changed}>Back to the first run</Button>
        </>
      }
    >
      <div className="wl-stage stage-pad">
        <div className="wl-flow">
          <Box className="wl-node tone-info">
            <SectionTitle hint="the operational database">Source</SectionTitle>
            <ul className="wl-rows">
              {rows.map((o) => (
                <li key={o.id}>#{o.id} {o.country} {o.qty} x {o.price}{changed && sourceChange(o.id) === 'corrected' ? ' (price corrected)' : ''}</li>
              ))}
              {changed && PURGED_IDS.map((id) => (
                <li key={`p${id}`} className="wl-gone">#{id} purged</li>
              ))}
            </ul>
            <p className="wl-note">An event log and a CSV drop would feed the same ingest; they are drawn here by name only.</p>
          </Box>
          <span className="wl-arrow" aria-hidden="true">→</span>
          <Box className="wl-node tone-violet">
            <SectionTitle hint="object storage, files">Raw zone</SectionTitle>
            {mode === 'elt' ? (
              <ul className="wl-rows">
                {INGESTED.map((o) => (
                  <li key={o.id}>#{o.id} {o.country} {o.qty} x {o.price}</li>
                ))}
              </ul>
            ) : (
              <p className="wl-gone">discarded after the transform</p>
            )}
          </Box>
          <span className="wl-arrow" aria-hidden="true">→</span>
          <Box className="wl-node tone-violet">
            <SectionTitle hint={`revenue by country, rule ${rule}`}>Curated table</SectionTitle>
            <table className="data-table wl-table">
              <thead>
                <tr><th scope="col">Country</th><th scope="col">Revenue</th>{changed && <th scope="col">Truth</th>}</tr>
              </thead>
              <tbody>
                {COUNTRIES.map((c) => {
                  const wrong = r.wrong.includes(c);
                  return (
                    <tr key={c}>
                      <th scope="row">{c}</th>
                      <td className={wrong ? 'wl-bad' : ''}>{r.curated.get(c) ?? '–'}</td>
                      {changed && <td>{r.truth.get(c) ?? '–'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        </div>
        <Box>
          <SectionTitle hint="stated, not scored">Cost and risk</SectionTitle>
          <ul className="wl-list">
            <li>{mode === 'etl' ? 'ETL loads only the finished result: little to store, and the source is read once per run.' : `ELT stores the raw extract (${plural(first.rawKept, 'row')} here) and pays to transform inside the store.`}</li>
            <li>{mode === 'etl' ? 'If the rule changes, the cleaned data cannot be re-cleaned: there is no raw left, so the source must be read again, and it may no longer hold the old data.' : 'If the rule changes, the transform runs again over the raw rows that were kept, whatever the source holds now.'}</li>
          </ul>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">ten made-up orders; the source purged {PURGED_IDS.length} rows and corrected {SOURCE_NOW.filter((o) => sourceChange(o.id)).length} prices since the first run, and the totals are computed from those rows</Provenance>
          <Provenance kind="illustrative">real pipelines differ in what they keep: some sources keep history, and an ELT lake can drop its raw files too</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
