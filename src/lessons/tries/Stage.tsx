import { useMemo, useState } from 'react';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark, type TreeShape } from '../../components/TreeSvg';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextArea, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { actionFrames, type Action } from './frames';
import {
  buildTrie, depthOf, leafCount, parseList, parseWord, PRESETS, radixNodeFor, radixShape, ROOT_ID, scanCost, SLOTS_PER_NODE, subtree, totalChars, trieShape,
  trieLookups,
} from './model';
import './styles.css';

const STEP_MS = 900;
const COL_W = 46;
const PAD = 40;
const MIN_W = 560;
const LEVEL_GAP = 40;
const TOP = 26;
const NODE_R = 12;
/** Node label size in drawing units (styles.css). */
const LABEL_PX = 13;
const CHAR_W = 8;
const DIM_OPACITY = 0.3;
const RING_GAP = 4;
const COL_SPACE = 4;
const PILL_PAD = 12;
/** A node's drawn width: a circle for one letter, a pill for a run of letters. */
const pillWidth = (label: string) => Math.max(2 * NODE_R, label.length * CHAR_W + PILL_PAD);

type Field = 'list' | 'prefix' | 'word';

export function Stage() {
  const [before, setBefore] = useState<string[]>([...PRESETS[0].words]);
  const [action, setAction] = useState<Action>({ kind: 'build', note: null });
  const [listText, setListText] = useState<string>(PRESETS[0].words.join(', '));
  const [prefix, setPrefix] = useState('');
  const [word, setWord] = useState('');
  const [error, setError] = useState<{ field: Field; text: string } | null>(null);
  const [compress, setCompress] = useState(false);

  const { frames, after } = useMemo(() => actionFrames(before, action), [before, action]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  const run = (next: Action) => {
    setBefore(after);
    setAction(next);
    setError(null);
  };
  const build = (words: string[], note: string | null) => {
    setBefore(words);
    setAction({ kind: 'build', note });
    setError(null);
  };
  const applyList = () => {
    const r = parseList(listText);
    if (!r.ok) return setError({ field: 'list', text: r.error });
    build(r.words, r.note);
  };
  const onPrefix = (text: string) => {
    setPrefix(text);
    if (text !== '' && !/^[a-z]+$/.test(text)) return setError({ field: 'prefix', text: 'A prefix is lowercase letters a-z.' });
    run({ kind: 'search', prefix: text });
  };
  const act = (kind: 'insert' | 'delete') => {
    const r = parseWord(word);
    if (!r.ok) return setError({ field: 'word', text: r.error });
    run({ kind, word: r.word });
  };

  const root = useMemo(() => buildTrie(f.words), [f.words]);
  const shape = useMemo(() => (compress ? radixShape(root) : trieShape(root)), [root, compress]);
  const plainNodes = useMemo(() => trieShape(root).size, [root]);
  const radixNodes = useMemo(() => radixShape(root).size, [root]);
  // Columns fit the widest label (pills in the compressed view) plus its ring, so neighbours never overlap.
  const widest = Math.max(...[...shape.values()].map((n) => pillWidth(n.label)));
  const width = Math.max(MIN_W, leafCount(shape) * Math.max(COL_W, widest + RING_GAP * 2 + COL_SPACE) + 2 * PAD);
  const height = TOP + depthOf(shape) * LEVEL_GAP + 2 * NODE_R + 16;

  const treeShape: TreeShape<string> = { root: ROOT_ID, children: (id) => shape.get(id)?.children ?? [] };
  // In the compressed view a trie position can fall mid-edge: mark the radix node whose edge holds it.
  const at = (id: string) => (compress ? radixNodeFor(shape, id) ?? id : id);
  const hot = f.hot === null ? null : at(f.hot);
  const created = f.created.map(at);
  const pruned = f.pruned.map(at);
  const pathSet = new Set(f.path.map(at));
  const foundSet = new Set(f.found === null ? [] : subtree(shape, at(f.found)));
  const mark = (id: string): TreeNodeMark | null => {
    if (pruned.includes(id)) return { tone: 'bad', fill: 'solid' };
    if (id === hot) return { tone: 'hi', fill: 'solid' };
    if (created.includes(id)) return { tone: 'info', fill: 'solid' };
    if (pathSet.has(id)) return { tone: 'violet', fill: 'tint', tint: 28 };
    if (foundSet.has(id)) return { tone: 'info', fill: 'tint', tint: 24 };
    return null;
  };
  const searching = action.kind === 'search' && f.completions !== null;
  const opacity = (id: string) => (searching && id !== ROOT_ID && !foundSet.has(id) && !pathSet.has(id) ? DIM_OPACITY : 1);

  const lastPrefix = action.kind === 'search' ? action.prefix : null;
  const cost = lastPrefix === null ? null : { trie: trieLookups(buildTrie(after), lastPrefix), scan: scanCost(after, lastPrefix) };
  const chars = totalChars(f.words);

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Trie nodes" value={plainNodes} color="var(--violet)" sub="distinct prefixes + root" />
          <Stat label="Radix nodes" value={radixNodes} color="var(--info)" sub={`saves ${plainNodes - radixNodes}`} />
          <Stat label="Letters in the list" value={chars} color="var(--muted)" sub={`${f.words.length} words`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'letter now' },
            { color: 'var(--violet)', label: 'matched path' },
            { color: 'var(--info)', label: 'new node / completions' },
            { color: 'var(--ok)', label: 'end of a word (ring)', shape: 'dot' },
            { color: 'var(--bad)', label: 'pruned' },
            { color: 'var(--dim)', label: 'not matched' },
          ]}
        />
      }
      controls={[
        <>
          <TextField label="Prefix" value={prefix} onChange={onPrefix} width={120} spellCheck={false} placeholder="type to search" />
          <TextField label="Word" value={word} onChange={setWord} onEnter={() => act('insert')} width={130} spellCheck={false} />
          <Button onClick={() => act('insert')}>Insert</Button>
          <Button onClick={() => act('delete')}>Delete</Button>
          <Toggle label="View" value={compress} onChange={setCompress} off="Trie" on="Compressed" />
          {error && error.field !== 'list' && (
            <Hint tone="muted" className="tr-note">
              <span role="status">{error.text}</span>
            </Hint>
          )}
        </>,
        <>
          <ControlGroup label="Presets" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={action.kind === 'build' && before.join() === p.words.join()} onClick={() => {
                setListText(p.words.join(', '));
                build([...p.words], null);
              }}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <TextArea label="Your words" value={listText} onChange={setListText} rows={2} className="tr-list" />
          <Button onClick={applyList}>Build trie</Button>
          <Hint tone={error?.field === 'list' ? 'muted' : 'faint'} className="tr-note">
            <span role="status">{error?.field === 'list' ? error.text : 'Up to 16 words of lowercase letters, separated by commas, spaces or new lines.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="tr stage-pad">
        <WideRegion minWidth={Math.max(MIN_W, minWidthForText(width, LABEL_PX))} label="Trie: scroll sideways to see all of it">
          <TreeSvg
            shape={treeShape}
            layout="tidy"
            width={width}
            height={height}
            top={TOP}
            pad={PAD}
            levelGap={LEVEL_GAP}
            className="tr-tree"
            ariaLabel={`${compress ? 'Radix tree' : 'Trie'} of ${f.words.length} words: ${f.words.join(', ')}`}
            hidden={(id) => f.hidden.includes(id)}
            nodeMark={mark}
            nodeOpacity={opacity}
            edgeMark={(p, c) => (pathSet.has(c) ? { tone: 'violet' } : foundSet.has(c) && foundSet.has(p) ? { tone: 'info' } : null)}
            renderNode={(id) => {
              const n = shape.get(id)!;
              const label = id === ROOT_ID ? '·' : n.label;
              const w = pillWidth(label);
              const ring = n.end && id !== f.unmarked;
              return (
                <>
                  {w > 2 * NODE_R ? <rect x={-w / 2} y={-NODE_R} width={w} height={2 * NODE_R} rx={NODE_R} /> : <circle r={NODE_R} />}
                  {ring && (w > 2 * NODE_R
                    ? <rect className="tr-ring" x={-w / 2 - RING_GAP} y={-NODE_R - RING_GAP} width={w + 2 * RING_GAP} height={2 * NODE_R + 2 * RING_GAP} rx={NODE_R + RING_GAP} />
                    : <circle className="tr-ring" r={NODE_R + RING_GAP} />)}
                  <text y={4} textAnchor="middle">{label}</text>
                </>
              );
            }}
          />
        </WideRegion>
        {compress && <Hint block>Compressed view: single-child chains are merged into one edge. Captions still count the plain trie's steps; a letter that falls inside a merged edge lights that edge's node.</Hint>}
        <div className="tr-panels">
          <Tray stack label={lastPrefix === null ? 'Completions' : `Completions of “${lastPrefix}”`} empty={lastPrefix === null ? 'type a prefix' : 'none'} className="tr-completions">
            {f.completions?.length ? f.completions.map((w) => <span key={w} className="chip tone-info">{w}</span>) : null}
          </Tray>
          <Box className="tr-cost">
            <SectionTitle>Cost of one prefix lookup</SectionTitle>
            {cost ? (
              <ul className="tr-cost-list">
                <li><span>Trie: child lookups</span><b>{cost.trie}</b></li>
                <li><span>List: startsWith calls</span><b>{cost.scan.calls}</b></li>
                <li><span>List: character checks</span><b>{cost.scan.chars}</b></li>
              </ul>
            ) : (
              <p className="empty-note">type a prefix to compare</p>
            )}
            <Hint block>
              Memory is a different story: with one {SLOTS_PER_NODE}-slot child array per node (one common layout), these {plainNodes} nodes
              hold {plainNodes * SLOTS_PER_NODE} slots, against {chars} letters in the plain list. Nothing simulated: computed live.
            </Hint>
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}
