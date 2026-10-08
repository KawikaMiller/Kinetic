/** The live world around the cluster model: a clock that runs a tick every TICK_SECONDS, a selection and an event log. */
import type { Tone } from '../../core/tone';
import {
  addBigPod, changeImage, drainNode, killNode, killPod, relabelPod, restoreNode, setReplicas, settledCluster, tick, type Cluster, type TickReport,
} from './model';

/** Seconds of real time per tick. */
export const TICK_SECONDS = 1.1;
const LOG_KEEP = 40;
const NODE_ACTED_ON = 1;

export interface LogEntry {
  id: number;
  tick: number;
  text: string;
  tone: Tone;
}

export interface SimWorld {
  cluster: Cluster;
  clock: number;
  report: TickReport | null;
  /** What the person just did: the next tick's caption starts with it. */
  lead: string | null;
  selected: number | null;
  log: LogEntry[];
  nextLog: number;
}

export function createWorld(): SimWorld {
  return { cluster: settledCluster(), clock: 0, report: null, lead: null, selected: null, log: [], nextLog: 1 };
}

function note(w: SimWorld, text: string, tone: Tone) {
  w.log.push({ id: w.nextLog++, tick: w.cluster.tick, text, tone });
  if (w.log.length > LOG_KEEP) w.log.shift();
}

/** Run one tick and log what it did. */
export function stepOnce(w: SimWorld): TickReport {
  const r = tick(w.cluster);
  if (r.act !== 'nothing to do') note(w, `${r.observe}: ${r.act}`, 'hi');
  for (const n of r.notes) note(w, n, 'dim');
  w.report = r;
  if (w.selected !== null && !w.cluster.pods.some((p) => p.id === w.selected)) w.selected = null;
  return r;
}

/** Advance by `dt` real seconds; returns the reports of the ticks that fell due. */
export function advance(w: SimWorld, dt: number): TickReport[] {
  w.clock += dt;
  const out: TickReport[] = [];
  while (w.clock >= TICK_SECONDS) {
    w.clock -= TICK_SECONDS;
    out.push(stepOnce(w));
  }
  return out;
}

/** An action by the person: logs it, remembers it for the next caption, and returns the text to show now. */
function acted(w: SimWorld, text: string): string {
  w.lead = text;
  note(w, text, 'info');
  return text;
}

export const selectPod = (w: SimWorld, id: number | null) => {
  w.selected = id;
};

export function killSelected(w: SimWorld): string | null {
  const p = w.selected === null ? null : killPod(w.cluster, w.selected);
  return p ? acted(w, `You deleted pod ${p.name}.`) : null;
}

export function relabelSelected(w: SimWorld): string | null {
  const p = w.selected === null ? null : relabelPod(w.cluster, w.selected);
  return p ? acted(w, `You changed ${p.name}'s label to app=web-debug: the Service no longer selects it, and it keeps running.`) : null;
}

export function scaleTo(w: SimWorld, n: number): string {
  setReplicas(w.cluster, n);
  return acted(w, `You set replicas to ${w.cluster.deployment.replicas}.`);
}

export function rollOut(w: SimWorld): string {
  const image = changeImage(w.cluster);
  return acted(w, `You changed the image to ${image}.`);
}

export function overRequest(w: SimWorld): string {
  const p = addBigPod(w.cluster);
  return acted(w, `You created ${p.name}, which asks for more CPU than any node has.`);
}

export function drain(w: SimWorld, node = NODE_ACTED_ON): string {
  drainNode(w.cluster, node);
  return acted(w, `You drained ${w.cluster.nodes[node].name}: it is cordoned and its pods are told to stop.`);
}

export function crash(w: SimWorld, node = NODE_ACTED_ON): string {
  killNode(w.cluster, node);
  return acted(w, `${w.cluster.nodes[node].name} crashed. The control plane hasn't noticed yet.`);
}

export function restore(w: SimWorld, node = NODE_ACTED_ON): string {
  restoreNode(w.cluster, node);
  return acted(w, `${w.cluster.nodes[node].name} is back and schedulable.`);
}
