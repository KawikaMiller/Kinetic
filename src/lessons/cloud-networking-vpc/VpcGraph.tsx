import { motion } from 'motion/react';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { ipToString } from '../../core/ipv4';
import { SPRING } from '../../core/motion';
import { CANVAS, NODES, NODE_BOX, NODE_LABEL, SUBNET_BOX, SUBNET_TINT, VPC_BOX, edgeKey, linksFor, positionOf } from './layout';
import {
  SUBNETS, SUBNET_CIDR, VPC_NET, VPC_PREFIX, behaviourOf, type Behaviour, cidrText, ipOf, tableOf, INSTANCES,
  type Flow, type Hop, type NodeId, type SubnetId, type VpcConfig,
} from './vpc';

/** The narrowest container at which the drawing's smallest text stays at 9px or more. */
export const VPC_MIN_WIDTH = 600;
const PACKET_LIFT = 34;

const BEHAVES: Record<Behaviour, string> = { public: 'public', private: 'private', isolated: 'isolated' };

/** The default route of a subnet's table as text, or the absence of one. */
function defaultRouteText(cfg: VpcConfig, subnet: SubnetId): string {
  const d = tableOf(cfg, subnet).find((r) => r.prefix === 0);
  return d ? `${d.target === 'igw' ? 'internet gateway' : 'NAT gateway'}` : 'none';
}

function Underlay({ cfg, active, dropped, packet }: { cfg: VpcConfig; active: SubnetId | null; dropped: SubnetId | null; packet: { x: number; y: number; label: string } | null }) {
  return (
    <>
      <rect className="vpc-box" x={VPC_BOX.x} y={VPC_BOX.y} width={VPC_BOX.w} height={VPC_BOX.h} rx={14} />
      <text className="vpc-box-label" x={VPC_BOX.x + VPC_BOX.w - 10} y={VPC_BOX.y + 13} textAnchor="end">
        VPC {cidrText({ net: VPC_NET, prefix: VPC_PREFIX })}
      </text>
      {SUBNETS.map((s) => {
        const b = SUBNET_BOX[s];
        const cls = ['vpc-subnet', `is-${SUBNET_TINT[s]}`, active === s && 'is-active', dropped === s && 'is-drop'].filter(Boolean).join(' ');
        return (
          <g key={s}>
            <rect className={cls} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} />
            <text className="vpc-subnet-name" x={b.x + 10} y={b.y + 15}>
              {s} {cidrText(SUBNET_CIDR[s])}
            </text>
            <text className="vpc-subnet-note" x={b.x + 10} y={b.y + 29}>
              default route: {defaultRouteText(cfg, s)}
            </text>
            <text className="vpc-subnet-note" x={b.x + 10} y={b.y + 42}>
              behaves as {BEHAVES[behaviourOf(cfg, s)]}
            </text>
          </g>
        );
      })}
      {INSTANCES.map((id) => {
        const p = positionOf(cfg, id);
        return (
          <g key={id}>
            <text className="vpc-addr" x={p.x} y={p.y + 27} textAnchor="middle">{ipToString(ipOf(cfg, id))}</text>
            {cfg.instances[id].publicIp && (
              <text className="vpc-addr is-public" x={p.x} y={p.y + 38} textAnchor="middle">+ public IP</text>
            )}
          </g>
        );
      })}
      {packet && (
        <motion.g initial={{ x: packet.x, y: packet.y - PACKET_LIFT }} animate={{ x: packet.x, y: packet.y - PACKET_LIFT }} transition={SPRING.soft}>
          <rect className="vpc-packet" x={-34} y={-9} width={68} height={18} rx={9} />
          <text className="vpc-packet-text" x={0} y={4} textAnchor="middle">{packet.label}</text>
        </motion.g>
      )}
    </>
  );
}

/**
 * The VPC drawn: subnet boxes under the nodes, the hops revealed so far marked on it. `shown` is how many
 * hops of `hops` have happened; 0 draws only the packet at its start.
 */
export function VpcGraph({ cfg, flow, hops, shown, ariaLabel }: { cfg: VpcConfig; flow: Flow; hops: Hop[]; shown: number; ariaLabel: string }) {
  const revealed = hops.slice(0, shown);
  const current = shown > 0 ? hops[shown - 1] : null;
  const passed = new Set(revealed.filter((h) => h.verdict !== 'drop').map((h) => h.node));
  const droppedAt = revealed.find((h) => h.verdict === 'drop') ?? null;
  const startNode = flow.from as NodeId;
  const packetNode = current?.node ?? startNode;
  const packetAt = positionOf(cfg, packetNode);
  const walked = [startNode, ...revealed.map((h) => h.node)].filter((n, i, all) => i === 0 || all[i - 1] !== n);
  const used = new Set(walked.slice(1).map((n, i) => edgeKey(walked[i], n)));
  const links = linksFor(cfg);

  const nodeMark = (id: string): GraphNodeMark | null => {
    const n = id as NodeId;
    if (droppedAt?.node === n) return { tone: 'bad', fill: 'solid' };
    if (current?.node === n) return { tone: 'hi', fill: 'solid' };
    return passed.has(n) ? { tone: 'ok', fill: 'tint' } : null;
  };
  const edgeMark = (_: unknown, i: number): GraphEdgeMark => {
    const [a, b] = links[i];
    return used.has(edgeKey(a, b)) ? { tone: 'ok', width: 5 } : { tone: 'dim', width: 2 };
  };

  return (
    <WideRegion minWidth={VPC_MIN_WIDTH} label="The VPC drawing: scroll sideways to see all of it">
      <GraphView
        nodes={NODES.map((id) => ({ id, label: NODE_LABEL[id], at: positionOf(cfg, id), shape: 'box' as const }))}
        edges={links.map(([from, to]) => ({ from, to }))}
        width={CANVAS.width}
        height={CANVAS.height}
        box={NODE_BOX}
        underlay={
          <Underlay
            cfg={cfg}
            active={current?.subnet ?? null}
            dropped={droppedAt?.subnet ?? null}
            packet={{ x: packetAt.x, y: packetAt.y, label: `tcp ${flow.port}` }}
          />
        }
        nodeMark={nodeMark}
        edgeMark={edgeMark}
        ariaLabel={ariaLabel}
        className="vpc-graph"
      />
    </WideRegion>
  );
}
