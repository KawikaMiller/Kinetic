/** Where everything sits in the drawing, and which links exist for a given config. Pure, so a test can check the geometry. */
import type { Pt } from '../../components/GraphView';
import { FLOWS, INSTANCES, traceFlow, type InstanceId, type NodeId, type SubnetId, type VpcConfig } from './vpc';

export const CANVAS = { width: 640, height: 400 } as const;
export const VPC_BOX = { x: 196, y: 2, w: 436, h: 390 } as const;
export const SUBNET_BOX: Record<SubnetId, { x: number; y: number; w: number; h: number }> = {
  public: { x: 208, y: 22, w: 412, h: 128 },
  private: { x: 208, y: 158, w: 412, h: 106 },
  isolated: { x: 208, y: 272, w: 412, h: 106 },
};
const ROW_Y: Record<SubnetId, number> = { public: 98, private: 216, isolated: 326 };
const SLOT: Record<InstanceId, { x: number; dy: number }> = { web: { x: 400, dy: -10 }, app: { x: 480, dy: 0 }, db: { x: 560, dy: 10 } };
export const NODE_BOX = { w: 72, h: 30 } as const;
const FIXED: Record<'internet' | 'igw' | 'nat', Pt> = { internet: { x: 44, y: 200 }, igw: { x: 128, y: 92 }, nat: { x: 290, y: 122 } };

export const positionOf = (cfg: VpcConfig, id: NodeId): Pt => {
  if (id === 'internet' || id === 'igw' || id === 'nat') return FIXED[id];
  return { x: SLOT[id].x, y: ROW_Y[cfg.instances[id].subnet] + SLOT[id].dy };
};

export const NODES: readonly NodeId[] = ['internet', 'igw', 'nat', ...INSTANCES];
export const NODE_LABEL: Record<NodeId, string> = { internet: 'Internet', igw: 'IGW', nat: 'NAT gw', web: 'web', app: 'app', db: 'db' };

const SKELETON: [NodeId, NodeId][] = [['internet', 'igw'], ['igw', 'nat'], ['igw', 'web'], ['nat', 'app'], ['web', 'app'], ['app', 'db']];
export const edgeKey = (a: NodeId, b: NodeId) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The links drawn: the three-tier skeleton plus any link some flow actually uses in this config. */
export function linksFor(cfg: VpcConfig): [NodeId, NodeId][] {
  const seen = new Map<string, [NodeId, NodeId]>();
  const add = (a: NodeId, b: NodeId) => {
    if (a !== b && !seen.has(edgeKey(a, b))) seen.set(edgeKey(a, b), [a, b]);
  };
  SKELETON.forEach(([a, b]) => add(a, b));
  for (const flow of FLOWS) {
    const { path } = traceFlow(cfg, flow);
    for (let i = 1; i < path.length; i++) add(path[i - 1], path[i]);
  }
  return [...seen.values()];
}

export const SUBNET_TINT: Record<SubnetId, 'sky' | 'amber' | 'pink'> = { public: 'sky', private: 'amber', isolated: 'pink' };
