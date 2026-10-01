import { motion } from 'motion/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useShake } from '../../core/useShake';

interface Container {
  name: string;
  cmd: string;
  hostPid: number;
  ip: string;
  hostPort: number;
  mem: number;
  cpu: number;
  status: 'running' | 'oom' | 'restarting';
}

/** Each container's cgroup memory limit, in MB. */
const LIMIT_MB = 256;
const START: Container[] = [
  { name: 'web', cmd: 'nginx', hostPid: 4012, ip: '172.17.0.2', hostPort: 8080, mem: 38, cpu: 12, status: 'running' },
  { name: 'api', cmd: 'node server.js', hostPid: 4078, ip: '172.17.0.3', hostPort: 8081, mem: 120, cpu: 35, status: 'running' },
  { name: 'worker', cmd: 'python worker.py', hostPid: 4133, ip: '172.17.0.4', hostPort: 8082, mem: 90, cpu: 20, status: 'running' },
];
const WORKER = 2;

/** The leak: every tick, worker's memory and CPU climb by these steps. */
const LEAK_TICK_MS = 120;
const LEAK_STEP_MB = 14;
const LEAK_STEP_CPU = 4;
const CPU_CAP = 95;
/** How long each restart phase (killed → restarting → fresh) lasts. */
const RESTART_PHASE_MS = 1300;
/** A restarted process gets a new host PID; this is just a plausible jump. */
const PID_BUMP = 97;
/** Meter fill turns red above this share of its maximum. */
const HOT_PCT = 85;

/** Namespaces (each container's own view) and cgroups (its resource limits), with an OOM kill demo. */
export function Isolation({ picker }: { picker: ReactNode }) {
  const [containers, setContainers] = useState(START);
  const [hostView, setHostView] = useState(false);
  const [leaking, setLeaking] = useState(false);
  const setCaption = useSetCaption();
  const { shake } = useShake();

  useIntroCaption(
    <>
      Three containers on one host. <b>Namespaces</b> give each its own view (processes, network, filesystem);{' '}
      <b>cgroups</b> cap how much CPU and memory it may use.
    </>,
  );

  const worker = containers[WORKER];
  const patchWorker = useCallback(
    (p: Partial<Container> | ((c: Container) => Partial<Container>)) =>
      setContainers((cs) => cs.map((c) => (c.name === 'worker' ? { ...c, ...(typeof p === 'function' ? p(c) : p) } : c))),
    [],
  );

  // The leak: memory climbs a notch every tick until the cgroup limit is hit.
  useEffect(() => {
    if (!leaking || worker.status !== 'running') return;
    const id = setTimeout(() => {
      if (worker.mem + LEAK_STEP_MB >= LIMIT_MB) {
        patchWorker({ mem: LIMIT_MB, status: 'oom' });
        setLeaking(false);
        setCaption(
          <>
            worker hit its <b>{LIMIT_MB} MB</b> cgroup limit, so the kernel <span className="hl bad">OOM-killed</span> it. web and
            api didn't even blink. With a restart policy it comes back in a moment.
          </>,
        );
      } else {
        patchWorker({ mem: worker.mem + LEAK_STEP_MB, cpu: Math.min(CPU_CAP, worker.cpu + LEAK_STEP_CPU) });
      }
    }, LEAK_TICK_MS);
    return () => clearTimeout(id);
  }, [leaking, worker.status, worker.mem, worker.cpu, patchWorker, setCaption]);

  // Restart policy: killed → restarting → fresh process.
  useEffect(() => {
    if (worker.status === 'running') return;
    const id = setTimeout(() => {
      if (worker.status === 'oom') patchWorker({ status: 'restarting' });
      else {
        patchWorker((c) => ({ ...START[WORKER], hostPid: c.hostPid + PID_BUMP }));
        setCaption(<>worker restarted as a <b>fresh</b> process: new host PID, but inside its namespace it's PID 1 again.</>);
      }
    }, RESTART_PHASE_MS);
    return () => clearTimeout(id);
  }, [worker.status, patchWorker, setCaption]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Containers running" value={containers.filter((c) => c.status === 'running').length} />
          <Stat label="Memory limit each" value={`${LIMIT_MB} MB`} />
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
          <Toggle
            label="Process list as seen from"
            value={hostView}
            off="inside each container"
            on="the host"
            onChange={(host) => {
              setHostView(host);
              setCaption(
                host ? (
                  <>From the <b>host</b>, they're just ordinary processes with ordinary PIDs. A container is not a tiny VM.</>
                ) : (
                  <>Inside its <b>PID namespace</b>, each app believes it is PID 1, alone on the machine.</>
                ),
              );
            }}
          />
          <Button
            variant="danger"
            disabled={leaking || worker.status !== 'running'}
            onClick={() => {
              setLeaking(true);
              setCaption(<>worker has a memory leak. Its usage climbs toward the cgroup limit…</>);
            }}
          >
            Leak memory in worker
          </Button>
        </Controls>
      }
    >
      <div className="ct-iso">
        <div className="ct-host">
          <span className="ct-label">host · one Linux kernel</span>
          <div className="ct-boxes">
            {containers.map((c) => (
              <motion.div
                key={c.name}
                className={`ct-box ${c.status}`}
                animate={shake(c.status === 'oom')}
                transition={{ duration: 0.4 }}
              >
                <header>
                  <b>{c.name}</b>
                  <span>{c.status === 'running' ? 'running' : c.status === 'oom' ? '💥 OOM-killed' : '↻ restarting'}</span>
                </header>
                <dl>
                  <dt>PID</dt>
                  <dd>
                    <AnimatedValue variant="flip" value={hostView ? c.hostPid : 1} id={hostView ? `h${c.hostPid}` : 'one'} />
                    <em>{c.cmd}</em>
                  </dd>
                  <dt>network</dt>
                  <dd>
                    {c.ip}:80 <em>host :{c.hostPort} → :80</em>
                  </dd>
                  <dt>filesystem</dt>
                  <dd>
                    / <em>its own image</em>
                  </dd>
                </dl>
                <Meter label="memory" value={c.mem} max={LIMIT_MB} unit="MB" />
                <Meter label="cpu" value={c.status === 'running' ? c.cpu : 0} max={100} unit="%" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

/** The leak ticks every 120 ms, so the fill tracks it with a quick tween. */
const METER_TRANSITION = { duration: 0.15 };

function Meter({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <Bar
      className="ct-meter"
      value={value}
      max={max}
      tone={pct > HOT_PCT ? 'bad' : 'ok'}
      transition={METER_TRANSITION}
      label={<span>{label}</span>}
      trailing={
        <b>
          {Math.round(value)}
          {unit === '%' ? '%' : ` / ${max} ${unit}`}
        </b>
      }
    />
  );
}
