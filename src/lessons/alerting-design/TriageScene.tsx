import { useEffect, useState, type ReactNode } from 'react';
import { MetricMeter } from '../../components/MetricMeter';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { PAGE_BANDS, PAGE_METER_MAX } from './bands';
import { triageCaption } from './captions';
import { ALERTS, NIGHT_SHARE, ROUTES, ROUTE_LABEL, allTo, byRubric, rubricRoute, totals, type Route, type Routing } from './triage';

const URGENCY_TEXT = { now: 'act now', soon: 'act soon', none: 'no action' } as const;
/** Page everything is where the board starts: the usual first draft, not a recommendation. */
const START = allTo('page');

export function TriageScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [routing, setRouting] = useState<Routing>(START);
  const t = totals(routing);

  useEffect(() => {
    setCaption(triageCaption(routing), { quiet: true });
  }, [setCaption, routing]);

  const set = (id: string, route: Route) => setRouting({ ...routing, [id]: route });

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Alerts that page" value={t.paging} sub={`of ${ALERTS.length}`} />
          <Stat label="Pages a week" value={t.pagesPerWeek} sub={`about ${Math.round(t.nightPages)} at night, if ${Math.round(NIGHT_SHARE * 100)}% of firings land then`} />
          <Stat label="Differ from the rubric" value={t.mismatches} color={t.mismatches ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Paging with no runbook" value={t.pagesWithoutRunbook.length} color={t.pagesWithoutRunbook.length ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'where you routed it', shape: 'square' },
            { color: 'var(--ok)', label: 'matches the rubric', shape: 'square' },
            { color: 'var(--bad)', label: 'differs from the rubric, or pages with no runbook', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ChipButton tone="violet" onClick={() => setRouting(allTo('page'))}>Page on everything</ChipButton>
          <ChipButton tone="violet" onClick={() => setRouting(byRubric())}>Page on pain (the rubric)</ChipButton>
          <ChipButton tone="violet" onClick={() => setRouting(allTo('dashboard'))}>Dashboard everything</ChipButton>
        </>,
      ]}
    >
      <div className="ad stage-pad">
        <Hint block>
          Two questions decide the route: does a human need to act now, and is a user hurt now? Page when both are yes; ticket when a human must act but not yet; otherwise a dashboard is enough. Each alert also shows whether it has a clear action, because a page with nothing to do is hard to act on, but that does not change the route in this rubric.
        </Hint>
        <MetricMeter label="Pages in a week" value={t.pagesPerWeek} max={PAGE_METER_MAX} bands={PAGE_BANDS} />
        <ul className="ad-alerts">
          {ALERTS.map((a) => {
            const route = routing[a.id];
            const rubric = rubricRoute(a);
            const ok = route === rubric.route;
            const noRunbook = route === 'page' && !a.runbook;
            return (
              <li key={a.id} className="ad-alert">
                <span className="ad-alert-text">{a.text}</span>
                <span className="ad-facts">
                  <span className="chip">{URGENCY_TEXT[a.urgency]}</span>
                  <span className="chip">{a.clearAction ? 'clear action' : 'no clear action'}</span>
                  <span className="chip">{a.userHurt ? 'user hurt now' : 'no user hurt'}</span>
                  <span className="chip">fires {a.firesPerWeek} a week</span>
                </span>
                <Segmented ariaLabel={`Route: ${a.text}`} value={route} onChange={(r) => set(a.id, r)} options={ROUTES.map((r) => ({ value: r, label: ROUTE_LABEL[r] }))} />
                <span className={`ad-verdict ${ok && !noRunbook ? 'is-ok' : 'is-bad'}`}>
                  {ok ? `Matches the rubric: ${rubric.because}.` : `The rubric says ${ROUTE_LABEL[rubric.route].toLowerCase()}: ${rubric.because}.`}
                  {noRunbook && ' It pages with no runbook link.'}
                </span>
              </li>
            );
          })}
        </ul>
        <ProvenanceRow>
          <Provenance kind="illustrative">twelve authored alerts, invented fire counts and an assumed night share</Provenance>
          <ClaimLabel kind="practice">the two-question rubric is common practice, not a standard</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
