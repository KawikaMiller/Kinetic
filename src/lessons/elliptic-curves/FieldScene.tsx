import { useMemo, useState, type ReactNode } from 'react';
import { integer } from '../../core/format';
import { CellGrid, type GridHighlight } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { formatPoint, onCurve } from '../../core/ecc';
import {
  DEFAULT_FIELD, FIELD_PRIMES, NO_PICKS, checkGroupLaw, claimField, curveFacts, fieldCurve, fieldEquation, fieldSum, hasseDecimal, isSingularField, nextPicks,
  type FieldCurveSpec, type GroupCheck, type Picks,
} from './model';

const PRIME_OPTIONS = FIELD_PRIMES.map((p) => ({ value: p, label: `p = ${p}` }));
const DESKTOP_CELL = 24;
const PHONE_GRID_PX = 300;
const MAX_PHONE_CELL = 22;

/** Scene 2: the same chord-and-tangent law over a finite field. Click two cells; the page shows slope, inverse and the sum. */
export function FieldScene({ picker }: { picker: ReactNode }) {
  const [spec, setSpec] = useState<FieldCurveSpec>(DEFAULT_FIELD);
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [check, setCheck] = useState<{ key: string; result: GroupCheck } | null>(null);
  const phone = useMediaQuery(PHONE_QUERY);
  const { p } = spec;
  const key = `${p}|${spec.a}|${spec.b}`;
  const curve = useMemo(() => fieldCurve(spec), [spec]);
  const facts = useMemo(() => curveFacts(spec), [spec]);
  const singular = isSingularField(spec);
  const cell = phone ? Math.min(MAX_PHONE_CELL, Math.floor(PHONE_GRID_PX / p)) : DESKTOP_CELL;
  const sum = picks.P && picks.Q ? fieldSum(spec, picks.P, picks.Q) : null;
  const shownCheck = check && check.key === key ? check.result : null;

  const setCurve = (next: FieldCurveSpec) => {
    setSpec(next);
    setPicks(NO_PICKS);
    setRefusal(null);
  };
  const setPrime = (np: number) => setCurve({ p: np, a: Math.min(spec.a, np - 1), b: Math.min(spec.b, np - 1) });

  const click = (r: number, c: number) => {
    const claim = claimField(spec, c, r);
    if (!claim.ok) {
      setRefusal(claim.message);
      return;
    }
    setRefusal(null);
    setPicks(nextPicks(picks, claim.point));
  };

  const rings: GridHighlight[] = [
    ...(picks.P ? [{ r: Number(picks.P.y), c: Number(picks.P.x), tone: 'info' as const }] : []),
    ...(picks.Q ? [{ r: Number(picks.Q.y), c: Number(picks.Q.x), tone: 'violet' as const }] : []),
  ];
  const result = sum?.result ?? null;
  const resultCell = result ? { r: Number(result.y), c: Number(result.x) } : null;

  const lines = sum
    ? [`P = ${formatPoint(picks.P)}, Q = ${formatPoint(picks.Q)}`, ...sum.lines, `P + Q = ${formatPoint(sum.result)}`]
    : picks.P
      ? [`P = ${formatPoint(picks.P)}: click a second cell (the same cell again doubles it)`]
      : [];

  const intro = refusal ?? (sum ? `${formatPoint(picks.P)} + ${formatPoint(picks.Q)} = ${formatPoint(sum.result)} over F${p}.` : `Click two cells on the curve y^2 = x^3 + ${spec.a}x + ${spec.b} over F${p}: the page adds them with the same slope formulas, using a modular inverse.`);

  return (
    <StageFrame
      height={470}
      intro={intro}
      introKey={`field|${key}|${picks.P ? formatPoint(picks.P) : '-'}|${picks.Q ? formatPoint(picks.Q) : '-'}|${refusal ?? ''}`}
      stats={
        <Stats>
          <Stat label="Points N" value={singular ? '–' : facts.count} sub={`affine points plus O, counted over all ${p * p} cells`} />
          <Stat label="Hasse interval" value={`${facts.hasse.lo} to ${facts.hasse.hi}`} sub={`|N - ${p + 1}| <= 2 sqrt(${p}) = ${hasseDecimal(p)}`} color={!singular && Math.abs(facts.count - (p + 1)) <= facts.hasse.width ? 'var(--ok)' : undefined} />
          <Stat label="P + Q" value={sum ? formatPoint(sum.result) : '–'} color={sum ? (sum.result === null ? 'var(--hi)' : 'var(--ok)') : undefined} sub={sum && sum.result === null ? 'the point at infinity O' : 'click two cells'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'a point of the curve', shape: 'square' },
            { color: 'var(--info)', label: 'P', shape: 'square' },
            { color: 'var(--violet)', label: 'Q', shape: 'square' },
            { color: 'var(--ok)', label: 'P + Q', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<number> label="Field" options={PRIME_OPTIONS} value={p} onChange={setPrime} />
        </>,
        <>
          <Slider label="a" value={spec.a} min={0} max={p - 1} onChange={(a) => setCurve({ ...spec, a })} />
          <Slider label="b" value={spec.b} min={0} max={p - 1} onChange={(b) => setCurve({ ...spec, b })} />
          <ControlGroup label="Curve">
            <ChipButton on={p === 17 && spec.a === 2 && spec.b === 2} onClick={() => setCurve(DEFAULT_FIELD)}>p = 17, a = 2, b = 2</ChipButton>
            <ChipButton on={p === 17 && spec.a === 0 && spec.b === 0} onClick={() => setCurve({ p: 17, a: 0, b: 0 })}>a = b = 0 (sharp point)</ChipButton>
          </ControlGroup>
        </>,
        <>
          <Button variant="primary" onClick={() => setCheck({ key, result: checkGroupLaw(spec) })}>Check the group law</Button>
          <Button onClick={() => { setPicks(NO_PICKS); setRefusal(null); }}>Clear points</Button>
          {refusal && <Hint tone="bad">{refusal}</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad ec-stage">
        <p className="ec-equation">{fieldEquation(spec)} <span className="ec-bits">(a {p.toString(2).length}-bit field)</span></p>
        {singular && <p className="ec-refusal" role="alert">4a^3 + 27b^2 = 0 mod {p}: this curve has a sharp point, so it is not an elliptic curve. The group-law check below reports where it fails.</p>}
        <div className="ec-grid">
          <CellGrid
            rows={p}
            cols={p}
            size={{ cell }}
            rowLabels={Array.from({ length: p }, (_, r) => r)}
            colLabels={Array.from({ length: p }, (_, c) => c)}
            ariaLabel={`Every (x, y) with y^2 = x^3 + ${spec.a}x + ${spec.b} mod ${p}; x runs across, y runs down`}
            cell={(r, c) => {
              if (resultCell && resultCell.r === r && resultCell.c === c) return { tone: 'ok', fill: 'solid' };
              if (picks.P && Number(picks.P.y) === r && Number(picks.P.x) === c) return { tone: 'info', fill: 'solid' };
              if (picks.Q && Number(picks.Q.y) === r && Number(picks.Q.x) === c) return { tone: 'violet', fill: 'solid' };
              return onCurve(curve, { x: BigInt(c), y: BigInt(r) }) ? { tone: 'muted', fill: 'solid' } : { fill: 'outline' };
            }}
            highlight={rings}
            onCellClick={click}
            cellAriaLabel={(r, c) => `x = ${c}, y = ${r}${onCurve(curve, { x: BigInt(c), y: BigInt(r) }) ? ', on the curve' : ', not on the curve'}`}
            cellTitle={(r, c) => `(${c}, ${r})`}
          />
          <div className="ec-working">
            <ConsolePanel lines={lines} title="the working" empty="click a cell of the curve" />
            {sum && sum.result === null && <p className="ec-o">The sum is the point at infinity O: the identity of the group, not a cell of the grid.</p>}
            {shownCheck && (
              <p className={shownCheck.ok ? 'ec-check is-ok' : 'ec-check is-bad'} role="status">
                {shownCheck.ok
                  ? `Holds for all ${integer(shownCheck.triples)} triples of the ${shownCheck.order} points: closure, identity, inverses and associativity (checked exhaustively, nothing sampled).`
                  : `Fails: ${shownCheck.failure!.kind}. ${shownCheck.failure!.text}.`}
              </p>
            )}
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a {p.toString(2).length}-bit field; the group has {singular ? 'no group law' : `${facts.count} points`}: broken instantly. Never copy this code: BigInt arithmetic is not constant-time</Provenance>
        <ClaimLabel kind="theorem">Hasse: |N - (p + 1)| is at most 2 sqrt(p) (argued, not run here; the page counts N for the curve you select, and the tests count it for every curve in the picker)</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
