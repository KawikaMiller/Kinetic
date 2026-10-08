import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pct } from '../../core/format';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { SESSIONS_INTRO, stepCaption } from './captions';
import {
  DEFAULT_PARTICIPANTS, MAX_PARTICIPANTS, NO_BIAS, PROBLEMS, foundAfter, hitList, runSessions, sessionStats, summarize, type Bias,
} from './model';
import { Prototype } from './Prototype';

interface ReplayFrame extends Frame {
  /** Index of the last step shown; -1 before the participant starts. */
  upto: number;
}
const REPLAY_MS = 900;
const SPEAKER_TONE = { participant: 'info', facilitator: 'orange' } as const;

export function SessionsScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(DEFAULT_PARTICIPANTS);
  const [chosen, setChosen] = useState(1);
  const [bias, setBias] = useState<Bias>(NO_BIAS);
  const sessions = useMemo(() => runSessions(MAX_PARTICIPANTS, bias), [bias]);
  const shown = sessions.slice(0, n);
  const who = Math.min(chosen, n);
  const session = sessions[who - 1];
  const frames = useMemo<ReplayFrame[]>(
    () => [{ upto: -1 }, ...session.steps.map((step, i) => ({ upto: i, say: stepCaption(step, session) }))],
    [session],
  );
  useIntroCaption(SESSIONS_INTRO);
  const player = usePlayer(frames, { interval: REPLAY_MS });
  const now = player.frame.upto;
  const spoken = session.steps.slice(0, now + 1).filter((s) => s.say);
  const found = foundAfter(shown, n);
  const summary = summarize(shown);
  const participants = Array.from({ length: n }, (_, i) => ({ value: i + 1, label: `P${i + 1}` }));

  return (
    <StageFrame
      player={player}
      height={600}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: "this participant's path", shape: 'line' },
            { color: 'var(--hi)', label: 'hesitation, and where clicks landed', shape: 'dot' },
            { color: 'var(--bad)', label: 'mistake or backtrack', shape: 'dot' },
            { color: 'var(--ok)', label: 'problem found', shape: 'dot' },
            { color: 'var(--orange)', label: 'a biased session', shape: 'dot' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat
            label="Bought the mug" value={pct(summary.successRate)}
            sub={summary.cleanSuccessRate !== null && summary.contaminated ? `unbiased sessions only: ${pct(summary.cleanSuccessRate)}` : undefined}
          />
          <Stat label="Mean time" value={`${summary.meanSeconds.toFixed(0)} s`} />
          <Stat label="Problems found" value={`${found.length} of ${PROBLEMS.length}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Participants" value={n} min={1} max={MAX_PARTICIPANTS} onChange={setN} />
          <Segmented label="Replay" value={who} onChange={setChosen} options={participants} />
        </>,
        <>
          <Toggle label="Leading questions" value={bias.leading} onChange={(leading) => setBias({ ...bias, leading })} />
          <Toggle label="Helping the participant" value={bias.helping} onChange={(helping) => setBias({ ...bias, helping })} />
        </>,
      ]}
    >
      <div className="ut stage-pad">
        <div className="ut-grid-wrap">
          <Prototype sessions={shown} current={session} upto={now} />
          <div className="ut-side">
            <SectionTitle hint={`participant ${who}`}>Think-aloud</SectionTitle>
            <ul className="ut-log" aria-label="Think-aloud lines so far">
              {spoken.length === 0 && <li className="empty-note">press play</li>}
              {spoken.map((s, i) => (
                <li key={i} className={`log-row tone-${s.speaker ? SPEAKER_TONE[s.speaker] : 'info'}`}>
                  {s.speaker === 'facilitator' ? 'Facilitator: ' : ''}“{s.say}”
                </li>
              ))}
            </ul>
            <SectionTitle>Problems</SectionTitle>
            <ul className="ut-problems">
              {PROBLEMS.map((p) => (
                <li key={p.id} className={found.includes(p.id) ? 'is-found' : 'is-unfound'}>
                  <i aria-hidden /> {p.label}
                  <span className="ut-found-by">{found.includes(p.id) ? `found by P${shown.findIndex((s) => hitList(s).includes(p.id)) + 1}` : 'not found yet'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Box className="ut-results">
          <table className="data-table">
            <thead>
              <tr><th>Participant</th><th>Task</th><th>Time</th><th>Mistakes</th><th>Backtracks</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {shown.map((s, i) => {
                const st = sessionStats(s);
                return (
                  <tr key={s.id} className={`${s.contaminated.length ? 'is-biased' : ''} ${i + 1 === who ? 'is-current' : ''}`}>
                    <td>P{s.id}</td>
                    <td className={st.success ? 'is-ok' : 'is-bad'}>{st.success ? 'done' : 'gave up'}</td>
                    <td>{st.seconds} s</td>
                    <td>{st.errors}</td>
                    <td>{st.backtracks}</td>
                    <td>
                      {s.contaminated.length
                        ? `${s.contaminated.join(' + ')}${s.wouldHaveGivenUp ? ', would have given up' : ''}`
                        : hitList(s).length ? `met ${hitList(s).length}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <Hint block>
          Simulated participants with seeded behaviour; real sessions are messier. A participant who gives up never meets the problems further along.
        </Hint>
      </div>
    </StageFrame>
  );
}
