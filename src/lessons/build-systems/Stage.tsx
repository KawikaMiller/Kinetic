import { useEffect, useMemo, useRef, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { GraphView, type GraphEdge } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { GraphNodeMark } from '../../components/GraphView';
import { barLabelPx } from '../../core/gantt';
import { hasSubtle } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, nodeStates, type BuildFrame, type NodeState } from './frames';
import { NOTHING_BUILT, fileHash, fileText, makeRun, type Built, type BuildRun, type Cache, type Mode, type Status } from './model';
import {
  ENV, PRESETS, SOURCES, edit, filesOf, graphFor, initialEdits, isSource, revertEdits, type EditKind, type FileEdits, type PresetId, type SourceId,
} from './presets';
import './styles.css';

const STEP_MS = 1100;
const BOX = { w: 88, h: 32, rx: 8 };
const SPACING = { direction: 'right', layerGap: 150, nodeGap: 46, padMain: 54, padCross: 26 } as const;
const GRAPH_MIN_WIDTH = 620;
const HEX = 10;
/** Bars too short for the longest target name drop their label (it stays the tooltip). */
const LABEL_MIN_PX = barLabelPx('libmath.a');
const WORKERS = [1, 2, 4] as const;
/** Seconds to one decimal place: sums of 0.6 s fetches pick up float noise. */
const secs = (v: number) => `${Math.round(v * 10) / 10} s`;

const MARK: Record<NodeState, GraphNodeMark | null> = {
  idle: null,
  edited: { tone: 'hi', fill: 'solid' },
  queued: { tone: 'info', fill: 'tint', tint: 30 },
  building: { tone: 'hi', fill: 'solid' },
  fetching: { tone: 'ok', fill: 'tint', tint: 40 },
  rebuilt: { tone: 'info', fill: 'solid' },
  hit: { tone: 'ok', fill: 'solid' },
  uptodate: { tone: 'dim', fill: 'tint' },
  stale: { tone: 'bad', fill: 'solid' },
  poisoned: { tone: 'orange', fill: 'solid' },
};
const STATE_TEXT: Record<NodeState, string> = {
  idle: 'unchanged', edited: 'edited', queued: 'to rebuild', building: 'building now', fetching: 'fetching from a cache', rebuilt: 'rebuilt', hit: 'output reused',
  uptodate: 'up to date', stale: 'stale output', poisoned: 'poisoned cache entry',
};
const STATUS_TEXT: Record<Status, string> = {
  uptodate: 'up to date', cutoff: 'same key (early cutoff)', rebuilt: 'rebuilt', 'hit-local': 'local cache hit', 'hit-remote': 'remote cache hit',
};
const EDIT_LABEL: Record<EditKind, string> = { code: 'Change code', comment: 'Comment only', touch: 'Touch (save, no change)' };

interface Base {
  built: Built;
  cache: Cache;
  clock: number;
}

export function Stage() {
  return hasSubtle() ? <BuildStage /> : <NoCrypto />;
}

/** Keys are SHA-256 digests; without crypto.subtle (an insecure page, an old browser) say so instead of faking them. */
function NoCrypto() {
  useIntroCaption(<>This lesson needs the browser&apos;s SHA-256.</>);
  return (
    <StageFrame height={160}>
      <p className="stage-pad">Build keys here are real SHA-256 hashes, and this page has no <code>crypto.subtle</code> (it needs a secure context: https or localhost). Open the lesson over https to run it.</p>
    </StageFrame>
  );
}

