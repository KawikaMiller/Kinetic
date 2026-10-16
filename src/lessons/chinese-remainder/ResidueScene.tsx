import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { fromResidues, productN, residueOp, toResidues } from './crt';
import { COPRIME_SETS, OPENING } from './presets';

type Op = 'add' | 'multiply';

/** Scene 4: residue arithmetic. Add and multiply component by component with no carries; right while the result is below M. */
export function ResidueScene({ picker }: { picker: ReactNode }) {
  const [setId, setSetId] = useState<string>(OPENING.residue.set);
  const [u, setU] = useState<number>(OPENING.residue.u);
  const [v, setV] = useState<number>(OPENING.residue.v);
  const [op, setOp] = useState<Op>(OPENING.residue.op);

  const moduli = COPRIME_SETS.find((s) => s.id === setId)!.moduli;
  const M = productN(moduli);
  const uu = Math.min(u, M - 1);
  const vv = Math.min(v, M - 1);
  const ru = toResidues(uu, moduli);
  const rv = toResidues(vv, moduli);
  const rr = residueOp(ru, rv, moduli, op);
  const back = fromResidues(rr, moduli);
  const direct = op === 'add' ? uu + vv : uu * vv;
  const wraps = direct >= M;
  const symbol = op === 'add' ? '+' : 'x';

  return (
    <StageFrame
      height={470}
      intro={
        <>
          {uu} {symbol} {vv} = {direct}. Done on the residues alone, {moduli.map((m, i) => `${rr[i]} mod ${m}`).join(', ')}, and converted back, the answer is {back}{wraps ? `: the true result ${direct} is past M = ${M}, so it wraps to ${direct} mod ${M} = ${direct % M}` : `, the right answer, since it is below M = ${M}`}.
        </>
      }
      introKey={`${setId}-${uu}-${vv}-${op}`}
      stats={
        <Stats>
          <Stat label="Direct result" value={direct} color={wraps ? 'var(--bad)' : 'var(--ok)'} sub={wraps ? `at least M = ${M}: out of range` : `below M = ${M}`} />
          <Stat label="From the residues" value={back} color="var(--ok)" sub="no carries between moduli" />
          <Stat label="Range M" value={M} color="var(--info)" sub={moduli.join(' x ')} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'result inside the range', shape: 'square' },
            { color: 'var(--bad)', label: 'result past M: it wraps', shape: 'square' },
            { color: 'var(--info)', label: 'the range M', shape: 'square' },
            { color: 'var(--violet)', label: 'residue tuple of the result', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {COPRIME_SETS.map((s) => (
            <ChipButton key={s.id} tone="info" on={setId === s.id} onClick={() => setSetId(s.id)}>{s.label}</ChipButton>
          ))}
          <Toggle label="Operation" value={op === 'multiply'} onChange={(on) => setOp(on ? 'multiply' : 'add')} off="Add" on="Multiply" />
          <Slider label="u" value={uu} min={0} max={M - 1} onChange={setU} />
          <Slider label="v" value={vv} min={0} max={M - 1} onChange={setV} />
        </>,
      ]}
    >
      <div className="cr-stage stage-pad">
        <CellGrid
          rows={3}
          cols={moduli.length}
          size={{ cell: 44, font: 13 }}
          rowLabels={[`u = ${uu}`, `v = ${vv}`, `u ${symbol} v`]}
          colLabels={moduli.map((m) => `mod ${m}`)}
          cell={(r, c) => {
            const value = r === 0 ? ru[c] : r === 1 ? rv[c] : rr[c];
            return r === 2 ? { tone: 'violet', fill: 'tint', text: value } : { tone: 'muted', fill: 'tint', text: value };
          }}
          ariaLabel="Residue tuples of u, v and their result, one column per modulus"
        />
        <Bar value={direct} max={Math.max(M, direct)} tone={wraps ? 'bad' : 'ok'} label="direct result" trailing={direct} />
        <Bar value={M} max={Math.max(M, direct)} tone="info" label="range M" trailing={M} />
        <p className="cr-note">Each column is computed on its own: a sum in one column never carries into another. That is the residue number system idea, and it is why the pieces of one big multiplication can be done independently. The result is only recoverable while it stays below M.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes: M is at most {Math.max(...COPRIME_SETS.map((s) => productN(s.moduli)))}</Provenance>
        <Provenance kind="real">the tuples are computed and converted back by the constructive formula</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
