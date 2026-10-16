import { ChipButton, Hint, Slider, TextField } from '../../components/ui';
import { GEARS_MAX, M_MAX, M_MIN } from './crt';
import { GEAR_PRESETS, formatSystem } from './presets';
import type { SystemState } from './useSystem';

/** One slider pair per gear (modulus 2 to 30, remainder 0 to m - 1), a typed field for the same system, preset chips and the status line. */
export function SystemFields({ state, presets = GEAR_PRESETS, maxGears = GEARS_MAX }: { state: SystemState; presets?: typeof GEAR_PRESETS; maxGears?: number }) {
  const { system } = state;
  return (
    <>
      {system.moduli.map((m, i) => (
        <span key={i} className="cr-gear-controls">
          <Slider label={`m${i + 1}`} value={m} min={M_MIN} max={M_MAX} onChange={(v) => state.setModulus(i, v)} />
          <Slider label={`remainder a${i + 1}`} value={system.residues[i]} min={0} max={m - 1} onChange={(v) => state.setResidue(i, v)} />
        </span>
      ))}
      <TextField label="Or type modulus:remainder pairs" value={state.draft} onChange={state.type} width={190} spellCheck={false} />
      {presets.map((p) => (
        <ChipButton key={p.id} tone="info" on={formatSystem(p.system) === formatSystem(system)} onClick={() => state.load(p.system)}>{p.label}</ChipButton>
      ))}
      <Hint><span role="status">{state.error ?? `Moduli 2 to 30, remainders 0 to m - 1; ${maxGears === GEARS_MAX ? `two to ${GEARS_MAX} gears` : `${maxGears} gears`}.`}</span></Hint>
    </>
  );
}
