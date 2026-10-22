import { Slider } from '../../components/ui';
import { RANGES, type Params } from './model';

/** The three sliders every scene on the data shares: group size, base-rate gap and score shift. Each scene keeps its own copy of the values. */
export function DataControls({ params, onChange, only }: { params: Params; onChange: (p: Params) => void; only?: ('nB' | 'gap' | 'shift')[] }) {
  const show = (k: 'nB' | 'gap' | 'shift') => !only || only.includes(k);
  return (
    <>
      {show('nB') && <Slider label="Group B applicants (of 2,000)" value={params.nB} {...RANGES.nB} format={(v) => v.toLocaleString('en-US')} onChange={(nB) => onChange({ ...params, nB })} />}
      {show('gap') && <Slider label="Base-rate gap (B repays less)" value={params.gap} {...RANGES.gap} format={(v) => `${Math.round(v * 100)} points`} onChange={(gap) => onChange({ ...params, gap })} />}
      {show('shift') && <Slider label="Score shift for B" value={params.shift} {...RANGES.shift} format={(v) => v.toFixed(1)} onChange={(shift) => onChange({ ...params, shift })} />}
    </>
  );
}
