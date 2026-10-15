import { CodePanel } from '../components/CodePanel';
import { GraphView } from '../components/GraphView';
import { SectionTitle } from '../components/Panel';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 3 kickoff kit round, extractions (#/dev/kit). */
export function DevKitTier3b() {
  return (
    <>
      <SectionTitle>Tier 3 kit · kickoff round, extractions</SectionTitle>
      <Section title="GraphView · underlay (a region in the graph's own coordinates) and labelHalo (K3-5)">
        <UnderlayDemo />
      </Section>
      <Section title="CodePanel · a long line scrolls inside the panel instead of widening a flex row (K3-6)">
        <LongLineDemo />
      </Section>
    </>
  );
}

const LONG_CODE = [
  'const url = "https://example.com/a/very/long/path/that/never/breaks/because/it/has/no/spaces/at/all/so/the/panel/must/scroll";',
  'fetch(url);',
];

function LongLineDemo() {
  return (
    <div className="devkit-row" style={{ flexWrap: 'nowrap' }}>
      <CodePanel title="flex child, 1 of 2" lines={LONG_CODE} active={0} />
      <CodePanel title="flex child, 2 of 2" lines={['ok();']} />
    </div>
  );
}

const REGION_NODES = [
  { id: 'web', label: 'web', at: { x: 90, y: 90 }, shape: 'box' as const },
  { id: 'api', label: 'api', at: { x: 250, y: 90 }, shape: 'box' as const },
  { id: 'db', label: 'db', at: { x: 410, y: 150 }, shape: 'box' as const },
];

function UnderlayDemo() {
  return (
    <GraphView
      nodes={REGION_NODES}
      edges={[
        { from: 'web', to: 'api', label: 'HTTPS' },
        { from: 'api', to: 'db', label: 'SQL' },
        { from: 'web', to: 'db', label: 'skips the api', labelAt: 0.5 },
      ]}
      directed
      width={500}
      height={200}
      box={{ w: 80, h: 38 }}
      labelHalo
      underlay={
        <>
          <rect x={190} y={30} width={280} height={150} rx={12} className="devkit-region" />
          <text x={202} y={50} className="devkit-region-label">
            private network
          </text>
        </>
      }
      ariaLabel="Three services; the api and the db sit in a shaded private-network region drawn as an underlay"
    />
  );
}
