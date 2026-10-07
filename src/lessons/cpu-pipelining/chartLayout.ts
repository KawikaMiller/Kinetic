import type { Tone } from '../../core/tone';
import { formatInstr, type Instr, type Row, type StageName } from './model';

/** Plain categories, one per stage (CLAUDE.md: categorical tones, never ok/bad as decoration). */
export const STAGE_TONE: Record<StageName, Tone> = { IF: 'sky', ID: 'amber', EX: 'orange', MEM: 'violet', WB: 'muted' };

export const CHART_SIZE = { cell: 30, gap: 3, font: 11 } as const;
/** Mirrors CellGrid's row-label measure (10px mono labels). */
const LABEL_CHAR_W = 6.2;

/** The chart's natural width in drawing units, for its WideRegion. */
export const chartWidth = (labels: readonly string[], cycles: number) =>
  Math.max(...labels.map((l) => l.length)) * LABEL_CHAR_W + 8 + cycles * (CHART_SIZE.cell + CHART_SIZE.gap);

export const rowLabel = (program: readonly Instr[], row: Row) => formatInstr(program[row.pc]);
