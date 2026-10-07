import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { fdFrames } from './frames';
import { SCENE_W } from './layout';
import { ERRNO_TEXT, FD_LIMIT, PRESETS, run, startWorld, type Op, type PresetId } from './model';
import { Scene } from './Scene';
import './styles.css';

const STEP_MS = 1500;
/** Smallest scene text: the 11.5px field rows. */
const SCENE_TEXT_PX = 11.5;
const SANDBOX_START = () => startWorld('app');

const parseFd = (label: string) => (text: string) =>
  parseBoundedInt(text, {
    min: 0,
    max: FD_LIMIT - 1,
    messages: {
      empty: `${label}: type an FD number.`,
      invalid: () => `${label}: an FD is a whole number.`,
      tooSmall: () => `${label}: FDs start at 0.`,
      tooBig: () => `${label}: this demo's table has slots 0 to ${FD_LIMIT - 1}.`,
      negative: `${label}: FDs are never negative (-1 is how calls report an error).`,
    },
  });

const INTROS: Record<PresetId | 'sandbox', ReactNode> = {
  redirect: <>How a shell runs <code>cmd &gt; out.txt 2&gt;&amp;1</code> in the child it forked: open, dup2, dup2, close, then exec. (The syntax is the shell lesson's; this is what it does underneath.)</>,
  'wrong-order': <>The same pieces in the other order, <code>cmd 2&gt;&amp;1 &gt; out.txt</code>: 2 copies 1 before 1 has moved.</>,
  'shared-offset': <>The app opens log.txt once, then forks. Parent and child both write to fd 3.</>,
  separate: <>This time the app forks first, and parent and child each open log.txt themselves.</>,
  leak: <>A server listens, accepts connections and should close each one when its request ends. One error path forgets. The limit is {FD_LIMIT} for this demo.</>,
  cloexec: <>The app opens a log file normally and a secret key with close-on-exec, then execs a helper program.</>,
  sandbox: <>Your own sequence: pick operations below. Each call follows the real rules (lowest free FD, refcounts, fork sharing).</>,
};

export function Stage() {
  /** The preset whose start world and script we're on (null: an empty sandbox), and whether the learner has added calls. */
  const [base, setBase] = useState<PresetId | null>('redirect');
  const [custom, setCustom] = useState(false);
  const [ops, setOps] = useState<Op[]>(PRESETS[0].ops);
  const [pid, setPid] = useState(100);
  const [fdText, setFdText] = useState('3');
  const [newText, setNewText] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const start = useMemo(() => (base ? PRESETS.find((p) => p.id === base)!.start() : SANDBOX_START()), [base]);
  const played = useMemo(() => run(start, ops), [start, ops]);
  const frames = useMemo(() => fdFrames(start, played, INTROS[base ?? 'sandbox'], !custom), [start, played, base, custom]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const w = f.world;
  const current = w.procs.find((p) => p.pid === pid) ?? w.procs[0];
  const used = current.fds.filter((x) => x !== null).length;
  const latest = played.length ? played[played.length - 1].result.world : start;

  const load = (id: PresetId | null) => {
    setBase(id);
    setCustom(false);
    setOps(id ? PRESETS.find((x) => x.id === id)!.ops : []);
    setPid(100);
    setError(null);
  };
  /** Add one call after everything so far (a preset's script included) and jump straight to it. */
  const add = (op: Op) => {
    setError(null);
    const next = [...ops, op];
    player.queueNext({ play: false, from: next.length });
    setOps(next);
    setCustom(true);
  };
  const withFd = (make: (fd: number) => Op) => {
    const r = parseFd('FD')(fdText);
    if (!r.ok) return setError(r.error);
    add(make(r.value));
  };
  const listening = current.fds.findIndex((id) => id !== null && latest.files.some((x) => x.id === id && latest.objs.find((o) => o.id === x.obj)?.kind === 'listen'));

  const errnoLines: ConsoleLine[] = played
    .slice(0, player.index)
    .filter((p) => !p.result.ok)
    .map((p) => ({ text: `${p.op.kind}: ${!p.result.ok ? `${p.result.errno} (${ERRNO_TEXT[p.result.errno]})` : ''}`, tone: 'bad' as const }));
  const fileObjs = w.objs.filter((o) => o.kind === 'file' && o.content);

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label={`FDs used, pid ${current.pid}`} value={`${used} / ${FD_LIMIT}`} color={used >= FD_LIMIT ? 'var(--bad)' : undefined} sub="demo limit (ulimit -n)">
            <Bar value={used} max={FD_LIMIT} tone={used >= FD_LIMIT ? 'bad' : 'info'} height={6} />
          </Stat>
          <Stat label="Open-file entries" value={w.files.length} color="var(--violet)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'FD in use', shape: 'square' },
            { color: 'var(--hi)', label: 'just allocated', shape: 'square' },
            { color: 'var(--dim)', label: 'free', shape: 'square' },
            { color: 'var(--violet)', label: 'open-file entry / reference', shape: 'square' },
            { color: 'var(--bad)', label: 'leaked FD, error', shape: 'square' },
          ]}
        />
      }
      controls={[
        <ControlGroup label="Presets" inline key="presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" size="md" on={base === p.id && !custom} onClick={() => load(p.id)}>
              {p.label}
            </ChipButton>
          ))}
          <ChipButton tone="info" size="md" on={base === null && !custom} onClick={() => load(null)}>
            Empty sandbox
          </ChipButton>
        </ControlGroup>,
        <>
          {latest.procs.length > 1 && <Segmented label="Process" value={pid} onChange={setPid} options={latest.procs.map((p) => ({ value: p.pid, label: `pid ${p.pid}` }))} />}
          <TextField label="FD" value={fdText} onChange={setFdText} width={56} spellCheck={false} />
          <TextField label="dup2 onto" value={newText} onChange={setNewText} width={56} spellCheck={false} />
        </>,
        <ControlGroup label="Call" inline key="ops">
          <ChipButton tone="violet" size="md" onClick={() => add({ kind: 'open', pid, path: 'data.txt', access: 'rw' })}>open</ChipButton>
          <ChipButton tone="violet" size="md" onClick={() => add({ kind: 'open', pid, path: 'data.txt', access: 'rw', cloexec: true })}>open (close-on-exec)</ChipButton>
          <ChipButton tone="violet" size="md" onClick={() => withFd((fd) => ({ kind: 'close', pid, fd }))}>close(FD)</ChipButton>
          <ChipButton tone="violet" size="md" onClick={() => withFd((fd) => ({ kind: 'dup', pid, fd }))}>dup(FD)</ChipButton>
          <ChipButton
            tone="violet"
            size="md"
            onClick={() => {
              const n = parseFd('dup2 onto')(newText);
              if (!n.ok) return setError(n.error);
              withFd((fd) => ({ kind: 'dup2', pid, old: fd, new: n.value }));
            }}
          >
            dup2(FD, onto)
          </ChipButton>
          <ChipButton tone="violet" size="md" onClick={() => add({ kind: 'pipe', pid })}>pipe</ChipButton>
          <ChipButton tone="violet" size="md" onClick={() => add(listening >= 0 ? { kind: 'accept', pid, lfd: listening } : { kind: 'listen', pid, port: 8080 })}>
            {listening >= 0 ? 'accept' : 'socket + listen'}
          </ChipButton>
          <ChipButton tone="violet" size="md" onClick={() => withFd((fd) => ({ kind: 'write', pid, fd, text: `pid ${pid}\n` }))}>write(FD)</ChipButton>
          <ChipButton tone="violet" size="md" onClick={() => add({ kind: 'fork', pid })}>fork</ChipButton>
          <ChipButton tone="violet" size="md" onClick={() => add({ kind: 'exec', pid, program: 'prog' })}>exec</ChipButton>
        </ControlGroup>,
        error ? (
          <p className="fd-error" role="status" key="error">
            {error}
          </p>
        ) : null,
      ].filter(Boolean)}
    >
      <div className="fd stage-pad">
        <Hint block>Simplified kernel tables; the limit is {FD_LIMIT} for the demo (Linux's usual soft default is 1024).</Hint>
        <WideRegion minWidth={minWidthForText(SCENE_W, SCENE_TEXT_PX)} label="FD tables: scroll sideways to see all of it">
          <Scene f={f} />
        </WideRegion>
        <div className="fd-panels">
          <ConsolePanel title="errors" lines={errnoLines} empty="(no failed calls)" />
          {fileObjs.map((o) => (
            <ConsolePanel key={o.id} title={o.name} lines={o.content.split('\n').filter(Boolean).map((text) => ({ text, tone: 'muted' as const }))} />
          ))}
        </div>
      </div>
    </StageFrame>
  );
}
