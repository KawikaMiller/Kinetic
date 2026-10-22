import { ClassifyBoard, type ClassifyCategory, type ClassifyItem } from '../../components/ClassifyBoard';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { placeCaption, stageLabel } from './captions';
import { COMPONENTS, REFERENCE, STAGES, benefitCounts, placementOf } from './model';
import type { SceneProps } from './opening';

const ITEMS: readonly ClassifyItem[] = COMPONENTS.map((c) => ({
  id: c.id,
  label: c.label,
  text: c.label,
  explanation: `${c.label[0].toUpperCase()}${c.label.slice(1)} has a yearly benefit of ${c.benefit} in this model if it sets the product apart; place it where you think it sits today.`,
}));
const CATEGORIES: readonly ClassifyCategory[] = STAGES.map((s) => ({ id: s.id, label: s.label }));

/** Scene 1: place each component on the evolution axis. The placement decides whether its benefit counts. */
export function PlaceScene({ picker, board, onBoard }: SceneProps) {
  const placement = placementOf(board.answers);
  const items = COMPONENTS.map((c) => ({ id: c.id, label: c.label, stage: placement[c.id] }));
  const counted = items.filter((i) => benefitCounts(i.stage)).length;
  const stagesKey = items.map((i) => i.stage).join('|');

  return (
    <StageFrame
      height={640}
      intro={placeCaption(items)}
      introKey={stagesKey}
      stats={
        <Stats>
          <Stat label="Benefits counted" value={`${counted} of ${COMPONENTS.length}`} color={counted > 0 ? 'var(--hi)' : undefined} sub="only Genesis and Custom-built count" />
          {items.map((i) => <Stat key={i.id} label={i.label} value={stageLabel(i.stage)} sub={benefitCounts(i.stage) ? 'sets you apart: benefit counts' : 'table stakes: benefit is zero'} />)}
        </Stats>
      }
      controls={[<>{picker}</>]}
    >
      <div className="bb-stage stage-pad">
        <Hint tone="muted" block>Where does each component sit on the evolution axis? All three open in Product, the neutral stage. Placing one in Genesis or Custom-built says it sets you apart, and only then does its yearly benefit count.</Hint>
        <ClassifyBoard mode="explore" items={ITEMS} categories={CATEGORIES} value={board} onChange={onBoard} reference={REFERENCE} groupLabel={(item) => `Stage of ${item.text}`} />
        <ProvenanceRow>
          <Provenance kind="invented">the components, the product and every figure are made up; no real product, price or salary appears</Provenance>
          <ClaimLabel kind="view">placing components on an evolution axis, from Genesis to Commodity, follows Wardley-style maps and is one way to think about what to build</ClaimLabel>
          <Provenance kind="from-memory">Simon Wardley&apos;s evolution axis; verify against his published material</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
