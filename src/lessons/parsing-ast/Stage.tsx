import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { CallStackPanel } from '../../components/CallStackPanel';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { parserFrames } from './frames';
import { NAIVE_CAP, NAIVE_EXPR, PRESETS, SOURCE, astChildren, astLabel, evaluate, formatValue, parse, readInput, type Ast, type Tok } from './model';
import './styles.css';

type Scene = 'parser' | 'trees';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'parser', label: 'Parser at work' },
  { value: 'trees', label: 'AST vs parse tree' },
];

const AST_W = 420;
const AST_H = 260;
const AST_MIN = 480;
const USE_CASES = ['linters', 'codemods', 'Prettier', 'query engines'];

/** The input both scenes share: the last line that lexed, with the refusal shown otherwise. */
function useExpression() {
  const [presetId, setPresetId] = useState<string>(PRESETS[0].id);
  const [text, setText] = useState<string>(PRESETS[0].src);
  const [tokens, setTokens] = useState<Tok[]>(() => {
    const r = readInput(PRESETS[0].src);
    return r.ok ? r.tokens : [];
  });
  const [error, setError] = useState<string | null>(null);
  const edit = (next: string, id = '') => {
    setText(next);
    setPresetId(id);
    const r = readInput(next);
    if (!r.ok) return setError(r.error);
    setError(null);
    setTokens(r.tokens);
  };
  const controls = (
    <>
      <ControlGroup label="Expression">
        {PRESETS.map((p) => (
          <ChipButton key={p.id} tone="info" on={p.id === presetId} onClick={() => edit(p.src, p.id)}>
            {p.label}
          </ChipButton>
        ))}
      </ControlGroup>
      <TextField label="Type your own" value={text} onChange={(v) => edit(v)} width={220} spellCheck={false} className="pa-field" />
      <Hint tone="muted" block>
        <span role="status">{error ? <span className="pa-error">{error} Showing the last expression that lexed.</span> : null}</span>
      </Hint>
    </>
  );
  return { tokens, controls };
}

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'parser' });
  const expr = useExpression();
  if (scene === 'trees') return <TreesScene picker={picker} {...expr} />;
  return <ParserScene picker={picker} {...expr} />;
}

/** AST id → node, and each node's parent, over one or more subtrees. */
function indexAst(tops: readonly Ast[]) {
  const byId = new Map<string, Ast>();
  const parent = new Map<string, string>();
  const walk = (n: Ast) => {
    byId.set(n.id, n);
    for (const c of astChildren(n)) {
      parent.set(c.id, n.id);
      walk(c);
    }
  };
  tops.forEach(walk);
  return { byId, parent };
}

/** The AST drawing: operators violet, numbers blue, with an optional value under each node. */
function AstView({
  asts, show, mark, values, ariaLabel,
}: {
  /** The whole AST, or the separate subtrees a failed parse got as far as building. */
  asts: readonly Ast[];
  /** Nodes built so far (all of them when omitted). */
  show?: ReadonlySet<string>;
  mark?: (id: string) => 'fresh' | 'hot' | null;
  values?: Record<string, number>;
  ariaLabel: string;
}) {
  const { byId, parent } = indexAst(asts);
  const visible = (id: string) => !show || show.has(id);
  // The parts built so far are separate subtrees until an operator joins them: draw them as a forest, left to right.
  const leftmost = (n: Ast): number => (n.kind === 'num' ? Number(n.id.slice(1)) : leftmost(astChildren(n)[0]));
  const roots = [...byId.keys()].filter((id) => visible(id) && !(parent.has(id) && visible(parent.get(id)!))).sort((a, b) => leftmost(byId.get(a)!) - leftmost(byId.get(b)!));
  if (!roots.length) return <p className="empty-note">no AST nodes yet</p>;
  return (
    <div style={{ maxWidth: AST_W, margin: '0 auto' }}>
    <TreeSvg
      shape={{ roots, children: (id) => astChildren(byId.get(id)!).map((c) => c.id).filter(visible) }}
      layout="tidy"
      width={AST_W}
      height={AST_H}
      levelGap={54}
      top={28}
      className="pa-ast"
      ariaLabel={ariaLabel}
      nodeClass={(id) => `${byId.get(id)!.kind === 'num' ? 'pa-num' : 'pa-op'} ${mark?.(id) === 'fresh' ? 'is-fresh' : mark?.(id) === 'hot' ? 'is-hot' : ''}`}
      renderNode={(id) => {
        const n = byId.get(id)!;
        const v = values?.[id];
        return (
          <>
            <circle r={19} />
            <text y={5} textAnchor="middle">
              {astLabel(n)}
            </text>
            {v !== undefined && (
              <g className="pa-badge">
                <rect x={-Math.max(17, formatValue(v).length * 4 + 6)} y={22} width={2 * Math.max(17, formatValue(v).length * 4 + 6)} height={17} rx={8.5} />
                <text y={34.5} textAnchor="middle">
                  {formatValue(v)}
                </text>
              </g>
            )}
          </>
        );
      }}
    />
    </div>
  );
}

