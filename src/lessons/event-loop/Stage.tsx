import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useLoop } from '../../core/hooks';
import { usePlayer } from '../../core/usePlayer';
import { SNIPPETS, simulate } from './sim';
import './styles.css';

type Mode = 'step' | 'block';

export function Stage() {
  const [mode, setMode] = useState<Mode>('step');
  const picker = (
    <Segmented
      label="Demo"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'step', label: 'Step through code' },
        { value: 'block', label: 'Block the loop' },
      ]}
    />
  );
  return mode === 'step' ? <StepStage picker={picker} /> : <BlockStage picker={picker} />;
}

/* ─── Step-through ────────────────────────────────────────────────── */

function StepStage({ picker }: { picker: ReactNode }) {
  const [snippetId, setSnippetId] = useState(SNIPPETS[0].id);
  const snippet = SNIPPETS.find((s) => s.id === snippetId)!;
  const frames = useMemo(() => simulate(snippet), [snippet]);
  const player = usePlayer(frames, { interval: 1500 });
  const f = player.frame;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Running" value={f.phase === 'idle' ? '—' : f.phase} color={f.phase === 'microtasks' ? 'var(--violet)' : f.phase === 'macrotask' ? 'var(--info)' : undefined} />
          <Stat label="Microtasks" value={f.micro.length} color="var(--violet)" />
          <Stat label="Macrotasks" value={f.macro.length} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running now' },
            { color: 'var(--violet)', label: 'microtask (promises, await)' },
            { color: 'var(--info)', label: 'macrotask (timers, events)' },
            { color: 'var(--ok)', label: 'output' },
          ]}
        />
      }
      controls={
        <Controls>
          {picker}
          <Segmented
            label="Snippet"
            value={snippetId}
            onChange={setSnippetId}
            options={SNIPPETS.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Controls>
      }
    >
      <div className="el">
        <div className="el-code">
          <span className="el-label">code</span>
          <ol>
            {snippet.code.map((line, i) => (
              <li key={i} className={f.line === i ? 'on' : ''}>
                <span className="el-ln">{i + 1}</span>
                <code>{line}</code>
              </li>
            ))}
          </ol>
        </div>

        <div className="el-machine">
          <Box title="Call stack" hint="runs one thing at a time" focus={f.focus === 'stack'} className="el-stack">
            <Chips items={[...f.stack].reverse()} kind="stack" empty="empty" />
          </Box>
          <Box title="Web APIs" hint="timers run in the browser, not JS" focus={f.focus === 'apis'}>
            <Chips items={f.apis} kind="api" empty="no timers" />
          </Box>
          <Box title="Microtask queue" hint="promise callbacks · drained completely" focus={f.focus === 'micro'} className="el-micro">
            <Chips items={f.micro} kind="micro" empty="empty" row />
          </Box>
          <Box title="Macrotask queue" hint="timers, clicks, I/O · one per loop" focus={f.focus === 'macro'} className="el-macro">
            <Chips items={f.macro} kind="macro" empty="empty" row />
          </Box>
          <Box title="Console" hint="" focus={f.focus === 'out'} className="el-out">
            <Chips items={f.out} kind="out" empty="nothing logged yet" row numbered />
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}

function Box({ title, hint, focus, className = '', children }: { title: string; hint: string; focus: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={`el-box ${className} ${focus ? 'focus' : ''}`}>
      <header>
        <b>{title}</b>
        {hint && <span>{hint}</span>}
      </header>
      {children}
    </section>
  );
}

