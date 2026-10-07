import { useMemo, useState } from 'react';
import { Bar } from '../../components/Bar';
import { BitStrip } from '../../components/BitStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark, type TreeShape } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import type { BitGroup } from '../../core/bits';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { framesFor, type Mode } from './frames';
import { buildHuffman, costs, depthOf, DEFAULT_TEXT, encode, frequencies, parseMessage, showSym, type Huffman, type TieBreak } from './model';
import './styles.css';

const BUILD_MS = 1100;
const DECODE_MS = 520;
const PRESETS = [DEFAULT_TEXT, 'abracadabra', 'she sells sea shells', 'aaaa'];
/** Horizontal room per leaf in the tree's viewBox, and the narrowest the tree ever draws. */
const LEAF_W = 44;
const TREE_MIN_W = 520;
const TREE_PAD = 30;
const LEVEL_GAP = 50;
const TREE_TOP = 26;
/** Room under the deepest leaf for its weight label. */
const TREE_BOTTOM = 44;
/** The smallest text in the tree (leaf weights), for the phone scroll width. */
const TREE_SMALL_TEXT = 10;
const LEAF_R = 16;
const INNER_R = 14;

export function Stage() {
  const [mode, setMode] = useState<Mode>('build');
  const [tie, setTie] = useState<TieBreak>('old');
  const [raw, setRaw] = useState(DEFAULT_TEXT);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [note, setNote] = useState('');

  const h = useMemo(() => buildHuffman(text, tie), [text, tie]);
  const frames = useMemo(() => framesFor(mode, h, tie), [mode, h, tie]);
  const player = usePlayer(frames, { interval: mode === 'build' ? BUILD_MS : DECODE_MS });
  const f = player.frame;
  const c = costs(h);
  const bits = encode(h);

  const edit = (v: string) => {
    setRaw(v);
    const r = parseMessage(v);
    if (r.ok) {
      setText(r.text);
      setNote('');
    } else setNote(`${r.error} Still showing "${text}".`);
  };

  const leafCount = h.leaves.length;
  const treeW = Math.max(TREE_MIN_W, leafCount * LEAF_W + 2 * TREE_PAD);
  const depth = Math.max(0, ...h.leaves.map((id) => depthOf(h, id)));
  const treeH = TREE_TOP + depth * LEVEL_GAP + TREE_BOTTOM;
  const shape: TreeShape<number> = {
    roots: f.roots,
    children: (id) => (h.nodes[id].sym !== undefined ? [] : [h.nodes[id].left!, h.nodes[id].right!]),
  };
  const merging = new Set(f.merging);
  const onPath = new Set(f.path);

  const nodeMark = (id: number): TreeNodeMark | null => {
    const leaf = h.nodes[id].sym !== undefined;
    if (mode === 'decode') {
      if (id === f.at) return { tone: f.emitted !== null ? 'ok' : 'hi', fill: 'solid' };
      if (onPath.has(id)) return { tone: 'hi', fill: 'tint', tint: 26 };
      return leaf ? { tone: 'ok', fill: 'tint' } : null;
    }
    if (merging.has(id)) return { tone: 'hi', fill: 'solid' };
    if (id === f.parent) return { tone: 'info', fill: 'solid' };
    return f.finished && leaf ? { tone: 'ok', fill: 'tint' } : null;
  };

  // The encoded bits, grouped per character with the character under its code.
  const chars = Array.from(text);
  const groups: BitGroup[] = [];
  let from = 0;
  chars.forEach((ch) => {
    const len = h.codes.get(ch)!.length;
    groups.push({ from, to: from + len - 1, label: showSym(ch) });
    from += len;
  });
  const bitTone = (i: number) => (mode !== 'decode' || f.cursor === null ? 'info' : i === f.cursor ? 'hi' : i < f.cursor ? 'ok' : 'info');
  const queue = f.roots;

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Characters" value={c.n} color="var(--muted)" sub={`${c.distinct} distinct`} />
          <Stat label="Huffman bits" value={c.huffman} color="var(--ok)" sub={`${(c.huffman / c.n).toFixed(2)} per character`} />
          <Stat label="Entropy" value={c.entropy.toFixed(2)} color="var(--muted)" sub="bits per character, the floor" />
        </Stats>
      }
      legend={
        <Legend
          items={
            mode === 'build'
              ? [
                  { color: 'var(--hi)', label: 'being merged', shape: 'dot' },
                  { color: 'var(--info)', label: 'new parent', shape: 'dot' },
                  { color: 'var(--ok)', label: 'finished leaf', shape: 'dot' },
                  { color: 'var(--violet)', label: 'edge bit 0 / 1', shape: 'dot' },
                ]
              : [
                  { color: 'var(--hi)', label: 'decode cursor and path', shape: 'dot' },
                  { color: 'var(--ok)', label: 'leaf reached / bits read', shape: 'dot' },
                  { color: 'var(--violet)', label: 'edge bit 0 / 1', shape: 'dot' },
                ]
          }
        />
      }
      controls={[
        <>
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'build', label: 'Build the tree' },
              { value: 'decode', label: 'Decode' },
            ]}
          />
          <Toggle label="Ties go to" value={tie === 'new'} onChange={(v) => setTie(v ? 'new' : 'old')} off="Older tree" on="Newer tree" />
        </>,
        <>
          <TextField label="Message" value={raw} onChange={edit} width={240} spellCheck={false} className="hf-field" />
          {PRESETS.map((p) => (
            <ChipButton key={p} tone="info" on={text === p} onClick={() => edit(p)}>
              {p}
            </ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="hf stage-pad">
        <p className={`hf-note ${note ? 'is-error' : ''}`} role="status">
          {note}
        </p>
        <div className="hf-main">
          <WideRegion minWidth={Math.max(TREE_MIN_W, minWidthForText(treeW, TREE_SMALL_TEXT))} label="Huffman tree: scroll sideways to see all of it">
            <TreeSvg
              shape={shape}
              layout="tidy"
              forestGap={0.4}
              width={treeW}
              height={treeH}
              pad={TREE_PAD}
              top={TREE_TOP}
              levelGap={LEVEL_GAP}
              className="hf-tree"
              ariaLabel={`Huffman forest, ${queue.length} ${queue.length === 1 ? 'tree' : 'trees'}`}
              nodeMark={nodeMark}
              edgeMark={(p, ch) => (mode === 'decode' && onPath.has(p) && onPath.has(ch) ? { tone: 'hi' } : null)}
              renderNode={(id) => <NodeShape h={h} id={id} />}
              overlay={({ at }) =>
                f.finished &&
                h.nodes
                  .filter((n) => n.sym === undefined && at(n.id))
                  .flatMap((n) =>
                    [n.left!, n.right!].map((ch, k) => {
                      const a = at(n.id)!;
                      const b = at(ch);
                      if (!b) return null;
                      const side = k === 0 ? -1 : 1;
                      return (
                        <text key={`${n.id}-${ch}`} className="hf-edge-bit" x={(a.x + b.x) / 2 + side * 9} y={(a.y + b.y) / 2 + 2} textAnchor="middle">
                          {k}
                        </text>
                      );
                    }),
                  )
              }
            />
          </WideRegion>
        </div>
        <Tray label={mode === 'decode' ? <>Encoded message · decoded so far: <span className="keep-case">"{f.decoded}"</span></> : 'Encoded message'} labelWeight="regular" stack ariaLabel="Encoded message">
          {f.finished ? (
            <BitStrip
              bits={[...bits].map((b) => (b === '1' ? 1 : 0))}
              size="sm"
              clear="toned"
              groups={groups}
              toneOf={bitTone}
              ariaLabel={`Encoded message, ${bits.length} bits`}
            />
          ) : (
            <span className="empty-note">The bits appear once the tree is finished and the codes are known.</span>
          )}
        </Tray>
        <div className="hf-side">
          <Tray label="Queue, lightest first" labelWeight="regular" stack ariaLabel="Priority queue">
            <div className="hf-queue">
              {queue.map((id) => {
                const n = h.nodes[id];
                const cls = merging.has(id) ? 'tone-hi is-on' : id === f.parent ? 'tone-info is-on' : 'tone-muted';
                return (
                  <span key={id} className={`chip hf-q ${cls}`}>
                    {n.sym !== undefined ? `${showSym(n.sym)} ${n.weight}` : `tree ${n.weight}`}
                  </span>
                );
              })}
            </div>
            <Hint>A sorted list stands in for the min-heap a real encoder would use (see the heaps lesson).</Hint>
          </Tray>
          <Tray label="Frequencies and codes" labelWeight="regular" stack ariaLabel="Frequencies and codes">
            <CodeTable h={h} finished={f.finished} current={mode === 'decode' ? f.emitted : null} />
          </Tray>
          <Tray label="Message bits" labelWeight="regular" stack ariaLabel="Savings meter">
            <Bar value={c.huffman} max={c.ascii} tone="ok" height={10} label="Huffman" trailing={`${c.huffman} bits`} />
            <Bar value={c.fixedBits} max={c.ascii} tone="muted" height={10} label={`Fixed ${c.fixedWidth}-bit`} trailing={`${c.fixedBits} bits`} />
            <Bar value={c.ascii} max={c.ascii} tone="bad" height={10} label="8-bit ASCII" trailing={`${c.ascii} bits`} />
            <Hint>
              Nothing simulated: computed live from your text. The tree has to be stored or sent too; this meter counts only the message bits.
            </Hint>
          </Tray>
        </div>
      </div>
    </StageFrame>
  );
}

function NodeShape({ h, id }: { h: Huffman; id: number }) {
  const n = h.nodes[id];
  if (n.sym === undefined) {
    return (
      <>
        <circle r={INNER_R} />
        <text y={4} textAnchor="middle" className="hf-weight">
          {n.weight}
        </text>
      </>
    );
  }
  return (
    <>
      <circle r={LEAF_R} />
      <text y={5} textAnchor="middle">
        {showSym(n.sym)}
      </text>
      <text y={LEAF_R + 14} textAnchor="middle" className="hf-leaf-count">
        ×{n.weight}
      </text>
    </>
  );
}

function CodeTable({ h, finished, current }: { h: Huffman; finished: boolean; current: string | null }) {
  return (
    <table className="data-table hf-table">
      <thead>
        <tr>
          <th scope="col">Char</th>
          <th scope="col">Count</th>
          <th scope="col">Code</th>
          <th scope="col">Bits</th>
        </tr>
      </thead>
      <tbody>
        {frequencies(h.text).map((f) => {
          const code = h.codes.get(f.sym)!;
          return (
            <tr key={f.sym} className={f.sym === current ? 'is-current' : ''}>
              <th scope="row" className="hf-sym">{showSym(f.sym)}</th>
              <td>{f.count}</td>
              <td className="hf-code">{finished ? code : '…'}</td>
              <td>{finished ? `${f.count} × ${code.length} = ${f.count * code.length}` : '…'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

