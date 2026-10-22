import type { NamespaceId } from './isolation';
import type { ActionId, RingId } from './rings';
import { OPENING_ALLOWED, type DefaultAction } from './seccomp';
import type { SurfaceMode } from './surface';

export type SceneId = 'rings' | 'seccomp' | 'views' | 'kernel';
export const OPENING_SCENE: SceneId = 'rings';

export interface RingsState {
  rings: RingId[];
  action: ActionId;
}

export interface SeccompState {
  /** Allowed call names. */
  allowed: string[];
  otherwise: DefaultAction;
}

export interface ViewsState {
  namespaces: NamespaceId[];
  memoryLimitMiB: number;
  allocateMiB: number;
  pidsLimit: number;
  forks: number;
  cpuWeight: number;
}

export interface KernelState {
  mode: SurfaceMode;
}

/** Every scene's opening state as a pure function (a fresh copy each time), so a test can switch through them and see none leaks into another. */
export const initialRings = (): RingsState => ({ rings: ['process', 'namespaces', 'cgroup'], action: 'file' });
export const initialSeccomp = (): SeccompState => ({ allowed: [...OPENING_ALLOWED], otherwise: 'kill' });
export const initialViews = (): ViewsState => ({
  namespaces: ['pid', 'mount', 'net', 'uts', 'ipc'],
  memoryLimitMiB: 128,
  allocateMiB: 192,
  pidsLimit: 16,
  forks: 30,
  cpuWeight: 100,
});
export const initialKernel = (): KernelState => ({ mode: 'process' });
