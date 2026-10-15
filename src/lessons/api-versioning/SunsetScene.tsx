import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { GanttLanes, type GanttBar, type GanttMarker } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { CLIENTS } from './api';
import { sunsetCaption } from './captions';
import { ANNOUNCE_DATE, BROWNOUT_HOURS, CHOICES, WINDOW, addDays, dayToHours, deprecationHeaderValue, simulate, sunsetHeaderValue, type Choice } from './sunset';

const GANTT_MIN_WIDTH = 480;
const TABLE_MIN_WIDTH = 440;
const AXIS_PADDING_DAYS = 14;
const AXIS_PADDING_SHARE = 0.07;
const LABEL_MIN_PX = 56;
const SHORT_LABEL: Record<string, string> = { mobile: 'Mobile', partner: 'Partner', web: 'Web', batch: 'Batch' };
const LANES = [{ id: 'api', label: 'v1 API' }, ...CLIENTS.map((c) => ({ id: c.id, label: SHORT_LABEL[c.id] }))];
const CHOICE_OPTIONS = CHOICES.map((c) => ({ value: c.id, label: c.label }));
const CALENDAR = { start: `${ANNOUNCE_DATE}T00:00:00Z`, unit: 'week' as const };

export function SunsetScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [windowDays, setWindowDays] = useState<number>(WINDOW.initial);
  const [choice, setChoice] = useState<Choice>('break');
  const o = simulate(windowDays, choice);
  const sunsetDate = addDays(ANNOUNCE_DATE, o.sunsetDay);

  const caption = useMemo(() => sunsetCaption(windowDays, choice), [windowDays, choice]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const reach = Math.max(o.sunsetDay, ...o.clients.map((c) => c.migratedAt ?? 0));
  const lastDay = reach + Math.max(AXIS_PADDING_DAYS, Math.ceil(reach * AXIS_PADDING_SHARE));
  const bars: GanttBar[] = [
    { id: 'api', lane: 'api', start: 0, end: dayToHours(o.sunsetDay), tone: 'muted', label: 'v1 is up' },
    ...o.brownoutDays.map((d, i): GanttBar => ({ id: `brownout-${i}`, lane: 'api', start: dayToHours(d), end: dayToHours(d), tone: 'orange', label: 'brownout' })),
    ...o.clients.map((c): GanttBar => ({
      id: c.id,
      lane: c.id,
      start: 0,
      end: dayToHours(c.migratedAt ?? lastDay),
      tone: c.onOldAtSunset ? 'bad' : 'ok',
      label: c.migratedAt === null ? 'never migrates' : `migrates on day ${c.migratedAt}`,
    })),
  ];
  const markers: GanttMarker[] = [
    { at: 0, label: 'announced', tone: 'info' },
    { at: dayToHours(o.sunsetDay), label: 'sunset', tone: 'hi' },
    ...(o.sunsetDay !== o.announcedSunsetDay ? [{ at: dayToHours(o.announcedSunsetDay), label: 'promised', tone: 'dim' as const }] : []),
  ];
  const left = o.clients.filter((c) => c.onOldAtSunset).length;

  return (
    <StageFrame
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'announcement' },
            { color: 'var(--hi)', label: 'sunset' },
            { color: 'var(--ok)', label: 'migrated in time' },
            { color: 'var(--bad)', label: 'on the old version at sunset' },
            { color: 'var(--orange)', label: 'brownout' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Old version goes" value={sunsetDate} sub="UTC" />
          <Stat label="Still on it at sunset" value={`${left} of ${o.clients.length}`} color={left ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Planned failure" value={plural(o.plannedClientHours, 'client-hour')} sub={o.brownoutDays.length ? `${BROWNOUT_HOURS} hour each, ${o.brownoutDays.length} brownouts` : 'no brownouts'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Days from announcement to sunset" value={windowDays} min={WINDOW.min} max={WINDOW.max} onChange={setWindowDays} format={(d) => `${d} days`} />
        </>,
        <Segmented key="choice" label="For the clients that miss it" value={choice} onChange={setChoice} options={CHOICE_OPTIONS} />,
      ]}
    >
      <div className="stage-pad av">
        <WideRegion minWidth={GANTT_MIN_WIDTH} label="Deprecation timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={LANES}
            bars={bars}
            markers={markers}
            domain={[0, dayToHours(lastDay)]}
            axis={{ calendar: CALENDAR }}
            size="md"
            labelWidth={64}
            labelMinPx={LABEL_MIN_PX}
            ariaLabel="Announcement, sunset and when each client migrates"
          />
        </WideRegion>

        <CodePanel title="Sent with every v1 response from the announcement on" lines={[`Deprecation: ${deprecationHeaderValue(ANNOUNCE_DATE)}`, `Sunset: ${sunsetHeaderValue(sunsetDate)}`]} gutter="none" />

        <Box className="av-card">
          <SectionTitle weight="regular" hint="all three at this window">What each choice costs</SectionTitle>
          <WideRegion minWidth={TABLE_MIN_WIDTH} label="Comparison of the three choices: scroll sideways to see all of it">
            <table className="data-table">
              <thead>
                <tr><th scope="col">Choice</th><th scope="col">Goes on</th><th scope="col">On v1 at sunset</th><th scope="col">v1 stays up</th><th scope="col">Planned failure</th></tr>
              </thead>
              <tbody>
                {CHOICES.map((c) => {
                  const r = simulate(windowDays, c.id);
                  return (
                    <tr key={c.id} className={c.id === choice ? 'is-selected' : undefined}>
                      <th scope="row" className="av-rowhead">{c.label}</th>
                      <td>{addDays(ANNOUNCE_DATE, r.sunsetDay)}</td>
                      <td>{r.brokenAtSunset} of {r.clients.length}</td>
                      <td>{plural(r.sunsetDay, 'day')}</td>
                      <td>{plural(r.plannedClientHours, 'client-hour')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </WideRegion>
        </Box>
        <div className="av-chips">
          <Provenance kind="illustrative">invented clients, migration lags and reactions</Provenance>
          <Provenance kind="from-memory">the Sunset header is RFC 8594 and the Deprecation header is RFC 9745 (2025), both recalled, so check the RFCs before quoting them</Provenance>
          <Provenance kind="real">the dates are real UTC day counts, leap days included</Provenance>
        </div>
        <Hint block>
          A brownout is a planned, short, deliberate failure of the old version to get attention; it is common practice, and here it only helps clients that read their alerts. A client that nobody owns is not helped by anything short of removing the old version.
        </Hint>
      </div>
    </StageFrame>
  );
}
