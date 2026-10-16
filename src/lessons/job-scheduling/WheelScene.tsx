import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { wheelFrames } from './captions';
import { addDelay, initialWheel } from './init';
import { WheelDial } from './WheelDial';
import { DELAY_MAX_S, DELAY_MIN_S, MAX_JOBS, TICK_S, WHEEL_SLOTS, dialSlots, heapOrder, inversions, place, runWheel } from './wheel';

const PRESETS = [3, 9, 20];
const PLAY_MS = 520;

export function WheelScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialWheel);
  const { jobs } = state;
  const result = useMemo(() => runWheel(jobs), [jobs]);
  const placed = useMemo(() => place(jobs), [jobs]);
  const frames = useMemo(() => wheelFrames(jobs), [jobs]);
  const flips = useMemo(() => inversions(jobs), [jobs]);
  const heap = useMemo(() => heapOrder(jobs), [jobs]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const tick = player.frame.tick;
  const firedBy = result.firings.filter((f) => f.tick <= tick);
  const dial = useMemo(() => dialSlots(result, tick), [result, tick]);
  const firedNow = result.firings.filter((f) => f.tick === tick).map((f) => f.id);
  const lateness = Math.max(0, ...result.firings.map((f) => f.tick * TICK_S - (jobs.find((j) => j.id === f.id)?.delay ?? 0)));
  const add = (value?: number) => setState((s) => addDelay(s, value));

  return (
    <StageFrame
      height={460}
      player={player}
      stats={
        <Stats>
          <Stat label="Jobs queued" value={jobs.length} sub={`up to ${MAX_JOBS}`} />
          <Stat label="Ticks to fire them all" value={result.ticks} sub={`one tick is ${TICK_S} s`} />
          <Stat label="Fired so far" value={`${firedBy.length} of ${jobs.length}`} color="var(--ok)" sub={`at tick ${tick}`} />
          <Stat label="Pairs out of due order" value={flips.length} color={flips.length > 0 ? 'var(--orange)' : undefined} sub="wheel against the sorted queue" />
          <Stat label="Latest, after its due time" value={`${lateness} s`} sub="always under one tick" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the wheel\'s pointer and its slot' },
            { color: 'var(--info)', label: 'laps still to go (the dot and number after a job)' },
            { color: 'var(--ok)', label: 'a job that fires at this tick' },
            { color: 'var(--orange)', label: 'a pair the heap would order differently' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Delay (s)" value={state.text} onChange={(text) => setState((s) => ({ ...s, text, refusal: null }))} onEnter={() => add()} width={72} spellCheck={false} />
          <Button variant="primary" onClick={() => add()}>Add job</Button>
          {PRESETS.map((p) => (
            <ChipButton key={p} tone="info" onClick={() => add(p)}>+ {p} s</ChipButton>
          ))}
        </>,
        <>
          <Button softDisabled={jobs.length === 0} onClick={() => setState((s) => ({ ...s, jobs: s.jobs.slice(0, -1), refusal: null }))}>Remove last</Button>
          <Button onClick={() => setState(initialWheel())}>Reset</Button>
          <span className="js-hint" role="status">{state.refusal ?? `Delays are multiples of 0.5 s from ${DELAY_MIN_S} to ${DELAY_MAX_S} s.`}</span>
        </>,
      ]}
    >
      <div className="js-stage stage-pad">
        <Box>
          <SectionTitle hint={`${WHEEL_SLOTS} slots, one tick a second`}>The timing wheel at tick {tick}</SectionTitle>
          <div className="js-wheel-row">
            <WheelDial
              slots={dial}
              pointer={tick === 0 ? null : tick % WHEEL_SLOTS}
              firedNow={firedNow}
              ariaLabel={`Timing wheel at tick ${tick}: ${result.slotsAt[tick].flat().length} jobs waiting${firedNow.length > 0 ? `, ${firedNow.length} firing now` : ''}, ${firedBy.length} fired`}
            />
            <div className="js-order">
              <p className="js-note"><b>Wheel order</b> (insertion order inside a tick)</p>
              <ol className="js-list">
                {result.firings.map((f) => (
                  <li key={f.id} className={f.tick <= tick ? 'is-done' : ''}>J{f.id} <span className="js-dimtext">tick {f.tick}</span></li>
                ))}
              </ol>
              <p className="js-note"><b>Sorted queue order</b> (exact due time)</p>
              <ol className="js-list">
                {heap.map((id) => (
                  <li key={id} className={flips.some(([a, b]) => a === id || b === id) ? 'is-flip' : ''}>J{id} <span className="js-dimtext">{jobs.find((j) => j.id === id)?.delay} s</span></li>
                ))}
              </ol>
            </div>
          </div>
        </Box>
        <Box>
          <SectionTitle hint="slot = due tick mod 8; laps = whole laps of the wheel still to go">Where each job sits</SectionTitle>
          <div className="js-scroll" role="region" aria-label="Jobs and their wheel placement" tabIndex={0}>
            <table className="data-table js-table table-cards">
              <thead>
                <tr><th scope="col">Job</th><th scope="col">Delay</th><th scope="col">Due tick</th><th scope="col">Slot</th><th scope="col">Laps</th><th scope="col">Fires at tick</th></tr>
              </thead>
              <tbody>
                {placed.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" data-label="Job">J{p.id}</th>
                    <td data-label="Delay">{p.delay} s</td>
                    <td data-label="Due tick">{p.dueTick}</td>
                    <td data-label="Slot">{p.slot}</td>
                    <td data-label="Laps">{p.rounds}</td>
                    <td data-label="Fires at tick">{result.firings.find((f) => f.id === p.id)?.tick}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="js-note">Inserting a job is one append to a slot, whatever the queue holds; the price is the tick: jobs due inside one tick fire in insertion order, and the sorted queue (O(log n) per insert) keeps exact order.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a wheel and a sorted queue run on the same jobs, in this page; the wheel is checked against the sorted order in the lesson's tests</Provenance>
          <Provenance kind="from-memory">real systems that use hashed or hierarchical timing wheels (Kafka and Netty are often named) differ in slot counts, tick sizes and hierarchy; verify against their documentation</Provenance>
          <Provenance kind="illustrative">8 slots and a 1 s tick are chosen to fit the screen</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
