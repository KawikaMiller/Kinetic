import { DEFAULT_PARAMS, type Fault, type Params } from './model';

/** The scenes are the fault states: a normal run, one slow handler, one crash. */
export type Scene = 'normal' | 'slow' | 'crash';

export const SCENE_FAULT: Record<Scene, Fault> = { normal: 'none', slow: 'hog', crash: 'crash' };

/** What each scene opens on: a pure function, so a scene never opens on another scene's state. Every scene starts on OS threads, so the fault's effect is the contrast the learner makes. */
export const openingFor = (scene: Scene): Params => ({ ...DEFAULT_PARAMS, runtime: 'threads', fault: SCENE_FAULT[scene], net: false });

export const SCENES: Scene[] = ['normal', 'slow', 'crash'];
