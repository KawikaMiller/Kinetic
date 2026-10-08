import { useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { strategyCaption } from './frames';
import { NEW_CARRIER, ORDER_TOTALS, addedLines, carrier, carriersFor, shippingCode, type CarrierId, type StrategyMode } from './model';

export function StrategyScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<StrategyMode>('strategies');
  const [added, setAdded] = useState(false);
  const [chosen, setChosen] = useState<CarrierId>('standard');
  const [total, setTotal] = useState(120);
  const id = carriersFor(added).some((c) => c.id === chosen) ? chosen : 'standard';
  const c = carrier(id);
  useIntroCaption(strategyCaption(mode, id, total, added), [mode, added, id, total]);
  const lines = shippingCode(mode, added);
  const fresh = new Set(added ? addedLines(mode) : []);

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Order" value={`$${total}`} color="var(--muted)" />
          <Stat label="Shipping" value={<AnimatedValue value={`$${c.price(total)}`} as="span" />} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the strategy in use, and its price' },
            { color: 'var(--orange)', label: 'lines the new carrier adds' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Code" value={mode === 'strategies'} onChange={(v) => setMode(v ? 'strategies' : 'switch')} off="one switch" on="strategy table" />
          <ChipButton tone="orange" on={added} onClick={() => setAdded(!added)}>
            + add {NEW_CARRIER}
          </ChipButton>
        </>,
        <>
          <ControlGroup label="Carrier (swapped at run time)">
            {carriersFor(added).map((x) => (
              <ChipButton key={x.id} tone="info" on={x.id === id} onClick={() => setChosen(x.id)}>
                {x.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Order total">
            {ORDER_TOTALS.map((t) => (
              <ChipButton key={t} tone="muted" on={t === total} onClick={() => setTotal(t)}>
                ${t}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="bp stage-pad">
        <div className="bp-checkout" aria-label={`Order of $${total} with ${c.label} shipping`}>
          <span className="bp-box">order ${total}</span>
          <span aria-hidden>→</span>
          <span className="bp-box tone-hi">{c.label}</span>
          <span aria-hidden>→</span>
          <span className="bp-box tone-hi is-solid">${c.price(total)}</span>
        </div>
        <CodePanel title={mode === 'switch' ? 'shipping(): a branch per carrier' : 'a small function per carrier'} lines={lines} stateOf={(i) => (fresh.has(lines[i]) ? 'next' : 'idle')} className="bp-code" />
        <Hint block>
          Scripted checkout with illustrative prices. The code on screen runs as real JavaScript in the lesson&apos;s tests and prices every carrier like a reference. When not to: with two
          fixed options that never change, an if is simpler than a table of strategies.
        </Hint>
      </div>
    </StageFrame>
  );
}
