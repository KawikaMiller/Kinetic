import { MemoryMapGroup, memCellRect, memPort, RefArrow } from '../../components/memory';
import type { VmFrame } from './frames';
import { SWAP_HEAD, SWAP_LINE, TITLE_Y, type SceneGeometry } from './layout';
import { PAGE_SIZE, PROCS } from './model';

export function Scene({ f, g }: { f: VmFrame; g: SceneGeometry }) {
  const { m, step, access } = f;
  const translatingNow = step?.kind === 'done' && access;

  const arrows = PROCS.flatMap((proc) =>
    m.tables[proc].flatMap((pte) => {
      const side = proc === 'A' ? 'right' : 'left';
      const from = memPort(g.layouts[proc], pte.vpn * PAGE_SIZE, side, g.at[proc]);
      if (!from) return [];
      if (pte.present) {
        const to = memCellRect(g.layouts.phys, pte.frame! * PAGE_SIZE, g.at.phys)!;
        const now = translatingNow && access.proc === proc && access.vaddr >>> 12 === pte.vpn;
        return [<RefArrow key={`${proc}-${pte.vpn}`} from={from} to={to} tone={now ? 'hi' : 'violet'} thin={!now} />];
      }
      if (pte.backing === 'swap') {
        return [<RefArrow key={`${proc}-${pte.vpn}-swap`} from={from} to={{ x: g.swap.x, y: g.swap.y, w: g.swap.w, h: g.swap.h }} color="var(--dim)" dashed thin />];
      }
      return [];
    }),
  );

  return (
    <svg className="vm-scene" viewBox={`-6 0 ${g.width + 12} ${g.height}`} width={g.width + 12} role="img" aria-label="Process A's pages, physical RAM, and process B's pages, with arrows from each present page to its frame">
      <text className="vm-title" x={g.at.A.x + g.layouts.A.cols.cell} y={TITLE_Y}>
        Process A · virtual pages
      </text>
      <text className="vm-title" x={g.at.phys.x + g.layouts.phys.cols.cell} y={TITLE_Y}>
        Physical RAM · 8 frames
      </text>
      <text className="vm-title" x={g.at.B.x + g.layouts.B.cols.cell} y={TITLE_Y}>
        Process B · virtual pages
      </text>
      <MemoryMapGroup at={g.at.A} {...g.props.A} />
      <MemoryMapGroup at={g.at.phys} {...g.props.phys} />
      <MemoryMapGroup at={g.at.B} {...g.props.B} />
      <g className="vm-swap">
        <rect x={g.swap.x} y={g.swap.y} width={g.swap.w} height={g.swap.h} rx={8} />
        <text className="vm-swap-title" x={g.swap.x + 10} y={g.swap.y + 18}>
          swap (on disk)
        </text>
        {g.swap.lines.map((line, i) => (
          <text key={i} className="vm-swap-list" x={g.swap.x + 10} y={g.swap.y + SWAP_HEAD + 8 + i * SWAP_LINE}>
            {line}
          </text>
        ))}
      </g>
      {arrows}
    </svg>
  );
}
