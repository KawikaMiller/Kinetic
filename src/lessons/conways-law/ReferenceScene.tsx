import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Slider, Stat, Stats } from '../../components/ui';
import { placeAll, referenceCaption } from './captions';
import { CAP, MAX_TIED_SHOWN, WEIGHT, isPlaced, layoutFrom, metrics, reference, teamsOf } from './model';
import { OPENING, type SceneProps } from './opening';
import { CapSlider, ConwayChips } from './parts';

const CAPS = Array.from({ length: CAP.max - CAP.min + 1 }, (_, i) => CAP.min + i);

/** Scene 3: one reference, found by trying every assignment, and what moves it. */
export function ReferenceScene({ picker, board, cap, onCap }: SceneProps) {
  const layout = useMemo(() => layoutFrom(board.answers), [board]);
  const placed = isPlaced(layout);
  const [weight, setWeight] = useState(OPENING.weight);
  const [shown, setShown] = useState(false);
  const ref = reference(cap, weight);
  const mine = placed ? metrics(layout, cap) : null;
  const yours = mine ? mine.handoffs + weight * mine.interfaces : null;
  const visible = shown && placed;

  return (
    <StageFrame
      height={780}
      intro={placed ? referenceCaption(ref, cap, weight, visible) : placeAll(layout)}
      introKey={`${placed}|${cap}|${weight}|${visible}`}
      stats={
        <Stats>
          <Stat label="Best score" value={ref.score ?? 'none fits'} color={ref.score === null ? 'var(--bad)' : 'var(--ok)'} sub={`handoffs + ${weight} x interfaces, at cap ${cap}`} />
          <Stat label="Tied layouts" value={ref.tied.length} sub="distinct groupings, team names ignored" />
          <Stat label="Your layout" value={yours === null ? '–' : yours} color={mine && mine.over.length ? 'var(--bad)' : undefined} sub={mine ? (mine.over.length ? 'over the cap' : 'inside the cap') : 'place all 8 services'} />
        </Stats>
      }
      controls={[
        <>{picker}<Slider label="Interface weight" value={weight} min={WEIGHT.min} max={WEIGHT.max} step={WEIGHT.step} format={(v) => v.toFixed(1)} onChange={setWeight} /></>,
        <><CapSlider cap={cap} onCap={onCap} /><Button variant="primary" softDisabled={!placed} onClick={() => placed && setShown((s) => !s)}>{visible ? 'Hide the reference' : 'Show one reference'}</Button></>,
      ]}
    >
      <div className="cw-stage stage-pad">
        {!placed && <Hint tone="muted" block>Place all 8 services first: the reference is hidden until you have drawn your own lines.</Hint>}
        {visible && (
          <section className="cw-reference">
            <ClaimLabel kind="view">one view, not the answer</ClaimLabel>
            {ref.score === null ? <p>No layout fits a cap of {cap}.</p> : (
              <ul>
                {ref.tied.slice(0, MAX_TIED_SHOWN).map((l) => {
                  const m = metrics(l, cap);
                  return (
                    <li key={teamsOf(l).map((t) => t.services.join('+')).join('|')}>
                      {teamsOf(l).map((t) => `team ${t.team}: ${t.services.join(', ')}`).join('; ')} ({m.handoffs} handoffs, {m.interfaces} interfaces, largest load {m.maxCognitive})
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        <table className="data-table cw-table">
          <caption>The best score at each cap (weight {weight}): the cap, not the services, flips the answer</caption>
          <thead><tr><th>Cap</th><th>Best score</th><th>Tied layouts</th></tr></thead>
          <tbody>
            {CAPS.map((c) => {
              const r = reference(c, weight);
              return (
                <tr key={c} className={c === cap ? 'cw-yours' : undefined}>
                  <td>{c}</td><td>{r.score ?? 'none fits'}</td><td>{r.tied.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ConwayChips />
      </div>
    </StageFrame>
  );
}
