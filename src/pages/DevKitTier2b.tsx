import { useMemo, useState } from 'react';
import { ConfusionMatrix, type ConfusionCell } from '../components/ConfusionMatrix';
import { SectionTitle } from '../components/Panel';
import { ChipButton, Slider, Toggle } from '../components/ui';
import { twoClassScores } from '../core/fixtures/datasets';
import { confusionAt } from '../core/stats';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 2 P0-b kit, rendered after DevKitTier2 (#/dev/kit). */
export function DevKitTier2b() {
  return (
    <>
      <SectionTitle>Tier 2 kit · P0-b</SectionTitle>
      <Section title="ConfusionMatrix · seeded twoClassScores, a threshold slider, share toggle and a highlighted cell">
        <ConfusionDemo />
      </Section>
    </>
  );
}

const SCORES = twoClassScores({ seed: 7, positives: 60, negatives: 240, separation: 2 });
const CELLS: ConfusionCell[] = ['tp', 'fp', 'fn', 'tn'];

function ConfusionDemo() {
  const [threshold, setThreshold] = useState(0.5);
  const [share, setShare] = useState(false);
  const [highlight, setHighlight] = useState<ConfusionCell | undefined>('fn');
  const counts = useMemo(() => confusionAt(SCORES, threshold), [threshold]);
  return (
    <div className="devkit-row">
      <ConfusionMatrix {...counts} labels={{ positive: 'spam', negative: 'not spam' }} share={share} highlight={highlight} />
      <div className="devkit-controls">
        <Slider label="Threshold" value={threshold} min={0} max={1} step={0.01} onChange={setThreshold} format={(v) => v.toFixed(2)} />
        <Toggle label="Cells show" value={share} onChange={setShare} off="Counts" on="Counts + share" />
        <div className="control-group-items">
          {CELLS.map((c) => (
            <ChipButton key={c} on={highlight === c} onClick={() => setHighlight(highlight === c ? undefined : c)}>
              {c.toUpperCase()}
            </ChipButton>
          ))}
        </div>
      </div>
    </div>
  );
}
