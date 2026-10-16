import { useState, type ReactNode } from 'react';
import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { edgesOf } from '../../core/automata';
import { parseBoundedInt } from '../../core/parse';
import { pumpingCaption } from './captions';
import { OPENING } from './opening';
import {
  MAX_COUNT, MAX_P, MIN_P, PUMP_COUNTS, PUMP_LANGUAGES, chooseString, loopIn, playGame, pump, pumpLanguage, type Decomposition, type PumpLanguageId, type PumpMode, type Row,
} from './pumping';

const MODES: { value: PumpMode; label: string }[] = [
  { value: 'regular', label: 'Regular: x y z' },
  { value: 'cf', label: 'Context-free: u v w x y' },
];
const TABLE_MIN_WIDTH = 520;
const DFA_POSITIONS = { s0: { x: 60, y: 60 }, s1: { x: 190, y: 60 }, dead: { x: 320, y: 60 } };

const show = (s: string) => (s === '' ? 'ε' : s);

/** The split with its pumped parts bracketed: aa[a]bbb. */
function SplitText({ d }: { d: Decomposition }) {
  return (
    <code className="ch-split">
      {d.pieces.map((piece, k) => (d.pumped.includes(k) ? <b key={k} className="ch-pumped">[{show(piece)}]</b> : <span key={k}>{piece}</span>))}
    </code>
  );
}

