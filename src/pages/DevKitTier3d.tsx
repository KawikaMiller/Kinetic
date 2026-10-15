import { useState } from 'react';
import { LaneEditor } from '../components/LaneEditor';
import { SectionTitle } from '../components/Panel';
import { Button, Provenance, ProvenanceRow, Segmented } from '../components/ui';
import { buildLaneModel, type LaneItem, type LaneLimits, type LaneMode } from '../core/laneEditor';
import type { Tone } from '../core/tone';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 3 wave 1 to 2 kit round, agent D: lane editor (#/dev/kit). */
export function DevKitTier3d() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 1 to 2 round, agent D</SectionTitle>
      <Section title="LaneEditor · events on process lanes joined by messages (logical-clocks): press a slot to add, drag to move, Link mode to draw a message">
        <EventsDemo />
      </Section>
      <Section title="LaneEditor · operation intervals on client rows (consistency-models): Alt + Left/Right stretches the selected bar">
        <IntervalsDemo />
      </Section>
      <Section title="ProvenanceRow · the wrapping row of chips under a stage's visual (cap-theorem, replication, isolation-levels, load-balancing, observability, event-sourcing)">
        <ProvenanceRow>
          <Provenance kind="simulated" seed={7}>seeded random requests, one copy of the balancer per strategy on the same traffic</Provenance>
          <Provenance kind="scripted">the crash, the failover manager's timing and fixed link delays, so every seed plays the same</Provenance>
          <Provenance kind="illustrative">server speeds and queue sizes are made up, not measured</Provenance>
        </ProvenanceRow>
      </Section>
    </>
  );
}

const PROCESSES = ['P1', 'P2', 'P3'];
const EVENT_LIMITS: LaneLimits = { lanes: 3, slots: 14, maxItems: 14 };
const eventPreset = () =>
  buildLaneModel<string>(
    EVENT_LIMITS,
    [{ lane: 0, slot: 1, data: 'a' }, { lane: 1, slot: 4, data: 'b' }, { lane: 2, slot: 8, data: 'c' }, { lane: 1, slot: 10, data: 'd' }],
    [[0, 1], [1, 2]],
  );
const eventName = (item: LaneItem<string>) => item.data;

function EventsDemo() {
  const [model, setModel] = useState(eventPreset);
  const [mode, setMode] = useState<LaneMode>('edit');
  const [status, setStatus] = useState('');
  const [counter, setCounter] = useState(0);
  return (
    <div className="devkit-row">
    <div className="devkit-controls">
      <Segmented
        label="Presses"
        options={[{ value: 'edit', label: 'Edit' }, { value: 'link', label: 'Link' }]}
        value={mode}
        onChange={(m) => { setMode(m); setStatus(''); }}
      />
      <LaneEditor
        model={model}
        onChange={(next) => { setModel(next); setStatus(''); }}
        onRefuse={setStatus}
        laneLabels={PROCESSES}
        newData={() => { setCounter((n) => n + 1); return `e${counter + 1}`; }}
        mode={mode}
        ariaLabel="Execution: events on three processes"
        describeItem={(item) => `event ${eventName(item)}`}
        itemLabel={eventName}
        toneOf={(item): Tone => (['sky', 'amber', 'pink'] as const)[item.lane]}
      />
      <p className="muted" role="status">{status || `${model.items.length} events, ${model.links.length} messages`}</p>
      <Button onClick={() => { setModel(eventPreset()); setStatus(''); }}>Reset</Button>
    </div>
    </div>
  );
}

const OP_SLOT_W = 26;
const CLIENTS = ['C1', 'C2', 'C3'];
const OP_LIMITS: LaneLimits = { lanes: 3, slots: 20, maxItems: 10, minSpan: 1 };
const opPreset = () =>
  buildLaneModel<string>(
    OP_LIMITS,
    [{ lane: 0, slot: 1, span: 3, data: 'W(1)' }, { lane: 1, slot: 6, span: 2, data: 'R→1' }, { lane: 2, slot: 10, span: 3, data: 'R→0' }],
  );

function IntervalsDemo() {
  const [model, setModel] = useState(opPreset);
  const [status, setStatus] = useState('');
  return (
    <div className="devkit-row">
    <div className="devkit-controls">
      <LaneEditor
        model={model}
        onChange={(next) => { setModel(next); setStatus(''); }}
        onRefuse={setStatus}
        laneLabels={CLIENTS}
        newData={(lane) => `R${lane + 1}`}
        ariaLabel="History: operations on three clients"
        describeItem={(item) => `operation ${item.data} from slot ${item.start} to ${item.end}`}
        itemLabel={(item) => item.data}
        toneOf={(item): Tone => (['amber', 'sky', 'pink'] as const)[item.lane]}
        slotWidth={OP_SLOT_W}
      />
      <p className="muted" role="status">{status || `${model.items.length} operations`}</p>
      <Button onClick={() => { setModel(opPreset()); setStatus(''); }}>Reset</Button>
    </div>
    </div>
  );
}
