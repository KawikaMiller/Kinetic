import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LogStream } from '../../components/LogStream';
import type { LogRow } from '../../components/logRows';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark } from '../../components/TreeSvg';
import { Button, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';
import type { Tone } from '../../core/tone';
import { useInterval } from '../../core/useInterval';
import {
  AT_TARGET, CAPTURING, CHILDREN, DEFAULT_LISTENERS, PHASE_NAME, TAG, pathTo, tour,
  type Fired, type ListenerMode, type Listeners, type NodeId, type Phase, type TourStep,
} from './model';

const STEP_MS = 520;
const NODE_W = 124;
/** Room beside the outermost nodes so their boxes stay inside the drawing. */
const TREE_SIDE_PAD = NODE_W / 2 + 8;
const NODE_H = 42;
/** Taller when a third line lists stopPropagation / preventDefault. */
const NODE_H_FLAGS = 56;
const NODES: NodeId[] = ['card', 'section', 'button', 'span', 'check'];
const TREE = { root: 'card' as NodeId, children: (id: NodeId) => CHILDREN[id] };
const MODE_SHORT: Record<ListenerMode, string> = { off: 'no listener', capture: 'capture', bubble: 'bubble' };
const PHASE_TONE: Record<Phase, Tone> = { [CAPTURING]: 'info', [AT_TARGET]: 'hi', 3: 'violet' };

interface Run {
  target: NodeId;
  steps: TourStep[];
  fired: Fired[];
  stoppedAt: NodeId | null;
  /** Nodes whose listener called preventDefault() during this click. */
  prevented: NodeId[];
  defaultPrevented: boolean;
}

interface Recording {
  target: NodeId | null;
  fired: Fired[];
  stoppedAt: NodeId | null;
  prevented: NodeId[];
  event: Event | null;
}

const blankRecording = (): Recording => ({ target: null, fired: [], stoppedAt: null, prevented: [], event: null });
const nodeOf = (el: EventTarget | null) =>
  ((el as Element | null)?.closest?.('[data-node]') as HTMLElement | null)?.dataset.node as NodeId | undefined;

/** The caption for step `at` of a recorded run. */
function narrate(run: Run, at: number): ReactNode {
  const s = run.steps[at];
  const tag = <code>{TAG[s.node]}</code>;
  if (at === run.steps.length - 1) {
    const listenersFired = <>{run.fired.length} listener{run.fired.length === 1 ? '' : 's'} fired, in the order in the log</>;
    if (run.target !== 'check') return <>Done: {listenersFired}.</>;
    return run.defaultPrevented ? (
      <>Done: {listenersFired}. The checkbox <span className="hl bad">didn't toggle</span>: <code>preventDefault()</code>{' '}
        cancelled its default action{run.stoppedAt ? '' : ', yet the event still travelled the whole way'}.</>
    ) : (
      <>Done: {listenersFired}. The checkbox <span className="hl ok">toggled</span>: that's its default action
        {run.stoppedAt ? <>, and <code>stopPropagation()</code> didn't stop it</> : null}.</>
    );
  }
  if (s.cut) {
    return (
      <>The trip was cut: <code>stopPropagation()</code> in <code>{TAG[run.stoppedAt ?? s.node]}</code> means {tag}{' '}
        <span className="hl bad">never hears</span> this click.</>
    );
  }
  if (s.fired) {
    return (
      <><span className="hl ok">Fired</span>: the {PHASE_NAME[s.phase]} listener on {tag}
        {run.prevented.includes(s.node) ? <> called <code>preventDefault()</code></> : null}
        {run.stoppedAt === s.node ? <> and called <code>stopPropagation()</code></> : null}.</>
    );
  }
  if (s.phase === AT_TARGET) {
    return <>The click reaches its <span className="hl">target</span>, {tag}. No listener here, so it turns around.</>;
  }
  return <>{s.phase === CAPTURING ? 'Capture' : 'Bubble'} phase passes {tag}: no {PHASE_NAME[s.phase]} listener there, so nothing runs.</>;
}

/** Where each node stands at the current step of the replay. */
function markFor(id: NodeId, run: Run | null, at: number): { tone: Tone; solid: boolean } | null {
  if (!run) return null;
  const current = run.steps[at];
  if (current && current.node === id && !current.cut) {
    return { tone: current.fired ? 'ok' : PHASE_TONE[current.phase], solid: true };
  }
  const seen = run.steps.slice(0, at + 1).filter((s) => s.node === id);
  if (!seen.length) return null;
  const last = seen[seen.length - 1];
  return { tone: last.cut ? 'bad' : PHASE_TONE[last.phase], solid: false };
}

export function Propagation({ picker }: { picker: ReactNode }) {
  const [listeners, setListeners] = useState<Listeners>(DEFAULT_LISTENERS);
  const [once, setOnce] = useState(false);
  const [editing, setEditing] = useState<NodeId>('button');
  const [run, setRun] = useState<Run | null>(null);
  const [at, setAt] = useState(0);
  const setCaption = useSetCaption();
  const wrapRef = useRef<HTMLDivElement>(null);
  const els = useRef<Partial<Record<NodeId, HTMLElement | null>>>({});
  const rec = useRef<Recording>(blankRecording());
  const onceRef = useRef(once);
  useEffect(() => {
    onceRef.current = once;
  });

  useIntroCaption(
    <>Real elements with real listeners. Click the <span className="hl">span</span> (or the checkbox): the click
      travels <span className="hl info">down</span> in the capture phase, then <span className="hl violet">up</span> as it bubbles.</>,
  );

  // The listeners the learner configured, attached for real.
  useEffect(() => {
    const detach: (() => void)[] = [];
    for (const id of NODES) {
      const el = els.current[id];
      const spec = listeners[id];
      if (!el || spec.mode === 'off') continue;
      const handler = (e: Event) => {
        rec.current.fired.push({ node: id, phase: e.eventPhase as Phase });
        if (spec.prevent) {
          e.preventDefault();
          rec.current.prevented.push(id);
        }
        if (spec.stop) {
          e.stopPropagation();
          rec.current.stoppedAt = id;
        }
      };
      const options = { capture: spec.mode === 'capture', once };
      el.addEventListener('click', handler, options);
      detach.push(() => el.removeEventListener('click', handler, options));
    }
    return () => detach.forEach((off) => off());
  }, [listeners, once]);

  // A recorder outside the card: it hears every click first and settles the run afterwards.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const start = (e: Event) => {
      const target = nodeOf(e.target);
      if (!target) return;
      rec.current = { ...blankRecording(), target, event: e };
      setTimeout(() => {
        const r = rec.current;
        if (!r.target || !r.event) return;
        const path = pathTo(r.target);
        const steps = tour(path, r.fired, r.stoppedAt);
        setRun({
          target: r.target,
          steps,
          fired: r.fired,
          stoppedAt: r.stoppedAt,
          prevented: r.prevented,
          defaultPrevented: r.event.defaultPrevented,
        });
        setAt(0);
        if (onceRef.current && r.fired.length) {
          setListeners((prev) => {
            const next = { ...prev };
            for (const f of r.fired) next[f.node] = { ...next[f.node], mode: 'off' };
            return next;
          });
        }
      }, 0);
    };
    wrap.addEventListener('click', start, { capture: true });
    return () => wrap.removeEventListener('click', start, { capture: true });
  }, []);

  useInterval(() => setAt((i) => i + 1), STEP_MS, run !== null && at < run.steps.length - 1);

  // Narrate the step on screen, from what was recorded (listeners may have changed since).
  useEffect(() => {
    if (run) setCaption(narrate(run, at));
  }, [run, at, setCaption]);

  const patch = (next: Partial<Listeners[NodeId]>) =>
    setListeners((prev) => ({ ...prev, [editing]: { ...prev[editing], ...next } }));
  const spec = listeners[editing];

  const nodeMark = (id: NodeId): TreeNodeMark | null => {
    const m = markFor(id, run, at);
    return m && { tone: m.tone, fill: m.solid ? 'solid' : 'tint' };
  };
  const liveClass = (id: NodeId) => {
    const m = markFor(id, run, at);
    return m ? `de-live tone-${m.tone} ${m.solid ? 'is-now' : ''}` : '';
  };
  const bind = (id: NodeId) => (el: HTMLElement | null) => {
    els.current[id] = el;
  };
  const shownFired = run ? run.steps.slice(0, at + 1).filter((s) => s.fired) : [];
  const cutFrom = run ? run.steps.findIndex((s) => s.cut) : -1;
  const logRows: LogRow[] = shownFired.map((s, i) => ({ id: `${s.node}-${s.phase}`, tone: 'ok', text: `${i + 1}. ${PHASE_NAME[s.phase]} · ${TAG[s.node]}` }));
  if (run?.stoppedAt && cutFrom >= 0 && at >= cutFrom) {
    logRows.push({ id: 'cut', tone: 'bad', text: `✂ stopPropagation() in ${TAG[run.stoppedAt]}: the rest of the trip is cut` });
  }

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Listeners fired" value={shownFired.length} color="var(--ok)" />
          <Stat label="Stopped at" value={run?.stoppedAt ? TAG[run.stoppedAt] : NA} color={run?.stoppedAt ? 'var(--bad)' : undefined} />
          <Stat
            label="Checkbox default"
            value={run?.target === 'check' ? (run.defaultPrevented ? 'prevented' : 'toggled') : NA}
            sub="clicking toggles it"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'capture path' },
            { color: 'var(--hi)', label: 'target' },
            { color: 'var(--violet)', label: 'bubble path' },
            { color: 'var(--ok)', label: 'listener firing' },
            { color: 'var(--bad)', label: 'cut by stopPropagation' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Edit the listener on" value={editing} onChange={setEditing} options={NODES.map((n) => ({ value: n, label: TAG[n] }))} />
        </>,
        <>
          <Segmented
            label={`${TAG[editing]} listens in`}
            value={spec.mode}
            onChange={(mode) => patch({ mode })}
            options={[
              { value: 'off', label: 'No listener' },
              { value: 'capture', label: 'Capture' },
              { value: 'bubble', label: 'Bubble' },
            ]}
          />
          <Toggle label="stopPropagation()" value={spec.stop} onChange={(stop) => patch({ stop })} off="No" on="Call it" />
          <Toggle label="preventDefault()" value={spec.prevent} onChange={(prevent) => patch({ prevent })} off="No" on="Call it" />
        </>,
        <>
          <Toggle label="{ once: true }" value={once} onChange={setOnce} off="Every click" on="Once, then removed" />
          <Button onClick={() => setListeners(DEFAULT_LISTENERS)}>Reset listeners</Button>
          <Button onClick={() => setAt(0)} disabled={!run}>Replay last click</Button>
          <Hint>Click the real span or checkbox in the sandbox</Hint>
        </>,
      ]}
    >
      <div className="stage-pad de">
        <div className="de-grid">
          <div ref={wrapRef} className="de-sandbox">
            <SectionTitle hint="the real DOM">Sandbox</SectionTitle>
            <div ref={bind('card')} data-node="card" data-label="div.card" className={`de-el de-card ${liveClass('card')}`}>
              <section ref={bind('section')} data-node="section" data-label="section" className={`de-el de-section ${liveClass('section')}`}>
                <button ref={bind('button')} type="button" data-node="button" className={`de-el de-button ${liveClass('button')}`}>
                  <span ref={bind('span')} data-node="span" className={`de-el de-span ${liveClass('span')}`}>span: click me</span>
                </button>
                {/* No <label> wrapper: clicking a label dispatches a second, synthetic click on the input. */}
                <span className="de-check-row">
                  <input
                    ref={bind('check')}
                    type="checkbox"
                    data-node="check"
                    aria-label="Subscribe (the checkbox target)"
                    className={`de-check ${liveClass('check')}`}
                  />
                  <span aria-hidden="true">input (checkbox)</span>
                </span>
              </section>
            </div>
          </div>
          <div className="de-mirror">
            <SectionTitle hint="the same elements as a tree">DOM tree</SectionTitle>
            <TreeSvg
              shape={TREE}
              layout="tidy"
              width={460}
              pad={TREE_SIDE_PAD}
              height={290}
              top={34}
              levelGap={72}
              nodeMark={nodeMark}
              edgeMark={(_, child) => {
                const m = markFor(child, run, at);
                return m && { tone: m.tone, dashed: m.tone === 'bad' };
              }}
              nodeClass={(id) => (id === editing ? 'de-node is-editing' : 'de-node')}
              onNodeClick={setEditing}
              nodeAriaLabel={(id) => `Edit the listener on ${TAG[id]}`}
              renderNode={(id) => {
                const l = listeners[id];
                const flags = [l.stop && 'stop', l.prevent && 'prevent'].filter(Boolean).join(' · ');
                const h = flags ? NODE_H_FLAGS : NODE_H;
                const box = { x: -NODE_W / 2, y: -h / 2, width: NODE_W, height: h, rx: 8 };
                return (
                  <>
                    {/* opaque underlay, so edges don't show through a tinted node */}
                    <rect className="de-node-under" {...box} />
                    <rect className="de-node-box" {...box} />
                    <text y={flags ? -10 : -3} className="de-node-tag">{TAG[id]}</text>
                    <text y={flags ? 6 : 13} className="de-node-sub">{MODE_SHORT[l.mode]}</text>
                    {flags && <text y={21} className="de-node-sub is-flag">{flags}</text>}
                  </>
                );
              }}
              ariaLabel="DOM tree of the sandbox"
            />
          </div>
        </div>
        <Box className="de-log">
          <SectionTitle hint="recorded from the real listeners">Log</SectionTitle>
          <LogStream
            className="de-stream"
            label="Listeners that fired"
            empty={run ? 'No listener has fired for this click (yet).' : 'No clicks yet.'}
            rows={logRows}
          />
        </Box>
      </div>
    </StageFrame>
  );
}
