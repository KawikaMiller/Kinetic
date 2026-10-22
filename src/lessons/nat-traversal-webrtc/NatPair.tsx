import { ChipButton, ControlGroup, Hint, Segmented, Toggle } from '../../components/ui';
import type { Scenario } from './ice';
import { PRESETS, presetOf } from './init';
import { NAT_NAME, NAT_TYPES, type NatType } from './nat';

const NAT_OPTIONS = NAT_TYPES.map((t) => ({ value: t, label: NAT_NAME[t] }));

/** The two NAT pickers, the presets and (optionally) the same-LAN switch: the controls scenes 2 to 4 share. */
export function NatPair({
  value, onChange, presets = true, lan = false,
}: {
  value: Scenario;
  onChange: (s: Scenario) => void;
  presets?: boolean;
  lan?: boolean;
}) {
  const set = (patch: Partial<Scenario>) => onChange({ ...value, ...patch });
  const active = presetOf(value);
  return (
    <>
      <Segmented<NatType> label="NAT of peer A" value={value.a} options={NAT_OPTIONS} onChange={(a) => set({ a })} />
      <Segmented<NatType> label="NAT of peer B" value={value.b} options={NAT_OPTIONS} onChange={(b) => set({ b })} />
      {lan && <Toggle label="Where the peers are" value={value.sameLan} off="two networks" on="the same LAN" onChange={(sameLan) => set({ sameLan })} />}
      {lan && value.sameLan && <Hint tone="muted">On one LAN both peers share one router, so the two NAT pickers change nothing here. This model does not do hairpinning (a check through the router's public address), so the host pair is the one that answers.</Hint>}
      {presets && (
        <ControlGroup label="Presets" inline>
          {PRESETS.filter((p) => lan || !p.scenario.sameLan).map((p) => (
            <ChipButton key={p.id} on={active === p.id} onClick={() => onChange({ ...p.scenario })}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>
      )}
    </>
  );
}
