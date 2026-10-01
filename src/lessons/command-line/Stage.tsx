import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useScenePicker } from '../../components/ScenePicker';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField } from '../../components/ui';
import { chunkGroups, flipBit } from '../../core/bits';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { ENV, INITIAL_FS, type Fs } from './fixture';
import { buildFrames, stepsOf } from './frames';
import { ACTIONS, PEOPLE, PERMISSION_PRESETS, bitName, bitsFromMode, can, chmod, lsString, modeFromBits, octal, symbolic } from './permissions';
import { BLOCKS, SHELL_PRESETS } from './presets';
import { runShell, showArgv, type ShellResult, type StageRun } from './shell';
import './styles.css';

type Scene = 'pipes' | 'perms';
const SCENES = [
  { value: 'pipes' as const, label: 'Pipes & redirection' },
  { value: 'perms' as const, label: 'File permissions' },
];

/** stdout lines shown per command card before "+N more". */
const PREVIEW_LINES = 4;
const FIRST = SHELL_PRESETS[0];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pipes' });
  return scene === 'pipes' ? <Pipes picker={picker} /> : <Permissions picker={picker} />;
}

// ─── Pipes ──────────────────────────────────────────────────────────────────

function Pipes({ picker }: { picker: ReactNode }) {
  const [line, setLine] = useState(FIRST.line);
  const [fs, setFs] = useState<Fs>(INITIAL_FS);
  const [result, setResult] = useState<ShellResult>(() => runShell(FIRST.line, INITIAL_FS, ENV));
  const [loaded, setLoaded] = useState<string | null>(FIRST.id);
  const setCaption = useSetCaption();
  const frames = useMemo(() => buildFrames(result), [result]);
  const player = usePlayer(frames, { interval: 1100 });
  const shown = player.frame.shown;
  const steps = stepsOf(result);
  const stepIndex = (p: number, s?: number) => steps.findIndex((st) => st.pipeline === p && (st.kind === 'skip' || st.stage === s));
  const revealed = (p: number, s?: number) => stepIndex(p, s) < shown;

  const execute = (cmd: string, files = fs) => {
    if (!cmd.trim()) return;
    const r = runShell(cmd, files, ENV);
    setFs(r.fs);
    setResult(r);
  };

  const load = (p: (typeof SHELL_PRESETS)[number]) => {
    setLine(p.line);
    setLoaded(p.id);
    execute(p.line);
    setCaption(p.caption);
  };

  const addBlock = (block: string) => {
    const next = line.trim() ? `${line.trim()} | ${block}` : block;
    setLine(next);
    setLoaded(null);
    execute(next);
  };

  const reset = () => {
    setFs(INITIAL_FS);
    execute(line, INITIAL_FS);
  };

  const printed = result.runs.flatMap((r, p) => r.stages.flatMap((st, s) => (revealed(p, s) ? st.printed : [])));
  const lastRun = [...result.runs].reverse().find((r) => r.ran);

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Commands" value={result.runs.reduce((n, r) => n + r.stages.length, 0)} />
          <Stat
            label="Last exit code"
            value={player.atEnd && lastRun?.exit != null ? lastRun.exit : '–'}
            color={!player.atEnd || lastRun?.exit == null ? undefined : lastRun.exit === 0 ? 'var(--ok)' : 'var(--bad)'}
            sub="0 = success"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'stdout' },
            { color: 'var(--bad)', label: 'stderr / non-zero exit' },
            { color: 'var(--ok)', label: 'exit 0' },
            { color: 'var(--violet)', label: 'written to a file' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Command" value={line} onChange={(v) => { setLine(v); setLoaded(null); }} onEnter={() => execute(line)} spellCheck={false} className="cl-cmd" />
          <Button variant="primary" onClick={() => execute(line)}>Run</Button>
          <Button onClick={reset}>Reset files</Button>
        </>,
        <ControlGroup key="blocks" label="Add a command block">
          {BLOCKS.map((b) => (
            <ChipButton key={b} tone="info" onClick={() => addBlock(b)}>
              + {b}
            </ChipButton>
          ))}
        </ControlGroup>,
        <ControlGroup key="presets" label="Presets">
          {SHELL_PRESETS.map((p) => (
            <ChipButton key={p.id} size="md" on={loaded === p.id} onClick={() => load(p)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad cl">
        <Hint block className="cl-sim">Simulated shell over a sample file.</Hint>
        <div className="cl-runs">
          {result.runs.map((run, p) => (
            <Fragment key={p}>
              {run.op && <span className="cl-op">{run.op}</span>}
              {run.ran ? (
                <div className="cl-pipeline">
                  {run.stages.map((st, s) => (
                    <Fragment key={s}>
                      {s > 0 && <PipeArrow count={run.stages[s - 1].stdoutTo === 'pipe' ? st.stdinCount : null} on={revealed(p, s)} />}
                      <StageCard stage={st} on={revealed(p, s)} />
                    </Fragment>
                  ))}
                </div>
              ) : (
                <div className={`cl-skipped ${revealed(p) ? 'is-on' : ''}`}>skipped: {run.source}</div>
              )}
            </Fragment>
          ))}
        </div>

        <div className="cl-bottom">
          <Box className="cl-terminal">
            <SectionTitle>Terminal</SectionTitle>
            <pre>
              <span className="cl-prompt">{ENV.USER}@box:~$ </span>
              {line}
              {'\n'}
              {printed.map((t, i) => (
                <span key={i} className={t.stream === 'err' ? 'cl-err' : 'cl-out'}>
                  {t.text}
                  {'\n'}
                </span>
              ))}
            </pre>
          </Box>
          <Box className="cl-files">
            <SectionTitle hint="ls -l">Files</SectionTitle>
            {Object.keys(fs).sort().map((name) => (
              <div key={name} className={`cl-file ${result.written.includes(name) ? 'is-written' : ''}`}>
                <code>{name}</code>
                <span>{plural(fs[name] === '' ? 0 : fs[name].split('\n').length, 'line')}</span>
              </div>
            ))}
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}

function PipeArrow({ count, on }: { count: number | null; on: boolean }) {
  return (
    <span className={`cl-pipe ${on ? 'is-on' : ''}`} aria-hidden="true">
      <span className="cl-pipe-bar">|</span>
      {count !== null && <span className="cl-pipe-count">{count}</span>}
    </span>
  );
}

function StageCard({ stage, on }: { stage: StageRun; on: boolean }) {
  const toFile = stage.stdoutTo !== 'pipe' && stage.stdoutTo !== 'terminal';
  return (
    <div className={`cl-stage ${on ? 'is-on' : ''}`}>
      <code className="cl-argv">{showArgv(stage.argv)}</code>
      {on ? (
        <>
          <div className="cl-lines">
            {stage.stdout.slice(0, PREVIEW_LINES).map((l, i) => (
              <code key={i} className="cl-out">{l}</code>
            ))}
            {stage.stdout.length > PREVIEW_LINES && <span className="cl-more">+{stage.stdout.length - PREVIEW_LINES} more</span>}
            {stage.stdout.length === 0 && <span className="cl-more">(no output)</span>}
          </div>
          {stage.stderr.length > 0 && (
            <div className="cl-stderr">
              {stage.stderr.map((l, i) => (
                <code key={i}>{l}</code>
              ))}
            </div>
          )}
          <div className="cl-stage-foot">
            <span className={`chip ${stage.exit === 0 ? 'tone-ok' : 'tone-bad'}`}>exit {stage.exit}</span>
            {toFile && <span className="chip tone-violet">&gt; {stage.stdoutTo}</span>}
            {stage.stderr.length > 0 && stage.stderrTo !== 'terminal' && <span className="chip tone-violet">2&gt; {stage.stderrTo}</span>}
          </div>
        </>
      ) : (
        <span className="cl-more">waiting…</span>
      )}
    </div>
  );
}

// ─── Permissions ────────────────────────────────────────────────────────────

function Permissions({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState(0o754);
  const [arg, setArg] = useState('u+x');
  const [error, setError] = useState<string | null>(null);
  const setCaption = useSetCaption();
  const bits = bitsFromMode(mode);

  useIntroCaption(
    <>Nine bits decide who can do what: read, write and execute, for the owner, the group and everyone else. Click a bit, or run a
      chmod.</>,
  );

  const apply = () => {
    const next = chmod(arg, mode);
    if (next === null) {
      setError(`chmod: invalid mode: '${arg}'`);
      return;
    }
    setError(null);
    setMode(next);
    setCaption(<>chmod {arg}: {octal(mode)} → <span className="hl">{octal(next)}</span>.</>);
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Octal" value={octal(mode)} color="var(--hi)" sub={`chmod ${octal(mode)} deploy.sh`} />
          <Stat label="Symbolic" value={symbolic(mode)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'permission set' },
            { color: 'var(--dim)', label: 'not set' },
            { color: 'var(--ok)', label: 'allowed' },
            { color: 'var(--bad)', label: 'denied' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="chmod" value={arg} onChange={setArg} onEnter={apply} width={140} spellCheck={false} className={error ? 'cl-bad' : ''} />
          <Button variant="primary" onClick={apply}>Apply</Button>
          {error && <Hint className="cl-error">{error}</Hint>}
        </>,
        <ControlGroup key="presets" label="Presets">
          {PERMISSION_PRESETS.map((p) => (
            <ChipButton key={p.mode} size="md" on={mode === p.mode} onClick={() => { setError(null); setMode(p.mode); setCaption(p.caption); }}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad cl">
        <BitStrip
          bits={bits}
          size="lg"
          onToggle={(i) => { setError(null); setMode(modeFromBits(flipBit(bits, i))); }}
          toneOf={(_, b) => (b ? 'hi' : 'dim')}
          labelOf={(i) => 'rwx'[i % 3]}
          ariaLabelOf={bitName}
          groups={chunkGroups(9, 3, { tone: 'violet', label: (k) => ['user (owner)', 'group', 'other'][k] })}
          ariaLabel="Permission bits"
        />
        <pre className="cl-ls">
          <span className="cl-prompt">$ ls -l deploy.sh{'\n'}</span>
          <span className="cl-mode">{lsString(mode)}</span> 1 ada dev 41 Mar  8 09:15 deploy.sh
        </pre>
        <table className="data-table cl-access">
          <thead>
            <tr>
              <th>as user</th>
              {ACTIONS.map((a) => (
                <th key={a}>{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PEOPLE.map((person) => (
              <tr key={person.name}>
                <td>
                  <b>{person.name}</b> <span className="cl-why">{person.why}</span>
                </td>
                {ACTIONS.map((a) => (
                  <td key={a} className={can(mode, person.who, a) ? 'cl-yes' : 'cl-no'}>
                    {can(mode, person.who, a) ? '✓' : '✗'} <span className="cl-word">{can(mode, person.who, a) ? 'allowed' : 'denied'}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {mode === 0o777 && <p className="cl-warn">Anyone on the machine can now rewrite deploy.sh, and it runs with whoever executes it.</p>}
      </div>
    </StageFrame>
  );
}
