import { useState } from 'react';
import { ColorField } from '../components/ColorField';
import { SectionTitle } from '../components/Panel';
import { contrastRatio, formatRatio, grade } from '../core/contrast';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the wave 3→4 kit round, rendered after DevKitTier2b (#/dev/kit). */
export function DevKitTier2c() {
  return (
    <>
      <SectionTitle>Tier 2 kit · wave 3→4</SectionTitle>
      <Section title="ColorField + core/contrast · pick two colours, read the WCAG 2.x ratio and grade">
        <ContrastDemo />
      </Section>
    </>
  );
}

function ContrastDemo() {
  const [fg, setFg] = useState('#777777'); // allow-color: demo input, the WCAG worked example
  const [bg, setBg] = useState('#ffffff'); // allow-color: demo input
  const ratio = contrastRatio(fg, bg);
  const g = grade(ratio);
  return (
    <div className="devkit-row">
      <ColorField label="Text" value={fg} onChange={setFg} />
      <ColorField label="Background" value={bg} onChange={setBg} />
      <span>
        {formatRatio(ratio)} · AA {g.aaNormal ? 'pass' : g.aaLarge ? 'large text only' : 'fail'} · AAA {g.aaaNormal ? 'pass' : 'fail'}
      </span>
    </div>
  );
}
