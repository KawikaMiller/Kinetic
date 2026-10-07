import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { CodePanel } from '../../components/CodePanel';
import { GraphView } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats, TextArea, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { deriveFrames, evalFrames, inputText, postOrder, regexFrames, ruleText, valueText } from './frames';
import {
  BRACKETS, MAX_TREES, PRESET_GRAMMARS, bracketed, countingDfa, derive, evaluate, isNonterminal, leftmostRules, nested, parseGrammar, parseTrees,
  precedenceReading, recognises, spanTable, tokenize, viable, type Grammar, type PNode, type Tok,
} from './model';
import { ParseTree } from './ParseTree';
import { fromPNode, treeSize, type TNode } from './tree';
import './styles.css';

type Scene = 'derive' | 'ambiguity' | 'regex';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'derive', label: 'Derive' },
  { value: 'ambiguity', label: 'Ambiguity' },
  { value: 'regex', label: 'Why not regex' },
];

/** Tree text is 13px: keep it at 8px or more on a phone. */
const TREE_TEXT_PX = 13;

const mustParse = (text: string) => {
  const r = parseGrammar(text);
  if (!r.ok) throw new Error(r.error);
  return r.grammar;
};
const mustTokens = (text: string) => {
  const r = tokenize(text);
  if (!r.ok) throw new Error(r.error);
  return r.tokens;
};

/** The grammar and input both scenes share, with the last good value kept while an edit is refused. */
function useGrammarInput() {
  const [presetId, setPresetId] = useState<string>(PRESET_GRAMMARS[0].id);
  const [grammarText, setGrammarText] = useState<string>(PRESET_GRAMMARS[0].text);
  const [grammar, setGrammar] = useState<Grammar>(() => mustParse(PRESET_GRAMMARS[0].text));
  const [grammarError, setGrammarError] = useState<string | null>(null);
  const [input, setInput] = useState<string>(PRESET_GRAMMARS[0].sample);
  const [tokens, setTokens] = useState<Tok[]>(() => mustTokens(PRESET_GRAMMARS[0].sample));
  const [inputError, setInputError] = useState<string | null>(null);

  const editGrammar = (text: string) => {
    setGrammarText(text);
    setPresetId('');
    const r = parseGrammar(text);
    if (!r.ok) return setGrammarError(r.error);
    setGrammarError(null);
    setGrammar(r.grammar);
  };
  const editInput = (text: string) => {
    setInput(text);
    const r = tokenize(text);
    if (!r.ok) return setInputError(r.error);
    setInputError(null);
    setTokens(r.tokens);
  };
  const load = (id: string, keepInput = false) => {
    const p = PRESET_GRAMMARS.find((x) => x.id === id)!;
    setPresetId(id);
    setGrammarText(p.text);
    setGrammar(mustParse(p.text));
    setGrammarError(null);
    if (!keepInput) editInput(p.sample);
  };

  const controls = (
    <>
      <ControlGroup label="Grammar">
        {PRESET_GRAMMARS.map((p) => (
          <ChipButton key={p.id} tone="violet" on={p.id === presetId} onClick={() => load(p.id, p.id !== 'brackets' && (presetId === 'ambiguous' || presetId === 'layered'))}>
            {p.label}
          </ChipButton>
        ))}
      </ControlGroup>
      <TextArea label="Productions (edit me)" value={grammarText} onChange={editGrammar} rows={3} className="gp-grammar-field" />
      <TextField label="Input" value={input} onChange={editInput} width={180} spellCheck={false} />
      <Hint tone="muted" block>
        <span role="status">
          {grammarError && <span className="gp-error">{grammarError} Using the last grammar that worked. </span>}
          {inputError && <span className="gp-error">{inputError} Using the last input that worked.</span>}
        </span>
      </Hint>
    </>
  );
  return { grammar, tokens, controls };
}

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'derive' });
  const shared = useGrammarInput();
  if (scene === 'regex') return <RegexScene picker={picker} />;
  if (scene === 'ambiguity') return <AmbiguityScene picker={picker} {...shared} />;
  return <DeriveScene picker={picker} {...shared} />;
}

