import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Arrow, Plot2D, PointLabels, Points, Segments } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useRadioGroup } from '../../components/useRadioGroup';
import { useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import type { Point } from '../../core/plot';
import type { Tone } from '../../core/tone';
import { cosine } from '../../core/vec';
import { CLOSE, KEPT, analogyCaption, compareCaption, num, pairCaption, queryCaption } from './frames';
import {
  ANALOGIES, DIMS, DIM_NOTE, DOCUMENTS, GROUPS, MAP, MAP_POINTS, TOP_K, VOCAB, analogy, keywordOverlap, lookup, misleadingPair, neighbours,
  phraseVector, project, rankDocuments, type Group, type Neighbour,
} from './model';
import './styles.css';

type Scene = 'map' | 'meaning';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'map', label: 'Word map' },
  { value: 'meaning', label: 'Words vs meaning' },
];

const GROUP_TONE: Record<Group, Tone> = { animals: 'orange', food: 'pink', vehicles: 'sky', repair: 'amber', describing: 'muted' };
const HONEST = 'Toy embeddings: 60 hand-made 8-dimensional vectors, not a trained neural model. Real models learn hundreds of dimensions from text, and their dimensions don\'t have names.';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'map' });
  return scene === 'map' ? <MapScene picker={picker} /> : <MeaningScene picker={picker} />;
}

// ── Word map ─────────────────────────────────────────────────────────

type Mode = { kind: 'query' } | { kind: 'analogy'; id: string } | { kind: 'pair' };

const MAP_W = 400;
const MAP_H = 330;
const PAIR = misleadingPair();
const xs = MAP_POINTS.map((p) => p[0]);
const ys = MAP_POINTS.map((p) => p[1]);
const PAD = 0.15;
const X_DOMAIN: [number, number] = [Math.min(...xs) - PAD, Math.max(...xs) + PAD];
const Y_DOMAIN: [number, number] = [Math.min(...ys) - PAD, Math.max(...ys) + PAD];
const START = 'kitten';
const MAX_CHARS = 60;

function MapScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState(START);
  const [mode, setMode] = useState<Mode>({ kind: 'query' });
  const [byGroup, setByGroup] = useState(false);
  const [allLabels, setAllLabels] = useState(false);
  const setCaption = useSetCaption();

  const phrase = useMemo(() => phraseVector(text), [text]);
  const an = mode.kind === 'analogy' ? ANALOGIES.find((a) => a.id === mode.id)! : null;
  const anResult = an ? analogy(an) : null;
  const vector = mode.kind === 'pair' ? PAIR.a.v : anResult ? anResult.vector : phrase.ok ? phrase.vector : null;
  const exclude = mode.kind === 'pair' ? [PAIR.a.word] : an ? [an.a, an.b, an.c] : phrase.ok ? phrase.known : [];
  const top: Neighbour[] = vector ? neighbours(vector, TOP_K, exclude) : [];
  const at: Point | null = vector ? project(MAP, vector) : null;
  const queryWords = mode.kind === 'pair' ? [PAIR.a.word] : an ? [an.a, an.b, an.c] : phrase.ok ? phrase.known : [];
  const topWords = mode.kind === 'pair' ? [PAIR.b.word] : top.map((n) => n.word.word);
  const checked = VOCAB.findIndex((w) => mode.kind === 'query' && text.trim().toLowerCase() === w.word);

  useEffect(() => {
    if (mode.kind === 'pair') setCaption(pairCaption(PAIR.a.word, PAIR.b.word, PAIR.dist2d, PAIR.cos));
    else if (an) setCaption(analogyCaption(an));
    else setCaption(queryCaption(text, phrase, top), { quiet: true });
    // top is derived from text and mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, mode, setCaption]);

  const pick = (word: string) => {
    setMode({ kind: 'query' });
    setText(word);
  };
  const radio = useRadioGroup(VOCAB.length, checked, (i) => pick(VOCAB[i].word));

  const pairMode = mode.kind === 'pair';
  const toneOf = (w: string, g: Group): Tone => {
    // The misleading pair is neighbours on the map only, so it never wears the "nearest" green.
    if (pairMode && (w === PAIR.a.word || w === PAIR.b.word)) return 'info';
    if (queryWords.includes(w)) return an && w !== an.c ? 'violet' : 'hi';
    if (topWords.includes(w)) return 'ok';
    return byGroup ? GROUP_TONE[g] : 'dim';
  };
  const labelled = new Set([...queryWords, ...topWords]);
  const wordDots = VOCAB.map((w, i) => ({ x: MAP_POINTS[i][0], y: MAP_POINTS[i][1], tone: toneOf(w.word, w.group) }));

  return (
    <StageFrame
      height={MAP_H + 40}
      stats={
        <Stats>
          <Stat label="Words" value={VOCAB.length} sub={`${DIMS.length} named dimensions`} />
          <Stat label="Map keeps" value={pct(KEPT)} sub="of the variance (PCA)" />
          {pairMode
            ? <Stat label="Pair" value={`${PAIR.a.word} · ${PAIR.b.word}`} color="var(--info)" sub={`cosine ${num(PAIR.cos)} in 8-D`} />
            : <Stat label="Nearest" value={top[0]?.word.word ?? '–'} color="var(--ok)" sub={top[0] ? `cosine ${num(top[0].cos)}` : undefined} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...(pairMode
              ? [{ color: 'var(--info)', label: 'the pair, and the line between them: neighbours on the map only', shape: 'dot' as const }]
              : [
                { color: 'var(--hi)', label: an ? 'the word the arrow starts from' : 'your word or phrase', shape: 'dot' as const },
                { color: 'var(--ok)', label: `top ${TOP_K} by cosine in 8-D, and lines to them`, shape: 'dot' as const },
              ]),
            ...(an ? [{ color: 'var(--violet)', label: 'analogy: the pair whose difference is added, and the arrow from the third word to the result', shape: 'line' as const }] : []),
            ...(byGroup
              ? GROUPS.map((g) => ({ color: `var(--${GROUP_TONE[g]})`, label: g, shape: 'dot' as const }))
              : [{ color: 'var(--dim)', label: 'other words', shape: 'dot' as const }]),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Word or phrase" value={text} maxLength={MAX_CHARS} width={220} spellCheck={false} onChange={(t) => { setMode({ kind: 'query' }); setText(t); }} />
          <Toggle label="Other words" value={byGroup} onChange={setByGroup} off="Dim" on="By group" />
          <Toggle label="Labels" value={allLabels} onChange={setAllLabels} off="Highlighted" on="Every word" />
        </>,
        <ControlGroup key="presets" label="Presets">
          {ANALOGIES.map((a) => (
            <ChipButton key={a.id} tone="violet" on={mode.kind === 'analogy' && mode.id === a.id} onClick={() => setMode({ kind: 'analogy', id: a.id })}>
              {a.a} − {a.b} + {a.c}
            </ChipButton>
          ))}
          <ChipButton tone="info" on={mode.kind === 'pair'} onClick={() => setMode({ kind: 'pair' })}>Close on the map, far in 8-D</ChipButton>
        </ControlGroup>,
        <div key="words" className="emb-words" role="radiogroup" aria-label="Pick a word (arrow keys move)">
          {VOCAB.map((w, i) => (
            <button key={w.word} type="button" {...radio.itemProps(i)} className={`chip chip-button tone-${GROUP_TONE[w.group]} ${i === checked ? 'is-on' : ''}`} onClick={() => pick(w.word)}>
              {w.word}
            </button>
          ))}
        </div>,
      ]}
    >
      <div className="stage-pad emb-row">
        <Plot2D x={{ domain: X_DOMAIN, label: 'PCA axis 1' }} y={{ domain: Y_DOMAIN, label: 'PCA axis 2' }} width={MAP_W} height={MAP_H} className="emb-map" ariaLabel="The 60 toy words projected to 2-D by PCA">
          {at && mode.kind !== 'pair' && <Segments segments={top.map((n) => ({ from: at, to: MAP_POINTS[VOCAB.indexOf(n.word)], tone: 'ok' }))} />}
          {mode.kind === 'pair' && <Segments segments={[{ from: MAP_POINTS[VOCAB.indexOf(PAIR.a)], to: MAP_POINTS[VOCAB.indexOf(PAIR.b)], tone: 'info' }]} />}
          {an && anResult && <Arrow from={MAP_POINTS[VOCAB.indexOf(lookup(an.c)!)]} to={project(MAP, anResult.vector)} tone="violet" />}
          <Points data={wordDots} r={3.6} />
          {at && mode.kind === 'query' && phrase.ok && phrase.known.length > 1 && <Points data={[{ x: at[0], y: at[1], tone: 'hi' }]} r={6} />}
          {/* After the query dot, so the words stay readable over it. */}
          <PointLabels data={wordDots} labels={(i) => (allLabels || labelled.has(VOCAB[i].word) ? { text: VOCAB[i].word, left: pairMode && VOCAB[i].word === PAIR.b.word } : null)} />
        </Plot2D>
        <div className="emb-side">
          <Box>
            <SectionTitle hint="cosine in all 8 dimensions">{mode.kind === 'pair' ? `${PAIR.a.word} vs ${PAIR.b.word}` : `Nearest ${TOP_K}`}</SectionTitle>
            {mode.kind === 'pair' ? <PairTable /> : <NeighbourTable top={top} />}
          </Box>
          {vector && <VectorBars v={vector} title={mode.kind === 'pair' ? PAIR.a.word : an ? `${an.a} − ${an.b} + ${an.c}` : phrase.ok && phrase.known.length === 1 ? phrase.known[0] : 'phrase (mean)'} />}
        </div>
        <Hint block className="emb-honest">
          {HONEST} The map is a 2-D shadow that keeps {pct(KEPT)} of the variance, so distances on it are distorted.
        </Hint>
      </div>
    </StageFrame>
  );
}

function NeighbourTable({ top }: { top: readonly Neighbour[] }) {
  if (!top.length) return <p className="emb-empty">No vector to compare yet.</p>;
  return (
    <table className="data-table emb-table">
      <thead><tr><th scope="col">word</th><th scope="col">cosine</th></tr></thead>
      <tbody>{top.map((n) => <tr key={n.word.word}><td>{n.word.word}</td><td>{num(n.cos)}</td></tr>)}</tbody>
    </table>
  );
}

function PairTable() {
  return (
    <table className="data-table emb-table">
      <tbody>
        <tr><td>distance on the map</td><td>{num(PAIR.dist2d, 3)}</td></tr>
        <tr><td>cosine in 8-D</td><td>{num(PAIR.cos)}</td></tr>
      </tbody>
    </table>
  );
}

/** The vector itself, one row per named dimension: these toy dimensions mean something, real ones don't. */
function VectorBars({ v, title }: { v: readonly number[]; title: string }) {
  return (
    <Box>
      <SectionTitle hint="toy dimensions have names">{title}</SectionTitle>
      <ul className="emb-dims">
        {DIMS.map((d, i) => (
          <li key={d} title={DIM_NOTE[d]}>
            <span className="emb-dim-name">{d}</span>
            <span className="emb-dim-track"><span className={`emb-dim-fill ${v[i] < 0 ? 'is-neg' : ''}`} style={{ width: `${Math.min(1, Math.abs(v[i])) * 50}%` }} /></span>
            <span className="emb-dim-val">{num(v[i])}</span>
          </li>
        ))}
      </ul>
    </Box>
  );
}

// ── Words vs meaning ─────────────────────────────────────────────────

function MeaningScene({ picker }: { picker: ReactNode }) {
  const [a, setA] = useState('car repair');
  const [b, setB] = useState('fixing my vehicle');
  const [query, setQuery] = useState('car repair');
  const setCaption = useSetCaption();
  const overlap = keywordOverlap(a, b);
  const pa = phraseVector(a);
  const pb = phraseVector(b);
  const cos = pa.ok && pb.ok ? cosine(pa.vector, pb.vector) : null;
  const pq = phraseVector(query);
  const ranked = pq.ok ? rankDocuments(pq.vector) : [];

  useEffect(() => {
    setCaption(compareCaption(a, b), { quiet: true });
  }, [a, b, setCaption]);

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Keyword overlap" value={num(overlap.score)} sub="shared ÷ all distinct words" />
          <Stat label="Cosine" value={cos === null ? '–' : num(cos, 3)} color={cos !== null && cos > CLOSE ? 'var(--ok)' : undefined} sub="of the averaged toy vectors" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'a close match (cosine above 0.8)', shape: 'square' }, { color: 'var(--hi)', label: 'top search result', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="stage-pad emb-meaning">
        <Box className="emb-compare">
          <SectionTitle hint="why not just match words?">Two phrases</SectionTitle>
          <div className="emb-fields">
            <TextField label="Phrase A" value={a} onChange={setA} maxLength={MAX_CHARS} width={200} spellCheck={false} />
            <TextField label="Phrase B" value={b} onChange={setB} maxLength={MAX_CHARS} width={200} spellCheck={false} />
          </div>
          <PhraseNote p={pa} label="A" />
          <PhraseNote p={pb} label="B" />
        </Box>
        <Box className="emb-search">
          <SectionTitle hint={`brute force: every one of the ${DOCUMENTS.length} documents scored`}>Search</SectionTitle>
          <TextField label="Query" value={query} onChange={setQuery} maxLength={MAX_CHARS} width={200} spellCheck={false} />
          <PhraseNote p={pq} label="query" />
          <ol className="emb-results">
            {(ranked.length ? ranked : DOCUMENTS.map((doc, index) => ({ doc, index, cos: null }))).map((r, i) => (
              <li key={r.index} className={ranked.length && i === 0 ? 'is-top' : ''}>
                <span className="emb-doc">{r.doc}</span>
                <span className="emb-score">{r.cos === null ? '–' : num(r.cos)}</span>
              </li>
            ))}
          </ol>
          <Hint block>
            Each document&apos;s vector is the mean of its known words. Scoring every document is fine for 8 and hopeless for a billion: real search engines use approximate
            nearest-neighbour indexes for that.
          </Hint>
        </Box>
        <Hint block className="emb-honest">
          {HONEST} Similarity here means &quot;close on these 8 made-up features&quot;, not meaning. Real embeddings also absorb the biases of the text they were trained on,
          so &quot;similar&quot; can encode stereotypes.
        </Hint>
      </div>
    </StageFrame>
  );
}

function PhraseNote({ p, label }: { p: ReturnType<typeof phraseVector>; label: string }) {
  if (!p.ok) return <p className="emb-refusal" role="status">{label}: {p.reason}{p.unknown.length ? ` Ignored: ${p.unknown.join(', ')}.` : ''}</p>;
  return <p className="emb-note">{label}: {p.known.join(' + ')}{p.unknown.length ? <> · not in the toy vocabulary: {p.unknown.join(', ')}</> : null}</p>;
}
