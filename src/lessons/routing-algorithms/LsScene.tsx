import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { lsFrames, msText } from './captions';
import {
  initialLs, loadLsPreset, brokenRandomSetup, scriptedSetup, linkEventOf, withDelay, withLinkEvent, type LinkEvent, type LsUi,
} from './init';
import {
  DUPLICATE_RATE, LATENCY_RANGE, LOSS_RANGE, LS_BROKEN_SEED, LS_DEAD_ROUTE_SEED, SCRIPTED_FAST_MS, SCRIPTED_SLOW_MS, agrees, behind, deadRouterOf, dvRoundsFor, frameAt, lsRun, messageCounts, routerView,
  scriptedSlowLink, sequenceUpTo, settling, trueTopoAt, wrongRouters, type LsMode,
} from './ls';
import { RouterGraph } from './RouterGraph';
import { PRESETS, linkId, presetById } from './topology';

const MODE_OPTIONS: { value: LsMode; label: string }[] = [
  { value: 'seq', label: 'higher sequence number wins' },
  { value: 'ignore', label: 'broken: ignore sequence numbers' },
];
const DELIVERY_OPTIONS = [
  { value: 'random' as const, label: 'random delay (seeded)' },
  { value: 'scripted' as const, label: 'scripted reordering' },
];
const EVENT_OPTIONS: { value: LinkEvent; label: string }[] = [
  { value: 'none', label: 'no change' },
  { value: 'cut', label: 'cut a link' },
  { value: 'restore', label: 'cut, then restore' },
];
const PLAY_MS = 160;
const LADDER_MESSAGES = 10;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: "a link in the chosen router's shortest-path tree" },
      { color: 'var(--bad)', label: 'a link that is down (dashed); a tree over it is a stale route' },
      { color: 'var(--orange)', label: 'a stale copy of an LSA (older than the newest anywhere); its router in the drawing' },
      { color: 'var(--hi)', label: 'the router whose tree is drawn (its own stale mark is not shown)' },
    ]}
  />
);

