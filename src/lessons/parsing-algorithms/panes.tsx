import { ArrayStrip } from '../../components/ArrayStrip';
import { SectionTitle } from '../../components/Panel';
import { WideRegion } from '../../components/WideRegion';
import type { Tone } from '../../core/tone';
import { derivationText } from './captions';
import { isNonterminal } from './grammar';
import { ParseTree, TREE_MIN_WIDTH } from './ParseTree';
import type { BuFrame, BuRun, TdFrame, TdRun } from './runs';

const TOKEN_CELL_MAX = 44;

function TokenStrip({ tokens, pos }: { tokens: readonly string[]; pos: number }) {
  if (tokens.length === 0) return <p className="empty-note">the empty input</p>;
  return (
    <ArrayStrip
      values={tokens}
      cellMax={TOKEN_CELL_MAX}
      cellState={(i) => (i < pos ? 'done' : i === pos ? 'active' : 'idle')}
    />
  );
}

const symbolClass = (s: string) => (isNonterminal(s) ? 'pa-sym is-nonterminal' : 'pa-sym');

function Verdict({ message, generated }: { message: string; generated: boolean }) {
  return (
    <p className="pa-detail" role="status">
      {message} The grammar {generated ? 'does' : 'does not'} generate this string (checked by a separate recogniser).
    </p>
  );
}

/** The top-down parser at one step: expected symbols, the input, the tree growing from the root, the leftmost derivation so far. */
export function TopDownPane({ run, index, tokens, generated }: { run: TdRun; index: number; tokens: readonly string[]; generated: boolean }) {
  const f: TdFrame = run.frames[index];
  const expansions = run.frames.slice(0, index + 1).filter((x) => x.kind === 'expand').length;
  const marks = new Map<number, Tone>();
  if (f.node !== null) marks.set(f.node, f.kind === 'match' ? 'ok' : 'hi');
  const finished = index === run.frames.length - 1;
  return (
    <section className="pa-pane" aria-label="Top-down parser">
      <SectionTitle>Top-down (LL): expected symbols</SectionTitle>
      <TokenStrip tokens={tokens} pos={f.pos} />
      <ol className="pa-stack" aria-label="Stack of expected symbols, next first">
        {f.stack.length ? f.stack.map((s, i) => (
          <li key={`${i}-${s.node}`} className={`${symbolClass(s.symbol)} ${i === 0 ? 'is-top' : ''}`}>
            {s.symbol}
          </li>
        )) : <li className="empty-note">empty</li>}
      </ol>
      <p className="pa-detail">{f.action}</p>
      <WideRegion minWidth={TREE_MIN_WIDTH} label="Top-down parse tree: scroll sideways to see all of it">
        <ParseTree nodes={run.nodes} roots={[0]} hiddenFrom={f.poolSize} marks={marks} tone="info" ariaLabel="Top-down parse tree, grown from the root" />
      </WideRegion>
      <p className="pa-derivation">
        <b>Leftmost derivation:</b> {derivationText(run.forms.slice(0, expansions + 1), '⇒')}
      </p>
      {finished ? <Verdict message={run.message} generated={generated} /> : null}
    </section>
  );
}

/** The bottom-up parser at one step: the state and symbol stack, the input, the trees joined so far, the reversed rightmost derivation so far. */
export function BottomUpPane({ run, index, tokens, generated }: { run: BuRun; index: number; tokens: readonly string[]; generated: boolean }) {
  const f: BuFrame = run.frames[index];
  const reduces = run.frames.slice(0, index + 1).filter((x) => x.kind === 'reduce').length;
  const marks = new Map<number, Tone>();
  if (f.node !== null) marks.set(f.node, f.kind === 'reduce' ? 'ok' : 'hi');
  const roots = f.stack.flatMap((e) => (e.node === null ? [] : [e.node]));
  const finished = index === run.frames.length - 1;
  return (
    <section className="pa-pane" aria-label="Bottom-up parser">
      <SectionTitle>Bottom-up (LR): state and symbol stack</SectionTitle>
      <TokenStrip tokens={tokens} pos={f.pos} />
      <ol className="pa-stack" aria-label="Stack of states and symbols, top first">
        {[...f.stack].reverse().map((e, i) => (
          <li key={`${f.stack.length - 1 - i}`} className={`${e.symbol ? symbolClass(e.symbol) : 'pa-sym'} ${i === 0 ? 'is-top' : ''}`}>
            {e.symbol ? `${e.symbol} (state ${e.state})` : `state ${e.state}`}
          </li>
        ))}
      </ol>
      <p className="pa-detail">{f.action}</p>
      <WideRegion minWidth={TREE_MIN_WIDTH} label="Bottom-up parse trees: scroll sideways to see all of them">
        <ParseTree nodes={run.nodes} roots={roots} hiddenFrom={run.nodes.length} marks={marks} tone="violet" ariaLabel="Bottom-up parse trees, built from the leaves" />
      </WideRegion>
      <p className="pa-derivation">
        <b>Rightmost derivation, read backwards:</b> {derivationText(run.forms.slice(0, reduces + 1), '⇐')}
      </p>
      {finished ? <Verdict message={run.message} generated={generated} /> : null}
    </section>
  );
}
