import { useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, SortTh, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { fakeSecret } from '../../core/fakeSecret';
import { matrixCaption } from './captions';
import {
  CLASS_IDEA, CLASS_LABEL, CLASS_ORDER, DEFENCE_LABEL, DEFENCE_ORDER, LIMIT_NOTE, RULES, causesOf, defenceSet, verdictOf, type ClassId, type DefenceId, type Verdict,
} from './matrix';
import { MAX_NAME_CHARS, WARN_DISTANCE, checkName, nearest, parseName } from './names';
import { initialMatrix } from './opening';

/** A made-up publishing credential, joined from parts at run time: a fake, for the "leaked CI credentials" card. */
const FAKE_CI_TOKEN = fakeSecret('ci-', 'publish-', 'EXAMPLE0000', '-FAKE');

const VERDICT_RANK: Record<Verdict, number> = { open: 0, limited: 1, blocked: 2 };
const VERDICT_COLOUR: Record<Verdict, string> = { blocked: 'var(--ok)', limited: 'var(--info)', open: 'var(--bad)' };

interface Row {
  id: ClassId;
  label: string;
  verdict: Verdict;
}

/** Scene 3: six abstract attack classes against seven defences, computed from rules, and a name-similarity check. */
export function MatrixScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialMatrix);
  const on = defenceSet(...state.defences);
  const rows: Row[] = CLASS_ORDER.map((id) => ({ id, label: CLASS_LABEL[id], verdict: verdictOf(id, on) }));
  const { sorted, headerProps } = useSortedRows(rows, { label: (r) => r.label, result: (r) => VERDICT_RANK[r.verdict] });
  const counts = { blocked: rows.filter((r) => r.verdict === 'blocked').length, limited: rows.filter((r) => r.verdict === 'limited').length, open: rows.filter((r) => r.verdict === 'open').length };
  const toggle = (id: DefenceId, value: boolean) => setState((s) => ({ ...s, defences: DEFENCE_ORDER.filter((d) => (d === id ? value : s.defences.includes(d))) }));
  const limitNotes = CLASS_ORDER.flatMap((cls) =>
    DEFENCE_ORDER.filter((d) => on.has(d) && RULES[cls][d] === 'limits' && LIMIT_NOTE[cls][d] !== undefined).map((d) => ({ cls, defence: d, note: LIMIT_NOTE[cls][d]! })),
  );
  const parsed = parseName(state.name);
  const verdict = parsed.ok ? checkName(parsed.value) : null;
  const near = parsed.ok && parsed.value !== '' ? nearest(parsed.value) : [];

  return (
    <StageFrame
      height={470}
      intro={matrixCaption(state.defences, state.name)}
      introKey={[state.defences.join(','), state.name]}
      stats={
        <Stats>
          <Stat label="Blocked" value={`${counts.blocked} of ${CLASS_ORDER.length}`} color="var(--ok)" sub="classes with a defence that blocks them" />
          <Stat label="Limited" value={counts.limited} color="var(--info)" sub="reduced, not stopped" />
          <Stat label="Open" value={counts.open} color={counts.open > 0 ? 'var(--bad)' : 'var(--muted)'} sub="nothing switched on helps" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'a defence switched on', shape: 'square' },
            { color: 'var(--ok)', label: 'the layer that blocks the class', shape: 'square' },
            { color: 'var(--info)', label: 'a layer that limits it', shape: 'square' },
            { color: 'var(--orange)', label: 'a name-similarity warning', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {DEFENCE_ORDER.map((d) => (
            <Toggle key={d} label={DEFENCE_LABEL[d]} value={on.has(d)} onChange={(v) => toggle(d, v)} />
          ))}
        </>,
        <>
          <TextField label={`Package name to check (up to ${MAX_NAME_CHARS}: a-z 0-9 - @ /)`} value={state.name} onChange={(v) => setState((s) => ({ ...s, name: v }))} width={260} spellCheck={false} maxLength={MAX_NAME_CHARS + 8} />
          <Hint tone="muted" block>
            <span role="status" className="sc-status">
              {parsed.ok ? null : <span className="sc-error">{parsed.error}</span>}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="sc-stage stage-pad">
        <div className="sc-block">
          <SectionTitle>Which defence stops which class (computed from the rules)</SectionTitle>
          <div className="sc-scroll" role="region" aria-label="Defence matrix, scrolls sideways" tabIndex={0}>
            <table className="data-table sc-matrix">
              <thead>
                <tr>
                  <SortTh {...headerProps('label')}>Class</SortTh>
                  <SortTh {...headerProps('result')}>Result</SortTh>
                  {DEFENCE_ORDER.map((d) => (
                    <th key={d} className={on.has(d) ? 'sc-on' : undefined}>
                      {DEFENCE_LABEL[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const causes = causesOf(r.id, on);
                  return (
                    <tr key={r.id}>
                      <td title={CLASS_IDEA[r.id]}>{r.label}</td>
                      <td style={{ color: VERDICT_COLOUR[r.verdict] }}>
                        {r.verdict}
                        {causes.length > 0 ? ` (${causes.map((c) => DEFENCE_LABEL[c]).join(', ')})` : ''}
                      </td>
                      {DEFENCE_ORDER.map((d) => {
                        const effect = RULES[r.id][d];
                        const lit = on.has(d) && effect !== undefined;
                        return (
                          <td key={d} title={effect === 'limits' ? LIMIT_NOTE[r.id][d] : undefined} style={{ color: lit ? (effect === 'blocks' ? 'var(--ok)' : 'var(--info)') : 'var(--dim)' }}>
                            {effect === 'blocks' ? 'blocks' : effect === 'limits' ? 'limits' : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {limitNotes.length > 0 && (
            <>
              <SectionTitle>What the limits that are on do</SectionTitle>
              <ul className="sc-list">
                {limitNotes.map((l) => (
                  <li key={`${l.cls}-${l.defence}`}>
                    <b>{CLASS_LABEL[l.cls]}</b>, {DEFENCE_LABEL[l.defence]}: {l.note}.
                  </li>
                ))}
              </ul>
            </>
          )}
          <ul className="sc-list">
            {CLASS_ORDER.map((c) => (
              <li key={c}>
                <b>{CLASS_LABEL[c]}</b>: {CLASS_IDEA[c]}.
              </li>
            ))}
          </ul>
          <p className="sc-note">
            A credential that must stay in the pipeline, as an example (a fake): <code>{FAKE_CI_TOKEN}</code>
          </p>
        </div>
        <div className="sc-block">
          <SectionTitle>Look-alike name check (edit distance, fictional names)</SectionTitle>
          {verdict?.kind === 'warn' && (
            <p className="sc-warn" role="status">
              <code>{state.name}</code> is {verdict.near.distance} edit{verdict.near.distance === 1 ? '' : 's'} from <code>{verdict.near.name}</code>: a warning at distance {WARN_DISTANCE} or less.
            </p>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Nearest known name</th>
                <th>Edit distance</th>
              </tr>
            </thead>
            <tbody>
              {near.map((n) => (
                <tr key={n.name}>
                  <td>{n.name}</td>
                  <td style={{ color: n.distance > 0 && n.distance <= WARN_DISTANCE ? 'var(--orange)' : undefined }}>{n.distance}</td>
                </tr>
              ))}
              {near.length === 0 && (
                <tr>
                  <td colSpan={2}>Type a name above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">fictional packages; the attack classes are one-line ideas with no recipe, and nothing is fetched or run</Provenance>
        <Provenance kind="illustrative">the rules are simplified: real attacks and defences overlap more than a table shows</Provenance>
        <Provenance kind="from-memory">which defence helps against which class comes from memory: check each tool's documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
