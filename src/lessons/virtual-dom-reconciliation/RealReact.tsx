import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Stat, Stats, Segmented, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { createCounter, useCount, type Counter } from './counter';
import { ITEMS, type Item } from './model';

type RealKeys = 'index' | 'id';
const REAL_KEYS = [
  { value: 'index' as const, label: 'key={index}' },
  { value: 'id' as const, label: 'key={item.id}' },
];
const START: Item[] = ITEMS.slice(0, 4);
const NEWCOMERS = ['Zed', 'Yan', 'Xia', 'Wes', 'Val', 'Uma'];
const KEY_LINES = ['{items.map((item, index) => (', '  <Row key={index} item={item} />', '  <Row key={item.id} item={item} />', '))}'];

/** One row of the real list: an uncontrolled input whose text lives in the browser, and state that lives with this component instance. */
function Row({ item }: { item: Item }) {
  const [madeFor] = useState(item.name);
  const [typed, setTyped] = useState(false);
  const stray = typed && madeFor !== item.name;
  return (
    <li className={`vd-row ${stray ? 'is-stray' : ''}`}>
      <span className="vd-row-name">{item.name}</span>
      <input
        className="vd-row-input"
        aria-label={`Note for ${item.name}`}
        placeholder="type a note"
        onChange={(e) => setTyped(e.target.value !== '')}
      />
      {stray && <span className="vd-row-warn">typed under {madeFor}, now beside {item.name}</span>}
    </li>
  );
}

/** Memoised, with the stable caption setter as its only prop: the lesson page re-renders on every caption change, and these panels must only render for the learner's own actions. */
const RealList = memo(function RealList({ caption }: { caption: (n: ReactNode) => void }) {
  const [keys, setKeys] = useState<RealKeys>('index');
  const [items, setItems] = useState(START);
  const [generation, setGeneration] = useState(0);
  const [added, setAdded] = useState(0);
  const reset = (nextKeys: RealKeys = keys) => {
    setKeys(nextKeys);
    setItems(START);
    setAdded(0);
    setGeneration((g) => g + 1);
  };
  const insert = () => {
    setItems([{ id: `new${added}`, name: NEWCOMERS[added % NEWCOMERS.length] }, ...items]);
    setAdded(added + 1);
    caption(
      keys === 'index' ? (
        <>With <code>key={'{index}'}</code> React matched rows by position: each row reused the instance that was at its index, input text included. A note typed before now sits beside a different name (red outline).</>
      ) : (
        <>With <code>key={'{item.id}'}</code> each item kept its own row instance, so notes stayed with their names. Only the new row is fresh.</>
      ),
    );
  };
  const reverse = () => {
    setItems([...items].reverse());
    caption(
      keys === 'index'
        ? <>Reversed. Index keys: the inputs stayed in their positions while the names swapped around them.</>
        : <>Reversed. Id keys: each row, with its note, moved with its item.</>,
    );
  };
  return (
    <Box className="vd-real">
      <SectionTitle hint="rendered by React itself">Real React list</SectionTitle>
      <ol className="vd-rows" key={generation} aria-label="Rows rendered by React">
        {items.map((it, i) => (
          <Row key={keys === 'index' ? i : it.id} item={it} />
        ))}
      </ol>
      <div className="vd-real-controls">
        <Segmented label="Keys" ariaLabel="Key used for each row" value={keys} onChange={(k) => { reset(k); caption(<>Reset with <code>key={k === 'index' ? '{index}' : '{item.id}'}</code>. Type a note in the second row, then press Insert at top.</>); }} options={REAL_KEYS} />
        <ControlGroup label="Do">
          <Button onClick={insert}>Insert at top</Button>
          <Button onClick={reverse}>Reverse</Button>
          <Button onClick={() => { reset(); caption(<>Reset: every row is fresh and empty.</>); }}>Reset</Button>
        </ControlGroup>
      </div>
      <CodePanel title="the line that decides" lines={KEY_LINES} active={keys === 'index' ? 1 : 2} gutter="none" className="vd-code" />
    </Box>
  );
});

