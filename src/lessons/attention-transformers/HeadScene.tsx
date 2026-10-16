import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { TokenArcs } from './TokenArcs';
import { headCaption } from './captions';
import { EMBEDDINGS, EMBED_RANGE, EMBED_DIM, N, TOKENS, oneHead } from './tokens';
import { headOpening } from './openings';

const row = (v: readonly number[]) => `(${v.map((x) => decimal(x, 2)).join(', ')})`;

export function HeadScene({ picker }: { picker: ReactNode }) {
  const open = headOpening();
  const [embeddings, setEmbeddings] = useState(open.embeddings);
  const [token, setToken] = useState(open.token);
  const head = useMemo(() => oneHead(embeddings), [embeddings]);
  const weights = head.weights[token];
  const edited = embeddings.some((r, i) => r.some((v, k) => v !== EMBEDDINGS[i][k]));

  const setEntry = (k: number, v: number) => setEmbeddings((all) => all.map((r, i) => (i === token ? r.map((x, kk) => (kk === k ? v : x)) : r)));
  const dk = head.Q[0].length;

  return (
    <StageFrame
      height={520}
      intro={headCaption(token, weights)}
      introKey={[embeddings, token]}
      stats={
        <Stats>
          <Stat label="Looking from" value={TOKENS[token]} sub={`token ${token + 1} of ${N}`} />
          <Stat label="Row sum" value={weights.reduce((a, b) => a + b, 0).toFixed(2)} sub="softmax makes each row add to 1" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the token attended from', shape: 'square' },
            { color: 'var(--info)', label: 'attention weight: line width and number', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Token" options={TOKENS.map((t, i) => ({ value: i, label: t }))} value={token} onChange={setToken} />
          {edited && <Button onClick={() => setEmbeddings(headOpening().embeddings)}>Reset embeddings</Button>}
        </>,
        <>
          {Array.from({ length: EMBED_DIM }, (_, k) => (
            <Slider key={k} label={`${TOKENS[token]} dim ${k + 1}`} value={embeddings[token][k]} {...EMBED_RANGE} format={(v) => decimal(v, 1)} onChange={(v) => setEntry(k, v)} />
          ))}
        </>,
      ]}
    >
      <div className="at-stage stage-pad">
        <span className="hint">Click a token in the arcs, or use the Token buttons to pick it from the keyboard.</span>
        <TokenArcs from={token} weights={weights} onPick={setToken} ariaLabel={`Attention from ${TOKENS[token]} to each token`} />
        <div className="at-row">
          <figure className="at-figure">
            <figcaption>softmax(Q Kᵀ / √{dk}): row = token looking, column = token looked at</figcaption>
            <CellGrid
              rows={N}
              cols={N}
              size="md"
              ariaLabel="Attention weight matrix"
              rowLabels={TOKENS.map((t, i) => `${i + 1} ${t}`)}
              colLabels={TOKENS.map((_, i) => String(i + 1))}
              onCellClick={(r) => setToken(r)}
              highlight={Array.from({ length: N }, (_, c) => ({ r: token, c, tone: 'hi' as const }))}
              cell={(r, c) => ({ tone: 'info', fill: 'tint', intensity: head.weights[r][c], text: head.weights[r][c].toFixed(2) })}
              rowSuffix={{ width: 52, render: (r) => `Σ ${head.weights[r].reduce((a, b) => a + b, 0).toFixed(2)}` }}
            />
          </figure>
          <ol className="at-steps" aria-label={`The arithmetic for ${TOKENS[token]}`}>
            <li>q = e · W_q = <b>{row(head.Q[token])}</b></li>
            <li>keys k = e · W_k, scores q·k / √{dk}: <b>{row(head.scores[token])}</b></li>
            <li>softmax: <b>{row(weights)}</b></li>
            <li>values v = e · W_v; output = Σ weight · v = <b>{row(head.output[token])}</b></li>
          </ol>
        </div>
        <ProvenanceRow>
          <Provenance kind="illustrative">hand-built 4-number embeddings and hand-set W_q, W_k, W_v: lesson-authored, not learned</Provenance>
          <Provenance kind="real">the weights come from core/nn attention; this toy does not understand language</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