/** Derivation nodes as drawable tree nodes. */
function derivationTree(g: Grammar, d: ReturnType<typeof derive>): Record<string, TNode> {
  return Object.fromEntries(Object.values(d.nodes).map((n) => [n.id, { sym: n.sym, text: n.text, nt: isNonterminal(g, n.sym), children: n.children }]));
}

// ── Scene 1: build a leftmost derivation ────────────────────────────

const NO_RULES: number[] = [];

function DeriveScene({ picker, grammar: g, tokens, controls }: { picker: ReactNode; grammar: Grammar; tokens: Tok[]; controls: ReactNode }) {
  const [state, setState] = useState<{ g: Grammar; tokens: Tok[]; rules: number[] }>({ g, tokens, rules: [] });
  // A new grammar or input starts the derivation over.
  const rules = state.g === g && state.tokens === tokens ? state.rules : NO_RULES;
  const [note, setNote] = useState<string | null>(null);
  const D = useMemo(() => spanTable(g, tokens.map((t) => t.t)), [g, tokens]);
  const derivable = D.get(g.start)![0][tokens.length];
  const frames = useMemo(() => deriveFrames(g, tokens, rules), [g, tokens, rules]);
  const player = usePlayer(frames, { interval: 900, autoplayOnChange: false });
  const d = player.frame.d;
  const atEnd = player.index === frames.length - 1;
  const next = d.next ? d.nodes[d.next].sym : null;
  const tree = derivationTree(g, d);
  const size = treeSize(tree, 'n0');

  const setRules = (next: number[], play: boolean) => {
    player.queueNext({ play, from: play ? rules.length : next.length });
    setState({ g, tokens, rules: next });
  };
  const choose = (ri: number) => {
    const trial = derive(g, tokens, [...rules, ri]);
    if (!viable(g, tokens, trial, D)) {
      setNote(`${ruleText(g.rules[ri])} can't lead to ${inputText(tokens) || 'the empty string'} any more. Pick another.`);
      return;
    }
    setNote(null);
    setRules([...rules, ri], false);
  };
  const auto = () => {
    // One valid derivation, played from the start symbol.
    setNote(null);
    player.queueNext({ play: true, from: 0 });
    setState({ g, tokens, rules: leftmostRules(parseTrees(g, tokens, 1)[0]) });
  };

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Steps" value={player.index} color="var(--hi)" />
          <Stat label="In the language?" value={derivable ? 'yes' : 'no'} color={derivable ? 'var(--ok)' : 'var(--bad)'} sub="checked by a CYK-style recogniser" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'to expand next / rule just used', shape: 'square' },
            { color: 'var(--violet)', label: 'non-terminal', shape: 'square' },
            { color: 'var(--info)', label: 'terminal (token)', shape: 'square' },
          ]}
        />
      }
      controls={[<>{picker}</>, controls]}
    >
      <div className="gp stage-pad">
        <div className="gp-cols">
          <CodePanel
            title="Grammar"
            lines={g.rules.map(ruleText)}
            stateOf={(i) => (i === d.lastRule ? 'now' : 'idle')}
            className="gp-rules"
          />
          <div className="gp-treebox">
            <SectionTitle>Parse tree</SectionTitle>
            <WideRegion minWidth={minWidthForText(size.width, TREE_TEXT_PX, 300)} label="Parse tree: scroll sideways to see all of it">
              <ParseTree nodes={tree} root="n0" hot={d.next} ariaLabel={`Parse tree after ${player.index} steps`} />
            </WideRegion>
          </div>
        </div>
        <p className="gp-form" aria-label="Sentential form">
          {d.form.length ? (
            d.form.map((id) => (
              <span key={id} className={`gp-sym ${isNonterminal(g, d.nodes[id].sym) ? 'is-nt' : 'is-t'} ${id === d.next ? 'is-hot' : ''}`}>
                {d.nodes[id].text ?? d.nodes[id].sym}
              </span>
            ))
          ) : (
            <span className="gp-sym is-t">ε (empty)</span>
          )}
        </p>
        {!derivable ? (
          <p className="gp-note">
            <span className="hl bad">Not in the language:</span> this grammar can't derive <b>{inputText(tokens) || 'the empty string'}</b>, so there's no derivation to build. Try
            another input.
          </p>
        ) : next && atEnd ? (
          <ControlGroup label={`Expand ${next} with`} className="gp-choices">
            {g.rules.map((r, i) =>
              r.lhs === next ? (
                <ChipButton key={i} tone="violet" size="md" onClick={() => choose(i)}>
                  {ruleText(r)}
                </ChipButton>
              ) : null,
            )}
          </ControlGroup>
        ) : next ? (
          <Hint block>Step to the last frame to keep choosing productions.</Hint>
        ) : null}
        <div className="gp-actions">
          <Button variant="primary" onClick={auto} disabled={!derivable}>
            Auto-derive
          </Button>
          <Button onClick={() => setRules(rules.slice(0, -1), false)} disabled={!rules.length}>
            Undo
          </Button>
          <Button onClick={() => setRules([], false)} disabled={!rules.length}>
            Start over
          </Button>
          <span className="gp-note" role="status">
            {note}
          </span>
        </div>
      </div>
    </StageFrame>
  );
}