function Chips({ items, kind, empty, row, numbered }: { items: string[]; kind: string; empty: string; row?: boolean; numbered?: boolean }) {
  return (
    <div className={`el-chips ${row ? 'row' : ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.length === 0 && (
          <motion.span key="empty" className="el-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {empty}
          </motion.span>
        )}
        {items.map((it, i) => (
          <motion.span
            key={`${it}-${kind === 'out' ? i : ''}`}
            layout
            className={`el-chip ${kind} ${kind === 'stack' && i === 0 ? 'top' : ''}`}
            initial={{ opacity: 0, scale: 0.6, y: kind === 'stack' ? -14 : 0, x: row ? 20 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: row ? -20 : 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            {numbered && <i>{i + 1}</i>}
            {it}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─── Blocking demo ───────────────────────────────────────────────── */

const WORK_MS = 2000;

function BlockStage({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const clockRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const gapRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  const maxGap = useRef(0);
  const [busy, setBusy] = useState<'none' | 'blocking' | 'chunked'>('none');

  useEffect(() => {
    setCaption(<>The clock and the sliding dot are drawn by JavaScript on the main thread. Now make that thread busy.</>);
  }, [setCaption]);

  useLoop((_dt, t) => {
    const now = performance.now();
    if (last.current) {
      const gap = now - last.current;
      if (gap > maxGap.current) {
        maxGap.current = gap;
        if (gapRef.current) gapRef.current.textContent = `${Math.round(gap)} ms`;
        if (gapRef.current) gapRef.current.dataset.bad = gap > 200 ? '1' : '0';
      }
    }
    last.current = now;
    if (clockRef.current) clockRef.current.textContent = t.toFixed(2);
    if (dotRef.current) dotRef.current.style.transform = `translateX(${(Math.sin(t * 2.2) * 0.5 + 0.5) * 100}%)`;
  });

  const resetGap = () => {
    maxGap.current = 0;
    if (gapRef.current) {
      gapRef.current.textContent = '0 ms';
      gapRef.current.dataset.bad = '0';
    }
  };

  const block = () => {
    resetGap();
    setBusy('blocking');
    setCaption(<>Running a <b>2-second</b> synchronous loop on the main thread… watch the clock.</>);
    // let the caption paint first, then hog the thread
    setTimeout(() => {
      const end = performance.now() + WORK_MS;
      while (performance.now() < end) {
        /* busy-wait: nothing else on this thread can run */
      }
      if (barRef.current) barRef.current.style.width = '100%';
      setBusy('none');
      setCaption(
        <>
          The page <span className="hl bad">froze</span> for 2 s: no animation, no clicks, no timers. One long task
          blocks the <b>whole</b> event loop, because there is only one call stack.
        </>,
      );
    }, 50);
  };

  const chunked = () => {
    resetGap();
    setBusy('chunked');
    if (barRef.current) barRef.current.style.width = '0%';
    setCaption(<>Same 2 s of work, split into 40 chunks of 50 ms with a setTimeout between each…</>);
    let done = 0;
    const chunk = () => {
      const end = performance.now() + WORK_MS / 40;
      while (performance.now() < end) {
        /* one small slice of the work */
      }
      done++;
      if (barRef.current) barRef.current.style.width = `${(done / 40) * 100}%`;
      if (done < 40) setTimeout(chunk, 0);
      else {
        setBusy('none');
        setCaption(
          <>
            Still 2 s of work, but the loop got to breathe between chunks, so the clock kept ticking. Longer jobs
            belong in a <span className="hl info">Web Worker</span> (a separate thread) entirely.
          </>,
        );
      }
    };
    setTimeout(chunk, 50);
  };

  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'UI updating' },
            { color: 'var(--bad)', label: 'frozen (long task)' },
          ]}
        />
      }
      controls={
        <Controls>
          {picker}
          <Button variant="danger" onClick={block} disabled={busy !== 'none'}>
            Run a 2 s loop (blocks)
          </Button>
          <Button onClick={chunked} disabled={busy !== 'none'}>
            Same work, in chunks
          </Button>
        </Controls>
      }
    >
      <div className="el-block">
        <div className="el-clock">
          <span className="el-label">JS-driven clock (seconds)</span>
          <span ref={clockRef} className="el-clock-num">
            0.00
          </span>
        </div>
        <div className="el-track">
          <span ref={dotRef} className="el-dot" />
        </div>
        <div className="el-block-row">
          <div className="el-gap">
            <span className="el-label">longest pause between frames</span>
            <span ref={gapRef} className="el-gap-num" data-bad="0">
              0 ms
            </span>
            <span className="el-note">smooth is ~16 ms · anything over 50 ms feels janky</span>
          </div>
          <div className="el-work">
            <span className="el-label">work done</span>
            <span className="el-bar">
              <span ref={barRef} />
            </span>
            <span className="el-note">{busy === 'none' ? 'idle' : busy === 'blocking' ? 'blocking the main thread…' : 'working in chunks…'}</span>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

