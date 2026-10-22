/** Every number the lesson text quotes, computed from the model at the states the try-this entries walk through. */
import { joinList } from '../../core/format';
import { choose, startWalk } from '../../core/scenario';
import { ACTIONS, DIAGNOSES, POLICIES, SUPPORT_EDGES, read, toggle, type NodeId } from './model';
import { METER, STORAGE } from './scenario';

const none: ReadonlySet<NodeId> = new Set();
const without = (...ids: NodeId[]) => ids.reduce(toggle, none);
const start = read(none);
const noP1 = read(without('P1'));
const noP4 = read(without('P4'));
const noP3 = read(without('P3'));
const ledger = (ids: string[]) => ids.reduce((w, id) => choose(STORAGE, w, id), startWalk(STORAGE)).meters;
const hybrid = ledger(['hybrid', 'exception']);
const consolidate = ledger(['consolidate', 'hard-rule']);
const teamChoice = ledger(['team-choice', 'advice']);

export const FACTS = {
  actions: ACTIONS.length,
  policies: POLICIES.length,
  diagnoses: DIAGNOSES.length,
  supportEdges: SUPPORT_EDGES.length,
  startOrphans: start.orphans.length,
  startUncovered: start.uncovered.length,
  startConflicts: start.conflicts.length,
  p1Orphans: joinList(noP1.orphans),
  p1OrphanCount: noP1.orphans.length,
  p4Orphans: joinList(noP4.orphans),
  p4Conflicts: noP4.conflicts.length,
  p3Orphans: joinList(noP3.orphans),
  p3Uncovered: joinList(noP3.uncovered),
  hybridAutonomy: hybrid[METER.autonomy],
  hybridEffort: hybrid[METER.effort],
  hybridDrag: hybrid[METER.drag],
  consolidateAutonomy: consolidate[METER.autonomy],
  consolidateEffort: consolidate[METER.effort],
  consolidateDrag: consolidate[METER.drag],
  teamChoiceAutonomy: teamChoice[METER.autonomy],
  teamChoiceEffort: teamChoice[METER.effort],
  teamChoiceDrag: teamChoice[METER.drag],
} as const;