// ── Scene 2: one input, two trees ───────────────────────────────────

function AmbiguityScene({ picker, grammar: g, tokens, controls }: { picker: ReactNode; grammar: Grammar; tokens: Tok[]; controls: ReactNode }) {
  const trees = useMemo(() => parseTrees(g, tokens), [g, tokens]);
  const reading = useMemo(() => precedenceReading(tokens), [tokens]);
  const shown = useMemo(() => trees.slice(0, 2), [trees]);
  const values = useMemo(() => shown.map(evaluate), [shown]);
  const isPrecedence = (t: PNode) => reading !== null && bracketed(t) === reading;
  const verdict = useMemo((): ReactNode => {
    if (!trees.length) return <><span className="hl bad">No tree:</span> this grammar can't derive {inputText(tokens) || 'the empty string'}.</>;
    if (trees.length === 1)
      return <>Exactly <b>one</b> parse tree{values[0] !== undefined ? <>, so one value: <b>{values[0]}</b></> : null}. This grammar's shape leaves no choice for this input.</>;
    const more = trees.length >= MAX_TREES ? `${MAX_TREES} or more` : String(trees.length);
    return (
      <>
        <span className="hl orange">Ambiguous:</span> {more} parse trees for one input
        {values[0] !== undefined && values[1] !== undefined ? (values[0] !== values[1] ? <>, and the first two disagree: {values[0]} vs {values[1]}</> : <>; these two happen to agree ({values[0]}), but their shapes differ</>) : null}
        . Precedence has to come from the grammar's shape: try the Layered grammar.
      </>
    );
  }, [trees, tokens, values]);
  const frames = useMemo(() => evalFrames(shown, verdict), [shown, verdict]);
  const player = usePlayer(frames, { interval: 700 });
  const shownCount = player.frame.shown;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Parse trees" value={trees.length >= MAX_TREES ? `${MAX_TREES}+` : trees.length} color={trees.length > 1 ? 'var(--orange)' : trees.length ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Usual reading" value={reading ?? '–'} color="var(--muted)" sub="* before +, left to right" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the tree that follows * before +', shape: 'square' },
            { color: 'var(--orange)', label: 'a competing tree', shape: 'square' },
            { color: 'var(--violet)', label: 'non-terminal', shape: 'square' },
            { color: 'var(--info)', label: 'terminal', shape: 'square' },
          ]}
        />
      }
      controls={[<>{picker}</>, controls]}
    >
      <div className="gp stage-pad">
        <div className="gp-trees">
          {shown.map((t, i) => {
            const { nodes, root } = fromPNode(t, (s) => isNonterminal(g, s));
            const order = postOrder(t);
            const done = new Set(order.slice(0, shownCount));
            const valueAt = (id: string) => {
              const path = id.split('.').slice(1).map(Number);
              let n = t;
              for (const k of path) n = n.children[k];
              return evaluate(n);
            };
            const ok = isPrecedence(t);
            const size = treeSize(nodes, root);
            return (
              <div key={i} className={`gp-tree-card ${reading !== null ? (ok ? 'is-ok' : 'is-other') : ''}`}>
                <SectionTitle>
                  Tree {i + 1}: {bracketed(t)}{' '}
                  {values[i] !== undefined && shownCount >= order.length ? <span className={`hl ${ok ? 'ok' : 'orange'}`}>= {values[i]}</span> : null}
                </SectionTitle>
                <WideRegion minWidth={minWidthForText(size.width, TREE_TEXT_PX, 300)} label={`Tree ${i + 1}: scroll sideways to see all of it`}>
                  <ParseTree
                    nodes={nodes}
                    root={root}
                    tone={reading !== null ? (ok ? 'ok' : 'orange') : undefined}
                    badge={(id) => (done.has(id) && nodes[id].nt && valueAt(id) !== undefined ? valueText(valueAt(id)) : null)}
                    ariaLabel={`Parse tree ${i + 1}, ${bracketed(t)}`}
                  />
                </WideRegion>
              </div>
            );
          })}
          {!trees.length && <p className="empty-note">no parse tree for this input</p>}
        </div>
        {trees.length > 2 && <Hint block>Showing the first two of {trees.length >= MAX_TREES ? `${MAX_TREES} or more` : trees.length} trees.</Hint>}
      </div>
    </StageFrame>
  );
}

