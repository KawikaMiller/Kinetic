import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { traceCaption } from './captions';
import { MODELS, MODEL_LABEL, type Model } from './serve';
import { DEFAULT_TRACE_MODEL, INSTANT_KEY, TRACE_WORK, callRows, echoTrace, revealed } from './trace';

const MODEL_OPTIONS = MODELS.map((m) => ({ value: m, label: MODEL_LABEL[m] }));
const GANTT_MIN_WIDTH = 900;

export function TraceScene({ picker }: { picker: ReactNode }) {
  const [model, setModel] = useState<Model>(DEFAULT_TRACE_MODEL);
  const echo = useMemo(() => echoTrace(model, TRACE_WORK), [model]);
  const [picked, setPicked] = useState<number | null>(null);
  const last = echo.calls.length - 1;
  const step = Math.min(picked ?? last, last);
  const rows = useMemo(() => callRows(echo), [echo]);
  const view = useMemo(() => revealed(echo, step), [echo, step]);
  const lane = echo.lanes.find((l) => l.id === echo.calls[step].lane)!;
  const pick = (next: number | null) => setPicked(next);

  return (
    <StageFrame
      height={420}
      intro={traceCaption(model, echo, step)}
      introKey={[model, echo, step]}
      stats={
        <Stats>
          <Stat label="Calls in the log" value={echo.calls.length} sub="for 3 connections and 6 events" />
          <Stat label="Showing call" value={`${step + 1} of ${echo.calls.length}`} sub={`on ${lane.label}, tick ${echo.calls[step].t}`} />
          <Stat label="Wasted calls (EAGAIN)" value={echo.calls.filter((c) => c.name === 'EAGAIN').length} color="var(--orange)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a call that moved data', shape: 'square' },
            { color: 'var(--info)', label: 'the call that waits for or scans fds', shape: 'square' },
            { color: 'var(--orange)', label: 'EAGAIN: nothing to read', shape: 'square' },
            { color: 'var(--hi)', label: 'work on a request', shape: 'square' },
            { color: 'var(--dim)', label: 'blocked or idle', shape: 'square' },
            { color: 'var(--muted)', label: INSTANT_KEY, shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="I/O model" value={model} onChange={(m) => { setModel(m); pick(null); }} options={MODEL_OPTIONS} />
        </>,
        <>
          <Button onClick={() => pick(Math.max(0, step - 1))} softDisabled={step === 0}>Previous call</Button>
          <Button variant="primary" onClick={() => pick(Math.min(last, step + 1))} softDisabled={step === last}>Next call</Button>
          <Slider label="Call" value={step + 1} min={1} max={echo.calls.length} onChange={(v) => pick(v - 1)} />
        </>,
      ]}
    >
      <div className="iom-stage stage-pad">
        <Box>
          <SectionTitle hint="the highlighted line is the call the lanes are drawn up to">An strace-style log of an echo server</SectionTitle>
          <LogStream
            label="System calls of the simulated echo server"
            rows={rows}
            maxHeight={230}
            live="off"
            highlight={(row) => (Number(row.id) === step ? true : Number(row.id) > step ? false : null)}
          />
        </Box>
        <Box>
          <SectionTitle>The lanes up to that call</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Lanes up to the chosen call: scroll sideways to see all of it">
            <GanttLanes lanes={echo.lanes} bars={view.bars} domain={[0, echo.end]} now={view.now} axis size="md" labelMinPx={46} ariaLabel={`${MODEL_LABEL[model]}, calls up to ${step + 1}`} />
          </WideRegion>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">simulated trace in strace style, not output from a real process</Provenance>
          <Provenance kind="from-memory">strace line format and call arguments are written from memory; real output adds addresses, timings and flags</Provenance>
          <Provenance kind="scripted">the 6 events are fixed: connections 0 and 2, then 1, then all three</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
