import type { Algorithm, RuleResult } from './combine';
import type { ModelId } from './models';
import { defaultOrg, type Action, type RequirementId } from './org';

export type SceneId = 'ask' | 'disagree' | 'count' | 'combine';

/** Every scene opens here. The organisation is shared by the first two scenes and lives in the Stage. */
export const OPENING = {
  scene: 'ask' as SceneId,
  org: defaultOrg,
  ask: { model: 'acl' as ModelId, user: 'alice', action: 'read' as Action, doc: 'notes' },
  requirement: 'dept-clearance' as RequirementId,
  count: { departments: 2, levels: 3, requirement: 'dept-clearance' as RequirementId },
  combine: { algorithm: 'deny-overrides' as Algorithm, rules: ['permit', 'deny'] as [RuleResult, RuleResult] },
};
