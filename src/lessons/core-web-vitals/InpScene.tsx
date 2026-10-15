import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import { ms } from '../../core/format';
import { busyWait } from './busy';
import { VitalsMeter } from './VitalsMeter';
import { BAND_TONE, CHUNK_MS, IGNORED_PER, bandOf, chunksOf, inpOf, interactionTotal, mainThreadWork, type InpFix, type Interaction } from './model';

const BREAKDOWN_MIN_W = 420;
const DEFAULT_WORK_MS = 250;
const MAX_KEPT = 200;
const LOG_ROWS = 6;
const AXIS_STEP = 50;
const BAR_MIN_PX = 2;
const FIXES: { value: InpFix; label: string }[] = [
  { value: 'none', label: 'Do it all in the handler' },
  { value: 'yield', label: 'Yield between slices' },
  { value: 'worker', label: 'Move it to a worker' },
];

const INTRO = (
  <>
    A real button with a real handler. Press it: the page measures, with <code>performance.now()</code>, how long your click waited, how long the handler ran and how long the next
    frame took to appear. Those three add up to one interaction&apos;s latency.
  </>
);

const phaseBars = (i: Interaction): GanttBar[] => [
  { id: 'in', lane: 'x', start: 0, end: i.inputDelay, tone: 'violet', minPx: BAR_MIN_PX, label: 'input delay' },
  { id: 'proc', lane: 'x', start: i.inputDelay, end: i.inputDelay + i.processing, tone: 'hi', minPx: BAR_MIN_PX, label: 'processing' },
  { id: 'pres', lane: 'x', start: i.inputDelay + i.processing, end: interactionTotal(i), tone: 'info', minPx: BAR_MIN_PX, label: 'presentation delay' },
];

const hlOf = (total: number) => (bandOf('inp', total) === 'good' ? 'ok' : bandOf('inp', total) === 'needs' ? 'orange' : 'bad');