function BuildStage() {
  const [preset, setPreset] = useState<PresetId>('good');
  const [fixed, setFixed] = useState(false);
  const [mode, setMode] = useState<Mode>('hash');
  const [remoteOn, setRemoteOn] = useState(false);
  const [workers, setWorkers] = useState<number>(2);
  const [edits, setEdits] = useState(initialEdits);
  const [dirty, setDirty] = useState<ReadonlySet<SourceId>>(new Set());
  /** The edits before each of the learner's edits, newest last, for Revert. */
  const [history, setHistory] = useState<Record<SourceId, FileEdits>[]>([]);
  const [base, setBase] = useState<Base | null>(null);
  const [run, setRun] = useState<BuildRun | null>(null);
  const [selected, setSelected] = useState<string>('math.c');
  const [busy, setBusy] = useState(false);
  const setCaption = useSetCaption();
  const request = useRef(0);

  const graph = useMemo(() => graphFor(preset, fixed), [preset, fixed]);
  const files = useMemo(() => filesOf(edits), [edits]);
  const frames = useMemo<BuildFrame[]>(() => (run ? buildFrames(run) : [{ t: 0, final: true }]), [run]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const states = run ? nodeStates(run, f.t, f.final) : null;

  // The remote cache: a teammate's clean build of the starting commit, with their environment.
  const remote = useAsyncValue(
    async () => (await makeRun({ graph, files: filesOf(initialEdits()), prev: NOTHING_BUILT, cache: {}, options: { mode: 'hash', env: ENV.teammate, clock: 0 }, workers: 1, clean: true })).result.cache,
    `${preset}-${fixed}`,
  );

  useIntroCaption(<>Everything has been built once already. Click a source file on the left, change it, then press <b>Build</b>.</>);

  // A new build file or change-detection mode starts from a fresh checkout, built once with no cache.
  useEffect(() => {
    const id = ++request.current;
    const fresh = initialEdits();
    void makeRun({ graph, files: filesOf(fresh), prev: NOTHING_BUILT, cache: {}, options: { mode, env: ENV.mine, clock: 1 }, workers: 1, clean: true }).then((r) => {
      if (id !== request.current) return;
      setEdits(fresh);
      setHistory([]);
      setDirty(new Set());
      setRun(null);
      setBase({ built: r.result.built, cache: mode === 'hash' ? r.result.cache : {}, clock: r.result.clock });
    });
  }, [graph, mode]);

  const doBuild = async (clean: boolean) => {
    if (!base) return;
    const id = ++request.current;
    setBusy(true);
    const r = await makeRun({
      graph, files, prev: base.built, cache: base.cache, workers, clean,
      options: { mode, env: ENV.mine, clock: base.clock, remote: remoteOn && mode === 'hash' ? remote ?? undefined : undefined },
    });
    setBusy(false);
    if (id !== request.current) return;
    setBase({ built: r.result.built, cache: r.result.cache, clock: r.result.clock });
    setDirty(new Set());
    player.queueNext({ play: true });
    setRun(r);
  };

  const applyEdit = (src: SourceId, kind: EditKind) => {
    if (!base) return;
    const tick = base.clock + 1;
    setBase({ ...base, clock: tick });
    setHistory([...history, edits]);
    setEdits({ ...edits, [src]: edit(edits[src], kind, tick) });
    setDirty(new Set([...dirty, src]));
    setRun(null);
    const what = kind === 'code' ? 'changed its code' : kind === 'comment' ? 'changed only a comment' : 'saved it without changing anything';
    setCaption(<>You {what} in <b>{src}</b>. Press <b>Build</b> to see what {mode === 'hash' ? 'the hashes' : 'make'} decide{mode === 'hash' ? '' : 's'}.</>);
  };

  const revert = () => {
    if (!base || !history.length) return;
    const previous = history[history.length - 1];
    const tick = base.clock + 1;
    const next = revertEdits(edits, previous, tick);
    setBase({ ...base, clock: tick });
    setHistory(history.slice(0, -1));
    setEdits(next);
    setDirty(new Set(SOURCES.filter((s) => next[s] !== edits[s])));
    setRun(null);
    setCaption(<>Reverted the last edit: the file&apos;s old text is back, with a new timestamp (as after a checkout). Press <b>Build</b>: {mode === 'hash'
      ? 'the keys match ones in the local cache again, so the old outputs can come back without running anything.'
      : 'make only sees newer timestamps, so it rebuilds everything downstream again.'}</>);
  };

  const pickPreset = (id: PresetId) => {
    setPreset(id);
    setFixed(false);
    if (id === 'env') setRemoteOn(true);
    setCaption(id === 'missing'
      ? <>main.c includes math.h, but the build file doesn&apos;t say so (the dashed red arrow). Edit <b>math.h</b> and build.</>
      : id === 'env'
        ? <>main.o&apos;s command reads <b>$LOG_LEVEL</b> without declaring it. Your teammate built with LOG_LEVEL={ENV.teammate}; you have {ENV.mine}. Remote cache is on: press <b>Clean build</b>.</>
        : <>Every input is declared. Fresh checkout, built once.</>);
  };

  /** The remote cache is filled asynchronously after a preset change: don't build until it's there, or the toggle would be silently ignored. */
  const notReady = !base || busy || (remoteOn && mode === 'hash' && !remote);
  const edgeList: GraphEdge<string>[] = graph.nodes.flatMap((n) => graph.actual[n.id].map((d) => ({ from: d, to: n.id })));
  const undeclared = (e: GraphEdge<string>) => !graph.declared[e.to].includes(e.from);
  const stateOf = (id: string): NodeState => states?.[id] ?? (isSource(id) ? (dirty.has(id) ? 'edited' : 'idle') : base ? 'uptodate' : 'idle');

  const bars: GanttBar[] = (run?.slots ?? []).map((s) => {
    const r = run!.result.results[s.id];
    const building = f.t >= s.start && f.t < s.end;
    const progress = f.t >= s.end ? 1 : f.t <= s.start ? 0 : (f.t - s.start) / (s.end - s.start);
    const tone = r.status === 'rebuilt' ? (building ? 'hi' : 'info') : 'ok';
    return { id: s.id, lane: `w${s.worker}`, start: s.start, end: s.end, tone: progress > 0 ? tone : undefined, progress, label: s.id };
  });
  const domainEnd = Math.max(1, ...(run?.slots ?? []).map((s) => s.end));
  const took = run ? Math.max(0, ...run.slots.map((s) => s.end)) : null;

  return (
    <StageFrame
      player={run ? player : undefined}
      height={520}
      stats={
        <Stats>
          <Stat label="This build" value={took === null ? '–' : secs(took)} color="var(--info)" sub={`${workers} worker${workers === 1 ? '' : 's'}`} />
          <Stat label="Clean build" value={run ? secs(run.cleanSeconds) : '–'} color="var(--muted)" sub="same workers, no cache" />
          <Stat label="Saved" value={run && took !== null ? secs(Math.max(0, run.cleanSeconds - took)) : '–'} color="var(--ok)" />
          <Stat label="Critical path" value={run ? secs(run.critical) : '–'} color="var(--muted)" sub="no worker count beats it" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'edited / building now' },
            { color: 'var(--info)', label: 'to rebuild (tint) · rebuilt (solid)' },
            { color: 'var(--ok)', label: 'output reused: cache hit (tint while fetching) or same key' },
            { color: 'var(--dim)', label: 'up to date' },
            { color: 'var(--bad)', label: 'stale output · undeclared input (dashed)' },
            { color: 'var(--orange)', label: 'poisoned cache entry' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Change detection" value={mode} onChange={setMode} options={[{ value: 'hash', label: 'Content hashes' }, { value: 'time', label: 'Timestamps (make)' }]} />
          <Segmented label="Workers" value={workers} onChange={setWorkers} options={WORKERS.map((w) => ({ value: w, label: String(w) }))} />
          <Toggle label="Remote cache" value={remoteOn} onChange={setRemoteOn} off="Off" on="On" />
        </>,
        <>
          <ControlGroup label="Build file">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={p.id === preset} onClick={() => pickPreset(p.id)}>
                {p.label}
              </ChipButton>
            ))}
            {PRESETS.find((p) => p.id === preset)?.fix && (
              <ChipButton tone="ok" on={fixed} onClick={() => setFixed(!fixed)}>
                {PRESETS.find((p) => p.id === preset)!.fix}
              </ChipButton>
            )}
          </ControlGroup>
          <Button variant="primary" onClick={() => void doBuild(false)} disabled={notReady}>
            Build
          </Button>
          <Button onClick={() => void doBuild(true)} disabled={notReady}>
            Clean build
          </Button>
          <Button onClick={revert} disabled={!base || !history.length || busy}>
            Revert last edit
          </Button>
          {mode === 'time' && remoteOn && <Hint>make has no cache: the remote cache only works with content hashes.</Hint>}
        </>,
      ]}
    >
      <div className="bs stage-pad">
        <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Build graph: scroll sideways to see all of it">
          <GraphView
            nodes={graph.nodes.map((n) => ({ id: n.id, shape: 'box' as const }))}
            edges={edgeList}
            layout="layered"
            spacing={SPACING}
            directed
            box={BOX}
            className="bs-graph"
            ariaLabel="Build graph: sources on the left, then objects, libraries, and the app and test binaries"
            nodeMark={(id) => MARK[stateOf(id)]}
            nodeClass={(id) => (id === selected ? 'bs-selected' : '')}
            edgeMark={(e) => (undeclared(e) ? { tone: 'bad', dashed: true, width: 2.5 } : null)}
            onNodeClick={setSelected}
            nodeAriaLabel={(id) => `${id}, ${STATE_TEXT[stateOf(id)]}`}
          />
        </WideRegion>
        <div className="bs-lower">
          <div className="bs-col">
            <SectionTitle hint="illustrative seconds">Build timeline</SectionTitle>
            {run && run.slots.length ? (
              <GanttLanes
                lanes={Array.from({ length: workers }, (_, i) => ({ id: `w${i}`, label: `worker ${i + 1}` }))}
                bars={bars}
                domain={[0, domainEnd]}
                now={f.t}
                unit=" s"
                axis
                size="md"
                labelWidth={70}
                labelMinPx={LABEL_MIN_PX}
                ariaLabel={`Build timeline on ${workers} workers, ${secs(took ?? 0)}`}
              />
            ) : (
              <p className="empty-note">{run ? 'nothing to run' : 'press Build'}</p>
            )}
            <SectionTitle hint="SHA-256, first 10 hex digits">Cache keys</SectionTitle>
            <KeyTable run={run} base={base} states={states} />
          </div>
          <div className="bs-col">
            <Selected id={selected} graph={graph} files={files} edits={edits} base={base} onEdit={applyEdit} run={run} />
            <Hint block>Build times are illustrative. Source hashes are real SHA-256 of the shown text; cache keys hash the full 64-digit input hashes (shortened here). Outputs are modelled, not compiled. A green target with an early cutoff was not looked up in any cache: its key simply matched, so nothing ran.</Hint>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

