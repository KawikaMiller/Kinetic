import { CodePanel } from '../components/CodePanel';
import { SectionTitle } from '../components/Panel';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 3 kickoff kit round, extractions (#/dev/kit). */
export function DevKitTier3b() {
  return (
    <>
      <SectionTitle>Tier 3 kit · kickoff round, extractions</SectionTitle>
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
