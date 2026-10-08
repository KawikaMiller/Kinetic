import type { ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { Segmented, Toggle } from '../../components/ui';
import { CSS_LABEL, SCRIPT_LABEL } from './frames';
import { CSS_IDS, SCRIPT_IDS, type Config, type CssId, type CssMode, type HeroMode, type ScriptId, type ScriptMode } from './model';

const SCRIPT_MODES: { value: ScriptMode; label: string }[] = [
  { value: 'sync', label: 'sync' },
  { value: 'async', label: 'async' },
  { value: 'defer', label: 'defer' },
  { value: 'module', label: 'module' },
];
const CSS_MODES: { value: CssMode; label: string }[] = [
  { value: 'normal', label: 'normal' },
  { value: 'print', label: 'media=print' },
  { value: 'inline', label: 'inlined' },
];
const HERO_MODES: { value: HeroMode; label: string }[] = [
  { value: 'css', label: 'CSS background' },
  { value: 'preload', label: 'preload hint' },
];

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="crp-row">
      <code className="crp-row-name">{name}</code>
      {children}
    </div>
  );
}

/** The <head> as a set of toggles: how each script, stylesheet, the font and the hero image load. */
export function HeadEditor({ config, onChange }: { config: Config; onChange: (next: Config) => void }) {
  const setScript = (id: ScriptId, mode: ScriptMode) => onChange({ ...config, scripts: { ...config.scripts, [id]: mode } });
  const setCss = (id: CssId, mode: CssMode) => onChange({ ...config, css: { ...config.css, [id]: mode } });
  return (
    <div className="crp-editor">
      <SectionTitle weight="regular" hint="edit the head; the load re-solves">Scripts</SectionTitle>
      {SCRIPT_IDS.map((id) => (
        <Row key={id} name={SCRIPT_LABEL[id]}>
          <Segmented ariaLabel={`${SCRIPT_LABEL[id]} loading`} value={config.scripts[id]} onChange={(m) => setScript(id, m)} options={SCRIPT_MODES} />
        </Row>
      ))}
      <SectionTitle weight="regular" hint="media=print swaps itself in on load">Stylesheets</SectionTitle>
      {CSS_IDS.map((id) => (
        <Row key={id} name={CSS_LABEL[id]}>
          <Segmented ariaLabel={`${CSS_LABEL[id]} loading`} value={config.css[id]} onChange={(m) => setCss(id, m)} options={CSS_MODES} />
        </Row>
      ))}
      <SectionTitle weight="regular" hint="found late by the CSS, unless hinted">Web font and hero image</SectionTitle>
      <Row name="inter.woff2">
        <Toggle label="Preload" value={config.fontPreload} onChange={(v) => onChange({ ...config, fontPreload: v })} off="no hint" on="preload" />
        <Toggle label="font-display" value={config.fontDisplay === 'swap'} onChange={(v) => onChange({ ...config, fontDisplay: v ? 'swap' : 'block' })} off="block" on="swap" />
      </Row>
      <Row name="hero.jpg">
        <Segmented ariaLabel="hero.jpg discovery" value={config.hero} onChange={(h) => onChange({ ...config, hero: h })} options={HERO_MODES} />
      </Row>
    </div>
  );
}
