import { useEffect, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { monolithCaption } from './captions';
import { ATTRIBUTES, REQUESTS, TEAMS, TEAM_TONE, blastRadius, teamsTouched } from './monolith';

const TEAM_ABBREVIATION = ['Bill', 'Ship', 'Supp', 'Mktg'];

export function MonolithScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [requestId, setRequestId] = useState(REQUESTS[0].id);
  const request = REQUESTS.find((r) => r.id === requestId)!;
  const touched = teamsTouched(request);
  const radius = blastRadius(request);

  const caption = monolithCaption(request);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const rows = request.attributes.map((id) => ATTRIBUTES.findIndex((a) => a.id === id));

  return (
    <StageFrame
      height={520}
      legend={
        <Legend
          items={[
            ...TEAMS.map((t) => ({ color: `var(--${TEAM_TONE[t.id]})`, label: t.label })),
            { color: 'var(--hi)', label: 'the attribute being changed' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Blast radius" value={`${radius} of ${TEAMS.length} teams`} color={radius > 1 ? 'var(--bad)' : 'var(--ok)'} sub={touched.map((t) => TEAMS.find((x) => x.id === t)!.label).join(', ')}>
            <Bar value={radius} max={TEAMS.length} tone={radius > 1 ? 'bad' : 'ok'} height={8} ariaLabel={`${radius} of ${TEAMS.length} teams must change`} />
          </Stat>
        </Stats>
      }
      controls={[
        <>
          {picker}
          <div className="ddd-chips" role="group" aria-label="Change requests">
            {REQUESTS.map((r) => <ChipButton key={r.id} tone="info" on={requestId === r.id} onClick={() => setRequestId(r.id)}>{r.label}</ChipButton>)}
          </div>
        </>,
      ]}
    >
      <div className="stage-pad ddd">
        <Box className="ddd-card">
          <SectionTitle weight="regular" hint="one concept, 14 attributes, 4 teams: w writes it, r reads it">Who touches the one Customer</SectionTitle>
          <CellGrid
            rows={ATTRIBUTES.length}
            cols={TEAMS.length}
            rowLabels={ATTRIBUTES.map((a) => a.label)}
            colLabels={TEAM_ABBREVIATION}
            size="md"
            ariaLabel="Which team reads or writes each attribute of Customer"
            cell={(r, c) => {
              const access = ATTRIBUTES[r].access[c];
              const tone = TEAM_TONE[TEAMS[c].id];
              return access ? { tone, fill: access === 'w' ? 'solid' : 'tint', text: access, intensity: 0.3 } : { fill: 'none' };
            }}
            cellTitle={(r, c) => `${TEAMS[c].label} ${ATTRIBUTES[r].access[c] === 'w' ? 'writes' : ATTRIBUTES[r].access[c] === 'r' ? 'reads' : 'does not touch'} ${ATTRIBUTES[r].label}`}
            highlight={rows.flatMap((r) => TEAMS.map((_, c) => ({ r, c, tone: 'hi' as const })))}
          />
        </Box>
        <div className="ddd-chips">
          <Provenance kind="illustrative">an invented shop and an invented usage matrix</Provenance>
        </div>
        <Hint block>
          Every request here touches three of the four teams, because they all share one model. That is the cost of one shared Customer, and the next scene draws the boundaries that remove it.
        </Hint>
      </div>
    </StageFrame>
  );
}
