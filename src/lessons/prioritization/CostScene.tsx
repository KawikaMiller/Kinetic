import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { costCaption } from './captions';
import { DEPENDENCY, ITEMS, bestOrder, delayCost, finishTimes, orderBy, swapsToRatioOrder, violation } from './model';
import { OPENING } from './opening';

const SHOWN_SWAPS = 6;
const label = (id: string) => ITEMS.find((i) => i.id === id)!.label;

/** Scene 2: order the items yourself and compare the delay cost with the best order. */
export function CostScene({ picker }: { picker: ReactNode }) {
  const [order, setOrder] = useState<string[]>(OPENING.cost.order);
  const [dependencyOn, setDependencyOn] = useState(OPENING.cost.dependencyOn);
  const dep = dependencyOn ? DEPENDENCY : null;
  const best = useMemo(() => bestOrder(ITEMS, dep), [dep]);
  const broken = violation(order, dep);
  const yourCost = broken ? null : delayCost(ITEMS, order);
  const swaps = useMemo(() => swapsToRatioOrder(ITEMS, order), [order]);
  const finish = finishTimes(ITEMS, order);
  const extra = yourCost === null ? null : yourCost - best.cost;
  const move = (index: number, by: number) =>
    setOrder((o) => {
      const next = [...o];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  return (
    <StageFrame
      height={720}
      intro={costCaption({ yourCost, bestCost: best.cost, broken, swaps, dependencyOn })}
      introKey={[order.join(), dependencyOn]}
      stats={
        <Stats>
          <Stat label="Your delay cost" value={yourCost ?? '–'} color={yourCost === null ? undefined : 'var(--hi)'} sub={broken ? 'order not allowed' : 'cost of delay x finish week, summed'} />
          <Stat label="Best possible" value={best.cost} color="var(--ok)" sub={dependencyOn ? 'best allowed order, by exhaustive search' : 'ordered by cost of delay over duration'} />
          <Stat label="Extra you pay" value={extra ?? '–'} color={extra ? 'var(--bad)' : undefined} sub={extra ? `${swaps.length} neighbour swaps remove it` : undefined} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'your order and its cost' }, { color: 'var(--ok)', label: 'the best order and its cost' }, { color: 'var(--bad)', label: 'the extra delay cost you pay' }, { color: 'var(--violet)', label: 'an item with a dependency' }]} />}
      controls={[
        <>
          {picker}
          <ChipButton tone="info" size="md" onClick={() => setOrder(orderBy(ITEMS, 'ratio'))}>Sort by cost of delay over duration</ChipButton>
          <ChipButton tone="info" size="md" onClick={() => setOrder(best.order)}>Use the best {dependencyOn ? 'allowed ' : ''}order</ChipButton>
          <Button onClick={() => setOrder(OPENING.cost.order)}>Reset order</Button>
        </>,
        <><Toggle label="Dependency" value={dependencyOn} onChange={setDependencyOn} off="None" on={`${label(DEPENDENCY.after)} needs ${label(DEPENDENCY.before)} first`} /></>,
      ]}
    >
      <div className="pz-stage stage-pad">
        <table className="data-table pz-table">
          <caption>Your order, one worker, one item after another</caption>
          <thead><tr><th>#</th><th>Item</th><th>Cost of delay a week</th><th>Weeks</th><th>Finishes</th><th>Move</th></tr></thead>
          <tbody>
            {order.map((id, index) => {
              const item = ITEMS.find((i) => i.id === id)!;
              const linked = dep && (id === dep.before || id === dep.after);
              return (
                <tr key={id} className={linked ? 'pz-linked' : undefined}>
                  <td>{index + 1}</td><td>{item.label}{linked ? (id === dep.after ? ' (needs the audit log)' : ' (first)') : ''}</td><td>{item.impact}</td><td>{item.effort}</td><td>week {finish[id]}</td>
                  <td className="pz-move">
                    <Button softDisabled={index === 0} aria-label={`Move ${item.label} up`} onClick={() => move(index, -1)}>Up</Button>
                    <Button softDisabled={index === order.length - 1} aria-label={`Move ${item.label} down`} onClick={() => move(index, 1)}>Down</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {extra ? (
          <table className="data-table pz-table">
            <caption>Swapping neighbours into the ratio order, cost removed by each swap (first {Math.min(SHOWN_SWAPS, swaps.length)} of {swaps.length})</caption>
            <thead><tr><th>Move up</th><th>Past</th><th>Saves</th></tr></thead>
            <tbody>
              {swaps.slice(0, SHOWN_SWAPS).map((s, i) => <tr key={i}><td>{label(s.behind)}</td><td>{label(s.ahead)}</td><td>{s.saved}</td></tr>)}
            </tbody>
          </table>
        ) : null}
        <ProvenanceRow>
          <ClaimLabel kind="standard">for one worker and independent items, ordering by cost of delay over duration minimises total delay cost: Smith (1956) and Reinertsen&apos;s work on flow, from memory, check both</ClaimLabel>
          <Provenance kind="invented">items and numbers are invented; real cost of delay is hard to estimate, which is why the next scene uses ranges</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
