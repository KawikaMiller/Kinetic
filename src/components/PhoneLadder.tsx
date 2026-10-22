import { useMemo, type ComponentProps } from 'react';
import { ladderMinWidth } from '../core/ladderWidth';
import { SequenceDiagram } from './SequenceDiagram';
import { WideRegion } from './WideRegion';

/**
 * A SequenceDiagram that keeps its note text readable on a phone: it sits in a WideRegion wide enough for the 11px notes
 * (core/ladderWidth), so the diagram scrolls sideways instead of shrinking them under 8px.
 */
export function PhoneLadder(props: ComponentProps<typeof SequenceDiagram>) {
  const { actors, messages, width } = props;
  const minWidth = useMemo(() => ladderMinWidth(actors, messages, width), [actors, messages, width]);
  return (
    <WideRegion minWidth={minWidth} label={`${props.ariaLabel ?? 'Ladder diagram'}: scroll sideways to see all of it`}>
      <SequenceDiagram {...props} />
    </WideRegion>
  );
}
