import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { traceFrames } from './captions';
import { HopList } from './HopList';
import { flowById, initialTracer } from './init';
import { FLOW_OPTIONS } from './options';
import { VpcGraph } from './VpcGraph';
import { PRESETS, asIntended, presetConfig, traceFlow } from './vpc';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a check that passed' },
      { color: 'var(--bad)', label: 'the check that dropped the packet' },
      { color: 'var(--hi)', label: 'the check happening now' },
      { color: 'var(--info)', label: 'the packet' },
      { color: 'var(--sky)', label: 'subnet tints are names, not verdicts' },
    ]}
  />
);

export function TracerScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialTracer);
  const cfg = useMemo(() => presetConfig(st.preset), [st.preset]);
  const flow = flowById(st.flow);
  const trace = useMemo(() => traceFlow(cfg, flow), [cfg, flow]);
  const frames = useMemo(() => traceFrames(cfg, flow, trace), [cfg, flow, trace]);
  const player = usePlayer(frames, { interval: 1500, autoplay: true });
  const shown = player.frame.shown;
  const dropped = trace.hops.find((h) => h.verdict === 'drop');
  const checks = trace.hops.filter((h) => h.verdict === 'pass').length;
  const intended = asIntended(flow, trace);
  const preset = PRESETS.find((p) => p.id === st.preset);

  return (
    <StageFrame
      height={470}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="This flow" value={trace.delivered ? 'delivered' : 'dropped'} color={trace.delivered ? 'var(--ok)' : 'var(--bad)'} sub={dropped ? `at ${dropped.title}` : 'the reply came back too'} />
          <Stat label="Checks passed" value={checks} sub={`of ${trace.hops.filter((h) => h.verdict !== 'info').length} checks on this flow`} />
          <Stat label="Design wants" value={flow.intended === 'reach' ? 'to get through' : 'to be stopped'} color={intended ? 'var(--ok)' : 'var(--bad)'} sub={intended ? 'as intended' : 'not as intended'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Flow" value={st.flow} options={FLOW_OPTIONS} onChange={(f) => setSt((x) => ({ ...x, flow: f }))} />
        </>,
        <>
          <ControlGroup label="Design" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={st.preset === p.id} onClick={() => setSt((x) => ({ ...x, preset: p.id }))}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="vpc-stage stage-pad">
        <div className="vpc-split">
          <Box>
            <SectionTitle hint={preset?.note}>A packet walks the VPC</SectionTitle>
            <VpcGraph cfg={cfg} flow={flow} hops={trace.hops} shown={shown} ariaLabel="A VPC with a public, a private and an isolated subnet, an internet gateway and a NAT gateway; the chosen packet and the checks it has passed" />
          </Box>
          <Box>
            <SectionTitle hint="every check, in order">Checks so far</SectionTitle>
            <HopList hops={trace.hops} shown={shown} label={`Checks made for ${flow.label}`} />
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">the packet walk is computed by a model of these rules, nothing is sent</Provenance>
          <Provenance kind="from-memory">AWS-style names and behaviour from memory: Azure and GCP use other names and some other defaults; verify against the provider's documentation</Provenance>
          <Provenance kind="not-run">shown, not run: no cloud account, console or network is contacted</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