// ── Scene 1: the parser at work ─────────────────────────────────────

function ParserScene({ picker, tokens, controls }: { picker: ReactNode; tokens: Tok[]; controls: ReactNode }) {
  const [naive, setNaive] = useState(false);
  const frames = useMemo(() => parserFrames(tokens, naive), [tokens, naive]);
  const result = useMemo(() => parse(tokens, { naive }), [tokens, naive]);
  const player = usePlayer(frames, { interval: 650 });
  const f = player.frame;
  const lines = naive ? [...NAIVE_EXPR, ...SOURCE.slice(NAIVE_EXPR.length)] : SOURCE;
  const shown = new Set(f.created);
  const failed = f.error !== null || f.overflow;
  const strip = tokens.map((t) => (t.kind === 'end' ? '⏹' : t.text));
  const built = useMemo(() => builtSubtrees(result), [result]);

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Stack depth" value={f.stack.length} color={f.overflow ? 'var(--bad)' : 'var(--hi)'} sub={naive ? `cap ${NAIVE_CAP}` : undefined} />
          <Stat label="Token" value={`${Math.min(f.cursor + 1, tokens.length)} / ${tokens.length}`} color="var(--info)" sub="⏹ = end of input" />
          <Stat label="AST nodes" value={f.created.length} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running line and frame', shape: 'square' },
            { color: 'var(--info)', label: 'token cursor / number', shape: 'square' },
            { color: 'var(--violet)', label: 'operator node', shape: 'dot' },
            { color: 'var(--ok)', label: 'node just built', shape: 'dot' },
            { color: 'var(--bad)', label: 'error / overflow', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="parseExpr" value={naive} onChange={setNaive} off="Loop" on="Naive left recursion" />
        </>,
        controls,
      ]}
    >
      <div className="pa stage-pad">
        <div className="pa-top">
          <CodePanel
            title="Recursive-descent parser"
            lines={lines}
            stateOf={(i) => (i === f.line ? (failed && player.index === frames.length - 1 ? 'bad' : 'now') : 'idle')}
            className="pa-code"
          />
          <CallStackPanel
            frames={f.stack.map((fr, i) => ({ id: fr.id, name: `${fr.fn}()`, state: f.overflow || f.error ? 'error' : i === 0 ? 'running' : 'waiting' }))}
            meta={`${f.stack.length} frame${f.stack.length === 1 ? '' : 's'}`}
            alarm={failed}
            minHeight={260}
            empty={<p className="empty-note">nothing running</p>}
            className="pa-stack"
          />
        </div>
        <div className="pa-tokens">
          <SectionTitle>Tokens</SectionTitle>
          <ArrayStrip
            values={strip}
            cellMax={48}
            cellState={(i) => (i < f.cursor ? 'dim' : i === f.cursor && !failed ? 'info' : i === f.cursor && f.error ? 'bad' : 'idle')}
            pointers={f.cursor < tokens.length ? [{ i: f.cursor, label: 'cursor', tone: 'info', id: 'cursor' }] : []}
          />
        </div>
        <div className="pa-bottom">
          <div className="pa-astbox">
            <SectionTitle>AST, built bottom-up</SectionTitle>
            <WideRegion minWidth={AST_MIN} label="AST: scroll sideways to see all of it">
              {built.length ? (
                <AstView
                  asts={built}
                  show={shown}
                  mark={(id) => (id === f.fresh ? 'fresh' : id === f.evaluating ? 'hot' : null)}
                  values={f.values}
                  ariaLabel={`AST so far: ${f.created.length} nodes`}
                />
              ) : (
                <p className="empty-note">no AST nodes yet</p>
              )}
            </WideRegion>
          </div>
          <div className="pa-side">
            <ConsolePanel
              title="result"
              lines={f.result !== null ? [Number.isFinite(f.result) ? `= ${formatValue(f.result)}` : { text: `= ${formatValue(f.result)}`, tone: 'bad' }] : []}
              error={f.error ?? (f.overflow ? `stack cap of ${NAIVE_CAP} frames hit (left recursion)` : undefined)}
              empty="(not evaluated yet)"
            />
            <div className="pa-uses">
              <SectionTitle>Also start from an AST</SectionTitle>
              <div className="pa-chips">
                {USE_CASES.map((u) => (
                  <span key={u} className="chip tone-muted">
                    {u}
                  </span>
                ))}
              </div>
            </div>
            <Hint block>
              {naive ? `The stack cap is set low (${NAIVE_CAP} frames) so the runaway is visible. ` : null}
              <code>-2 ^ 2</code> follows this lesson's rule (unary minus binds looser than ^, so it's −4); languages differ: in JavaScript <code>-2 ** 2</code> is a
              SyntaxError.
            </Hint>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

