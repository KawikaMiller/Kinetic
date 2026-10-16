import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { clampResidues, crtBuild, firstMatch } from './crt';
import { COPRIME_SETS, OPENING } from './presets';

/** Scene 2: build the answer from Mi and its inverse instead of searching; each term contributes 0 to the other moduli and a_i to its own. */
export function BuildScene({ picker }: { picker: ReactNode }) {
  const [setId, setSetId] = useState<string>(OPENING.build.set);
  const [residues, setResidues] = useState<number[]>(OPENING.build.residues.slice());
  const [gear, setGear] = useState<number>(OPENING.build.gear);

  const moduli = COPRIME_SETS.find((s) => s.id === setId)!.moduli;
  const effective = clampResidues(moduli, residues);
  const sys = { moduli, residues: effective };
  const build = crtBuild(sys)!;
  const searched = firstMatch(sys, build.product);
  const picked = build.terms[gear];
  const maxTerm = Math.max(1, build.sum);

  return (
    <StageFrame
      height={500}
      intro={
        <>
          M = {moduli.join(' x ')} = {build.product}. Each term a_i x M_i x y_i is a multiple of every modulus but its own, so it adds 0 to the other remainders and a_i to its own. The terms add to {build.sum}, and {build.sum} mod {build.product} = {build.x}, the number a search finds too.
        </>
      }
      introKey={`${setId}-${effective.join('-')}`}
      stats={
        <Stats>
          <Stat label="M = product of the moduli" value={build.product} color="var(--info)" sub="the range the answer is unique in" />
          <Stat label="Sum of the terms" value={build.sum} color="var(--violet)" sub={`${build.terms.map((t) => t.term).join(' + ')}`} />
          <Stat label="x = sum mod M" value={build.x} color="var(--ok)" sub={searched === build.x ? 'a search of 0..M-1 finds the same x' : 'differs from a search (a bug)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'a term a_i x M_i x y_i', shape: 'square' },
            { color: 'var(--info)', label: 'the modulus range M', shape: 'square' },
            { color: 'var(--ok)', label: 'x, the remainders all match', shape: 'square' },
            { color: 'var(--dim)', label: 'contributes 0 to this modulus', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {COPRIME_SETS.map((s) => (
            <ChipButton key={s.id} tone="info" on={setId === s.id} onClick={() => setSetId(s.id)}>{s.label}</ChipButton>
          ))}
          {moduli.map((m, i) => (
            <Slider key={`${setId}-${i}`} label={`remainder mod ${m}`} value={effective[i]} min={0} max={m - 1} onChange={(v) => setResidues(effective.map((a, k) => (k === i ? v : a)))} />
          ))}
          <Segmented label="Euclid table for" value={gear} onChange={setGear} options={moduli.map((m, i) => ({ value: i, label: `gear ${m}` }))} />
        </>,
      ]}
    >
      <div className="cr-stage stage-pad">
        <ul className="cr-formula" aria-label="The terms">
          {build.terms.map((t, i) => (
            <li key={i}>
              <span className="cr-term-name">mod {t.modulus}</span>
              <span>
                M_{i + 1} = {build.product} / {t.modulus} = {t.partial}; y_{i + 1} = {t.partial}^-1 mod {t.modulus} = {t.inverse}; term = {t.residue} x {t.partial} x {t.inverse} = <b>{t.term}</b>
              </span>
              <Bar value={t.term} max={maxTerm} tone="violet" label={`term ${i + 1}`} trailing={t.term} />
            </li>
          ))}
        </ul>
        <CellGrid
          rows={moduli.length}
          cols={moduli.length + 1}
          size={{ cell: 40, font: 13 }}
          rowLabels={moduli.map((m) => `mod ${m}`)}
          colLabels={[...moduli.map((_, i) => `term ${i + 1}`), 'sum']}
          cell={(r, c) => {
            const value = (c < moduli.length ? build.terms[c].term : build.sum) % moduli[r];
            if (c === moduli.length) return { tone: 'ok', fill: 'tint', text: value };
            return c === r ? { tone: 'violet', fill: 'tint', text: value } : { tone: 'dim', fill: 'none', text: value };
          }}
          ariaLabel="Each term and the sum, reduced modulo each modulus"
        />
        <p className="cr-note">
          The table is computed: reading down a term's column gives its remainder mod each modulus, and the sum's column is x's remainders, which are the ones you chose ({effective.join(', ')}).
        </p>
        <h4 className="cr-h">The inverse y_{gear + 1}, from the Euclid table for {picked.partial % picked.modulus} and {picked.modulus}</h4>
        <table className="cr-euclid">
          <thead>
            <tr><th>a</th><th>b</th><th>q</th><th>r</th></tr>
          </thead>
          <tbody>
            {picked.steps.map((s, i) => (
              <tr key={i}><td>{s.a.toString()}</td><td>{s.b.toString()}</td><td>{s.q.toString()}</td><td>{s.r.toString()}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="cr-note">The back-substitution of this table gives y = {picked.inverse} (core egcd), which is checked: {picked.partial} x {picked.inverse} mod {picked.modulus} = {(picked.partial * (picked.inverse ?? 0)) % picked.modulus}.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes: moduli of 3 to 9, no keys</Provenance>
        <Provenance kind="real">every term, inverse and the Euclid table are computed by core/numberTheory</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
