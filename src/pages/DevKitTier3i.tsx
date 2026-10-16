import { useState } from 'react';
import { LogStream } from '../components/LogStream';
import { SeedField } from '../components/SeedField';
import { Button } from '../components/ui';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 5 to 6, agent I (#/dev/kit). */

const PRESET_SEED = 1234;
const LANES = ['lane 0', 'lane 1', 'lane 2', 'lane 3'];
const LOG_ROWS = Array.from({ length: 12 }, (_, i) => ({ id: i, at: `t=${i}`, source: LANES[i % LANES.length], text: `event ${i} on ${LANES[i % LANES.length]}` }));
const LOG_HEIGHT_PX = 150;

function SeedDemo() {
  const [seed, setSeed] = useState(42);
  return (
    <div className="controls">
      <SeedField seed={seed} onSeed={setSeed} />
      <Button onClick={() => setSeed(PRESET_SEED)}>Preset: seed {PRESET_SEED}</Button>
      <span className="mono">running seed {seed}</span>
    </div>
  );
}

function PickLogDemo() {
  const [picked, setPicked] = useState<string | number | null>(null);
  return (
    <>
      <LogStream rows={LOG_ROWS} label="Pickable demo log" maxHeight={LOG_HEIGHT_PX} selectedId={picked} onRowClick={(row) => setPicked(row.id)} />
      <p className="mono">{picked === null ? 'click a row, or Tab in and use the arrow keys' : `picked ${LOG_ROWS.find((r) => r.id === picked)?.source}`}</p>
    </>
  );
}

export function DevKitTier3i() {
  return (
    <>
      <Section title="SeedField · follows a preset's seed with no remount, so typing keeps focus (no key={seed})">
        <SeedDemo />
      </Section>
      <Section title="LogStream onRowClick · selectable rows, one tab stop, arrow keys">
        <PickLogDemo />
      </Section>
    </>
  );
}
