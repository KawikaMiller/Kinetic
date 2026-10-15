import { Fragment, type ReactNode } from 'react';
import { ChipButton, ControlGroup, Segmented, Slider } from '../../components/ui';
import type { Config } from './config';
import { MAX_LENGTH, RANGES } from './generator';
import { BUGS, PROPERTIES, type PropId } from './sorts';
import { SeedField } from '../../components/SeedField';

/** The function, property and generator controls that scenes 1 and 2 share: the same rows, the same state. */
export function configRows(picker: ReactNode, config: Config, set: (patch: Partial<Config>) => void, extra?: ReactNode): ReactNode[] {
  const toggle = (id: PropId) => set({ props: config.props.includes(id) ? config.props.filter((p) => p !== id) : [...config.props, id] });
  return [
    <Fragment key="fn">
      {picker}
      <ControlGroup label="Function under test">
        {BUGS.map((b) => (
          <ChipButton key={b.id} tone={b.id === 'correct' ? 'ok' : 'info'} on={config.fn === b.id} onClick={() => set({ fn: b.id })}>
            {b.label}
          </ChipButton>
        ))}
      </ControlGroup>
    </Fragment>,
    <ControlGroup key="props" label="Properties to check">
      {PROPERTIES.map((p) => (
        <ChipButton key={p.id} tone="violet" on={config.props.includes(p.id)} onClick={() => toggle(p.id)}>
          {p.label}
        </ChipButton>
      ))}
    </ControlGroup>,
    <Fragment key="gen">
      <Slider label="Longest array" value={config.maxLength} min={0} max={MAX_LENGTH} onChange={(maxLength) => set({ maxLength })} format={(v) => `${v} values`} />
      <Segmented label="Values" value={config.range} onChange={(range) => set({ range })} options={RANGES.map((r) => ({ value: r.id, label: r.label }))} />
      <SeedField seed={config.seed} onSeed={(seed) => set({ seed })} />
      {extra}
    </Fragment>,
  ];
}
