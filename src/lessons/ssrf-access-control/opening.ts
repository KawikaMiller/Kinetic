import { NO_HARDENING } from './metadata';
import { FIRST_ID } from './invoices';
import { NO_DEFENCES, type ScenarioId } from './ssrf';

export type SceneId = 'fetch' | 'metadata' | 'invoices';

/** Every scene opens here, so each try-this starts from a known state. */
export const OPENING = {
  scene: 'fetch' as SceneId,
  fetch: { scenario: 'public' as ScenarioId, defences: NO_DEFENCES },
  metadata: NO_HARDENING,
  invoices: { mode: 'none' as 'none' | 'owner' | 'unguessable', id: FIRST_ID, role: 'member' as 'member' | 'admin', roleCheck: false },
};
