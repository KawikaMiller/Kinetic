import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { CANVAS, type Link, type Pt } from './topology';

/** The routers and links of a scene, drawn on the lesson's fixed 340 by 220 canvas. */
export function RouterGraph({
  routers, positions, links, edgeMark, nodeMark, onLinkClick, ariaLabel,
}: {
  routers: readonly string[];
  positions: Record<string, Pt>;
  links: readonly Link[];
  edgeMark?: (link: Link) => GraphEdgeMark | null | undefined;
  nodeMark?: (router: string) => GraphNodeMark | null | undefined;
  onLinkClick?: (link: Link) => void;
  ariaLabel: string;
}) {
  return (
    <GraphView
      nodes={routers.map((id) => ({ id, at: positions[id] }))}
      edges={links.map((l) => ({ from: l.a, to: l.b, weight: l.cost }))}
      width={CANVAS.width}
      height={CANVAS.height}
      edgeMark={(_, i) => edgeMark?.(links[i])}
      nodeMark={nodeMark}
      onEdgeClick={onLinkClick ? (_, i) => onLinkClick(links[i]) : undefined}
      edgeAriaLabel={(_, i) => `Link ${links[i].a} to ${links[i].b}, cost ${links[i].cost}${links[i].up ? '' : ', cut'}`}
      ariaLabel={ariaLabel}
      className="ra-graph"
    />
  );
}
