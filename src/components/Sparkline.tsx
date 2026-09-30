import { sparkMax, sparkPoints, type SparkOpts } from '../core/spark';

/**
 * A small SVG line chart of a rolling history. For canvas lessons use
 * core/canvas `drawSpark`, which shares the same maths.
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
  const max = sparkMax(values, opts) || 1;
  const refY = refLine === undefined ? null : height - (refLine / max) * height;
  return (
    <svg className={`sparkline ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {refY !== null && <line className="sparkline-ref" x1={0} x2={width} y1={refY} y2={refY} />}
      {pts.length > 1 && (
        <polyline
          points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
