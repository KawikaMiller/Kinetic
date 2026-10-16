import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { changeText, dvFrames } from './captions';
import { SPLIT_LABEL, SPLIT_MODES, cellKey, costText, roundsByMode, sceneRun, unreachableCount } from './dv';
import { applyCost, dvBaseline, dvTopo, initialDv, loadDvPreset, selectLink, toggleSelected, type DvState } from './init';
import { RouterGraph } from './RouterGraph';
import { INFINITY_COST, PRESETS, presetById, type StartKind } from './topology';

const MODE_OPTIONS = SPLIT_MODES.map((m) => ({ value: m, label: SPLIT_LABEL[m] }));

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'a table entry (and its router) that changed in this round' },
      { color: 'var(--bad)', label: 'unreachable, shown as ∞ (16), or a cut link (dashed)' },
      { color: 'var(--info)', label: 'the link selected for cutting or a new cost' },
    ]}
  />
);

export function DvScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<DvState>(initialDv);
  const preset = presetById(st.presetId);
  const baseline = useMemo(() => dvBaseline(st.presetId), [st.presetId]);
  const topo = useMemo(() => dvTopo(st.presetId, st.links), [st.presetId, st.links]);
  const run = useMemo(() => sceneRun(baseline, topo, st.start, st.mode), [baseline, topo, st.start, st.mode]);
  const frames = useMemo(() => dvFrames(run, st.start, changeText(baseline, topo), st.mode), [run, baseline, topo, st.start, st.mode]);
  const byMode = useMemo(() => roundsByMode(baseline, topo, st.start), [baseline, topo, st.start]);
  const player = usePlayer(frames, { interval: 700, autoplay: true });
  const round = player.frame.round;
  const tables = run.tables[round];
  const changed = round > 0 ? run.changed[round - 1] : new Set<string>();
  const changedRouters = new Set([...changed].map((k) => k.split('>')[0]));
  const selectedLink = st.links.find((l) => l.id === st.selected);

  return (
    <StageFrame
      height={560}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Rounds to converge" value={run.hitCap ? `over ${run.rounds}` : run.rounds} sub={`${SPLIT_LABEL[st.mode]}, ${st.start === 'boot' ? 'cold boot' : 'after the change'}`} />
          <Stat label="Same change, by mode" value={`${byMode.plain} / ${byMode.split} / ${byMode.poison}`} sub="plain / split horizon / poisoned reverse, in rounds" />
          <Stat label="Entries at ∞ (16)" value={unreachableCount(run, round)} color={unreachableCount(run, round) > 0 ? 'var(--bad)' : undefined} sub={`after round ${round} of ${run.rounds}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Network" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={p.id === st.presetId} onClick={() => setSt((s) => loadDvPreset(p.id, s.mode))}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="Advertise" value={st.mode} options={MODE_OPTIONS} onChange={(mode) => setSt((s) => ({ ...s, mode }))} />
          <Toggle label="Start" value={st.start === 'boot'} off="from a link change" on="from a cold boot" onChange={(boot) => setSt((s) => ({ ...s, start: (boot ? 'boot' : 'change') as StartKind }))} />
        </>,
        <>
          <Button softDisabled={!selectedLink} onClick={() => setSt(toggleSelected)}>
            {selectedLink && !selectedLink.up ? 'Restore the selected link' : 'Cut the selected link'}
          </Button>
          <TextField label="Cost" value={st.costText} onChange={(costText) => setSt((s) => ({ ...s, costText }))} onEnter={() => setSt(applyCost)} width={70} spellCheck={false} />
          <Button softDisabled={!selectedLink} onClick={() => setSt(applyCost)}>
            Set cost
          </Button>
          <Button onClick={() => setSt(loadDvPreset(st.presetId, st.mode))}>Reset</Button>
          <Hint tone="muted">
            <span role="status">{st.note ?? 'Click a link in the drawing to select it, then cut it or give it a cost from 1 to 9.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="ra-stage stage-pad">
        <Box>
          <SectionTitle hint="click a link to select it">Network: {preset.label}</SectionTitle>
          <RouterGraph
            routers={preset.routers}
            positions={preset.positions}
            links={st.links}
            edgeMark={(l) => (!l.up ? { tone: 'bad', dashed: true, width: l.id === st.selected ? 5 : 3.5 } : l.id === st.selected ? { tone: 'info', width: 5 } : null)}
            nodeMark={(r) => (changedRouters.has(r) ? { tone: 'hi', fill: 'tint' } : null)}
            onLinkClick={(l) => setSt((s) => selectLink(s, l.id))}
            ariaLabel={`Network ${preset.label}: routers and links; press a link to select it`}
          />
        </Box>
        <Box>
          <SectionTitle hint={`cost to each destination, and the next hop; after round ${round}`}>Every router's table</SectionTitle>
          <div className="ra-scroll" role="region" aria-label="Routing tables of every router" tabIndex={0}>
            <table className="data-table ra-grid">
              <thead>
                <tr>
                  <th scope="col">from \ to</th>
                  {preset.routers.map((d) => (
                    <th key={d} scope="col">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preset.routers.map((r) => (
                  <tr key={r}>
                    <th scope="row">{r}</th>
                    {preset.routers.map((d) => {
                      const e = tables[r][d];
                      const cls = d === r ? 'is-self' : changed.has(cellKey(r, d)) ? 'is-changed' : e.cost >= INFINITY_COST ? 'is-inf' : '';
                      return (
                        <td key={d} className={`ra-cell ${cls}`}>
                          {d === r ? (
                            <span className="ra-cost">–</span>
                          ) : (
                            <>
                              <span className="ra-cost">{costText(e)}</span>
                              <span className="ra-via">{e.next ? `via ${e.alts.join(', ')}` : 'no route'}</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ra-note">
            {st.mode === 'plain'
              ? 'Plain: a router passes every route to every neighbour, including the one it learned it from.'
              : st.mode === 'split'
                ? 'Split horizon: a router leaves out of its advertisement to a neighbour the routes that go through that neighbour.'
                : 'Poisoned reverse: a router advertises the routes that go through a neighbour back to it as 16, unreachable.'}{' '}
            In this synchronous model split horizon and poisoned reverse build identical tables; on real routers poisoning also tells the neighbour at once instead of leaving it to time out.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">synchronous rounds, vectors taken at the start of each round</Provenance>
          <Provenance kind="from-memory">infinity is 16, as in RIP (verify against RFC 2453); real RIP also has update timers of 30 s and a 180 s timeout, not modelled</Provenance>
          <Provenance kind="toy">a teaching simplification; real routers send updates on timers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
