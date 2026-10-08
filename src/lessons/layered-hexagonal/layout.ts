import type { Pt } from '../../core/geometry';
import type { View } from './model';

export const VIEW = { w: 790, h: 500 } as const;
export const BOX = { w: 140, h: 30, rx: 7 } as const;

/** The hexagon (pointy-top) the domain ring is drawn as. */
export const HEX = { cx: 390, cy: 220, r: 185 } as const;
export const hexPoints = (r: number = HEX.r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(HEX.cx + r * Math.cos(a)).toFixed(1)},${(HEX.cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const HEX_AT: Record<string, Pt> = {
  'domain/placeOrder.ts': { x: 250, y: 220 },
  'domain/order.ts': { x: 410, y: 220 },
  'domain/OrderRepository.ts': { x: 546, y: 140 },
  'domain/Notifier.ts': { x: 546, y: 300 },
  'domain/PaymentPort.ts': { x: 390, y: 380 },
  'adapters/HttpController.ts': { x: 85, y: 220 },
  'adapters/CliDriver.ts': { x: 85, y: 220 },
  'adapters/PostgresOrderRepo.ts': { x: 705, y: 140 },
  'adapters/InMemoryOrderRepo.ts': { x: 705, y: 140 },
  'adapters/EmailNotifier.ts': { x: 705, y: 300 },
  'adapters/StripeLikePayments.ts': { x: 560, y: 455 },
  'lib/orm.ts': { x: 600, y: 30 },
  'lib/memoryAudit.ts': { x: 600, y: 30 },
  'main.ts': { x: 230, y: 460 },
};

/** Bands of the layered drawing, top to bottom. */
export const BANDS = [
  { label: 'controller', y: 70 },
  { label: 'service', y: 185 },
  { label: 'repository', y: 300 },
  { label: 'database', y: 415 },
] as const;
export const BAND_H = 90;

const LAYERED_AT: Record<string, Pt> = {
  'layered/OrderController.ts': { x: 420, y: BANDS[0].y },
  'layered/OrderCli.ts': { x: 420, y: BANDS[0].y },
  'layered/OrderService.ts': { x: 420, y: BANDS[1].y },
  'layered/PostgresOrderRepo.ts': { x: 420, y: BANDS[2].y },
  'layered/InMemoryOrderRepo.ts': { x: 420, y: BANDS[2].y },
  'lib/orm.ts': { x: 420, y: BANDS[3].y },
};

export function positionOf(view: View, path: string): Pt {
  const at = (view === 'layered' ? LAYERED_AT : HEX_AT)[path];
  if (!at) throw new Error(`no position for ${path}`);
  return at;
}

/**
 * main.ts imports every adapter and the use case: that is its job. Its arrows are left out
 * of the drawing (the stage says so), because five lines from one corner cross the whole
 * hexagon. The checker and the code panel still include them.
 */
export const drawnEdge = (e: { from: string }) => e.from !== 'main.ts';

/** A file's label in the drawing: its name without the folder or extension. */
export const labelOf = (path: string) => path.split('/').pop()!.replace('.ts', '');
