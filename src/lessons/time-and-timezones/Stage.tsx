import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useScenePicker } from '../../components/ScenePicker';
import { Button, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import {
  DST, ZONE_LABEL, clockText, dateText, dstTimeline, falsehoods, gapWeeks, hoursInDay, instantsFor, naiveJobRuns, offsetText, parseWall,
  storageComparison, wallClock, type DstPreset, type HourCell, type Zone,
} from './model';
import './styles.css';

type Scene = 'dst' | 'gap' | 'meet' | 'false';

const SCENES = [
  { value: 'dst' as const, label: 'DST days' },
  { value: 'gap' as const, label: 'EU/US gap weeks' },
  { value: 'meet' as const, label: 'Schedule a meeting' },
  { value: 'false' as const, label: 'Falsehoods' },
];

const TIMELINE_ZONES: Zone[] = ['UTC', 'America/New_York', 'Europe/London'];
const MEETING_ZONES: Zone[] = ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Kolkata', 'UTC'];
/** 88px label column + 48 hour cells of at least 14px. */
const TIMELINE_MIN_WIDTH = 760;

const INTL_NOTE = 'Every time on this page is computed live by your browser\'s Intl API from IANA zone rules; nothing is a hard-coded offset.';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'dst' });
  if (scene === 'gap') return <GapWeeks picker={picker} />;
  if (scene === 'meet') return <Meeting picker={picker} />;
  if (scene === 'false') return <Falsehoods picker={picker} />;
  return <DstDays picker={picker} />;
}

// ─── DST days ───────────────────────────────────────────────────────────────

function DstDays({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<DstPreset>('spring');
  const setCaption = useSetCaption();
  const s = DST[preset];
  const { rows } = dstTimeline(s, TIMELINE_ZONES);
  const jobs = naiveJobRuns(s);
  const hours = hoursInDay(s.date.year, s.date.month, s.date.day, s.zone);
  const job = clockText({ ...s.date, ...s.jobAt });

  useIntroCaption(
    <>48 hours around New York's clock change on 8 March 2026. Each column is one real hour; the rows show what three clocks read
      at that moment. New York's clock jumps from 01:59 to <span className="hl bad">03:00</span>: the hour 02:00-02:59 doesn't exist.</>,
  );

  const choose = (p: DstPreset) => {
    setPreset(p);
    setCaption(
      p === 'spring' ? (
        <>Spring forward: at 2:00 New York jumps to 3:00. A job set for <span className="hl">{clockText({ ...DST.spring.date, ...DST.spring.jobAt })}</span> local time has no moment to run that day.</>
      ) : (
        <>Fall back: at 2:00 New York goes back to 1:00, so <span className="hl">01:00-01:59 happens twice</span>, and a 01:30 job fires twice.</>
      ),
    );
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label={`Hours in ${dateText(s.date)}`} value={hours} color={countTone(hours, 24)} sub="New York" />
          <Stat label={`${job} job runs that day`} value={jobs[1].runs.length} color={countTone(jobs[1].runs.length, 1)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'UTC' },
            { color: 'var(--violet)', label: 'local time' },
            { color: 'var(--bad)', label: 'hour that never happens' },
            { color: 'var(--hi)', label: 'hour that happens twice' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Clock change" value={preset} onChange={choose} options={[{ value: 'spring', label: 'Spring forward (8 Mar)' }, { value: 'fall', label: 'Fall back (1 Nov)' }]} />
        </>,
      ]}
    >
      <div className="stage-pad tz">
        <WideRegion minWidth={TIMELINE_MIN_WIDTH} label="Timeline: scroll sideways to see all 48 hours">
          <div className="tz-timeline" role="table" aria-label="48 hours on three clocks">
            {TIMELINE_ZONES.map((zone) => (
              <TimelineRow key={zone} zone={zone} cells={rows[zone]} />
            ))}
          </div>
        </WideRegion>
        <Box className="tz-jobs">
          <SectionTitle hint="a scheduler that fires whenever the local clock reads it">A daily job at {job} New York time</SectionTitle>
          {jobs.map((j) => (
            <div key={j.day.day} className={`tz-job ${j.runs.length === 0 ? 'is-skipped' : j.runs.length > 1 ? 'is-twice' : ''}`}>
              <span className="tz-job-date">{dateText(j.day)}</span>
              {j.runs.length === 0 ? (
                <span className="tz-job-note">skipped: {job} never happened</span>
              ) : (
                j.runs.map((at) => (
                  <span key={at} className="tz-job-run">
                    <span className="tz-utc">{clockText(wallClock(at, 'UTC'))} UTC</span> · London {clockText(wallClock(at, 'Europe/London'))}
                  </span>
                ))
              )}
              {j.runs.length > 1 && <span className="tz-job-note">ran twice</span>}
            </div>
          ))}
          <Hint block>
            Real schedulers differ: some skip, some run once, some run twice. Schedule in UTC, or use a scheduler that handles DST
            explicitly. {INTL_NOTE}
          </Hint>
        </Box>
      </div>
    </StageFrame>
  );
}

