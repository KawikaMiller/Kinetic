import { useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { ringsCaption } from './captions';
import { initialRings } from './opening';
import { RingsDrawing } from './RingsDrawing';
import { ACTION_LABEL, ACTION_ORDER, RING_ABOUT, RING_LABEL, RING_ORDER, decide, decisionText, ringSet, strength, type ActionId, type RingId } from './rings';

const DECISION_TONE = { allowed: 'var(--bad)', blocked: 'var(--ok)', limited: 'var(--violet)' } as const;

/** Scene 1: six boundaries round an abstract plugin; switch them and watch eight actions. */
export function RingsScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialRings);
  const { rings, action } = state;
  const on = ringSet(...rings);
  const d = decide(action, on);
  const toggle = (ring: RingId, value: boolean) => setState((s) => ({ ...s, rings: RING_ORDER.filter((r) => (r === ring ? value : s.rings.includes(r))) }));
  const rows = ACTION_ORDER.map((a) => ({ a, d: decide(a, on) }));
  const stoppedCount = rows.filter((r) => strength(r.d) === 2).length;
  const limitedCount = rows.filter((r) => strength(r.d) === 1).length;
  const allowedCount = rows.length - stoppedCount - limitedCount;

  return (
    <StageFrame
      height={460}
      intro={ringsCaption(action, rings)}
      introKey={[action, rings.join(',')]}
      stats={
        <Stats>
          <Stat label="The action" value={decisionText(d)} color={DECISION_TONE[d.kind]} sub={ACTION_LABEL[action]} />
          <Stat label="Blocked outright (limits not counted)" value={`${stoppedCount} of ${ACTION_ORDER.length}`} color="var(--ok)" sub={[`${limitedCount} limited, ${allowedCount} allowed`, `with ${rings.length} of ${RING_ORDER.length} rings on`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'the untrusted plugin', shape: 'square' },
            { color: 'var(--ok)', label: 'the ring that stopped it', shape: 'square' },
            { color: 'var(--violet)', label: 'a ring that limited it', shape: 'square' },
            { color: 'var(--bad)', label: 'it succeeded and should not have', shape: 'square' },
            { color: 'var(--dim)', label: 'a ring switched off', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Action">
            {ACTION_ORDER.map((a) => (
              <ChipButton key={a} tone="info" on={a === action} onClick={() => setState((s) => ({ ...s, action: a as ActionId }))}>
                {ACTION_LABEL[a]}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          {RING_ORDER.map((r) => (
            <Toggle key={r} label={RING_LABEL[r]} value={on.has(r)} onChange={(v) => toggle(r, v)} />
          ))}
        </>,
      ]}
    >
      <div className="sb-stage stage-pad">
        <div className="sb-two">
          <div className="sb-block">
            <SectionTitle>Rings round the plugin (innermost first: process)</SectionTitle>
            <RingsDrawing action={action} rings={on} ariaLabel={`Rings round the plugin: ${ACTION_LABEL[action]} is ${decisionText(d)}`} />
          </div>
          <div className="sb-block">
            <SectionTitle>Every action, with these rings</SectionTitle>
            <div className="sb-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ a, d: dec }) => (
                    <tr key={a} className={a === action ? 'sb-picked' : undefined}>
                      <td>{ACTION_LABEL[a]}</td>
                      <td style={{ color: DECISION_TONE[dec.kind] }}>{decisionText(dec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="sb-list">
              {RING_ORDER.map((r) => (
                <li key={r}>
                  <b>{RING_LABEL[r]}</b>: {RING_ABOUT[r]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">no system call is made and no code runs: the plugin is a labelled token and the rules are a table</Provenance>
        <Provenance kind="illustrative">the rules are simplified: real setups differ in what each layer is configured to do</Provenance>
        <Provenance kind="from-memory">what each layer controls comes from memory: check the container runtime's and the kernel's documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
