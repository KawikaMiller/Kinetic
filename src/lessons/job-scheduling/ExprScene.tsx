import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, TextField } from '../../components/ui';
import { dayCounts, exprCaption } from './captions';
import { CRON_NOW_MS, DOM_DOW_PRESET, MAX_CRON_CHARS, dayRuns, fireLabel, nextFires, parseCron } from './cron';
import { initialExpr } from './init';

const FIRES_SHOWN = 5;
const YEAR = new Date(CRON_NOW_MS).getUTCFullYear();
const MONTH = new Date(CRON_NOW_MS).getUTCMonth() + 1;
const MONTH_NAME = 'March 2026';
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRESETS = [
  { label: 'Every hour', text: '0 * * * *' },
  { label: '15th or Friday', text: DOM_DOW_PRESET },
  { label: 'Fridays only', text: '0 0 * * 5' },
  { label: 'Odd days and Friday', text: '0 0 */2 * 5' },
  { label: 'Weekdays 09:30', text: '30 9 * * 1-5' },
];

export function ExprScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialExpr);
  const parsed = useMemo(() => parseCron(state.text), [state.text]);
  const cron = parsed.ok ? parsed.cron : null;
  const fires = useMemo(() => (cron ? nextFires(cron, CRON_NOW_MS, FIRES_SHOWN) : []), [cron]);
  const counts = useMemo(() => (cron ? dayCounts(cron, YEAR, MONTH) : null), [cron]);
  const firstWeekday = new Date(Date.UTC(YEAR, MONTH - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();
  const rows = Math.ceil((firstWeekday + days) / 7);
  const dayOf = (r: number, c: number) => r * 7 + c - firstWeekday + 1;
  const runsOn = (day: number) => cron !== null && dayRuns(cron, MONTH, day, new Date(Date.UTC(YEAR, MONTH - 1, day)).getUTCDay());
  const restricted = cron !== null && !cron.dom.star && !cron.dow.star;

  return (
    <StageFrame
      height={420}
      intro={cron && counts ? exprCaption(cron, fires, MONTH_NAME, counts) : <>Type five fields: minute hour day-of-month month day-of-week.</>}
      introKey={[state.text, parsed.ok ? 'ok' : parsed.error]}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a day the job runs (March 2026, UTC)' },
            { color: 'var(--orange)', label: 'both day fields are restricted: either one matching is enough' },
            { color: 'var(--dim)', label: 'a day it does not run' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Cron expression" value={state.text} onChange={(text) => setState({ text })} width={230} maxLength={MAX_CRON_CHARS} spellCheck={false} />
          <Button onClick={() => setState(initialExpr())}>Reset</Button>
        </>,
        <>
          {PRESETS.map((p) => (
            <ChipButton key={p.text} tone="info" on={state.text === p.text} onClick={() => setState({ text: p.text })}>
              {p.label}: {p.text}
            </ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="js-stage stage-pad">
        {!parsed.ok && (
          <p className="js-refusal" role="status">{parsed.error}</p>
        )}
        {cron && (
          <>
            <Box>
              <SectionTitle hint="after Monday 2 March 2026 00:00 UTC, the lesson's fixed start">The next {FIRES_SHOWN} fires</SectionTitle>
              <ol className="js-fires">
                {fires.map((t) => (
                  <li key={t}>{fireLabel(t)}</li>
                ))}
                {fires.length === 0 && <li>None within nine years.</li>}
              </ol>
            </Box>
            <Box>
              <SectionTitle hint={MONTH_NAME}>Days the job runs</SectionTitle>
              <CellGrid
                rows={rows}
                cols={7}
                size="sm"
                colLabels={WEEK}
                cell={(r, c) => {
                  const d = dayOf(r, c);
                  if (d < 1 || d > days) return { text: '', fill: 'none' };
                  const runs = runsOn(d);
                  return { text: d, tone: runs ? (restricted ? 'orange' : 'ok') : 'dim', fill: runs ? 'tint' : 'none', intensity: 0.45 };
                }}
                ariaLabel={`${MONTH_NAME} calendar: the days the expression runs on are tinted`}
              />
            </Box>
          </>
        )}
        <ProvenanceRow>
          <ClaimLabel kind="standard">five fields, with lists, ranges and steps, in the classic crontab form; names, ? and L are not read here</ClaimLabel>
          <Provenance kind="from-memory">the rule that a restricted day-of-month and a restricted day-of-week run on either match, and that a field starting with * counts as unrestricted, is the Vixie cron behaviour as I remember it from man 5 crontab; verify before relying on it</Provenance>
          <Provenance kind="from-memory">a local-time schedule at 02:30 does not exist on a spring-forward day and happens twice on a fall-back day, and implementations differ in what they do; that is why this lesson schedules in UTC; verify against your cron</Provenance>
          <Provenance kind="real">the parser and the next-fire search are real code, checked in the lesson's tests against a minute-by-minute matcher over a whole year</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
