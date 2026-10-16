import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decimal } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { vectorCaption } from './captions';
import { initialVectorScene } from './init';
import { BATCH_VALUES, DEFAULT_N, N_MAX, N_MIN, batchSizes, callsPerBatch, callsPerRow } from './vector';

const PRESETS = [1, BATCH_VALUES, BATCH_VALUES + 1, DEFAULT_N, N_MAX];
const SHOWN_BATCHES = 6;

export function VectorScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialVectorScene);
  const [note, setNote] = useState('');
  const { n } = state;
  const perRow = callsPerRow(n);
  const perBatch = callsPerBatch(n);
  const sizes = batchSizes(n);

  useIntroCaption(vectorCaption(n, perRow, perBatch), [n]);

  const type = (text: string) => {
    setState((s) => ({ ...s, text }));
    const r = parseBoundedInt(text, {
      min: N_MIN,
      max: N_MAX,
      thousands: true,
      messages: { empty: 'Type a number of values.', invalid: () => 'Use plain digits, like 5000.', tooSmall: () => `At least ${N_MIN} value.`, tooBig: () => `Up to ${N_MAX.toLocaleString('en-US')} values.` },
    });
    if (r.ok) {
      setNote('');
      setState((s) => ({ ...s, n: r.value }));
    } else setNote(r.error);
  };
  const settle = () => {
    setState((s) => ({ ...s, text: s.n.toLocaleString('en-US') }));
    setNote('');
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="One call per row" value={perRow.toLocaleString('en-US')} color="var(--bad)" sub="calls" />
          <Stat label={`One call per ${BATCH_VALUES.toLocaleString('en-US')}`} value={perBatch.toLocaleString('en-US')} color="var(--ok)" sub={perBatch === perRow ? 'calls, the same number' : `calls, ${decimal(perRow / perBatch, 1)}× fewer`} />
        </Stats>
      }
      controls={
        <>
          {picker}
          <TextField label="Values N" value={state.text} onChange={type} onBlur={settle} width={150} spellCheck={false} />
          {PRESETS.map((p) => (
            <ChipButton key={p} tone="info" on={n === p} onClick={() => type(String(p))}>{p.toLocaleString('en-US')}</ChipButton>
          ))}
        </>
      }
    >
      <div className="cs-stage stage-pad">
        <Box>
          <SectionTitle hint="calls to sum a column, drawn to the same scale">Function calls</SectionTitle>
          <div className="cs-bars">
            <Bar label="one call per row" value={perRow} max={perRow} tone="bad" trailing={perRow.toLocaleString('en-US')} />
            <Bar label={`one call per ${BATCH_VALUES.toLocaleString('en-US')}`} value={perBatch} max={perRow} tone="ok" trailing={perBatch.toLocaleString('en-US')} />
          </div>
          <p className="cs-note">
            The first {Math.min(sizes.length, SHOWN_BATCHES)} batch sizes: {sizes.slice(0, SHOWN_BATCHES).join(', ')}
            {sizes.length > SHOWN_BATCHES ? ', …' : ''}.
          </p>
        </Box>
        {note && <p className="cs-status" role="status">{note}</p>}
        <ProvenanceRow>
          <Provenance kind="illustrative">counting calls, not seconds: no timing is shown, and real speed depends on the engine and the CPU</Provenance>
          <Provenance kind="toy">the batch size of {BATCH_VALUES.toLocaleString('en-US')} is a round number for the arithmetic, not any engine's setting</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