/** Fewer than normal (a skipped hour or run) is red; more than normal (repeated) is yellow. */
const countTone = (n: number, normal: number) => (n < normal ? 'var(--bad)' : n > normal ? 'var(--hi)' : 'var(--ok)');

function TimelineRow({ zone, cells }: { zone: Zone; cells: HourCell[] }) {
  const tone = zone === 'UTC' ? 'info' : 'violet';
  const first = cells[0].local.offset;
  const last = cells[cells.length - 1].local.offset;
  return (
    <div className={`tz-row tone-${tone}`} role="row">
      <span className="tz-row-label" role="rowheader">
        {ZONE_LABEL[zone]}
        <small>{first === last ? offsetText(first) : `${offsetText(first)} → ${offsetText(last).slice(3)}`}</small>
      </span>
      {cells.map((c) => {
        const cls = ['tz-cell', c.local.hour === 0 && 'is-midnight', c.afterGap && 'is-after-gap', c.repeated && 'is-repeated'].filter(Boolean).join(' ');
        return (
          <span key={c.at} className={cls} role="cell" title={`${c.local.weekday} ${dateText(c.local)} ${clockText(c.local)} (${offsetText(c.local.offset)})`}>
            {c.local.hour === 0 && <em className="tz-day">{dateText(c.local)}</em>}
            {c.skipped && <em className="tz-skip">{c.skipped} skipped</em>}
            {String(c.local.hour).padStart(2, '0')}
          </span>
        );
      })}
    </div>
  );
}

// ─── Gap weeks ──────────────────────────────────────────────────────────────

function GapWeeks({ picker }: { picker: ReactNode }) {
  const days = gapWeeks();
  useIntroCaption(
    <>The US changes its clocks on 8 March, Europe on 29 March. For three weeks London is only{' '}
      <span className="hl">4 hours</span> ahead of New York instead of 5, so a 09:00 New York meeting "moves" in London.</>,
  );
  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'London clock for a 09:00 New York meeting' },
            { color: 'var(--hi)', label: 'the gap weeks (4-hour difference)' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="stage-pad tz">
        <div className="tz-days" role="list" aria-label="Each day, 1 March to 5 April 2026">
          {days.map((d) => (
            <div key={d.date.day + d.date.month * 100} role="listitem" className={`tz-daycell ${d.lead === 4 ? 'is-gap' : ''}`}>
              <span className="tz-daycell-date">{dateText(d.date)}</span>
              <span className="tz-daycell-time">{d.meetingInLondon}</span>
              <span className="tz-daycell-lead">+{d.lead} h</span>
            </div>
          ))}
        </div>
        <Hint block>
          US clocks change on the second Sunday in March, EU clocks on the last Sunday; in autumn there's a one-week gap too. Store
          the meeting as 09:00 America/New_York and let each person's calendar convert it. {INTL_NOTE}
        </Hint>
      </div>
    </StageFrame>
  );
}

// ─── Meeting scheduler ──────────────────────────────────────────────────────

