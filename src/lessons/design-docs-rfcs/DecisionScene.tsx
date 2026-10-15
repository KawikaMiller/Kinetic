import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { TITLE_MAX, acceptBlocked, adrLines, draftAdr, edit, setStatus, supersede, type Adr, type Status } from './adr';
import { decisionCaption } from './captions';
import {
  CONSTRAINTS, CRITERIA, OPENING_WEIGHTS, optionOf, rank, scaled, sweepFlips, weightTotal, winner, violated,
  type ConstraintId, type CriterionId, type OptionId, type Weights,
} from './decision';

const TABLE_MIN_WIDTH = 520;
const STATUSES: Status[] = ['proposed', 'accepted', 'superseded'];
const money = (v: number) => v.toLocaleString('en-US');

/** The percentage share a slider value would have of all the weights (0 when they would all be zero). */
function shareOf(w: Weights, id: CriterionId, v: number): number {
  const total = weightTotal({ ...w, [id]: v });
  return total === 0 ? 0 : Math.round((v / total) * 100);
}

export function DecisionScene({ picker }: { picker: ReactNode }) {
  const [weights, setWeights] = useState<Weights>(OPENING_WEIGHTS);
  const [on, setOn] = useState<ConstraintId[]>([]);
  const [swept, setSwept] = useState<CriterionId>('latency');
  const [history, setHistory] = useState<Adr[]>(() => [draftAdr(winner(OPENING_WEIGHTS, [])!.id)]);
  const [message, setMessage] = useState<string | null>(null);
  const setCaption = useSetCaption();
  const active = history[history.length - 1];
  const ranked = useMemo(() => rank(weights, on)!, [weights, on]);
  const flips = useMemo(() => sweepFlips(weights, swept, on), [weights, swept, on]);

  useEffect(() => {
    setCaption(decisionCaption(weights, on, swept), { quiet: true });
  }, [setCaption, weights, on, swept]);

  const setWeight = (id: CriterionId, v: number) => {
    const next = { ...weights, [id]: v };
    if (weightTotal(next) === 0) return setMessage('At least one weight has to stay above zero, so the weights are unchanged.');
    setMessage(null);
    setWeights(next);
  };
  const replaceActive = (next: Adr) => setHistory([...history.slice(0, -1), next]);
  const apply = (r: ReturnType<typeof edit>) => {
    if (!r.ok) return setMessage(r.message);
    setMessage(null);
    replaceActive(r.value);
  };
  const choose = (id: OptionId) => apply(edit(active, { optionId: id }));
  const status = (s: Status) => {
    const blocked = s === 'accepted' ? acceptBlocked(active.optionId, on) : null;
    if (blocked) return setMessage(blocked);
    apply(setStatus(active, s));
  };
  const doSupersede = () => {
    const next = supersede(history, active.number, active.optionId, active.title);
    if (!next.ok) return setMessage(next.message);
    setMessage(null);
    setHistory(next.value);
  };
  const toggleConstraint = (id: ConstraintId) => setOn(on.includes(id) ? on.filter((c) => c !== id) : [...on, id]);

  const chosen = optionOf(active.optionId);
  const chosenBroken = violated(chosen, on);

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Ranks first" value={ranked[0].knockedOut.length === 0 ? ranked[0].option.name : 'nothing'} color="var(--hi)" sub={ranked[0].knockedOut.length === 0 ? `score ${ranked[0].score.toFixed(2)}` : 'every option is knocked out'} />
          <Stat label="Knocked out" value={ranked.filter((r) => r.knockedOut.length > 0).length} color="var(--dim)" sub="by a must-have constraint" />
          <Stat label={`ADR ${active.number}`} value={active.status} sub={`chosen: ${chosen.name}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the chosen option', shape: 'square' },
            { color: 'var(--dim)', label: 'knocked out by a constraint', shape: 'square' },
            { color: 'var(--bad)', label: 'the constraint it violates', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Must-have constraints">
            {CONSTRAINTS.map((c) => (
              <ChipButton key={c.id} tone="orange" on={on.includes(c.id)} onClick={() => toggleConstraint(c.id)}>
                {c.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          {CRITERIA.map((c) => (
            <Slider key={c.id} label={`Weight: ${c.label.toLowerCase()}`} value={weights[c.id]} min={0} max={100} step={5} onChange={(v) => setWeight(c.id, v)} format={(v) => `${shareOf(weights, c.id, v)}%`} />
          ))}
          <Segmented label="Sweep" value={swept} onChange={setSwept} options={CRITERIA.map((c) => ({ value: c.id, label: c.label }))} />
        </>,
      ]}
    >
      <div className="dd stage-pad">
        <WideRegion minWidth={TABLE_MIN_WIDTH} label="Options by criteria: scroll sideways to see all of it">
          <table className="data-table dd-options">
            <thead>
              <tr>
                <th>Option</th>
                {CRITERIA.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
                <th>Score</th>
                <th>
                  <span className="dd-sr">Choose</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const knocked = r.knockedOut.length > 0;
                const isChosen = r.option.id === active.optionId;
                return (
                  <tr key={r.option.id} className={`${knocked ? 'is-dim' : ''} ${isChosen ? 'is-chosen' : ''}`}>
                    <th scope="row">{r.option.name}</th>
                    {CRITERIA.map((c) => {
                      const broken = r.knockedOut.some((k) => k.criterion === c.id);
                      return (
                        <td key={c.id} className={broken ? 'dd-bad' : ''}>
                          {c.id === 'cost' ? `$${money(r.option.values[c.id])}` : r.option.values[c.id]} <span className="dd-unit">{c.id === 'cost' ? '' : c.unit}</span>
                          <span className="dd-scaled"> · {scaled(c.id, r.option.values[c.id]).toFixed(2)}</span>
                        </td>
                      );
                    })}
                    <td>{knocked ? <span className="dd-bad">{r.knockedOut.map((k) => k.label).join(', ')}</span> : r.score.toFixed(2)}</td>
                    <td>
                      <ChipButton tone="hi" on={isChosen} onStyle="solid" disabled={knocked} onClick={() => choose(r.option.id)}>
                        {isChosen ? 'chosen' : 'choose'}
                      </ChipButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </WideRegion>
        <Hint block>Each criterion is scaled 0 to 1 across the four options (1 is the best value, shown after the dot), weighted by the sliders (shown as shares of 100%), and summed. Lower is better on every criterion.</Hint>

        <Box variant="sunken" className="dd-flip">
          <SectionTitle hint="scanned from 0 to 1 in steps of 0.01, the other weights keeping their proportions">Where does the decision flip?</SectionTitle>
          {flips.length === 0 ? (
            <p>
              Moving the weight on {CRITERIA.find((c) => c.id === swept)!.label.toLowerCase()} anywhere from 0 to 1 never changes the winner, which is <b>{winner(weights, on)?.name ?? 'nothing'}</b>.
            </p>
          ) : (
            <ul>
              {flips.map((f) => (
                <li key={f.at}>
                  At a weight of <b>{f.at.toFixed(2)}</b> the winner changes from <b>{f.from ? optionOf(f.from).name : 'nothing'}</b> to <b>{f.to ? optionOf(f.to).name : 'nothing'}</b>.
                </li>
              ))}
            </ul>
          )}
        </Box>

        <Box className="dd-adr">
          <SectionTitle hint="the chosen option writes it">Architecture decision record</SectionTitle>
          <div className="dd-adr-edit">
            <TextField
              label="Title"
              value={active.title}
              onChange={(title) => apply(edit(active, { title: title.slice(0, TITLE_MAX) }))}
              maxLength={TITLE_MAX}
              spellCheck
              width={320}
            />
            <Segmented label="Status" value={active.status} onChange={status} options={STATUSES.map((s) => ({ value: s, label: s }))} />
            <Button disabled={active.status !== 'accepted'} onClick={doSupersede}>Supersede with a new record</Button>
          </div>
          {message && <Hint tone="muted">{message}</Hint>}
          {chosenBroken.length > 0 && active.status === 'proposed' && <Hint tone="muted">The chosen option breaks {chosenBroken.map((c) => c.label).join(' and ')}.</Hint>}
          <CodePanel title={`ADR ${active.number}`} lines={adrLines(active, history)} />
          {history.length > 1 && (
            <ul className="dd-history" aria-label="ADR history">
              {history.map((a) => (
                <li key={a.number}>
                  ADR {a.number}: {optionOf(a.optionId).name}, <b>{a.status}</b>
                  {a.supersedes !== null && <> (supersedes ADR {a.supersedes})</>}
                  {a.supersededBy !== null && <> (superseded by ADR {a.supersededBy})</>}
                </li>
              ))}
            </ul>
          )}
        </Box>

        <div className="dd-notes">
          <Provenance kind="invented">an invented decision, its options and every number in the table</Provenance>
          <ClaimLabel kind="practice">the title, status, context, decision, consequences layout follows a template many teams use, popularised by a 2011 post on documenting architecture decisions; from memory</ClaimLabel>
          <ClaimLabel kind="view">a weighted sum is one way to compare options; the weights are a judgement, not a measurement</ClaimLabel>
        </div>
      </div>
    </StageFrame>
  );
}
