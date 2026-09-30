import { sparkMax, sparkPoints, sparkY, type SparkOpts } from '../core/spark';

/**
 * A small SVG line chart of a rolling history. For canvas lessons use
 * core/canvas `drawSpark`, which shares the same maths. Draws nothing until
 * there are two samples.
 */
export function Sparkline({
  values, width, height, color, strokeWidth = 2, refLine, className = '', ...opts
}: SparkOpts & {
  values: readonly number[];
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
  /** Dashed horizontal reference line at this value (a target or limit). */
  refLine?: number;
  className?: string;
}) {
  const pts = sparkPoints(values, width, height, opts);
  const hasData = pts.length > 1;
  const refY = refLine === undefined ? null : sparkY(refLine, sparkMax(values, opts), height, opts.pad);
  return (
    <svg className={`sparkline ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {hasData && refY !== null && <line className="sparkline-ref" x1={0} x2={width} y1={refY} y2={refY} />}
      {hasData && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={strokeWidth} />}
    </svg>
  );
}
