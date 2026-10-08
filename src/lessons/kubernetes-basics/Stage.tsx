import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, PauseButton, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useSimulation } from '../../core/useSimulation';
import { ClusterScene } from './ClusterScene';
import { endpoints, MAX_REPLICAS, imageTag, type Cluster, type TickReport } from './model';
import { tickCaption } from './narrate';
import { EventLog, PendingList, ReconcileStrip, RolloutNote } from './Panels';
import { advance, createWorld, crash, drain, killSelected, overRequest, relabelSelected, restore, rollOut, scaleTo, selectPod, stepOnce, type LogEntry, type SimWorld } from './sim';
import { hasOversizedPending, podState, readyCount } from './view';
import './styles.css';

const SCENE_MIN_W = 540;
const SNAPSHOT_S = 0.15;
const NODE_NAME = 'node-2';

interface Snap {
  cluster: Cluster;
  report: TickReport | null;
  selected: number | null;
  log: LogEntry[];
}

const snapshot = (w: SimWorld): Snap => ({ cluster: structuredClone(w.cluster), report: w.report, selected: w.selected, log: [...w.log] });

const INTRO = <>Three pods are Ready and the Deployment wants three, so the loop has nothing to do. Click a pod, then delete it, and watch the loop notice.</>;

export function Stage() {
  const setCaption = useSetCaption();
  const sim = useSimulation<SimWorld, Snap>({
    create: createWorld,
    step: (w, dt) => {
      for (const r of advance(w, dt)) {
        setCaption(tickCaption(r, w.lead), { quiet: true });
        w.lead = null;
      }
    },
    snapshot,
    snapshotEvery: SNAPSHOT_S,
  });
  useIntroCaption(INTRO);

  const { snap } = sim;
  if (!snap) return null;
  const { cluster, report, selected, log } = snap;
  const chosen = selected === null ? undefined : cluster.pods.find((p) => p.id === selected);

  const act = (run: (w: SimWorld) => string | null) => {
    const text = run(sim.world());
    if (text) setCaption(<>{text} The controllers react on their next tick.</>);
    sim.refresh();
  };
  const stepNow = () => {
    const w = sim.world();
    const r = stepOnce(w);
    setCaption(tickCaption(r, w.lead));
    w.lead = null;
    sim.refresh();
  };
  const reset = () => {
    sim.reset();
    setCaption(INTRO);
  };
  const select = (id: number | null) => {
    selectPod(sim.world(), id);
    sim.refresh();
  };
  const nextImage = imageTag(cluster.deployment.revision + 1);

  return (
    <StageFrame
      height={600}
      stats={
        <Stats>
          <Stat label="Desired" value={cluster.deployment.replicas} />
          <Stat label="Ready" value={readyCount(cluster)} color={readyCount(cluster) === cluster.deployment.replicas ? 'var(--ok)' : 'var(--hi)'} />
          <Stat label="Endpoints" value={endpoints(cluster).length} />
          <Stat label="Requests ok" value={cluster.served} />
          <Stat label="Requests failed" value={cluster.failed} color={cluster.failed > 0 ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'Ready (solid)' },
            { color: 'var(--hi)', label: 'Pending, creating, running not Ready' },
            { color: 'var(--dim)', label: 'Terminating' },
            { color: 'var(--bad)', label: 'on a down node' },
            { color: 'var(--info)', label: 'Service traffic' },
            { color: 'var(--violet)', label: 'old ReplicaSet' },
            { color: 'var(--sky)', label: 'new ReplicaSet' },
            { color: 'var(--amber)', label: 'selected pod' },
            { color: 'var(--dim)', label: 'dim ring: not selected by the Service; dashed cell: free slot' },
          ]}
        />
      }
      controls={[
        <>
          <PauseButton paused={sim.paused} onToggle={sim.togglePause} />
          <Button onClick={stepNow}>Step one tick</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
        <>
          <Slider
            label="Replicas"
            value={cluster.deployment.replicas}
            min={0}
            max={MAX_REPLICAS}
            onChange={(n) => act((w) => scaleTo(w, n))}
          />
          <Button onClick={() => act(rollOut)}>Change image to {nextImage}</Button>
          <Button disabled={hasOversizedPending(cluster)} onClick={() => act(overRequest)}>Over-request CPU</Button>
        </>,
        <>
          <Button disabled={!chosen} onClick={() => act(killSelected)}>
            Delete selected pod
          </Button>
          <Button disabled={!chosen} onClick={() => act(relabelSelected)}>
            Relabel selected pod
          </Button>
          <Hint>{chosen ? `Selected ${chosen.name}: ${podState(chosen)}${chosen.node !== null ? ` on ${cluster.nodes[chosen.node].name}` : ''}.` : 'Click a pod in the grid to select it.'}</Hint>
        </>,
        <>
          <Button onClick={() => act((w) => drain(w))}>Drain {NODE_NAME}</Button>
          <Button onClick={() => act((w) => crash(w))}>Crash {NODE_NAME}</Button>
          <Button onClick={() => act((w) => restore(w))}>Restore {NODE_NAME}</Button>
        </>,
      ]}
    >
      <div className="k8s stage-pad">
        <WideRegion minWidth={SCENE_MIN_W} label="Cluster: scroll sideways to see all of it">
          <ClusterScene cluster={cluster} report={report} selected={selected} onSelect={select} />
        </WideRegion>
        <ReconcileStrip report={report} />
        <RolloutNote cluster={cluster} />
        <PendingList cluster={cluster} />
        <EventLog log={log} />
        <Hint block>
          Simulated cluster with a simplified scheduler (most free CPU, lowest node first on a tie); timings are shortened (a real node is marked NotReady after about 40 s and its pods are evicted minutes later). Pod names are illustrative. Each tick runs the
          node monitor, kubelets, scheduler, Deployment and ReplicaSet loops once, in that order.
        </Hint>
      </div>
    </StageFrame>
  );
}
