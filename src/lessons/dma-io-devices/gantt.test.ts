import { describe, expect, it } from 'vitest';
import { isInstant } from '../../core/gantt';
import { ganttBars } from './gantt';
import { BUS_MODES, MODES, SIZES, chartEnd, plan } from './transfer';

describe('the Gantt bars', () => {
  it('no two bars on one lane overlap (instants excepted), and all sit inside the chart', () => {
    for (const bytes of SIZES) {
      for (const mode of MODES) {
        for (const bus of BUS_MODES) {
          const p = plan(mode, bytes, bus);
          const bars = ganttBars(p, bus);
          const end = chartEnd(bytes);
          for (const lane of ['cpu', 'bus', 'device']) {
            const spans = bars.filter((b) => b.lane === lane && !isInstant(b)).sort((a, b) => a.start - b.start);
            spans.forEach((b, i) => {
              expect(b.start, `${mode} ${bus} ${bytes} ${b.id}`).toBeGreaterThanOrEqual(0);
              expect(b.end).toBeLessThanOrEqual(end);
              if (i > 0) expect(b.start, `${mode} ${bus} ${bytes} ${b.id} vs ${spans[i - 1].id}`).toBeGreaterThanOrEqual(spans[i - 1].end);
            });
          }
        }
      }
    }
  });

  it('DMA draws a register-write instant and an interrupt instant; irq-PIO only the interrupt; PIO neither', () => {
    const count = (mode: (typeof MODES)[number]) => ganttBars(plan(mode, 4096, 'burst'), 'burst').filter(isInstant).map((b) => b.label).sort();
    expect(count('dma')).toEqual(['interrupt', 'regs written']);
    expect(count('irq-pio')).toEqual(['interrupt']);
    expect(count('pio')).toEqual([]);
  });
});
