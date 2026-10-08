import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Button, Hint, Legend, Segmented } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import { useMeasure } from '../../core/useMeasure';
import { DOM, DOM_ROOT, RESTYLABLE, buildRenderTree, domOrder, type HideStyle, type Restylable, type Styles } from './model';

const TREE_W = 640;
const TREE_H = 310;
const LEVEL_GAP = 62;
const NODE_W = 78;
const NODE_H = 34;
const TREE_MIN_W = 600;

const SHAPE: TreeShape<string> = { root: DOM_ROOT, children: (id) => DOM[id].children };

const STYLE_OPTIONS: { value: HideStyle; label: string }[] = [
  { value: 'normal', label: 'normal' },
  { value: 'display-none', label: 'display: none' },
  { value: 'visibility-hidden', label: 'visibility: hidden' },
];
const TARGET_LABEL: Record<Restylable, string> = { nav: 'nav', note: 'p.note', list: 'ul' };
const DEFAULT_STYLES: Styles = { nav: 'display-none', note: 'visibility-hidden' };
const PAGE_ELEMENTS = ['nav', 'note', 'list'] as const;

/** The real element's inline style for the chosen way of hiding it. */
function hideStyle(style: HideStyle | undefined): CSSProperties {
  if (style === 'display-none') return { display: 'none' };
  if (style === 'visibility-hidden') return { visibility: 'hidden' };
  return {};
}

/** What the render tree says about a node, for its sub-label. */
function stateLabel(id: string, inTree: Set<string>, unpainted: Set<string>): string {
  if (!inTree.has(id)) return 'no box';
  return unpainted.has(id) ? 'box, not drawn' : 'box';
}

/** The DOM tree next to the render tree built from it, plus a real page that obeys the same styles. */
export function RenderTreeScene({ picker }: { picker: ReactNode }) {
  const [styles, setStyles] = useState<Styles>(DEFAULT_STYLES);
  const [target, setTarget] = useState<Restylable>('nav');
  const pageRef = useRef<HTMLDivElement>(null);
  const setCaption = useSetCaption();
  const { inTree, unpainted } = buildRenderTree(styles);
  // The real page's measured heights: display: none removes the box (0 px), visibility: hidden keeps it.
  const heights = useMeasure(pageRef, (el) => {
    const out: Record<string, number> = { page: Math.round(el.getBoundingClientRect().height) };
    for (const id of PAGE_ELEMENTS) out[id] = Math.round(el.querySelector(`[data-id="${id}"]`)?.getBoundingClientRect().height ?? 0);
    return out;
  });

  const boxes = domOrder().filter((id) => inTree.has(id)).length;
  useEffect(() => {
    const parts = RESTYLABLE.map((id) => {
      const s = styles[id] ?? 'normal';
      const h = heights ? `${heights[id]} px tall in the real page` : '';
      if (s === 'display-none') return <span key={id}><b>{TARGET_LABEL[id]}</b> (<code>display: none</code>) has no box at all: {h}.</span>;
      if (s === 'visibility-hidden') return <span key={id}><b>{TARGET_LABEL[id]}</b> (<code>visibility: hidden</code>) keeps its box but is not drawn: {h}, empty space.</span>;
      return null;
    }).filter((p) => p !== null);
    setCaption(
      <>The DOM has {domOrder().length} nodes; the render tree has {boxes} boxes. {parts.length ? parts.map((p, i) => <span key={i}>{i ? ' ' : ''}{p}</span>) : <>Every element has a box and is drawn.</>}{' '}
        <code>head</code> is in the DOM, but the browser&apos;s own stylesheet gives it <code>display: none</code>.</>,
      { quiet: true },
    );
  }, [styles, heights, boxes, setCaption]);

  const choose = (style: HideStyle) => setStyles((s) => ({ ...s, [target]: style }));

  return (
    <StageFrame
      height={460}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'has a box (in the render tree)' },
            { color: 'var(--dim)', label: 'no box: out of the render tree (dashed)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Element" value={target} onChange={setTarget} options={RESTYLABLE.map((id) => ({ value: id, label: TARGET_LABEL[id] }))} />
          <Segmented label="Give it" value={styles[target] ?? 'normal'} onChange={choose} options={STYLE_OPTIONS} />
          <Button onClick={() => setStyles({})}>All normal</Button>
        </>,
      ]}
    >
      <div className="stage-pad bp">
        <SectionTitle weight="regular" hint="every DOM node; dashed = no box in the render tree">DOM tree → render tree</SectionTitle>
        <WideRegion minWidth={TREE_MIN_W} label="DOM and render tree: scroll sideways to see all of it">
          <TreeSvg
            shape={SHAPE}
            layout="tidy"
            width={TREE_W}
            height={TREE_H}
            levelGap={LEVEL_GAP}
            top={30}
            markedEdgeWidth={2}
            ariaLabel="The DOM tree, with nodes that have no box drawn dashed"
            edgeMark={(_, child) => (inTree.has(child) ? { tone: 'info' } : { tone: 'dim', dashed: true })}
            renderNode={(id) => {
              const gone = !inTree.has(id);
              return (
                <g className={`bp-tn ${gone ? 'is-gone' : 'has-box'} ${unpainted.has(id) ? 'is-unpainted' : ''}`}>
                  <rect x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={7} />
                  <text y={-2} className="bp-tn-tag">{DOM[id].tag}</text>
                  <text y={11} className="bp-tn-sub">{stateLabel(id, inTree, unpainted)}</text>
                </g>
              );
            }}
          />
        </WideRegion>
        <SectionTitle weight="regular" hint="a real page with the same styles, measured in your browser">The real page</SectionTitle>
        <div className="bp-page-wrap">
          <div className="bp-page" ref={pageRef}>
            <h1 data-id="header">Heading</h1>
            <nav data-id="nav" style={hideStyle(styles.nav)}>nav: Home · Docs · Pricing</nav>
            <main>
              <p data-id="intro">p.intro: the first paragraph is plain.</p>
              <p data-id="note" style={hideStyle(styles.note)}>p.note: this one is restyled.</p>
              <ul data-id="list" style={hideStyle(styles.list)}>
                <li>list item one</li>
                <li>list item two</li>
              </ul>
            </main>
            <footer>footer</footer>
          </div>
          <dl className="bp-heights">
            {PAGE_ELEMENTS.map((id) => (
              <div key={id}>
                <dt>{TARGET_LABEL[id]}</dt>
                <dd>{heights ? `${heights[id]} px` : '…'}</dd>
              </div>
            ))}
            <div>
              <dt>page</dt>
              <dd>{heights ? `${heights.page} px` : '…'}</dd>
            </div>
          </dl>
        </div>
        <Hint block>
          Simplified: the real render tree also holds boxes for pseudo-elements and anonymous text, and skips elements such as <code>script</code>. The heights are
          measured live from the real page above, so your fonts and widths set the exact pixels.
        </Hint>
      </div>
    </StageFrame>
  );
}