/** The finished AST, or for a failed parse every subtree it built that no other built node contains. */
function builtSubtrees(r: ReturnType<typeof parse>): Ast[] {
  if (r.ast) return [r.ast];
  const built = r.trace.flatMap((e) => (e.kind === 'create' ? [e.node] : []));
  const contained = new Set(built.flatMap((n) => astChildren(n).map((c) => c.id)));
  return built.filter((n) => !contained.has(n.id));
}

// ── Scene 2: the AST beside the full parse tree ──────────────────────

function TreesScene({ picker, tokens, controls }: { picker: ReactNode; tokens: Tok[]; controls: ReactNode }) {
  const r = useMemo(() => parse(tokens), [tokens]);
  const tree = r.tree;
  const ptNodes = Object.values(tree);
  const kept = ptNodes.filter((n) => n.kept).length;
  const leaves = ptNodes.filter((n) => !n.children.length).length;
  const depthOf = (id: string): number => 1 + Math.max(0, ...tree[id].children.map(depthOf));
  const ptW = Math.max(360, leaves * 58 + 60);
  const ptH = r.treeRoot ? depthOf(r.treeRoot) * 50 + 40 : 100;
  useIntroCaption(
    r.ast ? (
      <>
        The parse tree has <b>{ptNodes.length}</b> nodes: one per function call plus every token, brackets included. The AST keeps only the <b>{kept}</b> that carry
        meaning (numbers and operators), and its value is {formatValue(evaluate(r.ast))}.
      </>
    ) : (
      <><span className="hl bad">Syntax error.</span> {r.error?.message} There's no tree to compare.</>
    ),
    [r],
  );

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Parse tree nodes" value={ptNodes.length} color="var(--muted)" />
          <Stat label="AST nodes" value={kept} color="var(--ok)" sub="numbers and operators" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'operator', shape: 'dot' },
            { color: 'var(--info)', label: 'number', shape: 'dot' },
            { color: 'var(--dim)', label: 'dropped from the AST', shape: 'square' },
          ]}
        />
      }
      controls={[<>{picker}</>, controls]}
    >
      <div className="pa stage-pad">
        {r.ast && r.treeRoot ? (
          <div className="pa-trees">
            <div className="pa-treecol">
              <SectionTitle>Parse tree (one node per call, as this parser walks it)</SectionTitle>
              <WideRegion minWidth={Math.min(ptW, 520)} label="Parse tree: scroll sideways to see all of it">
                <div style={{ maxWidth: ptW, margin: '0 auto' }}>
                  <TreeSvg
                    shape={{ root: r.treeRoot, children: (id) => tree[id].children }}
                    layout="tidy"
                    width={ptW}
                    height={ptH}
                    levelGap={50}
                    top={24}
                    className="pa-pt"
                    ariaLabel="Full parse tree"
                    nodeClass={(id) => (tree[id].kept ? (/^[0-9.]+$/.test(tree[id].label) ? 'pa-num' : 'pa-op') : 'is-dropped')}
                    renderNode={(id) => {
                      const n = tree[id];
                      const w = Math.max(28, n.label.length * 8 + 14);
                      return (
                        <>
                          <rect x={-w / 2} y={-13} width={w} height={26} rx={n.isCall ? 5 : 13} />
                          <text y={4.5} textAnchor="middle">
                            {n.label}
                          </text>
                        </>
                      );
                    }}
                  />
                </div>
              </WideRegion>
            </div>
            <div className="pa-treecol">
              <SectionTitle>AST</SectionTitle>
              <WideRegion minWidth={minWidthForText(AST_W, 13)} label="AST: scroll sideways to see all of it">
                <AstView asts={[r.ast]} ariaLabel="The AST" />
              </WideRegion>
            </div>
          </div>
        ) : (
          <p className="empty-note">fix the expression to compare the trees</p>
        )}
      </div>
    </StageFrame>
  );
}
