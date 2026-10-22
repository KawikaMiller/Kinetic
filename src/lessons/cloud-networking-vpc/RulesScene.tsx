import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { outcomeText, rulesIntro } from './captions';
import { HopList } from './HopList';
import { flowById, initialRules, loadPreset } from './init';
import { RuleEditor } from './RuleEditor';
import { VpcGraph } from './VpcGraph';
import { FLOWS, PRESETS, asIntended, traceFlow } from './vpc';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a flow that is as intended, or a check that passed' },
      { color: 'var(--bad)', label: 'a flow that is not as intended, or the check that dropped it' },
      { color: 'var(--hi)', label: 'the flow whose checks are drawn' },
      { color: 'var(--info)', label: 'the packet' },
    ]}
  />
);

export function RulesScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialRules);
  const results = useMemo(() => FLOWS.map((flow) => ({ flow, trace: traceFlow(st.cfg, flow) })), [st.cfg]);
  const flow = flowById(st.flow);
  const trace = results.find((r) => r.flow.id === flow.id)!.trace;
  const good = results.filter((r) => asIntended(r.flow, r.trace)).length;
  const signature = results.map((r) => r.trace.drop ?? 'ok').join(',');

  return (
    <StageFrame
      height={760}
      legend={LEGEND}
      intro={rulesIntro(st.cfg)}
      introKey={signature}
      stats={
        <Stats>
          <Stat label="Flows as intended" value={`${good} of ${FLOWS.length}`} color={good === FLOWS.length ? 'var(--ok)' : 'var(--bad)'} sub={good === FLOWS.length ? 'the design works' : 'edit a list until every flow is as intended'} />
          <Stat label={`${flow.label}`} value={trace.delivered ? 'delivered' : 'dropped'} color={asIntended(flow, trace) ? 'var(--ok)' : 'var(--bad)'} sub={outcomeText(trace)} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Start from" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={st.preset === p.id} onClick={() => setSt((s) => loadPreset(s, p.id))}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => setSt((s) => loadPreset(s, s.preset))}>Reset to this design</Button>
        </>,
      ]}
    >
      <div className="vpc-stage stage-pad">
        <Box>
          <SectionTitle hint="press a row to draw its checks below">Every flow under your rules</SectionTitle>
          <div className="vpc-scroll" role="region" aria-label="The six flows and what happens to each" tabIndex={0}>
            <table className="data-table vpc-flows">
              <thead>
                <tr>
                  <th scope="col">Flow</th>
                  <th scope="col">Design wants</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map(({ flow: f, trace: t }) => {
                  const ok = asIntended(f, t);
                  return (
                    <tr key={f.id} className={`vpc-flow-row ${ok ? 'is-ok' : 'is-bad'}${f.id === st.flow ? ' is-selected' : ''}`}>
                      <td>
                        <button type="button" className="vpc-flow-btn" aria-pressed={f.id === st.flow} onClick={() => setSt((s) => ({ ...s, flow: f.id }))}>{f.label}</button>
                      </td>
                      <td>{f.intended === 'reach' ? 'get through' : 'be stopped'}</td>
                      <td>
                        {ok ? 'as intended: ' : 'NOT as intended: '}
                        {outcomeText(t)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Box>
        <Box>
          <SectionTitle hint="the preset is only a starting point; every list below can be edited">Rules you can change</SectionTitle>
          <RuleEditor st={st} setSt={setSt} />
        </Box>
        <div className="vpc-split">
          <Box>
            <SectionTitle hint={flow.label}>Where it goes</SectionTitle>
            <VpcGraph cfg={st.cfg} flow={flow} hops={trace.hops} shown={trace.hops.length} ariaLabel={`The VPC with every check for ${flow.label} marked`} />
          </Box>
          <Box>
            <SectionTitle hint="every check, in order">Checks for this flow</SectionTitle>
            <HopList hops={trace.hops} shown={trace.hops.length} label={`Checks made for ${flow.label}`} />
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">a model of the rules, nothing is sent</Provenance>
          <Provenance kind="from-memory">security groups are stateful and allow-only, network ACLs are stateless and numbered, in the AWS style (verify against the provider's documentation)</Provenance>
          <Provenance kind="not-run">shown, not run: this is not a cloud console and contacts no account</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
