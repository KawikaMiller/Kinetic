import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { decimal } from '../../core/format';
import type { Tone } from '../../core/tone';
import type { Mat } from '../../core/vec';
import { headsCaption } from './captions';
import { headsOpening } from './openings';
import { EMBEDDINGS, N, TOKENS, shuffleTest, shuffled, twoHeads } from './tokens';

const HEAD_TONE: Record<'A' | 'B', Tone> = { A: 'amber', B: 'pink' };

function Matrix({ name, weights, masked, label }: { name: 'A' | 'B'; weights: Mat; masked: boolean; label: string }) {
  return (
    <figure className="at-figure">
      <figcaption>{label}</figcaption>
      <CellGrid
        rows={N}
        cols={N}
        size="md"
        ariaLabel={`Head ${name} attention weights`}
        rowLabels={TOKENS.map((t, i) => `${i + 1} ${t}`)}
        colLabels={TOKENS.map((_, i) => String(i + 1))}
        cell={(r, c) =>
          masked && c > r
            ? { tone: 'dim', fill: 'outline', text: '0' }
            : { tone: HEAD_TONE[name], fill: 'tint', intensity: weights[r][c], text: weights[r][c].toFixed(2) }
        }
      />
    </figure>
  );
}

export function HeadsScene({ picker }: { picker: ReactNode }) {
  const open = headsOpening();
  const [causal, setCausal] = useState(open.causal);
  const [positions, setPositions] = useState(open.positions);
  const [two, setTwo] = useState(open.twoHeads);
  const [order, setOrder] = useState<number[] | null>(open.order);
  const [shuffles, setShuffles] = useState(open.shuffles);

  const layer = useMemo(() => twoHeads(EMBEDDINGS, { positions, causal }), [positions, causal]);
  const test = useMemo(() => (order ? shuffleTest(EMBEDDINGS, { positions, causal, twoHeads: two }, order) : null), [order, positions, causal, two]);
  const outputs = two ? layer.concat : layer.b.output;
  const shuffledTokens = order ? order.map((i) => TOKENS[i]) : null;

  const shuffle = () => {
    setOrder(shuffled(N, shuffles + 1));
    setShuffles(shuffles + 1);
  };

  return (
    <StageFrame
      height={540}
      intro={headsCaption({ causal, positions, twoHeads: two, aWeights: two ? layer.a.weights : null, shuffle: test })}
      introKey={[causal, positions, two, order]}
      stats={
        <Stats>
          <Stat label="Heads" value={two ? '2' : '1'} sub={two ? 'A: previous token, B: same word' : 'B: same word'} />
          <Stat label="Position code" value={positions ? 'on' : 'off'} sub={two ? '2-number sine and cosine, added to two reserved dimensions' : 'head B ignores it; only head A reads the position dimensions'} />
          {test && <Stat label="Tokens with the same output" value={`${test.filter((r) => r.same).length} of ${N}`} sub="after shuffling the input" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'head A weights', shape: 'square' },
            { color: 'var(--pink)', label: 'head B weights', shape: 'square' },
            { color: 'var(--dim)', label: 'masked: weight forced to 0', shape: 'square' },
            { color: 'var(--ok)', label: '✓ output unchanged by the shuffle', shape: 'square' },
            { color: 'var(--bad)', label: '✗ output changed', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Causal mask" value={causal} onChange={setCausal} off="Off" on="On" />
          <Toggle label="Heads" value={two} onChange={setTwo} off="One (B)" on="Two (A and B)" />
          <Toggle label="Position code" value={positions} onChange={setPositions} off="Off" on="On" />
        </>,
        <>
          <Button variant="primary" onClick={shuffle}>Shuffle the tokens</Button>
          <Button softDisabled={!order} onClick={() => setOrder(null)}>Restore the order</Button>
        </>,
      ]}
    >
      <div className="at-stage stage-pad">
        {shuffledTokens && test && (
          <ol className="at-shuffled" aria-label="Tokens after the shuffle, with whether each kept its output">
            {test.map((row, p) => (
              <li key={p} className={row.same ? 'is-same' : 'is-changed'}>
                <span>{row.token}</span>
                <b aria-label={row.same ? 'same output' : 'changed output'}>{row.same ? '✓' : '✗'}</b>
              </li>
            ))}
          </ol>
        )}
        <div className="at-row">
          {two && <Matrix name="A" weights={layer.a.weights} masked={causal} label="Head A: looks at the previous token" />}
          <Matrix name="B" weights={layer.b.weights} masked={causal} label="Head B: looks at the same word" />
        </div>
        <figure className="at-figure">
          <figcaption>Output per token: {two ? 'head A (2 numbers) then head B (2 numbers)' : 'head B (2 numbers)'}</figcaption>
          <CellGrid
            rows={N}
            cols={outputs[0].length}
            size={{ cell: 40 }}
            ariaLabel="Output of the layer for each token"
            rowLabels={TOKENS.map((t, i) => `${i + 1} ${t}`)}
            cell={(r, c) => ({ tone: two && c < 2 ? HEAD_TONE.A : HEAD_TONE.B, fill: 'tint', intensity: 0.25, text: decimal(outputs[r][c], 2) })}
          />
        </figure>
        <ProvenanceRow>
          <Provenance kind="illustrative">hand-built weights for both heads: A reads only the position dimensions, B only the word dimensions</Provenance>
          <Provenance kind="toy">a two-number position code, so it repeats every 6.28 positions; real models use many frequencies</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
