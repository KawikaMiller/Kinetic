export interface Preset {
  label: string;
  text: string;
}

export const STEPPER_PRESETS: readonly Preset[] = [
  { label: 'succ 1', text: '(λn.λf.λx.f (n f x)) 1' },
  { label: 'K a b', text: '(λx.λy.x) a b' },
  { label: 'twice', text: '(λf.λx.f (f x)) (λz.z z) w' },
  { label: 'id id', text: '(λx.x) (λy.y)' },
];

export const CAPTURE_PRESETS: readonly Preset[] = [
  { label: '(λx.λy.x) y', text: '(λx.λy.x) y' },
  { label: '(λx.λy.x y) y', text: '(λx.λy.x y) y' },
];