function KeyTable({ run, base, states }: { run: BuildRun | null; base: Base | null; states: Record<string, NodeState> | null }) {
  const rows = run
    ? Object.entries(run.result.results).map(([id, r]) => ({ id, key: r.key, out: r.out, status: STATUS_TEXT[r.status] }))
    : Object.entries(base?.built.targets ?? {}).map(([id, r]) => ({ id, key: r.key, out: r.out, status: 'up to date' }));
  return (
    <table className="data-table bs-keys">
      <thead>
        <tr><th>target</th><th>key</th><th>result</th><th>output</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const s = states?.[r.id];
          const tone = s === 'stale' ? 'bad' : s === 'poisoned' ? 'orange' : '';
          return (
            <tr key={r.id} className={tone ? `tone-${tone} bs-flag` : ''}>
              <td><code>{r.id}</code></td>
              <td><code>{r.key.slice(0, HEX)}</code></td>
              <td>{s === 'stale' ? 'stale' : s === 'poisoned' ? 'poisoned' : r.status}</td>
              <td><code>{r.out.slice(0, HEX)}</code></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Selected({
  id, graph, files, edits, base, onEdit, run,
}: {
  id: string;
  graph: ReturnType<typeof graphFor>;
  files: ReturnType<typeof filesOf>;
  edits: Record<SourceId, FileEdits>;
  base: Base | null;
  onEdit: (src: SourceId, kind: EditKind) => void;
  run: BuildRun | null;
}) {
  const file = isSource(id) ? files[id] : null;
  const digest = useAsyncValue(() => (file ? fileHash(file) : Promise.resolve(null)), file ? fileText(file) : id);
  if (isSource(id)) {
    return (
      <div className="bs-selected-panel">
        <CodePanel title={`${id} · sha256 ${digest ? digest.slice(0, HEX) : '…'} · edits ${edits[id].code + edits[id].comment}`} lines={fileText(file!).split('\n')} />
        <div className="bs-edit-row">
          {(['code', 'comment', 'touch'] as const).map((k) => (
            <ChipButton key={k} tone="hi" size="md" onClick={() => onEdit(id, k)} disabled={!base}>
              {EDIT_LABEL[k]}
            </ChipButton>
          ))}
        </div>
        <Hint>A compiler usually produces the same bytes after a comment-only edit (line numbers and debug info can move), as it does here.</Hint>
      </div>
    );
  }
  const node = graph.nodes.find((n) => n.id === id)!;
  const declared = graph.declared[id];
  const missing = graph.actual[id].filter((d) => !declared.includes(d));
  const hashOf = (d: string) => (isSource(d) ? base?.built.srcHash[d] : (run?.result.results[d]?.out ?? base?.built.targets[d]?.out)) ?? '';
  const env = graph.readsEnv.includes(id);
  const lines = [
    `key(${id}) = sha256(`,
    `  "${node.cmd}"`,
    ...(env && graph.envDeclared ? [`  LOG_LEVEL=${ENV.mine}`] : []),
    ...declared.map((d) => `  ${d}  ${hashOf(d).slice(0, HEX)}`),
    ')',
  ];
  return (
    <div className="bs-selected-panel">
      <CodePanel title={`${id} · how its cache key is made`} lines={lines} gutter="none" />
      {missing.length > 0 && <p className="bs-warn tone-bad">Reads {missing.join(', ')} too, but doesn&apos;t declare it: that input is not in the key.</p>}
      {env && !graph.envDeclared && <p className="bs-warn tone-orange">Its command reads $LOG_LEVEL, which is not in the key.</p>}
      <Hint>Click a source file to edit it. Hashes are from the last build.</Hint>
    </div>
  );
}

