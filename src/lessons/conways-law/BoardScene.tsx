import { useMemo } from 'react';
import { ClassifyBoard, type ClassifyCategory, type ClassifyItem } from '../../components/ClassifyBoard';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Stat, Stats } from '../../components/ui';
import { layoutCaption, placeAll } from './captions';
import { CHANGES, PRESETS, SERVICES, TEAMS, isPlaced, layoutFrom, metrics } from './model';
import type { SceneProps } from './opening';
import { CapSlider, ConwayChips, LayoutGraph, LayoutLegend, PresetChips } from './parts';

const ITEMS: readonly ClassifyItem[] = SERVICES.map((s) => ({ id: s.id, label: `${s.id} (${s.complexity} points, ${s.skill})`, text: s.id }));
const CATEGORIES: readonly ClassifyCategory[] = TEAMS.map((t) => ({ id: t, label: `Team ${t}` }));

/** Scene 1: draw the team lines. No answer key and no score: the layout is the learner's. */
export function BoardScene({ picker, board, onBoard, cap, onCap }: SceneProps) {
  const layout = useMemo(() => layoutFrom(board.answers), [board]);
  const m = isPlaced(layout) ? metrics(layout, cap) : null;
  const pick = (key: keyof typeof PRESETS) => onBoard({ answers: { ...PRESETS[key].layout }, checked: false });
  const none = 'place all 8 services';

  return (
    <StageFrame
      height={820}
      intro={m ? layoutCaption(m, cap) : placeAll(layout)}
      introKey={`${JSON.stringify(layout)}|${cap}`}
      stats={
        <Stats>
          <Stat label="Handoffs" value={m ? m.handoffs : '–'} sub={m ? `teams touched minus 1, summed over ${CHANGES.length} changes` : none} />
          <Stat label="Interfaces" value={m ? m.interfaces : '–'} color={m && m.interfaces > 0 ? 'var(--bad)' : undefined} sub={m ? 'calls across a team line' : none} />
          <Stat label="Largest cognitive load" value={m ? m.maxCognitive : '–'} color={m ? (m.over.length ? 'var(--bad)' : 'var(--ok)') : undefined} sub={m ? `against a cap of ${cap}${m.over.length ? `: team ${m.over.join(', ')} over` : ''}` : none} />
          <Stat label="Skill peers" value={m ? m.peers : '–'} sub={m ? 'services beside one with the same skill' : none} />
        </Stats>
      }
      legend={<LayoutLegend />}
      controls={[
        <>{picker}<PresetChips layout={layout} onPick={pick} /></>,
        <><CapSlider cap={cap} onCap={onCap} /></>,
      ]}
    >
      <div className="cw-stage stage-pad">
        <Hint tone="muted" block>Put each service on a team. A call across a team line becomes an interface the two teams must agree on.</Hint>
        <ClassifyBoard mode="explore" items={ITEMS} categories={CATEGORIES} value={board} onChange={onBoard} groupLabel={(item) => `Team of ${item.text}`} />
        <LayoutGraph layout={layout} />
        <ConwayChips />
      </div>
    </StageFrame>
  );
}
