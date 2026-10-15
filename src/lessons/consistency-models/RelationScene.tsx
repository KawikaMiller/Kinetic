import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, ControlGroup, Legend, Provenance, ProvenanceRow, SortTh } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { useIntroCaption } from '../../core/caption';
import { relationCaption } from './captions';
import { HistoryGantt } from './HistoryGantt';
import { barsFromOps } from './historyBars';
import { DEFAULT_PRESET, MODEL_NAME, ORDER_MODELS, PRESETS, SLOTS, opsOf, strongestHolding, verdictsOf, type Preset } from './model';
import { AXIS_CELLS, AXIS_COLUMNS, AXIS_ROWS, MODEL_FACTS, type ModelFacts } from './relation';
import { chainStates, type ChainState } from './view';

const CHAIN_NOTE: Record<ChainState, string> = {
  strongest: 'the strongest that holds',
  implied: 'holds, implied by a stronger one',
  fails: 'fails',
};
const yesNo = (v: boolean) => (v ? 1 : 0);

export function RelationScene({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const ops = useMemo(() => opsOf(preset.model()), [preset]);
  const verdicts = useMemo(() => verdictsOf(ops, { values: preset.quiet }), [ops, preset]);
  const states = chainStates(strongestHolding(verdicts));
  const { sorted, headerProps } = useSortedRows<ModelFacts, 'model' | 'stale' | 'coordination' | 'available'>(
    MODEL_FACTS,
    {
      model: (r) => MODEL_FACTS.indexOf(r),
      stale: (r) => yesNo(r.stale),
      coordination: (r) => yesNo(r.coordination),
      available: (r) => yesNo(r.available),
    },
  );

  useIntroCaption(relationCaption(preset, verdicts), [preset]);

  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the strongest model that holds' },
            { color: 'var(--ok)', label: 'weaker ones it implies (tinted)', shape: 'dot' },
            { color: 'var(--bad)', label: 'stronger models that fail' },
            { color: 'var(--info)', label: 'converged, beside the chain' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Drop a history into the picture" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" size="md" on={preset.id === p.id} onClick={() => setPreset(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        <div className="cm-chain" role="group" aria-label="The chain of models, strongest first, and the separate converged marker">
          {ORDER_MODELS.map((m, i) => (
            <Fragment key={m}>
              {i > 0 && <span className="cm-subset" aria-label="is contained in">⊂</span>}
              <div className={`cm-link is-${states[m]}`}>
                <b>{MODEL_NAME[m]}</b>
                <span>{CHAIN_NOTE[states[m]]}</span>
              </div>
            </Fragment>
          ))}
          <div className={`cm-link is-converged is-${verdicts.converged.state}`}>
            <b>Converged</b>
            <span>{verdicts.converged.state === 'ok' ? 'yes: the quiet reads agree' : verdicts.converged.state === 'bad' ? 'no: the quiet reads disagree' : 'not decided'}</span>
          </div>
        </div>
        <p className="cm-chain-note">
          Each model accepts every history the one before it accepts (⊂). Converged stands apart: it is a promise about where the copies end up, not about the order operations were seen in.
        </p>
        <HistoryGantt bars={barsFromOps(ops)} domain={[0, SLOTS + 1]} ariaLabel={`History of the preset ${preset.label}`} />
        <Box>
          <SectionTitle hint="press a heading to sort">The models side by side</SectionTitle>
          <table className="data-table cm-table">
            <thead>
              <tr>
                <SortTh {...headerProps('model')}>Model</SortTh>
                <SortTh {...headerProps('stale')}>Allows a stale read</SortTh>
                <SortTh {...headerProps('coordination')}>Needs coordination</SortTh>
                <SortTh {...headerProps('available')}>Stays available on both sides of a partition</SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  <td>{r.staleNote}</td>
                  <td>{r.coordinationNote}</td>
                  <td>{r.availableNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Box>
          <SectionTitle>Serializability and linearizability are different axes</SectionTitle>
          <table className="data-table cm-axes">
            <thead>
              <tr>
                <td />
                {AXIS_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {AXIS_ROWS.map((row, r) => (
                <tr key={row}>
                  <th scope="row">{row}</th>
                  {AXIS_CELLS[r].map((cell) => (
                    <td key={cell.name}><b>{cell.name}</b><br />{cell.note}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <ClaimLabel kind="research">causal consistency is the strongest model known to stay available under partitions: Mahajan, Alvisi and Dahlin 2011, from memory; check the paper</ClaimLabel>
          <Provenance kind="from-memory">the table's cells summarise common designs, not every system; real products differ</Provenance>
          <Provenance kind="toy">the history above is checked by the scene 1 checkers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
