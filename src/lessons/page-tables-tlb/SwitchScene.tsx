import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { pct } from '../../core/format';
import { n, shootdownCaption, switchCaption } from './captions';
import {
  CORES, IPI_CYCLES, LOCAL_INVALIDATE_CYCLES, SWITCH, UNMAPS, runSwitching, shootdown, shootdownOpening, switchOpening,
} from './tlb';

export function SwitchScene({ picker }: { picker: ReactNode }) {
  const [openSwitch] = useState(switchOpening);
  const [openShoot] = useState(shootdownOpening);
  const [workingSet, setWorkingSet] = useState(openSwitch.workingSet);
  const [slice, setSlice] = useState(openSwitch.slice);
  const [cores, setCores] = useState(openShoot.cores);
  const [unmaps, setUnmaps] = useState(openShoot.unmaps);
  const [batched, setBatched] = useState(openShoot.batched);

  const flush = useMemo(() => runSwitching({ workingSet, slice }, 'flush'), [workingSet, slice]);
  const asid = useMemo(() => runSwitching({ workingSet, slice }, 'asid'), [workingSet, slice]);
  const cfg = useMemo(() => ({ cores, unmaps, batched }), [cores, unmaps, batched]);
  const shoot = shootdown(cfg);
  const unbatched = shootdown({ cores, unmaps, batched: false });
  const caption = `${switchCaption(flush, asid)} ${shootdownCaption(cfg, shoot)}`;
  const total = SWITCH.switches * slice;

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Misses, flush on switch" value={n(flush.misses)} color="var(--bad)" sub={`${pct(flush.misses / total, 1)} of ${n(total)} accesses`} />
          <Stat label="Misses, address-space tags" value={n(asid.misses)} color="var(--ok)" sub={`${pct(asid.misses / total, 1)} of ${n(total)} accesses`} />
          <Stat label="Shootdown IPIs" value={n(shoot.ipis)} color={shoot.ipis > 0 ? 'var(--bad)' : undefined} sub={`${n(shoot.rounds)} ${shoot.rounds === 1 ? 'round' : 'rounds'} x ${n(cores - 1)} other cores`} />
          <Stat label="Shootdown cost" value={`${n(shoot.cost)} cycles`} sub={batched ? `unbatched: ${n(unbatched.cost)}` : 'illustrative'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the costly side: misses after a flush, IPIs', shape: 'square' },
            { color: 'var(--ok)', label: 'the cheap side: entries that survive', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Pages per process" value={workingSet} min={SWITCH.workingSet.min} max={SWITCH.workingSet.max} onChange={setWorkingSet} />
          <Slider label="Accesses per turn" value={slice} min={SWITCH.slice.min} max={SWITCH.slice.max} onChange={setSlice} />
        </>,
        <>
          <Slider label="Cores running the process" value={cores} min={CORES.min} max={CORES.max} onChange={setCores} />
          <Slider label="Pages unmapped" value={unmaps} min={UNMAPS.min} max={UNMAPS.max} onChange={setUnmaps} />
          <Toggle label="Shootdowns" value={batched} onChange={setBatched} off="One per unmap" on="Batched" />
        </>,
      ]}
    >
      <div className="ptt-stage stage-pad">
        <Box>
          <SectionTitle hint={`${SWITCH.switches} turns, a ${SWITCH.entries}-entry TLB`}>Two processes, one TLB</SectionTitle>
          <Hint tone="muted" block>
            Both processes use the same virtual page numbers for different frames. With a flush on every switch each turn starts cold; with address-space tags (ASIDs, called PCID on x86) the entries stay in the TLB and are told apart by the tag.
          </Hint>
        </Box>
        <Box>
          <SectionTitle hint="unmapping a page in a multi-threaded process">Shootdowns</SectionTitle>
          <Hint tone="muted" block>
            When one core unmaps a page, the other cores running the process may hold its translation, so the initiating core interrupts them (an inter-processor interrupt, IPI): {n(IPI_CYCLES)} cycles each here, plus {n(LOCAL_INVALIDATE_CYCLES)} to invalidate each entry locally. Batching the unmaps into one round pays the interrupts once.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">two processes alternating over one small TLB, and a count of interrupts</Provenance>
          <Provenance kind="simulated" seed={SWITCH.seed}>seeded random accesses inside each process</Provenance>
          <Provenance kind="illustrative">the cycle costs are round numbers</Provenance>
          <Provenance kind="from-memory">ASIDs, x86 PCID, and the remark that mitigations for speculative-execution bugs made some switches costlier; verify against a vendor manual</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
