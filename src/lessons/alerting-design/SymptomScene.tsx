import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import { alertRows, predictionTicket } from './alerts';
import { symptomCaption } from './captions';
import { PREDICT_HORIZON, PREDICT_WINDOW, incidentAt } from './rules';
import { INCIDENTS, MIN_PER_DAY, WEEK_SEED, incidentEnd } from './week';

const GANTT_MIN_W = 520;
const LABEL_W = 132;
const NO_BAR_TEXT = Number.POSITIVE_INFINITY;
const toDay = (minute: number) => minute / MIN_PER_DAY;
/** A 12-minute incident is thinner than a pixel on a week: draw it at least this many days wide. */
const MIN_BAND_DAYS = 0.05;

export function SymptomScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [withPrediction, setWithPrediction] = useState(false);
  const rows = useMemo(() => alertRows(), []);
  const ticket = useMemo(() => predictionTicket(), []);
  const lead = withPrediction && ticket ? ticket.lead : null;

  useEffect(() => {
    setCaption(symptomCaption(rows, lead), { quiet: true });
  }, [setCaption, rows, lead]);

  const lanes: GanttLane[] = [
    { id: 'incidents', label: 'Real incidents' },
    ...rows.map((r) => ({ id: r.id, label: r.label })),
    ...(withPrediction ? [{ id: 'predict', label: 'Disk full soon: ticket' }] : []),
  ];
  const bars: GanttBar[] = [
    ...INCIDENTS.map((i) => ({ id: i.id, lane: 'incidents', start: toDay(i.start), end: Math.max(toDay(incidentEnd(i)), toDay(i.start) + MIN_BAND_DAYS), tone: 'bad' as const, label: i.name })),
    ...rows.flatMap((r) => r.fires.map((f) => ({ id: `${r.id}-${f}`, lane: r.id, start: toDay(f), end: toDay(f), tone: incidentAt(f) ? ('ok' as const) : ('orange' as const) }))),
    ...(withPrediction && ticket ? [{ id: 'ticket', lane: 'predict', start: toDay(ticket.fire), end: toDay(ticket.fire), tone: 'info' as const, label: `ticket, ${ticket.lead} min before it fills` }] : []),
  ];

  return (
    <StageFrame
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a real incident', shape: 'square' },
            { color: 'var(--ok)', label: 'a page during an incident', shape: 'dot' },
            { color: 'var(--orange)', label: 'a page with no incident', shape: 'dot' },
            { color: 'var(--info)', label: 'a ticket', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="The one honest cause alert" value={withPrediction} onChange={setWithPrediction} off="Hidden" on="Add the disk-full prediction" />
        </>,
      ]}
    >
      <div className="ad stage-pad">
        <WideRegion minWidth={GANTT_MIN_W} label="Alerts over the week: scroll sideways to see all of it">
          <GanttLanes lanes={lanes} bars={bars} domain={[0, 7]} unit=" d" axis labelWidth={LABEL_W} labelMinPx={NO_BAR_TEXT} ariaLabel="Pages from each alert over the week, against the real incidents" />
        </WideRegion>
        <table className="data-table ad-table">
          <thead>
            <tr>
              <th scope="col">Alert</th>
              <th scope="col">Kind</th>
              <th scope="col">Pages</th>
              <th scope="col">During an incident</th>
              <th scope="col">No incident</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.label}</th>
                <td>{r.kind}</td>
                <td>{r.verdict.pages}</td>
                <td className={r.verdict.useful ? 'ad-ok' : ''}>{r.verdict.useful}</td>
                <td className={r.verdict.falsePages ? 'ad-false' : ''}>{r.verdict.falsePages}</td>
              </tr>
            ))}
            {withPrediction && ticket && (
              <tr>
                <th scope="row">Disk predicted full within {PREDICT_HORIZON / 60} hours</th>
                <td>cause, as a ticket</td>
                <td colSpan={3}>1 ticket, {ticket.lead} minutes before the disk fills</td>
              </tr>
            )}
          </tbody>
        </table>
        {withPrediction && (
          <Hint block>
            The prediction extends the trend of the last {PREDICT_WINDOW / 60} hours of this week&apos;s disk series in a straight line and raises a ticket when it says the disk fills within {PREDICT_HORIZON / 60} hours. It routes to a ticket
            because it has lead time and nobody is hurt yet. Real monitoring systems have a function like this; the lesson names the idea, not a product&apos;s syntax.
          </Hint>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={WEEK_SEED}>the same synthetic week as the rule editor, plus an authored disk and pod restarts</Provenance>
          <Provenance kind="illustrative">the third incident is authored as the disk filling</Provenance>
          <ClaimLabel kind="practice">alert on symptoms users feel; keep causes for tickets and dashboards</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
