import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { recommend, type Updates, type WantedOp } from './chooser';
import { CHOOSER_N } from './presets';

const OPTIONS_OP: { value: WantedOp; label: string }[] = [{ value: 'sum', label: 'sum' }, { value: 'min', label: 'min' }, { value: 'max', label: 'max' }];
const OPTIONS_UPDATES: { value: Updates; label: string }[] = [{ value: 'none', label: 'none' }, { value: 'point', label: 'point updates' }, { value: 'range', label: 'range updates' }];

export function ChooserScene({ picker }: { picker: ReactNode }) {
  const [op, setOp] = useState<WantedOp>('min');
  const [updates, setUpdates] = useState<Updates>('none');
  const [memory, setMemory] = useState(false);
  const rec = recommend({ op, updates, memory }, CHOOSER_N);
  useIntroCaption(<>{rec.reason}</>, [rec.reason]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Pick" value={rec.structure.label} color="var(--ok)" sub={`stores ${rec.structure.numbers(CHOOSER_N).toLocaleString('en-US')} numbers at n = ${CHOOSER_N.toLocaleString('en-US')}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Operation" value={op} onChange={setOp} options={OPTIONS_OP} />
          <Segmented label="Updates" value={updates} onChange={setUpdates} options={OPTIONS_UPDATES} />
          <Toggle label="Memory is tight" value={memory} onChange={setMemory} off="No" on="Yes" />
        </>,
      ]}
    >
      <div className="st-stage stage-pad">
        <table className="data-table st-table">
          <thead>
            <tr>
              <th>Structure</th>
              <th>Answers</th>
              <th>Updates</th>
              <th>Numbers stored (n = {CHOOSER_N.toLocaleString('en-US')})</th>
              <th>For this need</th>
            </tr>
          </thead>
          <tbody>
            {rec.considered.map((c) => (
              <tr key={c.structure.id} className={c.structure === rec.structure ? 'is-pick' : ''}>
                <td>{c.structure.label}</td>
                <td>{c.structure.ops.join(', ')}</td>
                <td>{c.structure.updates.join(', ')}</td>
                <td>
                  {c.structure.numbers(CHOOSER_N).toLocaleString('en-US')} ({c.structure.numbersNote})
                </td>
                <td>{c.structure === rec.structure ? 'chosen' : c.fits ? 'fits, but not first' : c.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Hint tone="muted" block>The rule: the first row of the table that answers the need, skipping rows that store more than 2n numbers when memory is tight and another row will do. Numbers stored depend on the implementation.</Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the pick is computed from this table, not typed</Provenance>
        <Provenance kind="illustrative">numbers stored are one common layout for each structure; the sparse table is named, not built here</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
