import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Legend, PauseButton, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useInterval } from '../../core/useInterval';
import { liveCaption, trapCaption } from './captions';
import { ClusterView } from './ClusterView';
import { DESIRED_START, IMAGE_TAGS, REPLICAS_MAX, diffLines, sameSpec, type Spec, type State } from './reconcile';
import { INTERVAL_MAX, INTERVAL_MIN, commit, failingShare, manual, secondsToRun, setPaused, startWorld, tick, toNextRun, type Mode, type World } from './world';

const TICK_MS = 400;
const SCALE_BY_HAND = 10;
const DEPLOYMENTS = ['web', 'api', 'worker'] as const;

const withReplicas = (s: State, key: string, n: number): State => ({ ...s, [key]: { ...s[key], replicas: Math.max(0, Math.min(REPLICAS_MAX, n)) } });
const withImage = (s: State, key: string, tag: string): State => ({ ...s, [key]: { ...s[key], image: `${key}:${tag}` } });
const tagOf = (spec: Spec | undefined) => spec?.image?.split(':')[1] ?? '';

export function LiveScene({ picker, mode }: { picker: ReactNode; mode: Mode }) {
  const setCaption = useSetCaption();
  const [w, setW] = useState<World>(() => startWorld(mode));
  const [draft, setDraft] = useState<State>(DESIRED_START);
  const [playing, setPlaying] = useState(true);
  const [spike, setSpike] = useState(false);
  /** Pressing Commit or Delete disables that button, so focus first moves to the form around it instead of falling to the page. */
  const commitFormRef = useRef<HTMLDivElement>(null);
  const deleteRowRef = useRef<HTMLDivElement>(null);

  useInterval(() => setW(tick), TICK_MS, playing);
  const lines = useMemo(() => diffLines(w.desired, w.live, w.prune), [w.desired, w.live, w.prune]);

  useEffect(() => {
    setCaption(mode === 'trap' ? trapCaption(w, spike) : liveCaption(mode, w), { quiet: true });
  }, [setCaption, mode, w, spike]);

  const reset = () => {
    setW(startWorld(mode));
    setDraft(DESIRED_START);
    setSpike(false);
  };
  const handScale = (key: string, n: number) => setW((x) => manual(x, key, { ...x.live[key], replicas: Math.max(0, Math.min(REPLICAS_MAX, n)) }, `scale ${key} to ${n}`));
  const failing = failingShare(w.live, spike);
  const draftChanged = Object.keys(draft).some((k) => !sameSpec(draft[k], w.desired[k]));

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Seconds" value={w.t} sub={`next sync in ${secondsToRun(w)} s`} />
          <Stat label="Out of sync" value={`${w.driftSeconds} s`} sub="seconds with live different from git" color={w.driftSeconds ? 'var(--bad)' : undefined} />
          {mode === 'trap' && <Stat label="Requests failing" value={`${Math.round(failing * 100)}%`} color={failing > 0 ? 'var(--bad)' : 'var(--ok)'} sub={spike ? 'traffic spike' : 'normal traffic'} />}
          {w.paused && <Stat label="Sync" value="paused" sub={`${w.unnoticedSeconds} s of drift nobody was watching`} color="var(--violet)" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'git: the desired state', shape: 'square' },
            { color: 'var(--ok)', label: 'live, in sync', shape: 'square' },
            { color: 'var(--bad)', label: 'live, drifted', shape: 'square' },
            { color: 'var(--hi)', label: 'what the controller just did', shape: 'square' },
            { color: 'var(--orange)', label: 'an orphan', shape: 'square' },
            { color: 'var(--violet)', label: 'sync paused on purpose', shape: 'square' },
            { color: 'var(--dim)', label: 'not created yet', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PauseButton paused={!playing} onToggle={() => setPlaying(!playing)} />
          <Button onClick={() => setW((x) => tick(x))}>Step 1 s</Button>
          <Button onClick={() => setW(toNextRun)}>To the next sync</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
        ...(mode === 'drift'
          ? [
              <>
                <Toggle label="Auto-sync" value={w.autoSync} onChange={(autoSync) => setW((x) => ({ ...x, autoSync }))} off="Off: alert only" on="On" />
                <Slider label="Sync interval" value={w.interval} min={INTERVAL_MIN} max={INTERVAL_MAX} onChange={(interval) => setW((x) => ({ ...x, interval }))} format={(v) => `${v} s`} />
              </>,
            ]
          : []),
        ...(mode === 'trap'
          ? [
              <>
                <Segmented label="Traffic" value={spike} onChange={setSpike} options={[{ value: false, label: 'Normal' }, { value: true, label: 'Spike' }]} />
                <Button onClick={() => handScale('web', SCALE_BY_HAND)}>Scale web to {SCALE_BY_HAND} by hand</Button>
                <Button onClick={() => setW((x) => commit(x, withReplicas(x.desired, 'web', SCALE_BY_HAND)))}>Commit web = {SCALE_BY_HAND} to git</Button>
                <Button onClick={() => setW((x) => setPaused(x, !x.paused))}>{w.paused ? 'Resume sync' : 'Pause sync (logged override)'}</Button>
              </>,
            ]
          : []),
      ]}
    >
      <div className="go stage-pad">
        <div className="go-split">
          <ClusterView desired={w.desired} live={w.live} acting={w.acting} paused={w.paused} />
          <div className="go-side-panels">
            <CodePanel
              title="What the next sync would change"
              lines={lines.map((l) => l.text)}
              stateOf={(i) => lines[i].mark}
            />
            <LogStream label="Controller and git log" rows={w.log.map((e) => ({ id: e.id, at: `${e.t} s`, text: e.text, tone: e.tone }))} maxHeight={150} follow live="off" empty="Nothing has happened yet." />
          </div>
        </div>

        {mode === 'loop' && (
          <Box>
            <SectionTitle hint="edit the draft, then commit it to git">Git: the desired state</SectionTitle>
            <div className="go-form" ref={commitFormRef} tabIndex={-1} aria-label="Draft of the desired state">
              {DEPLOYMENTS.map((key) => (
                <div key={key} className="go-form-row" role="group" aria-label={`Draft for ${key}`}>
                  <b>{key}</b>
                  <Button aria-label={`Fewer ${key} replicas`} onClick={() => setDraft(withReplicas(draft, key, (draft[key].replicas ?? 0) - 1))}>−</Button>
                  <span className="go-count">{draft[key].replicas} replicas</span>
                  <Button aria-label={`More ${key} replicas`} onClick={() => setDraft(withReplicas(draft, key, (draft[key].replicas ?? 0) + 1))}>+</Button>
                  {IMAGE_TAGS.map((t) => (
                    <ChipButton key={t} tone="info" on={tagOf(draft[key]) === t} onClick={() => setDraft(withImage(draft, key, t))}>{t}</ChipButton>
                  ))}
                </div>
              ))}
              <Button
                variant="primary"
                disabled={!draftChanged}
                onClick={() => {
                  commitFormRef.current?.focus();
                  setW((x) => commit(x, draft));
                }}
              >
                Commit
              </Button>
            </div>
          </Box>
        )}

        {mode === 'drift' && (
          <Box>
            <SectionTitle hint="what an engineer in a hurry does to the cluster, bypassing git">Change the cluster by hand</SectionTitle>
            <div className="go-form">
              {DEPLOYMENTS.map((key) => (
                <div key={key} className="go-form-row" role="group" aria-label={`Hand changes to ${key}`}>
                  <b>{key}</b>
                  <Button onClick={() => handScale(key, (w.live[key]?.replicas ?? 0) + 1)} disabled={!(key in w.live)}>+1 replica</Button>
                  <Button onClick={() => handScale(key, (w.live[key]?.replicas ?? 0) - 1)} disabled={!(key in w.live)}>−1 replica</Button>
                  {IMAGE_TAGS.map((t) => (
                    <ChipButton key={t} tone="bad" disabled={!(key in w.live)} onClick={() => setW((x) => manual(x, key, { ...x.live[key], image: `${key}:${t}` }, `edit ${key} image to ${t}`))}>image {t}</ChipButton>
                  ))}
                </div>
              ))}
              <div className="go-form-row" ref={deleteRowRef} tabIndex={-1} aria-label="The service">
                <b>web-svc</b>
                <Button
                  onClick={() => {
                    deleteRowRef.current?.focus();
                    setW((x) => manual(x, 'web-svc', null, 'delete web-svc'));
                  }}
                  disabled={!('web-svc' in w.live)}
                >
                  Delete the service
                </Button>
              </div>
            </div>
          </Box>
        )}

        {mode === 'trap' && (
          <Hint block>
            During a spike the web deployment needs more replicas than git asks for. Scaling by hand works until the controller&apos;s next run reverts it. The two ways out are to commit the change, or to pause sync as a deliberate, logged override, which
            leaves the cluster drifted and unwatched until someone commits or resumes.
          </Hint>
        )}

        <ProvenanceRow>
          <Provenance kind="toy">a toy controller, not Kubernetes: no API server, no real manifests</Provenance>
          <Provenance kind="simulated">time passes in simulated seconds</Provenance>
          <ClaimLabel kind="standard">Kubernetes controllers are reconciliation loops; see kubernetes-basics</ClaimLabel>
          {mode === 'trap' && <ClaimLabel kind="practice">committing the change, or pausing sync as a logged override, are the usual ways to keep an incident fix; teams differ on whether pausing is allowed at all</ClaimLabel>}
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