export function LsScene({ picker }: { picker: ReactNode }) {
  const [ui, setUi] = useState<LsUi>(initialLs);
  const s = ui.setup;
  const preset = presetById(s.presetId);
  const run = useMemo(() => lsRun(s), [s]);
  const frames = useMemo(() => lsFrames(run), [run]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;
  const frame = frameAt(run, now);
  const truth = trueTopoAt(s, now);
  const view = routerView(run, ui.router, now);
  const treeIds = new Set(view.tree.map(([p, c]) => linkId(p, c)));
  const deadIds = new Set(view.deadEdges.map(([p, c]) => linkId(p, c)));
  const late = behind(frame);
  const counts = messageCounts(run, now);
  const settle = useMemo(() => settling(run), [run]);
  const wrong = wrongRouters(run, now);
  const dvRounds = dvRoundsFor(s);
  const broken = run.violation !== null && now >= run.violation.time;
  const newest = Object.fromEntries(preset.routers.map((o) => [o, Math.max(...preset.routers.map((r) => frame.db[r][o]?.seq ?? 0))]));
  const slow = scriptedSlowLink(s);
  const ladder = sequenceUpTo(run, now, LADDER_MESSAGES);
  const patch = (p: Partial<typeof s>) => setUi((u) => ({ ...u, setup: { ...u.setup, ...p } }));

  return (
    <StageFrame
      height={620}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="LSAs sent" value={counts.sent} sub={counts.lost > 0 ? `${counts.lost} lost` : 'none lost so far'} />
          <Stat
            label="Databases"
            value={agrees(frame, truth) ? 'agree' : 'differ'}
            color={agrees(frame, truth) ? 'var(--ok)' : 'var(--orange)'}
            sub={late.length > 0 ? `${late.join(', ')} behind the newest copy` : 'each group holds the same sequence numbers'}
          />
          <Stat
            label="Time to agree"
            value={settle.ms === null ? 'never' : msText(settle.ms)}
            sub={[
              settle.ms === null ? 'in this run' : s.link === null ? 'after startup' : `after the last change, at ${msText(settle.changeAt)}`,
              dvRounds === null ? 'distance vector: no change to compare' : `distance vector, same cut: ${dvRounds} ${dvRounds === 1 ? 'round' : 'rounds'}`,
            ]}
          />
          <Stat
            label="Sequence rule"
            value={broken ? 'broken' : 'holds'}
            color={broken ? 'var(--bad)' : 'var(--ok)'}
            sub={broken && run.violation ? run.violation.message : 'no router has stored an older LSA over a newer one'}
          />
          <Stat label={`${ui.router} routes over a down link`} value={view.deadEdges.length} color={view.deadEdges.length > 0 ? 'var(--bad)' : undefined} sub={`${wrong.length} routers with a wrong next hop right now`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Network" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={p.id === s.presetId} onClick={() => setUi((u) => loadLsPreset(u, p.id))}>
                {p.label.split(',')[0]}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="Link event" value={linkEventOf(s)} options={EVENT_OPTIONS} onChange={(e) => setUi((u) => ({ ...u, setup: withLinkEvent(u.setup, e) }))} />
        </>,
        <>
          <Segmented label="Rule" value={s.mode} options={MODE_OPTIONS} onChange={(mode) => patch({ mode })} />
          <Segmented label="Delivery" value={s.delivery} options={DELIVERY_OPTIONS} onChange={(delivery) => patch({ delivery })} />
          <Segmented label="Tree of" value={ui.router} options={preset.routers.map((r) => ({ value: r, label: r }))} onChange={(router) => setUi((u) => ({ ...u, router }))} />
        </>,
        s.delivery === 'random' ? (
          <>
            <Slider label="Delay from" value={s.minMs} min={LATENCY_RANGE.min} max={LATENCY_RANGE.max} format={msText} onChange={(ms) => setUi((u) => ({ ...u, setup: withDelay(u.setup, 'min', ms) }))} />
            <Slider label="to" value={s.maxMs} min={LATENCY_RANGE.min} max={LATENCY_RANGE.max} format={msText} onChange={(ms) => setUi((u) => ({ ...u, setup: withDelay(u.setup, 'max', ms) }))} />
            <Slider label="Loss" value={s.loss} min={LOSS_RANGE.min} max={LOSS_RANGE.max} step={LOSS_RANGE.step} format={(v) => pct(v)} onChange={(loss) => patch({ loss })} />
            <SeedField seed={s.seed} onSeed={(seed) => patch({ seed })} />
          </>
        ) : (
          <Hint key="scripted-delivery" tone="muted">
            {slow
              ? `Scripted: the first message on the ${slow[0]} to ${slow[1]} link takes ${SCRIPTED_SLOW_MS} ms and every other message ${SCRIPTED_FAST_MS} ms, so the old LSA from ${slow[0]} arrives after the new one. Delay, loss and seed do not apply.`
              : `Scripted: every message takes ${SCRIPTED_FAST_MS} ms. This network has no second link at the cut link's first router, so nothing is reordered here; pick the ring.`}
          </Hint>
        ),
        <>
          <ChipButton tone="bad" onClick={() => setUi((u) => ({ ...u, setup: brokenRandomSetup() }))}>
            Load the lowest failing seed ({LS_BROKEN_SEED})
          </ChipButton>
          <ChipButton tone="bad" onClick={() => setUi((u) => ({ ...u, setup: { ...brokenRandomSetup(), seed: LS_DEAD_ROUTE_SEED }, router: deadRouterOf(LS_DEAD_ROUTE_SEED) ?? u.router }))}>
            Seed {LS_DEAD_ROUTE_SEED}: a router keeps a dead route
          </ChipButton>
          <ChipButton tone="bad" onClick={() => setUi((u) => ({ ...u, setup: scriptedSetup('ignore') }))}>
            Replay the scripted reordering
          </ChipButton>
          <ChipButton tone="info" onClick={() => setUi(initialLs)}>
            Reset
          </ChipButton>
        </>,
      ]}
    >
      <div className="ra-stage stage-pad">
        <Box>
          <SectionTitle hint="click a link to be the one that is cut; the tree is what the chosen router would use right now">Network: {preset.label}</SectionTitle>
          <RouterGraph
            routers={preset.routers}
            positions={preset.positions}
            links={truth.links}
            edgeMark={(l) =>
              !l.up ? { tone: 'bad', dashed: true, width: deadIds.has(l.id) ? 5 : 3.5 } : treeIds.has(l.id) ? { tone: 'ok', width: 4.5 } : null
            }
            nodeMark={(r) => (r === ui.router ? { tone: 'hi', fill: 'solid' } : late.includes(r) ? { tone: 'orange', fill: 'tint' } : null)}
            onLinkClick={(l) => setUi((u) => ({ ...u, setup: { ...u.setup, link: l.id, restore: u.setup.link === null ? false : u.setup.restore } }))}
            ariaLabel={`Network ${preset.label}; the shortest-path tree of router ${ui.router} from its own link-state database`}
          />
        </Box>
        <Box>
          <SectionTitle hint="the sequence number each router holds for each origin's LSA">Link-state databases at {msText(now)}</SectionTitle>
          <div className="ra-scroll" role="region" aria-label="Link-state databases: the sequence number each router holds for each origin" tabIndex={0}>
            <table className="data-table ra-grid">
              <thead>
                <tr>
                  <th scope="col">router \ LSA of</th>
                  {preset.routers.map((o) => (
                    <th key={o} scope="col">{o}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preset.routers.map((r) => (
                  <tr key={r}>
                    <th scope="row">{r}</th>
                    {preset.routers.map((o) => {
                      const seq = frame.db[r][o]?.seq;
                      const stale = seq !== undefined && seq < newest[o];
                      return (
                        <td key={o} className={`ra-cell ${stale ? 'is-stale' : ''}`}>
                          <span className="ra-cost">{seq === undefined ? '–' : `#${seq}`}</span>
                          {stale && <span className="ra-via">stale</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`the last ${LADDER_MESSAGES} messages sent so far`}>LSA flood</SectionTitle>
          <SequenceDiagram actors={ladder.actors} messages={ladder.messages} ariaLabel="The most recent link-state advertisements between routers" />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.delivery === 'random' ? s.seed : undefined}>
            {s.delivery === 'random' ? `random delay, ${pct(DUPLICATE_RATE)} duplicated, ${pct(s.loss)} lost; each router re-sends its own LSA to its neighbours a few times, but a loss further along is not repaired, so with loss the databases can stay different` : 'a scripted schedule, no randomness'}
          </Provenance>
          <Provenance kind="toy">real OSPF has areas, designated routers and LSA ageing; this is the core idea</Provenance>
          <Provenance kind="illustrative">link costs and delays are made up</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
