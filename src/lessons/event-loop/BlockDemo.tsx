import { useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useLoop } from '../../core/hooks';

/** Total work, whether done in one go or in chunks. */
const WORK_MS = 2000;
const CHUNKS = 40;
/** Wait before starting the work, so the new caption paints first. */
const START_DELAY_MS = 50;
/** A pause between frames longer than this is shown in red. */
const JANK_MS = 200;
/** Angular speed of the sliding dot. */
const DOT_SPEED = 2.2;

type Busy = 'none' | 'blocking' | 'chunked';

/** A JS-driven clock and dot, frozen by one long task vs kept alive by chunked work. */
export function BlockDemo({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const clockRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const gapRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  const maxGap = useRef(0);
  const [busy, setBusy] = useState<Busy>('none');

  useIntroCaption(<>The clock and the sliding dot are drawn by JavaScript on the main thread. Now make that thread busy.</>);

  // Painted through refs, not state: the point is to measure the main thread, not React.
  useLoop((_dt, t) => {
    const now = performance.now();
    if (last.current) {
      const gap = now - last.current;
      if (gap > maxGap.current) {
        maxGap.current = gap;
        if (gapRef.current) {
          gapRef.current.textContent = `${Math.round(gap)} ms`;
          gapRef.current.dataset.bad = gap > JANK_MS ? '1' : '0';
        }
      }
    }
    last.current = now;
    if (clockRef.current) clockRef.current.textContent = t.toFixed(2);
    if (dotRef.current) dotRef.current.style.transform = `translateX(${(Math.sin(t * DOT_SPEED) * 0.5 + 0.5) * 100}%)`;
  });

  const resetGap = () => {
    maxGap.current = 0;
    if (gapRef.current) {
      gapRef.current.textContent = '0 ms';
      gapRef.current.dataset.bad = '0';
    }
  };

  const setProgress = (fraction: number) => {
    if (barRef.current) barRef.current.style.width = `${fraction * 100}%`;
  };

  const block = () => {
    resetGap();
    setBusy('blocking');
    setCaption(<>Running a <b>2-second</b> synchronous loop on the main thread… watch the clock.</>);
    setTimeout(() => {
      const end = performance.now() + WORK_MS;
      while (performance.now() < end) {
        /* busy-wait: nothing else on this thread can run */
      }
      setProgress(1);
      setBusy('none');
      setCaption(
        <>
          The page <span className="hl bad">froze</span> for 2 s: no animation, no clicks, no timers. One long task
          blocks the <b>whole</b> event loop, because there is only one call stack.
        </>,
      );
    }, START_DELAY_MS);
  };

  const chunked = () => {
    resetGap();
    setBusy('chunked');
    setProgress(0);
    setCaption(<>Same 2 s of work, split into 40 chunks of 50 ms with a setTimeout between each…</>);
    let done = 0;
    const chunk = () => {
      const end = performance.now() + WORK_MS / CHUNKS;
      while (performance.now() < end) {
        /* one small slice of the work */
      }
      done++;
      setProgress(done / CHUNKS);
      if (done < CHUNKS) setTimeout(chunk, 0);
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
    setTimeout(chunk, START_DELAY_MS);
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