function Meeting({ picker }: { picker: ReactNode }) {
  const [date, setDate] = useState('2026-03-10');
  const [time, setTime] = useState('09:00');
  const [zone, setZone] = useState<Zone>('America/New_York');
  useIntroCaption(<>Pick a local time in one zone and see it on every other clock. Try 02:30 on 2026-03-08 in New York: it doesn't exist.</>);

  const wall = parseWall(date, time);
  const instants = wall ? instantsFor(wall, zone) : [];
  const cmp = wall && instants.length ? storageComparison(wall, zone, ['America/New_York', 'Europe/London']) : null;

  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'UTC' },
            { color: 'var(--violet)', label: 'local time' },
            { color: 'var(--bad)', label: 'doesn\'t exist / wrong instant' },
            { color: 'var(--hi)', label: 'happens twice' },
            { color: 'var(--ok)', label: 'stored correctly' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Date (YYYY-MM-DD)" value={date} onChange={setDate} width={130} spellCheck={false} />
          <TextField label="Time (HH:MM)" value={time} onChange={setTime} width={80} spellCheck={false} />
        </>,
        <Segmented key="zone" label="in" value={zone} onChange={setZone} options={MEETING_ZONES.map((z) => ({ value: z, label: ZONE_LABEL[z] }))} />,
      ]}
    >
      <div className="stage-pad tz">
        {!wall ? (
          <p className="tz-error">That isn't a real date and time. Use YYYY-MM-DD and HH:MM (24-hour).</p>
        ) : instants.length === 0 ? (
          <p className="tz-error">
            {time} on {date} never happens in {ZONE_LABEL[zone]}: the clocks jump over it. A booking system must ask what to do (move
            it to the next valid time) rather than guess.
          </p>
        ) : (
          <>
            {instants.length > 1 && (
              <p className="tz-warn">{time} happens twice in {ZONE_LABEL[zone]} that day. Both moments are shown; a booking needs the offset to pick one.</p>
            )}
            <div className="tz-table-wrap">
              <table className="data-table tz-table">
                <thead>
                  <tr>
                    <th>clock</th>
                    {instants.map((at, k) => (
                      <th key={at}>{instants.length > 1 ? `moment ${k + 1}` : 'shows'}</th>
                    ))}
                    <th>offset</th>
                  </tr>
                </thead>
                <tbody>
                  {MEETING_ZONES.map((z) => (
                    <tr key={z} className={z === 'UTC' ? 'tz-utc' : 'tz-local'}>
                      <td>{ZONE_LABEL[z]}</td>
                      {instants.map((at) => {
                        const w = wallClock(at, z);
                        return <td key={at}>{w.weekday} {dateText(w)} {clockText(w)}</td>;
                      })}
                      <td>{instants.map((at) => offsetText(wallClock(at, z).offset)).join(' / ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {cmp && (
          <Box className="tz-store">
            <SectionTitle>Storing it</SectionTitle>
            <div className="tz-store-row is-bad">
              <b>Naive local time</b> "{date} {time}", no zone. Read back by:
              {cmp.naive.map((n) => (
                <span key={n.server} className="tz-store-item">
                  a {ZONE_LABEL[n.server]} server → {n.instant === null ? 'a time that doesn\'t exist' : `${new Date(n.instant).toISOString().slice(0, 16)}Z`}
                </span>
              ))}
            </div>
            <div className="tz-store-row is-ok">
              <b>UTC instant + zone</b>: <code>{cmp.stored.utc}</code> + <code>{cmp.stored.zone}</code>: one moment for everyone, and you
              still know it was booked as {time} {ZONE_LABEL[zone]} (handy when the zone's rules change).
            </div>
            {cmp.stored.notStored.length > 0 && (
              <div className="tz-store-row is-warn">
                <b>But which {time}?</b> This stored moment 1. Moment 2 would be <code>{cmp.stored.notStored.join(', ')}</code>. A UTC
                instant can only pin the moment once someone has picked it, so the booking form has to ask.
              </div>
            )}
          </Box>
        )}
        <Hint block>{INTL_NOTE}</Hint>
      </div>
    </StageFrame>
  );
}

// ─── Falsehoods ─────────────────────────────────────────────────────────────

function Falsehoods({ picker }: { picker: ReactNode }) {
  const cards = falsehoods();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const setCaption = useSetCaption();
  useIntroCaption(<>Four things programmers believe about time. Flip each card for a counterexample your browser just computed.</>);

  const flip = (id: string, claim: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!open.has(id)) setCaption(<>"{claim}": <span className="hl bad">false</span>. Here's the proof.</>);
  };

  return (
    <StageFrame height={380} legend={<Legend items={[{ color: 'var(--bad)', label: 'the belief' }, { color: 'var(--ok)', label: 'what\'s actually true' }]} />} controls={[picker]}>
      <div className="stage-pad tz tz-cards">
        {cards.map((c) => {
          const isOpen = open.has(c.id);
          return (
            <Box key={c.id} className={`tz-card ${isOpen ? 'is-open' : ''}`}>
              <p className="tz-claim">"{c.claim}"</p>
              {isOpen && (
                <>
                  <ul className="tz-evidence">
                    {c.evidence.map((e) => (
                      <li key={e}>
                        <code>{e}</code>
                      </li>
                    ))}
                  </ul>
                  <p className="tz-truth">{c.truth}</p>
                </>
              )}
              <Button onClick={() => flip(c.id, c.claim)} aria-expanded={isOpen}>
                {isOpen ? 'Hide' : 'Show the counterexample'}
              </Button>
            </Box>
          );
        })}
      </div>
    </StageFrame>
  );
}
