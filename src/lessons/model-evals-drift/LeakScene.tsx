import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { leakCaption, pct1 } from './captions';
import { LEAK_FRESH, LEAK_TEST, LEAK_TRAIN, leakExperiment } from './leak';
import { LEAK_DEFAULT } from './settings';

export function LeakScene({ picker }: { picker: ReactNode }) {
  const [leaked, setLeaked] = useState<boolean>(LEAK_DEFAULT.leaked);
  const r = useMemo(() => leakExperiment(leaked), [leaked]);
  const caption = leakCaption(leaked, r);
  const rows = [
    { label: 'Memoriser on the test set', value: r.memoriser.test, tone: leaked ? 'bad' : 'info' },
    { label: 'Memoriser on fresh data', value: r.memoriser.fresh, tone: 'info' },
    { label: 'Logistic model on the test set', value: r.logistic.test, tone: 'info' },
    { label: 'Logistic model on fresh data', value: r.logistic.fresh, tone: 'info' },
  ] as const;

  return (
    <StageFrame
      height={380}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Memoriser, test set" value={pct1(r.memoriser.test)} color={leaked ? 'var(--bad)' : undefined} sub={leaked ? 'it has seen these items' : 'held out'} />
          <Stat label="Memoriser, fresh data" value={pct1(r.memoriser.fresh)} sub={`${LEAK_FRESH.toLocaleString('en-US')} new examples`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'accuracy', shape: 'square' }, { color: 'var(--bad)', label: 'a leaked score', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Test items leaked into training" value={leaked} onChange={setLeaked} off="Held out" on="Leaked" />
        </>,
      ]}
    >
      <div className="med-stage stage-pad">
        <Box>
          <SectionTitle hint={`${r.trainSize} training examples, ${LEAK_TEST} test examples`}>What a memoriser reports</SectionTitle>
          <div className="med-leak">
            {rows.map((row) => (
              <Bar key={row.label} value={row.value} max={1} tone={row.tone} label={<span className="med-leak-label">{row.label}: {pct1(row.value)}</span>} ariaLabel={`${row.label} ${pct1(row.value)}`} />
            ))}
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">a 1-nearest-neighbour memoriser and a logistic model on seeded blobs ({LEAK_TRAIN} training examples)</Provenance>
          <Provenance kind="simulated">seeded draws; the leak is the test items copied into the training set</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
