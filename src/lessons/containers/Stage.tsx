import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

type Mode = 'stacks' | 'layers' | 'isolation';

export function Stage() {
  const [mode, setMode] = useState<Mode>('stacks');
  const picker = (
    <Segmented
      label="Demo"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'stacks', label: 'VMs vs containers' },
        { value: 'layers', label: 'Image layers' },
        { value: 'isolation', label: 'Isolation' },
      ]}
    />
  );
  if (mode === 'stacks') return <Stacks picker={picker} />;
  if (mode === 'layers') return <Layers picker={picker} />;
  return <Isolation picker={picker} />;
}

/* ─── VMs vs containers ───────────────────────────────────────────── */

const APPS = ['web', 'api', 'worker', 'cron'];
const VM_OS_GB = 2;
const APP_GB = 0.2;

function Stacks({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(3);
  const [boot, setBoot] = useState(0);
  const setCaption = useSetCaption();

  useEffect(() => {
    setCaption(
      <>
        Each VM carries a <b>whole guest operating system</b>. Containers share the host's kernel and only package the
        app and its libraries. Add apps and hit <b>Boot</b>.
      </>,
    );
  }, [setCaption]);

  const apps = APPS.slice(0, n);
  const spring = { type: 'spring', stiffness: 260, damping: 24 } as const;

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="VM disk" value={`${(n * (VM_OS_GB + APP_GB)).toFixed(1)} GB`} color="var(--bad)" sub="rough, typical" />
          <Stat label="Container disk" value={`${(n * APP_GB * 1000).toFixed(0)} MB`} color="var(--ok)" sub="rough, typical" />
          <Stat label="Guest OSes" value={n} color="var(--bad)" sub="vs 0 for containers" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'hardware' },
            { color: 'var(--bad)', label: 'guest OS (one per VM)' },
            { color: 'var(--info)', label: 'shared host kernel' },
            { color: 'var(--violet)', label: 'libs + app' },
          ]}
        />
      }
      controls={
        <Controls>
          {picker}
          <Slider label="Apps" value={n} min={1} max={4} onChange={setN} />
          <Button
            variant="primary"
            onClick={() => {
              setBoot((b) => b + 1);
              setCaption(<>Booting… a VM has to start a whole OS (tens of seconds). A container is just a process starting on an already-running kernel (well under a second).</>);
            }}
          >
            ▶ Boot everything
          </Button>
        </Controls>
      }
    >
      <div className="ct-stacks">
        {(['vm', 'ct'] as const).map((kind) => (
          <div key={kind} className={`ct-side ${kind}`}>
            <h4>{kind === 'vm' ? 'Virtual machines' : 'Containers'}</h4>
            <div className="ct-tower">
              <div className="ct-apps">
                <AnimatePresence initial={false}>
                  {apps.map((a) => (
                    <motion.div
                      key={a}
                      layout
                      className="ct-col"
                      initial={{ opacity: 0, y: -30 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -30 }}
                      transition={spring}
                    >
                      <div className="ct-block app">
                        <b>{a}</b>
                        <span>libs + app</span>
                      </div>
                      {kind === 'vm' && (
                        <div className="ct-block guest">
                          <b>guest OS</b>
                          <span>own kernel</span>
                        </div>
                      )}
                      <div className="ct-boot">
                        <i key={boot} className={boot ? 'run' : ''} style={{ animationDuration: kind === 'vm' ? '4s' : '0.25s' }} />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <div className={`ct-block layer ${kind === 'vm' ? 'hyper' : 'kernel'}`}>
                {kind === 'vm' ? 'Hypervisor' : 'Host OS kernel · container runtime'}
              </div>
              <div className="ct-block layer hw">Hardware</div>
            </div>
            <p className="ct-note">{kind === 'vm' ? 'boot ≈ 30–60 s each · strong isolation (separate kernels)' : 'start ≈ under 1 s · lighter isolation (shared kernel)'}</p>
          </div>
        ))}
      </div>
    </StageFrame>
  );
}

/* ─── Image layers ────────────────────────────────────────────────── */

interface Instr {
  text: string;
  /** Which inputs this instruction depends on beyond the instruction text. */
  inputs: ('base' | 'deps' | 'code')[];
  seconds: number;
  size: string;
  what: string;
}

const GOOD: Instr[] = [
  { text: 'FROM node:20-slim', inputs: ['base'], seconds: 8, size: '180 MB', what: 'base image' },
  { text: 'WORKDIR /app', inputs: [], seconds: 0.1, size: '0 B', what: 'working dir' },
  { text: 'COPY package*.json ./', inputs: ['deps'], seconds: 0.2, size: '2 KB', what: 'dependency list' },
  { text: 'RUN npm ci', inputs: [], seconds: 45, size: '95 MB', what: 'node_modules' },
  { text: 'COPY . .', inputs: ['deps', 'code'], seconds: 0.5, size: '1.2 MB', what: 'your source' },
  { text: 'CMD ["node", "server.js"]', inputs: [], seconds: 0, size: '0 B', what: 'metadata only' },
];
const BAD: Instr[] = [GOOD[0], GOOD[1], GOOD[4], GOOD[3], GOOD[5]];

type Change = 'first' | 'code' | 'deps';

interface LayerFrame extends Frame {
  statuses: ('pending' | 'cached' | 'built')[];
  current: number | null;
  seconds: number;
}

function buildFrames(file: Instr[], change: Change): LayerFrame[] {
  const statuses: LayerFrame['statuses'] = file.map(() => 'pending');
  const frames: LayerFrame[] = [
    {
      statuses: [...statuses], current: null, seconds: 0,
      say:
        change === 'first' ? <>First build: nothing is cached yet. Each instruction becomes a <b>layer</b>, stacked on the one below.</>
          : change === 'code' ? <>You edited <span className="hl">server.js</span> and rebuild. Which layers can Docker reuse?</>
            : <>You added a dependency to <span className="hl">package.json</span> and rebuild.</>,
    },
  ];
  let missed = change === 'first';
  let seconds = 0;
  file.forEach((ins, i) => {
    const changed = change !== 'first' && ins.inputs.includes(change);
    if (changed) missed = true;
    const cached = !missed;
    statuses[i] = cached ? 'cached' : 'built';
    if (!cached) seconds += ins.seconds;
    let say: ReactNode;
    if (cached) say = <><code>{ins.text}</code> → <span className="hl ok">CACHED</span>. Same instruction, same inputs, same layers underneath: reuse it.</>;
    else if (changed) say = <><code>{ins.text}</code> → its input changed, so it <span className="hl">rebuilds</span>… and <b>every layer above it</b> must rebuild too.</>;
    else if (change === 'first') say = <><code>{ins.text}</code> → builds the {ins.what} layer ({ins.size}, {ins.seconds}s).</>;
    else say = <><code>{ins.text}</code> → nothing about it changed, but a layer below did, so the cache is gone: <span className="hl bad">rebuild</span> ({ins.seconds}s).</>;
    frames.push({ statuses: [...statuses], current: i, seconds, say, hold: ins.seconds > 10 && !cached ? 1.6 : 1 });
  });
  const reused = statuses.filter((s) => s === 'cached').length;
  frames.push({
    statuses: [...statuses], current: null, seconds, hold: 2,
    say: (
      <>
        Build took <span className={`hl ${seconds > 20 ? 'bad' : 'ok'}`}>{seconds.toFixed(1)}s</span> with {reused}/{file.length} layers reused.
        {file === BAD && change === 'code' ? <> Copying all the source <b>before</b> npm ci means any code edit reinstalls every dependency.</> : null}
        {file === GOOD && change === 'code' ? <> Copying package.json first keeps the slow npm ci layer cached for code-only edits.</> : null}
      </>
    ),
  });
  return frames;
}

function Layers({ picker }: { picker: ReactNode }) {
  const [order, setOrder] = useState<'good' | 'bad'>('good');
  const [change, setChange] = useState<Change>('first');
  const file = order === 'good' ? GOOD : BAD;
  const frames = useMemo(() => buildFrames(file, change), [file, change]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Build time" value={`${f.seconds.toFixed(1)} s`} color={f.seconds > 20 ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Layers reused" value={`${f.statuses.filter((s) => s === 'cached').length}/${file.length}`} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'cached (reused)' },
            { color: 'var(--hi)', label: 'rebuilt' },
            { color: 'var(--dim)', label: 'not reached yet' },
          ]}
        />
      }
      controls={
        <Controls>
          {picker}
          <Segmented
            label="Dockerfile"
            value={order}
            onChange={setOrder}
            options={[
              { value: 'good', label: 'Deps first (good)' },
              { value: 'bad', label: 'Copy everything first' },
            ]}
          />
          <Segmented
            label="Build"
            value={change}
            onChange={setChange}
            options={[
              { value: 'first', label: 'First build' },
              { value: 'code', label: 'Edit source code' },
              { value: 'deps', label: 'Edit package.json' },
            ]}
          />
        </Controls>
      }
    >
      <div className="ct-layers">
        <div className="ct-dockerfile">
          <span className="ct-label">Dockerfile</span>
          <ol>
            {file.map((ins, i) => (
              <li key={ins.text} className={`${f.statuses[i]} ${f.current === i ? 'on' : ''}`}>
                <span className="ct-ln">{i + 1}</span>
                <code>{ins.text}</code>
                <em>{f.statuses[i] === 'cached' ? 'CACHED' : f.statuses[i] === 'built' ? `${ins.seconds}s` : ''}</em>
              </li>
            ))}
          </ol>
        </div>
        <div className="ct-image">
          <span className="ct-label">image = stack of read-only layers</span>
          <div className="ct-layerstack">
            <AnimatePresence initial={false}>
              {file.map((ins, i) =>
                f.statuses[i] === 'pending' ? null : (
                  <motion.div
                    key={`${order}-${change}-${i}`}
                    className={`ct-layer ${f.statuses[i]}`}
                    initial={{ opacity: 0, y: -40, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                  >
                    <span>{ins.what}</span>
                    <b>{ins.size}</b>
                  </motion.div>
                ),
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

/* ─── Isolation: namespaces + cgroups ─────────────────────────────── */

interface Box {
  name: string;
  cmd: string;
  hostPid: number;
  ip: string;
  hostPort: number;
  mem: number;
  cpu: number;
  status: 'running' | 'oom' | 'restarting';
}

const LIMIT = 256;
const START: Box[] = [
  { name: 'web', cmd: 'nginx', hostPid: 4012, ip: '172.17.0.2', hostPort: 8080, mem: 38, cpu: 12, status: 'running' },
  { name: 'api', cmd: 'node server.js', hostPid: 4078, ip: '172.17.0.3', hostPort: 8081, mem: 120, cpu: 35, status: 'running' },
  { name: 'worker', cmd: 'python worker.py', hostPid: 4133, ip: '172.17.0.4', hostPort: 8082, mem: 90, cpu: 20, status: 'running' },
];

function Isolation({ picker }: { picker: ReactNode }) {
  const [boxes, setBoxes] = useState(START);
  const [hostView, setHostView] = useState(false);
  const [leaking, setLeaking] = useState(false);
  const setCaption = useSetCaption();

  useEffect(() => {
    setCaption(
      <>
        Three containers on one host. <b>Namespaces</b> give each its own view (processes, network, filesystem);{' '}
        <b>cgroups</b> cap how much CPU and memory it may use.
      </>,
    );
  }, [setCaption]);

  const worker = boxes[2];
  const patchWorker = (p: Partial<Box> | ((b: Box) => Partial<Box>)) =>
    setBoxes((bs) => bs.map((b) => (b.name === 'worker' ? { ...b, ...(typeof p === 'function' ? p(b) : p) } : b)));

  // the leak: memory climbs a notch every tick until the cgroup limit is hit
  useEffect(() => {
    if (!leaking || worker.status !== 'running') return;
    const id = setTimeout(() => {
      if (worker.mem + 14 >= LIMIT) {
        patchWorker({ mem: LIMIT, status: 'oom' });
        setLeaking(false);
        setCaption(
          <>
            worker hit its <b>{LIMIT} MB</b> cgroup limit, so the kernel <span className="hl bad">OOM-killed</span> it. web and
            api didn't even blink. With a restart policy it comes back in a moment.
          </>,
        );
      } else {
        patchWorker((b) => ({ mem: b.mem + 14, cpu: Math.min(95, b.cpu + 4) }));
      }
    }, 120);
    return () => clearTimeout(id);
  });

  // restart policy: killed → restarting → fresh process
  useEffect(() => {
    if (worker.status === 'running') return;
    const id = setTimeout(() => {
      if (worker.status === 'oom') patchWorker({ status: 'restarting' });
      else {
        patchWorker((b) => ({ ...START[2], hostPid: b.hostPid + 97 }));
        setCaption(<>worker restarted as a <b>fresh</b> process: new host PID, but inside its namespace it's PID 1 again.</>);
      }
    }, 1300);
    return () => clearTimeout(id);
  }, [worker.status, setCaption]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Containers running" value={boxes.filter((b) => b.status === 'running').length} />
          <Stat label="Memory limit each" value={`${LIMIT} MB`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'namespace: own view' },
            { color: 'var(--ok)', label: 'within limits' },
            { color: 'var(--bad)', label: 'over limit / OOM-killed' },
          ]}
        />
      }
      controls={
        <Controls>
          {picker}
          <Segmented
            label="Process list as seen from"
            value={hostView ? 'host' : 'inside'}
            onChange={(v) => {
              setHostView(v === 'host');
              setCaption(
                v === 'host' ? (
                  <>From the <b>host</b>, they're just ordinary processes with ordinary PIDs. A container is not a tiny VM.</>
                ) : (
                  <>Inside its <b>PID namespace</b>, each app believes it is PID 1, alone on the machine.</>
                ),
              );
            }}
            options={[
              { value: 'inside', label: 'inside each container' },
              { value: 'host', label: 'the host' },
            ]}
          />
          <Button variant="danger" disabled={leaking || boxes[2].status !== 'running'} onClick={() => {
            setLeaking(true);
            setCaption(<>worker has a memory leak. Its usage climbs toward the cgroup limit…</>);
          }}>
            Leak memory in worker
          </Button>
        </Controls>
      }
    >
      <div className="ct-iso">
        <div className="ct-host">
          <span className="ct-label">host · one Linux kernel</span>
          <div className="ct-boxes">
            {boxes.map((b) => (
              <motion.div
                key={b.name}
                className={`ct-box ${b.status}`}
                animate={b.status === 'oom' ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
              >
                <header>
                  <b>{b.name}</b>
                  <span>{b.status === 'running' ? 'running' : b.status === 'oom' ? '💥 OOM-killed' : '↻ restarting'}</span>
                </header>
                <dl>
                  <dt>PID</dt>
                  <dd>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span key={hostView ? `h${b.hostPid}` : 'one'} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                        {hostView ? b.hostPid : 1}
                      </motion.span>
                    </AnimatePresence>
                    <em>{b.cmd}</em>
                  </dd>
                  <dt>network</dt>
                  <dd>
                    {b.ip}:80 <em>host :{b.hostPort} → :80</em>
                  </dd>
                  <dt>filesystem</dt>
                  <dd>
                    / <em>its own image</em>
                  </dd>
                </dl>
                <Meter label="memory" value={b.mem} max={LIMIT} unit="MB" />
                <Meter label="cpu" value={b.status === 'running' ? b.cpu : 0} max={100} unit="%" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

function Meter({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="ct-meter">
      <span>{label}</span>
      <div className="ct-meter-bar">
        <motion.i animate={{ width: `${pct}%` }} transition={{ duration: 0.15 }} className={pct > 85 ? 'hot' : ''} />
      </div>
      <b>
        {Math.round(value)}
        {unit === '%' ? '%' : ` / ${max} ${unit}`}
      </b>
    </div>
  );
}