export function InpScene({ picker }: { picker: ReactNode }) {
  const [workMs, setWorkMs] = useState(DEFAULT_WORK_MS);
  const [fix, setFix] = useState<InpFix>('none');
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [clicks, setClicks] = useState(0);
  const nextId = useRef(1);
  const worker = useRef<Worker | null>(null);
  const setCaption = useSetCaption();

  useEffect(() => () => worker.current?.terminate(), []);

  const latest = interactions[interactions.length - 1] ?? null;
  const inp = inpOf(interactions);
  const inpValue = inp ? interactionTotal(inp) : null;

  useEffect(() => {
    if (!latest) {
      setCaption(INTRO);
      return;
    }
    const total = interactionTotal(latest);
    setCaption(
      <>
        Your last click took <span className={`hl ${hlOf(total)}`}>{ms(total)}</span>: {ms(latest.inputDelay)} waiting for the main thread, {ms(latest.processing)} in the handler and{' '}
        {ms(latest.presentation)} until the next frame was painted. INP is the worst interaction
        {interactions.length >= IGNORED_PER ? <> (ignoring the worst of every {IGNORED_PER})</> : <>, and with fewer than {IGNORED_PER} interactions none is ignored</>}.
        {fix === 'yield' && workMs > CHUNK_MS ? <> The remaining {ms(workMs - CHUNK_MS)} of work still ran, in {CHUNK_MS} ms slices after the page had responded.</> : null}
        {fix === 'worker' ? <> The {ms(workMs)} of work ran in a worker thread, so the page stayed free.</> : null}
      </>,
      { quiet: true },
    );
  }, [latest, interactions.length, fix, workMs, setCaption]);

  const record = (inputDelay: number, processing: number, handlerEnd: number) => {
    // The frame goes out after the next animation frame callback; a task queued from that callback runs once the frame is out.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const presentation = performance.now() - handlerEnd;
        const entry: Interaction = { id: nextId.current++, inputDelay, processing, presentation };
        setInteractions((prev) => [...prev, entry].slice(-MAX_KEPT));
      }, 0);
    });
  };

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const start = performance.now();
    const inputDelay = Math.max(0, start - e.nativeEvent.timeStamp);
    setClicks((c) => c + 1);
    if (fix === 'worker') {
      try {
        worker.current ??= new Worker(new URL('./busy.worker.ts', import.meta.url), { type: 'module' });
        worker.current.postMessage({ workMs });
      } catch {
        setCaption(<>Workers are unavailable here, so this handler could not run. Pick another handler.</>, { quiet: true });
        return;
      }
    } else {
      busyWait(mainThreadWork(fix, workMs));
    }
    const handlerEnd = performance.now();
    record(inputDelay, handlerEnd - start, handlerEnd);
    if (fix === 'yield') {
      // The rest of the work, one slice per task: the browser can paint and handle input between slices.
      const rest = chunksOf(workMs).slice(1);
      const runSlice = (i: number) => {
        if (i >= rest.length) return;
        setTimeout(() => {
          busyWait(rest[i]);
          runSlice(i + 1);
        }, 0);
      };
      runSlice(0);
    }
  };

  const domainEnd = latest ? Math.max(AXIS_STEP * 2, Math.ceil(interactionTotal(latest) / AXIS_STEP) * AXIS_STEP + AXIS_STEP) : AXIS_STEP * 2;
  const recent = interactions.slice(-LOG_ROWS).reverse();

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Interactions" value={interactions.length} />
          <Stat label="INP" value={inpValue === null ? 'none yet' : ms(inpValue)} color={inpValue === null ? undefined : `var(--${BAND_TONE[bandOf('inp', inpValue)]})`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Handler work" value={workMs} min={0} max={600} step={10} onChange={setWorkMs} format={ms} />
          <Segmented label="Handler" value={fix} onChange={setFix} options={FIXES} />
          <Button onClick={() => setInteractions([])} disabled={!interactions.length}>Clear</Button>
        </>,
      ]}
    >
      <div className="stage-pad cwv">
        <VitalsMeter metric="inp" value={inpValue} />
        <div className="cwv-inp-body">
          <div className="cwv-inp-sandbox">
            <Button variant="primary" onClick={onClick}>Press me ({clicks})</Button>
            <span className="cwv-inp-note">Its handler does {ms(workMs)} of synchronous work.</span>
          </div>
          <div className="cwv-inp-log">
            <SectionTitle weight="regular" hint="measured live, newest first">Your interactions</SectionTitle>
            {recent.length === 0 && <div className="cwv-inp-empty">Press the button to measure one.</div>}
            {recent.map((i) => (
              <div key={i.id} className={`log-row tone-${BAND_TONE[bandOf('inp', interactionTotal(i))]}`}>
                #{i.id}: {ms(interactionTotal(i))} = {ms(i.inputDelay)} + {ms(i.processing)} + {ms(i.presentation)}
                {i === inp ? ' ← INP' : ''}
              </div>
            ))}
          </div>
        </div>
        <SectionTitle weight="regular" hint="the last interaction, phase by phase">Where the time went</SectionTitle>
        <WideRegion minWidth={BREAKDOWN_MIN_W} label="Breakdown: scroll sideways to see all of it">
          <GanttLanes
            lanes={[{ id: 'x', label: 'Last click' }]}
            bars={latest ? phaseBars(latest) : []}
            domain={[0, domainEnd]}
            unit=" ms"
            axis
            size="md"
            labelWidth={84}
            ariaLabel="The last interaction: input delay, processing, presentation delay"
          />
        </WideRegion>
        <Hint block>
          Measured live from your clicks, so the numbers are your device&apos;s and change from click to click. The three phases are the real definition; the presentation delay is approximated
          as the time from the end of the handler until a task queued after the next animation frame ran. Input delay is small unless the main thread is busy when you click: with the default handler, press twice quickly to see it. Yielding runs{' '}
          {CHUNK_MS} ms slices with the page free between them; the worker is a real worker thread running fixed busy work.
        </Hint>
      </div>
    </StageFrame>
  );
}
