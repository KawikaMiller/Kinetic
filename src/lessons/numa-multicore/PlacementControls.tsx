import { Segmented, Toggle } from '../../components/ui';
import type { Init, Policy } from './numa';

const POLICIES: { value: Policy; label: string }[] = [
  { value: 'first-touch', label: 'first touch' },
  { value: 'interleave', label: 'interleave' },
  { value: 'bind0', label: 'bind to node 0' },
];

/** The page placement policy and who initialises the array: shared by the first-touch and bandwidth scenes. */
export function PlacementControls({ policy, init, onPolicy, onInit }: { policy: Policy; init: Init; onPolicy: (p: Policy) => void; onInit: (i: Init) => void }) {
  return (
    <>
      <Segmented label="Placement policy" value={policy} onChange={onPolicy} options={POLICIES} />
      <Toggle label="Who initialises" value={init === 'parallel'} onChange={(on) => onInit(on ? 'parallel' : 'serial')} off="the main thread fills the array" on="each worker fills its own chunk" />
    </>
  );
}
