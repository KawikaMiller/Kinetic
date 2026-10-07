import { motion } from 'motion/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useShake } from '../../core/useShake';
import { LIMIT_MB, START, WORKER, leakTick, meterHot, pidSeenFrom, restartPhase, type Container } from './model';

/** The leak ticks this often. */
const LEAK_TICK_MS = 120;
/** How long each restart phase (killed → restarting → fresh) lasts. */
const RESTART_PHASE_MS = 1300;

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
      const next = leakTick(worker);
      patchWorker(next);
      if (next.status === 'oom') {
        setLeaking(false);
        setCaption(
          <>
            worker hit its <b>{LIMIT_MB} MB</b> cgroup limit, so the kernel <span className="hl bad">OOM-killed</span> it. web and
            api didn't even blink. With a restart policy it comes back in a moment.
          </>,
        );
      }
    }, LEAK_TICK_MS);
    return () => clearTimeout(id);
  }, [leaking, worker, patchWorker, setCaption]);

  // Restart policy: killed → restarting → fresh process.
  useEffect(() => {
    if (worker.status === 'running') return;
    const id = setTimeout(() => {
      const wasRestarting = worker.status === 'restarting';
      patchWorker((c) => restartPhase(c, START[WORKER]));
      if (wasRestarting) {
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
            { color: 'var(--bad)', label: 'near the limit / OOM-killed' },
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
          <Hint block>
            Simulated: the PIDs, addresses and usage are made up, and the leak climbs on a timer. The isolation rules are the
            real ones: a process is PID 1 in its own namespace, and the kernel kills it at its cgroup memory limit.
          </Hint>
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
                    <AnimatedValue variant="flip" value={pidSeenFrom(c, hostView)} id={hostView ? `h${c.hostPid}` : 'one'} />
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
  return (
    <Bar
      className="ct-meter"
      value={value}
      max={max}
      tone={meterHot(value, max) ? 'bad' : 'ok'}
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