/** Reports every commit of whoever renders it, from an effect after the browser has the result. */
function Greeting({ name, renders }: { name: string; memoised: boolean; renders: Counter }) {
  useEffect(() => {
    renders.add();
  });
  return <span className="vd-greet">Hello, {name}</span>;
}
/** React.memo with a comparison that only skips while `memoised` is on: one component type, so toggling never remounts it. */
const Greet = memo(Greeting, (prev, next) => next.memoised && prev.name === next.name);

const WastedRender = memo(function WastedRender({ caption }: { caption: (n: ReactNode) => void }) {
  const [renders] = useState(createCounter);
  const [mutations] = useState(createCounter);
  const [name, setName] = useState('Ada');
  const [pushes, setPushes] = useState(0);
  const [memoised, setMemoised] = useState(false);
  const watched = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = watched.current;
    if (!el) return;
    const observer = new MutationObserver((records) => mutations.add(records.length));
    observer.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, [mutations]);

  // The parent's effect runs after Greeting's in the same commit, so this zeroes the counts the toggle itself caused.
  useEffect(() => {
    renders.reset();
    mutations.reset();
  }, [renders, mutations, memoised]);

  const rerender = () => {
    setPushes(pushes + 1);
    caption(
      memoised
        ? <>The parent re-rendered with the same props. Wrapped in <code>memo</code>, Greeting was skipped: its render count did not move and the DOM was not touched.</>
        : <>The parent re-rendered and Greeting ran again with the same output. React compared and found nothing to change: the render count climbed, the DOM mutation count did not.</>,
    );
  };
  const rename = () => {
    setName(name === 'Ada' ? 'Bea' : 'Ada');
    caption(<>The name changed, so Greeting rendered again and the browser's DOM really was mutated. A render is not a DOM change; this one needed one.</>);
  };
  return (
    <Box className="vd-wasted">
      <SectionTitle hint="counts come from the real page">Render vs DOM change</SectionTitle>
      <div ref={watched} className="vd-watched" aria-label="Watched by a MutationObserver">
        <Greet name={name} memoised={memoised} renders={renders} />
      </div>
      <div className="vd-wasted-stats">
        <CounterStat label="Greeting renders" counter={renders} tone="var(--hi)" />
        <CounterStat label="DOM mutations seen" counter={mutations} tone="var(--info)" />
        <Stat label="Parent renders pushed" value={pushes} />
      </div>
      <div className="vd-real-controls">
        <Toggle label="Greeting is" value={memoised} onChange={setMemoised} off="plain" on="in memo" />
        <ControlGroup label="Do">
          <Button onClick={rerender}>Re-render, same output</Button>
          <Button onClick={rename}>Re-render, new name</Button>
          <Button onClick={() => { renders.reset(); mutations.reset(); }}>Zero the counts</Button>
        </ControlGroup>
      </div>
    </Box>
  );
});

function CounterStat({ label, counter, tone }: { label: string; counter: Counter; tone: string }) {
  const n = useCount(counter);
  return <Stat label={label} value={n} color={n ? tone : 'var(--muted)'} />;
}

const REAL_INTRO = <>This is real React, not the teaching model. Type a note in the second row, then press Insert at top.</>;

export function RealReactScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  useIntroCaption(REAL_INTRO);
  return (
    <StageFrame
      height={520}
      controls={[picker]}
      stats={
        <Stats>
          <Stat label="Rendered by" value="real React" color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'an input holding text typed under another name' },
            { color: 'var(--hi)', label: 'component renders' },
            { color: 'var(--info)', label: 'DOM mutations' },
          ]}
        />
      }
    >
      <div className="vd stage-pad">
        <div className="vd-real-grid">
          <RealList caption={setCaption} />
          <WastedRender caption={setCaption} />
        </div>
        <Hint block>
          A row's input is uncontrolled: its text lives in the browser's DOM node, and React keeps that node for as long as it keeps the row instance. The key decides which item an instance belongs to.
          React runs this list for real here. The counts on the right come from a MutationObserver and from effects, not from the model.
        </Hint>
      </div>
    </StageFrame>
  );
}
