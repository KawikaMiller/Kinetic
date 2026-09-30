import { useState, type ReactNode } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { archPath } from '../../core/geometry';
import { A_RANGE_ON_C, ADVISORY, B_RANGE_ON_C, resolveTree, type BVersion, type FixMode } from './deps';

type NodeId = 'root' | 'A' | 'B' | 'c-top' | 'c-nested';

const W = 640;
const H = 300;
const BOX_W = 132;
const BOX_H = 40;
/** The "requires" arcs start at the bottom edge of the boxes and dip this far below them. */
const LINK_INSET = BOX_H / 2;
const LINK_DIP = 60;
/** Horizontal room so the outermost boxes aren't clipped by the viewBox. */
const SIDE_PAD = BOX_W / 2 + 12;

const FIXES: { value: FixMode; label: string }[] = [
  { value: 'none', label: 'Not yet' },
  { value: 'both', label: 'On 1.x and 2.x' },
  { value: 'latest-only', label: 'Only on 2.x' },
];
const B_VERSIONS: { value: BVersion; label: string }[] = [
  { value: '3.2.0', label: `3.2.0 (c-utils ${B_RANGE_ON_C['3.2.0']})` },
  { value: '3.3.0', label: '3.3.0 (also accepts 2.x)' },
];

export function TreeScene({ picker }: { picker: ReactNode }) {
  const [fix, setFix] = useState<FixMode>('none');
  const [bVersion, setBVersion] = useState<BVersion>('3.2.0');
  const setCaption = useSetCaption();
  const arrow = useArrowMarker('var(--faint)', { size: 6, refX: 9 });
  const { copies, stuck } = resolveTree(fix, bVersion);
  const top = copies.find((c) => c.hoisted)!;
  const nested = copies.find((c) => !c.hoisted);
  const vulnerable = copies.filter((c) => c.vulnerable).length;

  useIntroCaption(
    <>
      Your app uses A and B. <b>Both</b> depend on c-utils, but A wants {A_RANGE_ON_C} and B wants{' '}
      {B_RANGE_ON_C['3.2.0']}. No single version satisfies both, so npm installs <span className="hl violet">two copies</span>.
    </>,
  );

  const describe = (nextFix: FixMode, nextB: BVersion) => {
    const r = resolveTree(nextFix, nextB);
    const bad = r.copies.filter((c) => c.vulnerable);
    if (nextFix === 'none') {
      return (
        <>
          A security advisory hits c-utils ({ADVISORY}). {plural(bad.length, 'copy', 'copies')} in your tree{' '}
          {bad.length === 1 ? 'is' : 'are'} <span className="hl bad">vulnerable</span>, and no fix exists yet.
        </>
      );
    }
    if (r.stuck.length) {
      return (
        <>
          The fix only exists for 2.x. B@{nextB} only accepts {B_RANGE_ON_C[nextB]}, so <span className="hl bad">B's copy
          can't be fixed</span> by reinstalling: B's maintainers must widen their range (or you force it with npm{' '}
          <code>overrides</code>).
        </>
      );
    }
    return r.copies.length === 1 ? (
      <>
        B@{nextB} accepts 2.x too, so npm <span className="hl ok">dedupes</span> to one copy of c-utils and one reinstall
        fixes it.
      </>
    ) : (
      <>
        Fixes exist on both lines and both ranges allow them, so <code>npm update</code> fixes{' '}
        <span className="hl ok">every copy</span> with no change from A or B.
      </>
    );
  };

  const change = (nextFix: FixMode, nextB: BVersion) => {
    setFix(nextFix);
    setBVersion(nextB);
    setCaption(describe(nextFix, nextB));
  };

  const ids: Record<NodeId, { name: string; version: string; kind: 'app' | 'pkg' | 'c' }> = {
    root: { name: 'my-app', version: 'node_modules/', kind: 'app' },
    A: { name: 'A', version: '1.0.0', kind: 'pkg' },
    B: { name: 'B', version: bVersion, kind: 'pkg' },
    'c-top': { name: 'c-utils', version: top.version, kind: 'c' },
    'c-nested': { name: 'c-utils', version: nested?.version ?? '', kind: 'c' },
  };
  const shape: TreeShape<NodeId> = {
    root: 'root',
    children: (id) => (id === 'root' ? ['A', 'B', 'c-top'] : id === 'B' && nested ? ['c-nested'] : []),
  };
  const copyOf = (id: NodeId) => (id === 'c-top' ? top : id === 'c-nested' ? nested : undefined);
  const nodeClass = (id: NodeId) => {
    const c = copyOf(id);
    if (!c) return id === 'root' ? 'dm-node is-app' : 'dm-node';
    return `dm-node is-c ${c.vulnerable ? 'is-vuln' : 'is-fixed'} ${copies.length > 1 ? 'is-dup' : ''}`;
  };

  return (
    <StageFrame
      minWidth={560}
      height={H + 20}
      stats={
        <Stats>
          <Stat label="Copies of c-utils" value={copies.length} color={copies.length > 1 ? 'var(--violet)' : 'var(--ok)'} />
          <Stat label="Vulnerable copies" value={vulnerable} color={vulnerable ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Needs a maintainer" value={stuck.length ? stuck.join(', ') : 'no one'} color={stuck.length ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'duplicate copy' },
            { color: 'var(--bad)', label: 'vulnerable version' },
            { color: 'var(--ok)', label: 'fixed version' },
            { color: 'var(--faint)', label: 'requires (dashed)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Security fix released" value={fix} onChange={(v) => change(v, bVersion)} options={FIXES} />
        </>,
        <>
          <Segmented label="B's version" value={bVersion} onChange={(v) => change(fix, v)} options={B_VERSIONS} />
          <Hint>simplified: npm's real hoisting has more cases, but nested copies work like this</Hint>
        </>,
      ]}
    >
      <div className="dm-tree stage-pad">
        <TreeSvg
          shape={shape}
          layout="tidy"
          width={W}
          height={H}
          levelGap={110}
          top={40}
          pad={SIDE_PAD}
          ariaLabel="node_modules folder tree"
          nodeClass={nodeClass}
          renderNode={(id) => (
            <>
              <rect x={-BOX_W / 2} y={-BOX_H / 2} width={BOX_W} height={BOX_H} rx={8} />
              <text y={-3} textAnchor="middle" className="dm-node-name">
                {ids[id].name}
              </text>
              <text y={13} textAnchor="middle" className="dm-node-ver">
                {ids[id].version}
              </text>
            </>
          )}
          overlay={({ at }) => {
            // Sibling folders at the top level: a "requires" arc dips under them. B's nested
            // copy is its own child folder, so the folder edge already shows who uses it.
            const users: NodeId[] = nested ? ['A'] : ['A', 'B'];
            const target = at('c-top');
            return (
              <g>
                {arrow.def}
                {target &&
                  users.map((from) => {
                    const a = at(from);
                    return a ? (
                      <path key={from} d={archPath(a.x, target.x, a.y + LINK_INSET, -LINK_DIP)} className="dm-requires" markerEnd={arrow.url} />
                    ) : null;
                  })}
              </g>
            );
          }}
        />
      </div>
    </StageFrame>
  );
}
