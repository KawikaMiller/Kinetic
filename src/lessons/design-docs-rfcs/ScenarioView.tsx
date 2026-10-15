import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { Button, ClaimLabel, Hint } from '../../components/ui';
import { useRadioGroup } from '../../components/useRadioGroup';
import type { ClaimKind } from '../../core/provenance';
import { findEnding, findNode, isBad, ledger, type Choice, type Meter, type Scenario, type Walk } from './scenario';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Where a meter's red edge sits, as a Bar marker in the meter's own units. */
const redEdge = (m: Meter) => ('below' in m.bad ? m.bad.below : m.bad.above);

function MeterRow({ m, value, preview }: { m: Meter; value: number; preview?: number }) {
  const bad = isBad(m, value);
  const after = preview === undefined ? undefined : value + preview;
  return (
    <div className="dd-meter">
      <span className="dd-meter-label">
        {m.label}{' '}
        <b className={bad ? 'is-bad' : ''}>
          {value}
          {m.unit ? ` ${m.unit}` : ''}
        </b>
        {preview !== undefined && preview !== 0 && (
          <span className={`dd-preview ${after !== undefined && isBad(m, after) ? 'is-bad' : ''}`}> {signed(preview)} if chosen</span>
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

/** Presentational: the meters, the choices as a keyboard radio group with their reasons, the ledger and the ending. */
export function ScenarioView({
  scenario, walk, picked, onPick, onContinue, onUndo, onReplay, claimOf,
}: {
  scenario: Scenario;
  walk: Walk;
  picked: string | null;
  onPick: (choiceId: string) => void;
  onContinue: () => void;
  onUndo: () => void;
  onReplay: () => void;
  claimOf?: (choiceId: string) => ClaimKind | undefined;
}) {
  const node = findNode(scenario, walk.at);
  const ending = findEnding(scenario, walk.at);
  const choices = node?.choices ?? [];
  const pickedIndex = choices.findIndex((c) => c.id === picked);
  const radio = useRadioGroup(choices.length, pickedIndex, (i) => onPick(choices[i].id));
  const chosen: Choice | undefined = choices[pickedIndex];
  const rows = ledger(scenario, walk);

  return (
    <div className="dd-scenario">
      <div className="dd-meters">
        {scenario.meters.map((m) => (
          <MeterRow key={m.id} m={m} value={walk.meters[m.id]} preview={chosen?.effects?.[m.id]} />
        ))}
      </div>

      {node && (
        <Box>
          <SectionTitle>{`Decision ${walk.path.length + 1}`}</SectionTitle>
          <p className="dd-prompt">{node.prompt}</p>
          <div className="dd-choices" role="radiogroup" aria-label="What do you do?">
            {choices.map((c, i) => (
              <button key={c.id} type="button" {...radio.itemProps(i)} className={`dd-choice ${c.id === picked ? 'is-on' : ''}`} onClick={() => onPick(c.id)}>
                <b>{c.label}</b>
                {c.id === picked && <span className="dd-because">{c.because} {claimOf?.(c.id) && <ClaimLabel kind={claimOf(c.id)!} />}</span>}
              </button>
            ))}
          </div>
          <div className="dd-actions">
            <Button variant="primary" disabled={!chosen} onClick={onContinue}>Continue</Button>
            <Button disabled={walk.path.length === 0} onClick={onUndo}>Undo the last choice</Button>
            {!chosen && <Hint>Pick a choice to see why it does what it does.</Hint>}
          </div>
        </Box>
      )}

      {ending && (
        <Box variant="sunken" className="dd-ending">
          <SectionTitle hint="every ending is reachable">Ending</SectionTitle>
          <p className="dd-ending-title">{ending.title}</p>
          <p>{ending.text}</p>
          <div className="dd-actions">
            <Button onClick={onUndo}>Undo the last choice</Button>
            <Button variant="primary" onClick={onReplay}>Replay from the start</Button>
          </div>
        </Box>
      )}

      <Box className="dd-ledger">
        <SectionTitle hint="what you chose and what it cost">Ledger</SectionTitle>
        {rows.length === 0 ? (
          <p className="empty-note">Nothing chosen yet.</p>
        ) : (
          <ol>
            {rows.map((r) => (
              <li key={r.nodeId}>
                <b>{r.choice.label}</b>
                <span className="dd-effects">
                  {scenario.meters.map((m) => {
                    const d = r.choice.effects?.[m.id] ?? 0;
                    return d === 0 ? null : (
                      <span key={m.id} className="chip">{m.label.toLowerCase()} {signed(d)}</span>
                    );
                  })}
                </span>
                <span className="dd-because">{r.choice.because}</span>
              </li>
            ))}
          </ol>
        )}
      </Box>
    </div>
  );
}
