import { useEffect, useRef, useState, type ReactNode } from 'react';
import { choose, findEnding, findNode, isBad, ledger, startWalk, undo, type Choice, type Meter, type Scenario, type Walk } from '../core/scenario';
import type { ClaimKind } from '../core/provenance';
import { Bar } from './Bar';
import { Box, SectionTitle } from './Panel';
import { Button, ClaimLabel, Hint, Provenance } from './ui';
import { useRadioGroup } from './useRadioGroup';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Where a meter's red edge sits, as a Bar marker in the meter's own units. */
const redEdge = (m: Meter) => ('below' in m.bad ? m.bad.below : m.bad.above);

/** Builds a class name from the story's prefix, so a lesson can carry its own CSS if it needs to. */
type ClassName = (name: string) => string;

function MeterRow({ m, value, preview, cls }: { m: Meter; value: number; preview?: number; cls: ClassName }) {
  const bad = isBad(m, value);
  const after = preview === undefined ? undefined : value + preview;
  return (
    <div className={cls('meter')}>
      <span className={cls('meter-label')}>
        {m.label}{' '}
        <b className={bad ? 'is-bad' : ''}>
          {value}
          {m.unit ? ` ${m.unit}` : ''}
        </b>
        {preview !== undefined && preview !== 0 && (
          <span className={`${cls('preview')} ${after !== undefined && isBad(m, after) ? 'is-bad' : ''}`}> {signed(preview)} if chosen</span>
        )}
      </span>
      <Bar
        value={value - m.min}
        max={m.max - m.min}
        marker={redEdge(m) - m.min}
        markLabel={`red ${'below' in m.bad ? 'below' : 'above'} ${redEdge(m)}`}
        tone={bad ? 'bad' : 'info'}
        height={10}
        ariaLabel={`${m.label}: ${value}${m.unit ? ` ${m.unit}` : ''}${bad ? ', in the red' : ''}`}
      />
    </div>
  );
}

/**
 * A branching decision simulator (K3-15) over a `core/scenario` `Scenario`: the meters, the choices as a
 * keyboard radio group with their reasons, a ledger of what happened, undo and replay, and the ending.
 * The caller owns the `walk` (start it with `startWalk`) so its stats and caption can follow it; the pick
 * that has not been continued yet is the story's own. After every step focus moves to the first choice of
 * the new step, or to the ending's title.
 *
 * `provenance` is mandatory: the story always carries the "invented" chip, because every effect in a
 * scenario is an authored number that shows a trade-off rather than a measurement; say what is invented.
 * `notes` are further chips (claim labels) for the same row. Class names carry `classPrefix`: the default,
 * `scn`, is styled by `scenarioStory.css`, and a lesson that passes its own prefix supplies the CSS for it.
 * `endingHint` is the one sentence about the scenario as a whole, the caller's to supply because only the
 * caller knows it is true (e.g. a claim it has checked with `validateScenario`).
 */
export function ScenarioStory({
  scenario, walk, onWalk, provenance, notes, claimOf, classPrefix = 'scn', endingHint, stepTitle = (n) => `Decision ${n}`,
}: {
  scenario: Scenario;
  walk: Walk;
  onWalk: (walk: Walk) => void;
  /** What is invented, shown beside the "invented" label. */
  provenance: ReactNode;
  /** Further chips (claim labels) on the provenance row. */
  notes?: ReactNode;
  claimOf?: (choiceId: string) => ClaimKind | undefined;
  classPrefix?: string;
  /** Shown beside the ending heading. */
  endingHint?: string;
  /** The heading of the n-th step (1-based). */
  stepTitle?: (n: number) => string;
}) {
  const cls: ClassName = (name) => `${classPrefix}-${name}`;
  const [picked, setPicked] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const node = findNode(scenario, walk.at);
  const ending = findEnding(scenario, walk.at);
  const choices = node?.choices ?? [];
  const pickedIndex = choices.findIndex((c) => c.id === picked);
  const radio = useRadioGroup(choices.length, pickedIndex, (i) => setPicked(choices[i].id));
  const chosen: Choice | undefined = choices[pickedIndex];
  const rows = ledger(scenario, walk);

  const moveTo = (next: Walk) => {
    onWalk(next);
    setPicked(null);
  };

  // Continue, Undo and Replay disable themselves or vanish with the step they act on, so focus moves
  // to the new step: its first choice, or the ending's title.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = root.current?.querySelector<HTMLElement>(`[role="radio"][tabindex="0"], .${cls('ending-title')}`);
    el?.focus();
  }, [walk.at]);

  return (
    <>
      <div className={cls('scenario')} ref={root}>
        <div className={cls('meters')}>
          {scenario.meters.map((m) => (
            <MeterRow key={m.id} m={m} value={walk.meters[m.id]} preview={chosen?.effects?.[m.id]} cls={cls} />
          ))}
        </div>

        {node && (
          <Box>
            <SectionTitle>{stepTitle(walk.path.length + 1)}</SectionTitle>
            <p className={cls('prompt')}>{node.prompt}</p>
            <div className={cls('choices')} role="radiogroup" aria-label="What do you do?">
              {choices.map((c, i) => (
                <button key={c.id} type="button" {...radio.itemProps(i)} className={`${cls('choice')} ${c.id === picked ? 'is-on' : ''}`} onClick={() => setPicked(c.id)}>
                  <b>{c.label}</b>
                  {c.id === picked && <span className={cls('because')}>{c.because} {claimOf?.(c.id) && <ClaimLabel kind={claimOf(c.id)!} />}</span>}
                </button>
              ))}
            </div>
            <div className={cls('actions')}>
              <Button variant="primary" disabled={!chosen} onClick={() => moveTo(choose(scenario, walk, picked!))}>Continue</Button>
              <Button disabled={walk.path.length === 0} onClick={() => moveTo(undo(scenario, walk))}>Undo the last choice</Button>
              {!chosen && <Hint>Pick a choice to see why it does what it does.</Hint>}
            </div>
          </Box>
        )}

        {ending && (
          <Box variant="sunken" className={cls('ending')}>
            <SectionTitle hint={endingHint}>Ending</SectionTitle>
            <p className={cls('ending-title')} tabIndex={-1}>{ending.title}</p>
            <p>{ending.text}</p>
            <div className={cls('actions')}>
              <Button onClick={() => moveTo(undo(scenario, walk))}>Undo the last choice</Button>
              <Button variant="primary" onClick={() => moveTo(startWalk(scenario))}>Replay from the start</Button>
            </div>
          </Box>
        )}

        <Box className={cls('ledger')}>
          <SectionTitle hint="what you chose and what it cost">Ledger</SectionTitle>
          {rows.length === 0 ? (
            <p className="empty-note">Nothing chosen yet.</p>
          ) : (
            <ol>
              {rows.map((r) => (
                <li key={r.nodeId}>
                  <b>{r.choice.label}</b>
                  <span className={cls('effects')}>
                    {scenario.meters.map((m) => {
                      const d = r.choice.effects?.[m.id] ?? 0;
                      return d === 0 ? null : (
                        <span key={m.id} className="chip">{m.label.toLowerCase()} {signed(d)}</span>
                      );
                    })}
                  </span>
                  <span className={cls('because')}>{r.choice.because}</span>
                </li>
              ))}
            </ol>
          )}
        </Box>
      </div>
      <div className={cls('notes')}>
        <Provenance kind="invented">{provenance}</Provenance>
        {notes}
      </div>
    </>
  );
}
