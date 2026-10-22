import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Stat, Stats } from '../../components/ui';
import { moveCaption, placeAll } from './captions';
import { SERVICE_IDS, TEAMS, isPlaced, layoutFrom, metrics, moveService, type ServiceId, type TeamId } from './model';
import { OPENING, type SceneProps } from './opening';
import { CapSlider, ConwayChips, LayoutGraph, LayoutLegend } from './parts';

const change = (before: number, after: number): string => (after === before ? `${after}, no change` : `${before} to ${after}`);

/** Scene 4: the inverse Conway manoeuvre. Shape the lines on purpose, and see what each interface becomes. */
export function MoveScene({ picker, board, onBoard, cap, onCap }: SceneProps) {
  const layout = useMemo(() => layoutFrom(board.answers), [board]);
  const [service, setService] = useState<ServiceId>(OPENING.move.service);
  const [team, setTeam] = useState<TeamId>(OPENING.move.team);
  const placed = isPlaced(layout);
  const before = placed ? metrics(layout, cap) : null;
  const moved = placed ? moveService(layout, service, team) : null;
  const after = moved ? metrics(moved, cap) : null;
  const from = placed ? layout[service] : null;

  return (
    <StageFrame
      height={780}
      intro={placed && before && after && from ? moveCaption(service, from, team, before, after, cap) : placeAll(layout)}
      introKey={`${JSON.stringify(layout)}|${service}|${team}|${cap}`}
      stats={
        <Stats>
          <Stat label="Handoffs" value={before && after ? change(before.handoffs, after.handoffs) : '–'} sub="now, then after the move" />
          <Stat label="Interfaces" value={before && after ? change(before.interfaces, after.interfaces) : '–'} sub="now, then after the move" />
          <Stat label="Largest load" value={before && after ? change(before.maxCognitive, after.maxCognitive) : '–'} color={after && after.over.length ? 'var(--bad)' : undefined} sub={after && after.over.length ? `team ${after.over.join(', ')} over the cap of ${cap} after the move` : `cap ${cap}`} />
        </Stats>
      }
      legend={<LayoutLegend />}
      controls={[<>{picker}</>, <><CapSlider cap={cap} onCap={onCap} /></>]}
    >
      <div className="cw-stage stage-pad">
        {!placed && <Hint tone="muted" block>Place all 8 services on the first scene, or press a preset there, then come back to move one.</Hint>}
        <div className="cw-pick" role="group" aria-label="Service to move">
          {SERVICE_IDS.map((id) => <ChipButton key={id} tone="info" on={service === id} onClick={() => setService(id)}>{id}</ChipButton>)}
        </div>
        <div className="cw-pick" role="group" aria-label="Team to move it to">
          {TEAMS.map((t) => <ChipButton key={t} tone="info" on={team === t} onClick={() => setTeam(t)}>{`to team ${t}`}</ChipButton>)}
          <Button variant="primary" softDisabled={!moved || from === team} onClick={() => moved && from !== team && onBoard({ answers: { ...moved }, checked: false })}>Apply the move</Button>
        </div>
        <LayoutGraph layout={moved ?? layout} />
        <p className="cw-note">The drawing shows the layout as it would be after the move.</p>
        {before && (
          <section>
            <h4 className="cw-h">Interfaces this layout creates: each is a contract two teams negotiate</h4>
            {before.crossEdges.length === 0 ? <p>None: no call crosses a team line.</p> : (
              <ul className="cw-contracts">
                {before.crossEdges.map(([a, b]) => <li key={`${a}-${b}`}>{a} (team {layout[a]}) and {b} (team {layout[b]})</li>)}
              </ul>
            )}
          </section>
        )}
        <ConwayChips />
        <div>
          <ClaimLabel kind="view">the inverse Conway manoeuvre: shape teams and communication to encourage the architecture you want, a design view and not a recipe</ClaimLabel>
        </div>
      </div>
    </StageFrame>
  );
}
