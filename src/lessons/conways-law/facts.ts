/** Every number the lesson text quotes, computed from the model at the states the try-this entries walk through. */
import { CAP, PRESETS, SERVICES, dominatingLayouts, groupingCount, metrics, minFeasibleCap, moveService, reference } from './model';

const at = (key: keyof typeof PRESETS) => metrics(PRESETS[key].layout, CAP.default);
const one = at('one');
const layer = at('layer');
const journey = at('journey');
const moved = metrics(moveService(PRESETS.journey.layout, 'payments', 'A'), CAP.default);
const ref = reference(CAP.default, 1);
const TOTAL_COMPLEXITY = SERVICES.reduce((n, s) => n + s.complexity, 0);
const wide = reference(TOTAL_COMPLEXITY, 1);

export const FACTS = {
  cap: CAP.default,
  oneHandoffs: one.handoffs,
  oneInterfaces: one.interfaces,
  oneLoad: one.maxCognitive,
  onePeers: one.peers,
  layerHandoffs: layer.handoffs,
  layerInterfaces: layer.interfaces,
  layerLoadB: layer.cognitive.B,
  layerPeers: layer.peers,
  layerBeaten: dominatingLayouts(PRESETS.layer.layout).length,
  layerBeatenInCap: dominatingLayouts(PRESETS.layer.layout, CAP.default).length,
  groupings: groupingCount(),
  journeyHandoffs: journey.handoffs,
  journeyInterfaces: journey.interfaces,
  journeyLoad: journey.maxCognitive,
  journeyPeers: journey.peers,
  movedHandoffs: moved.handoffs,
  movedInterfaces: moved.interfaces,
  movedLoadA: moved.cognitive.A,
  refScore: ref.score,
  refTied: ref.tied.length,
  wideCap: TOTAL_COMPLEXITY,
  wideScore: wide.score,
  wideTeams: new Set(Object.values(wide.tied[0])).size,
  tightCap: minFeasibleCap(),
  tightScore: reference(minFeasibleCap(), 1).score,
} as const;