/** Scene 2: the pumping game, with every legal split listed. */
export function PumpingScene({ picker }: { picker: ReactNode }) {
  const [languageId, setLanguageId] = useState<PumpLanguageId>(OPENING.pumping.language);
  const [mode, setMode] = useState<PumpMode>(OPENING.pumping.mode);
  const [p, setP] = useState(OPENING.pumping.p);
  const [shapeId, setShapeId] = useState(OPENING.pumping.shape);
  const [nText, setNText] = useState(String(OPENING.pumping.n));
  const [selected, setSelected] = useState<number | null>(null);
  const lang = pumpLanguage(languageId);
  const n = parseBoundedInt(nText, { min: 0, max: MAX_COUNT, messages: { invalid: () => `n is a whole number from 0 to ${MAX_COUNT}.`, tooBig: () => `n is at most ${MAX_COUNT}.`, tooSmall: () => 'n cannot be negative.' } });
  const setup = n.ok ? chooseString(lang, shapeId, n.value, p) : { ok: false as const, error: n.error };
  const s = setup.ok ? setup.s : null;
  const game = s === null ? null : playGame(lang, s, p, mode);
  const shownRows: Row[] = game?.rows ?? [];
  const focus = game && (selected !== null && game.rows[selected] ? selected : game.rows.findIndex((r) => r.firstLeaving === null));
  const focusRow = game && focus !== null && focus >= 0 ? game.rows[focus] : null;
  const showDfa = mode === 'regular' && lang.dfa !== undefined;

  const pickLanguage = (id: PumpLanguageId) => {
    const next = pumpLanguage(id);
    setLanguageId(id);
    setShapeId(next.shapes[0].id);
    setSelected(null);
  };

  return (
    <StageFrame
      height={560}
      intro={pumpingCaption({ lang, mode, p, game, s, error: setup.ok ? null : setup.error })}
      introKey={`${languageId}|${mode}|${p}|${shapeId}|${nText}`}
      stats={
        <Stats>
          <Stat label="Pumping length p" value={p} color="var(--info)" sub="the adversary's number, picked by the lesson" />
          <Stat label="Legal splits" value={game ? game.rows.length : 'none'} color="var(--muted)" sub={mode === 'regular' ? '|xy| <= p, |y| >= 1' : '|vwx| <= p, |vx| >= 1'} />
          <Stat label="Survive pumping" value={game ? game.surviving.length : 'none'} color={game && game.surviving.length ? 'var(--bad)' : 'var(--ok)'} sub="no i from 0 to 3 leaves the language" />
          <Stat label="Game" value={game ? (game.won ? 'won' : 'not won') : 'no string'} color={game ? (game.won ? 'var(--ok)' : 'var(--bad)') : 'var(--muted)'} sub="won when every split has a leaving i" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'pumping leaves the language (your witness)', shape: 'square' },
            { color: 'var(--bad)', label: 'survives: you have not won this split', shape: 'square' },
            { color: 'var(--hi)', label: 'the pumped part [ ]', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Language">
            {PUMP_LANGUAGES.map((l) => (
              <ChipButton key={l.id} tone="info" on={l.id === languageId} onClick={() => pickLanguage(l.id)}>
                {l.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="Split rule" value={mode} onChange={setMode} options={MODES} />
        </>,
        <>
          <Slider label="p" value={p} min={MIN_P} max={MAX_P} onChange={setP} />
          {lang.shapes.length > 1 ? <Segmented label="Your string" value={shapeId} onChange={setShapeId} options={lang.shapes.map((sh) => ({ value: sh.id, label: sh.label }))} /> : null}
          <TextField label={`n, 0 to ${MAX_COUNT} (your string is ${lang.shapes.find((sh) => sh.id === shapeId)?.label ?? ''})`} value={nText} onChange={setNText} width={100} spellCheck={false} maxLength={4} />
          <Hint tone="muted" block>
            <span role="status" className="ch-status">
              {setup.ok ? <>s = <code>{setup.s}</code></> : <span className="ch-error">{setup.error}</span>}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="ch-stage stage-pad">
        {game ? (
          <>
            <SectionTitle>Every legal {mode === 'regular' ? 'split' : 'decomposition'} of {game.s} (click a row)</SectionTitle>
            <WideRegion minWidth={TABLE_MIN_WIDTH} label="Splits table: scroll sideways to see all of it">
              <div className="ch-table-scroll">
                <table className="data-table ch-table">
                  <thead>
                    <tr>
                      <th>{mode === 'regular' ? 'x [y] z' : 'u [v] w [x] y'}</th>
                      {PUMP_COUNTS.map((i) => (
                        <th key={i}>i = {i}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.map((row, r) => (
                      <tr key={r} className={r === focus ? 'is-focus' : ''}>
                        <td>
                          <button type="button" className="ch-row-btn" aria-pressed={r === focus} onClick={() => setSelected(r)}>
                            <SplitText d={row.decomposition} />
                          </button>
                        </td>
                        {PUMP_COUNTS.map((i) => (
                          <td key={i} className={row.leaves[i] ? 'ch-leaves' : 'ch-stays'}>
                            <code className="ch-pumped-string">{show(pump(row.decomposition, i))}</code> {row.leaves[i] ? 'leaves' : 'stays'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </WideRegion>
            {showDfa && focusRow && focusRow.firstLeaving === null ? <DfaLoop lang={lang} row={focusRow} /> : null}
          </>
        ) : null}
        <p className="ch-note">
          The table uses the p the lesson picked ({p}); the lemma speaks of every p, so this illustrates one case of an argument and does not replace it. Passing the game never proves a language regular: the lemma is a necessary condition, so it can show non-regularity and never regularity.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">every split is listed and decided by the language&apos;s own test; the classes are textbook results (verify against Sipser)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

/** The minimal DFA of (ab)* with the loop that y follows drawn in violet. */
function DfaLoop({ lang, row }: { lang: ReturnType<typeof pumpLanguage>; row: Row }) {
  const dfa = lang.dfa!;
  const [x, y] = row.decomposition.pieces;
  const loop = loopIn(dfa, x, y);
  const nodes: GraphNode<string>[] = dfa.states.map((st) => ({ id: st, at: DFA_POSITIONS[st as keyof typeof DFA_POSITIONS], accept: dfa.accept.includes(st), label: st === 'dead' ? '✕' : st }));
  const edges: GraphEdge<string>[] = edgesOf(dfa).filter((e) => e.to !== 'dead').map((e) => ({ from: e.from, to: e.to, label: e.symbols.join(',') }));
  const onLoop = new Set(loop.states);
  return (
    <div className="ch-loop">
      <SectionTitle>The loop y follows in the smallest DFA</SectionTitle>
      <WideRegion minWidth={380} label="DFA diagram: scroll sideways to see all of it">
        <GraphView
          nodes={nodes}
          edges={edges}
          directed
          startNode={dfa.start}
          width={380}
          height={120}
          labelHalo
          className="ch-graph"
          ariaLabel={`Minimal DFA for ${lang.label}; the part y = ${y} leaves state ${loop.states[0]} and ${loop.closes ? 'comes back to it' : 'ends elsewhere'}`}
          nodeMark={(id) => (onLoop.has(id) ? { tone: 'violet', fill: 'tint' } : null)}
          edgeMark={(e) => (onLoop.has(e.from) && onLoop.has(e.to) ? { tone: 'violet', width: 4 } : null)}
        />
      </WideRegion>
      <p className="ch-note">
        After <code>{show(x)}</code> the machine is in <code>{loop.states[0]}</code>; reading <code>{y}</code> brings it back there, so repeating <code>{y}</code> any number of times cannot change the answer: a long enough string in a regular language always has a loop to pump.
      </p>
    </div>
  );
}