// ── Scene 3: brackets beat any fixed DFA ────────────────────────────

const BRACKET_GRAMMAR = mustParse(BRACKETS);
const DFA_GAP = 96;

function RegexScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(3);
  const [k, setK] = useState(4);
  const frames = useMemo(() => regexFrames(n, k), [n, k]);
  const player = usePlayer(frames, { interval: 600 });
  const f = player.frame;
  const s = nested(n);
  const dfa = useMemo(() => countingDfa(k), [k]);
  const grammarSays = useMemo(() => recognises(BRACKET_GRAMMAR, [...s]), [s]);
  const width = 80 + (k - 1) * DFA_GAP + 60;
  const edges = dfa.states.flatMap((st) => Object.entries(dfa.delta[st]).map(([sym, to]) => ({ from: st, to, label: sym })));

  return (
    <StageFrame
      player={player}
      height={380}
      stats={
        <Stats>
          <Stat label="Grammar" value={grammarSays ? 'balanced' : 'not balanced'} color="var(--ok)" sub="S → ( S ) S | ε, any depth" />
          <Stat
            label={`${k}-state DFA`}
            value={f.verdict === null ? 'reading…' : f.verdict ? 'accepts' : 'rejects'}
            color={f.verdict === null ? 'var(--muted)' : f.verdict === grammarSays ? 'var(--ok)' : 'var(--bad)'}
            sub={f.verdict !== null && f.verdict !== grammarSays ? 'wrong' : undefined}
          />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'current state / bracket', shape: 'square' }, { color: 'var(--bad)', label: "the DFA's wrong verdict", shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Nesting depth n" value={n} min={1} max={8} onChange={setN} />
          <Slider label="DFA states k" value={k} min={2} max={6} onChange={setK} />
        </>,
      ]}
    >
      <div className="gp stage-pad">
        <p className="gp-note">
          The string <code>{s}</code>: n = {n} opening brackets, then n closing. The grammar derives it at every depth; this DFA has to count depth with a fixed number of states.
        </p>
        <WideRegion minWidth={Math.min(width, 520)} label="Counting DFA: scroll sideways to see all of it">
          <GraphView
            nodes={dfa.states.map((st, i) => ({ id: st, at: { x: 60 + i * DFA_GAP, y: 90 }, accept: dfa.accept.includes(st) }))}
            edges={edges}
            directed
            startNode="c0"
            width={width}
            height={150}
            radius={22}
            className="gp-dfa"
            ariaLabel={`A ${k}-state DFA counting bracket depth 0 to ${k - 1}`}
            nodeMark={(id) => (id === f.state ? { tone: 'hi', fill: 'solid' } : f.state === null && f.verdict === false && id === `c${k - 1}` ? { tone: 'bad', fill: 'tint' } : null)}
          />
        </WideRegion>
        <ArrayStrip
          values={[...s]}
          cellMax={36}
          cellState={(i) => (i === f.read - 1 ? (f.state === null ? 'bad' : 'active') : i < f.read - 1 ? 'dim' : 'idle')}
          pointers={f.read < s.length && f.verdict === null ? [{ i: f.read, label: 'next', tone: 'info', id: 'next' }] : []}
        />
        <Hint block>The bracket DFA is one example machine; the pumping lemma proves no DFA works for every depth, which this demo only illustrates.</Hint>
      </div>
    </StageFrame>
  );
}
