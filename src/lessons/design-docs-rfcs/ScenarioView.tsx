import { useEffect, useRef } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { Button, ClaimLabel, Hint } from '../../components/ui';
import { useRadioGroup } from '../../components/useRadioGroup';
import type { ClaimKind } from '../../core/provenance';
import { findEnding, findNode, isBad, ledger, type Choice, type Meter, type Scenario, type Walk } from './scenario';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Where a meter's red edge sits, as a Bar marker in the meter's own units. */
const redEdge = (m: Meter) => ('below' in m.bad ? m.bad.below : m.bad.above);

/** Builds a class name from the view's prefix, so an extracted scenario view can carry its own lesson's prefix. */
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
 * Presentational: the meters, the choices as a keyboard radio group with their reasons, the ledger and the ending.
 * Class names carry `classPrefix` (lesson CSS is global, so each lesson passes its own), and the one sentence about
 * the scenario as a whole, `endingHint`, is the caller's to supply because only the caller knows it is true.
 */
export function ScenarioView({
  scenario, walk, picked, onPick, onContinue, onUndo, onReplay, claimOf, classPrefix = 'dd', endingHint, stepTitle = (n) => `Decision ${n}`,
}: {
  scenario: Scenario;
  walk: Walk;
  picked: string | null;
  onPick: (choiceId: string) => void;
  onContinue: () => void;
  onUndo: () => void;
  onReplay: () => void;
  claimOf?: (choiceId: string) => ClaimKind | undefined;
  classPrefix?: string;
  /** Shown beside the ending heading, e.g. a claim the caller has checked with `validateScenario`. */
  endingHint?: string;
  /** The heading of the n-th step (1-based). */
  stepTitle?: (n: number) => string;
}) {
  const cls: ClassName = (name) => `${classPrefix}-${name}`;
  const root = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const node = findNode(scenario, walk.at);
  const ending = findEnding(scenario, walk.at);
  const choices = node?.choices ?? [];
  const pickedIndex = choices.findIndex((c) => c.id === picked);
  const radio = useRadioGroup(choices.length, pickedIndex, (i) => onPick(choices[i].id));
  const chosen: Choice | undefined = choices[pickedIndex];
  const rows = ledger(scenario, walk);

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
              <button key={c.id} type="button" {...radio.itemProps(i)} className={`${cls('choice')} ${c.id === picked ? 'is-on' : ''}`} onClick={() => onPick(c.id)}>
                <b>{c.label}</b>
                {c.id === picked && <span className={cls('because')}>{c.because} {claimOf?.(c.id) && <ClaimLabel kind={claimOf(c.id)!} />}</span>}
              </button>
            ))}
          </div>
          <div className={cls('actions')}>
            <Button variant="primary" disabled={!chosen} onClick={onContinue}>Continue</Button>
            <Button disabled={walk.path.length === 0} onClick={onUndo}>Undo the last choice</Button>
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
            <Button onClick={onUndo}>Undo the last choice</Button>
            <Button variant="primary" onClick={onReplay}>Replay from the start</Button>
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
  );
}
