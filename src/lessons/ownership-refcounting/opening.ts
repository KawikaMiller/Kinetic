import { CYCLE_SCRIPT, type Mode, type Slot } from './heap';
import { PRESETS, type Line } from './ownership';
import type { OpKind } from './tray';

export type SceneId = 'counting' | 'ownership' | 'summary';

export const OPENING = {
  scene: 'counting' as SceneId,
  counting: {
    /** The scene opens with the cycle already run, so the leak is on screen at once. */
    log: CYCLE_SCRIPT,
    view: 'counting' as Mode,
    atomic: false,
    tray: { kind: 'new' as OpKind, first: 'a' as Slot, second: 'b' as Slot, weak: false },
  },
  /** The ownership scene opens on the accepted "shared ends before &mut" program. */
  ownership: { program: PRESETS[2].program as Line[], preset: PRESETS[2].id },
};
