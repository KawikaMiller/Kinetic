import { SeedField } from '../../components/SeedField';
import { Slider } from '../../components/ui';
import { pct } from '../../core/format';
import { RANGES, bdpOf, type LinkSetup } from './model';

/** The sliders every link scene shares: bandwidth, base round trip, buffer, random loss, and the seed. */
export function LinkControls({
  link, onChange, show,
}: {
  link: LinkSetup;
  onChange: (patch: Partial<LinkSetup>) => void;
  show: { buffer?: boolean; loss?: boolean; seed?: boolean };
}) {
  return (
    <>
      <Slider label="Bandwidth" value={link.mbps} min={RANGES.mbps.min} max={RANGES.mbps.max} step={RANGES.mbps.step} format={(v) => `${v} Mbit/s`} onChange={(mbps) => onChange({ mbps })} />
      <Slider label="Base round trip" value={link.rttMs} min={RANGES.rttMs.min} max={RANGES.rttMs.max} step={RANGES.rttMs.step} format={(v) => `${v} ms`} onChange={(rttMs) => onChange({ rttMs })} />
      {show.buffer && (
        <Slider
          label="Buffer"
          value={link.bufferBdp}
          min={RANGES.bufferBdp.min}
          max={RANGES.bufferBdp.max}
          step={RANGES.bufferBdp.step}
          format={(v) => `${v.toFixed(1)} BDP (${Math.max(1, Math.round(v * bdpOf(link)))} segments)`}
          onChange={(bufferBdp) => onChange({ bufferBdp })}
        />
      )}
      {show.loss && <Slider label="Random loss" value={link.loss} min={RANGES.loss.min} max={RANGES.loss.max} step={RANGES.loss.step} format={(v) => pct(v, 2)} onChange={(loss) => onChange({ loss })} />}
      {show.seed && <SeedField seed={link.seed} onSeed={(seed) => onChange({ seed })} />}
    </>
  );
}
