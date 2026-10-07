import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { GraphView, type GraphEdge, type GraphNode, type LoopSide, type Pt } from '../../components/GraphView';
import { SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import type { State } from '../../core/automata';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { lexFrames, showChar } from './frames';
import { ACCEPTS, DISCARDED, LEXER, MOVES, PRESETS, STATE_LABEL, checkSource, lex, position, type Kind, type Token } from './model';
import './styles.css';

const STEP_MS = 750;
const GRAPH_W = 580;
const GRAPH_H = 470;
const GRAPH_MIN = 480;

/** Token chips and DFA states share one colour per kind. */
const KIND_TONE: Record<Kind, Tone> = {
  NUMBER: 'info', IDENT: 'violet', KEYWORD: 'amber', OP: 'sky', STRING: 'pink', LPAREN: 'muted', RPAREN: 'muted', WS: 'dim', COMMENT: 'dim', ERROR: 'bad',
};

const CENTER: Pt = { x: 220, y: 235 };
/** A point `r` out from S at `deg` degrees (0 = right, clockwise), squashed vertically to fit. */
const polar = (deg: number, r: number): Pt => ({
  x: Math.round(CENTER.x + r * Math.cos((deg * Math.PI) / 180)),
  y: Math.round(CENTER.y + r * 0.8 * Math.sin((deg * Math.PI) / 180)),
});
/** S in the middle, each token kind in its own direction, longer tokens further out along it. */
const AT: Record<State, Pt> = {
  S: CENTER,
  ws: polar(-90, 140), int: polar(-30, 140), dot: polar(-30, 250), frac: polar(-36, 345), id: polar(-125, 140), lp: polar(-165, 140), rp: polar(150, 140),
  op: polar(0, 140), plus: polar(30, 140), pp: polar(30, 250), slash: polar(70, 140), cmt: polar(52, 250), str: polar(110, 140), strEnd: polar(110, 250),
};

/** Self-loops that would sit on an edge into the state go on its free side instead. */
const LOOP_SIDE: Partial<Record<State, LoopSide>> = { str: 'left', cmt: 'right' };
/** Labels on S's spokes sit past the middle, out of the crowd round S. */
const SPOKE_LABEL_AT = 0.62;

const NODES: GraphNode<State>[] = LEXER.states.map((s) => ({ id: s, label: STATE_LABEL[s], at: AT[s], accept: s in ACCEPTS, loopSide: LOOP_SIDE[s] }));
const EDGES: GraphEdge<State>[] = MOVES.map((m) => ({ from: m.from, to: m.to, label: m.label, ...(m.from === 'S' && { labelAt: SPOKE_LABEL_AT }) }));

export function Stage() {
  const [presetId, setPresetId] = useState<string>(PRESETS[0].id);
  const [text, setText] = useState<string>(PRESETS[0].source);
  const [source, setSource] = useState<string>(PRESETS[0].source);
  const [error, setError] = useState<string | null>(null);
  const [identsFirst, setIdentsFirst] = useState(false);
  const opts = useMemo(() => ({ keywordsFirst: !identsFirst }), [identsFirst]);
  const frames = useMemo(() => lexFrames(source, opts), [source, opts]);
  const tokens = useMemo(() => lex(source, opts), [source, opts]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const done = tokens.slice(0, f.emitted);
  const shown = done.filter((t) => !DISCARDED.includes(t.kind));
  const errors = done.filter((t) => t.kind === 'ERROR').length;
  const cursor = f.read >= 0 ? position(source, f.read) : { line: 1, col: 0 };

  const load = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setText(p.source);
    setSource(p.source);
    setError(null);
  };
  const type = (next: string) => {
    setText(next);
    setPresetId('');
    const r = checkSource(next);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    // Typing rebuilds the whole stream at once: jump to the last frame.
    player.queueNext({ play: false, from: Number.MAX_SAFE_INTEGER });
    setSource(r.source);
  };

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Tokens out" value={shown.length - errors} color="var(--violet)" sub={`of ${tokens.filter((t) => !DISCARDED.includes(t.kind) && t.kind !== 'ERROR').length}`} />
          <Stat label="Errors" value={errors} color={errors ? 'var(--bad)' : 'var(--muted)'} />
          <Stat label="Cursor" value={f.read >= 0 ? `${cursor.line}:${cursor.col}` : '–'} sub="line:column" color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'being scanned', shape: 'square' },
            { color: 'var(--ok)', label: 'last accepting spot', shape: 'line' },
            { color: 'var(--orange)', label: 'read past, given back', shape: 'square' },
            { color: 'var(--dim)', label: 'discarded', shape: 'square' },
            { color: 'var(--bad)', label: 'error', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          <ControlGroup label="Line">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={p.id === presetId} onClick={() => load(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Toggle label="Rule order" value={identsFirst} onChange={setIdentsFirst} off="Keywords first" on="Identifiers first" />
        </>,
        <>
          <TextField label="Type your own line" value={text} onChange={type} width={320} spellCheck={false} className="lx-field" />
          <Hint tone="muted" block>
            <span role="status">{error ? <span className="lx-error">{error} The stream keeps the last line that fit.</span> : null}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="lx stage-pad">
        <div className="lx-main">
          <CodePanel title="Source" lines={[source]} gutter="number" renderLine={(line) => <SourceLine line={line} tokens={tokens} f={f} />} className="lx-code" />
          <Tray label="Token stream (what the parser gets)" labelWeight="regular" empty="no tokens yet" ariaLabel="Token stream" className="lx-tray">
            {shown.length > 0 &&
              shown.map((t) => (
                <span key={t.start} className={`chip tone-${KIND_TONE[t.kind]} lx-token`}>
                  {t.kind === 'ERROR' ? <>ERROR {t.line}:{t.col} {t.message}</> : <>{t.kind} {t.text}</>}
                </span>
              ))}
          </Tray>
          <div className="lx-kinds" aria-hidden>
            {(['NUMBER', 'IDENT', 'KEYWORD', 'OP', 'STRING', 'LPAREN'] as Kind[]).map((k) => (
              <span key={k} className={`chip tone-${KIND_TONE[k]}`}>
                {k === 'LPAREN' ? 'LPAREN / RPAREN' : k}
              </span>
            ))}
          </div>
          <Hint block>A teaching lexer for a small language; real languages have more token kinds and edge cases. It runs live on whatever you type.</Hint>
        </div>
        <div className="lx-side">
          <SectionTitle>Combined lexer DFA</SectionTitle>
          <WideRegion minWidth={GRAPH_MIN} label="Lexer DFA: scroll sideways to see all of it">
            <GraphView
              nodes={NODES}
              edges={EDGES}
              directed
              startNode="S"
              width={GRAPH_W}
              height={GRAPH_H}
              radius={20}
              className="lx-graph"
              ariaLabel={`Combined lexer DFA, ${NODES.length} states; current state ${f.state ? STATE_LABEL[f.state] : 'none (stuck)'}`}
              nodeColor={(id) => (id in ACCEPTS ? `var(--${KIND_TONE[ACCEPTS[id]]})` : undefined)}
              nodeMark={(id) => (id === f.state ? { tone: 'hi', fill: 'solid' } : null)}
              edgeMark={(e) => (f.edgeFrom !== null && e.from === f.edgeFrom && e.to === f.state ? { tone: 'hi', width: 3.5 } : null)}
            />
          </WideRegion>
          <Hint block>
            One accepting state (double ring) per token kind, coloured like its chips. {f.state === null && f.scanStart !== null ? <b className="lx-stuck">Stuck: no arrow for that character.</b> : null}
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}

/** The source line, each character styled by what the lexer has done with it so far. */
function SourceLine({ line, tokens, f }: { line: string; tokens: readonly Token[]; f: ReturnType<typeof lexFrames>[number] }) {
  const doneTo = f.emitted > 0 ? tokens[f.emitted - 1].end : 0;
  const tokenAt = (i: number) => tokens.find((t) => i >= t.start && i < t.end);
  const parts: ReactNode[] = [];
  // Step by code point, so an emoji stays one glyph.
  for (let i = 0, len = 1; i < line.length; i += len) {
    len = String.fromCodePoint(line.codePointAt(i)!).length;
    const t = tokenAt(i);
    let cls = 'lx-ch';
    if (i < doneTo && t) cls += DISCARDED.includes(t.kind) ? ' is-dropped' : t.kind === 'ERROR' ? ' is-error' : ' is-done';
    else if (f.scanStart !== null && i >= f.scanStart && i <= f.read) cls += f.acceptEnd !== null && i >= f.acceptEnd ? ' is-past' : ' is-scan';
    else if (i > f.read) cls += ' is-ahead';
    if (f.acceptEnd !== null && f.scanStart !== null && i === f.acceptEnd) parts.push(<span key={`m${i}`} className="lx-mark" aria-hidden />);
    parts.push(
      <span key={i} className={cls}>
        {line[i] === ' ' && cls.includes('is-past') ? showChar(' ') : line.slice(i, i + len)}
      </span>,
    );
  }
  if (f.acceptEnd === line.length && f.scanStart !== null) parts.push(<span key="mend" className="lx-mark" aria-hidden />);
  return <>{parts}</>;
}
