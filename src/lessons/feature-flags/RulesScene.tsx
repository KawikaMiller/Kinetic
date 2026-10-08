import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { Crowd } from './Crowd';
import { DEFAULT_ORDER, FLAG_KEY, RULES, USER_COUNT, bucketOf, countOn, evaluate, makeUsers, moveRule, percentFor, reached, usersByRule, type RuleId } from './model';

const ruleLine = (id: RuleId, dial: number) => `${RULES[id].text.padEnd(14)} -> ${percentFor(id, dial)}% on`;

export function RulesScene({ picker }: { picker: ReactNode }) {
  const users = useMemo(() => makeUsers(), []);
  const [order, setOrder] = useState<RuleId[]>(DEFAULT_ORDER);
  const [dial, setDial] = useState(10);
  const [selected, setSelected] = useState(0);

  const user = users[selected];
  const e = evaluate(order, user, dial, false);
  const ran = reached(order, e.rule);
  const table = usersByRule(users, order, dial);
  const total = countOn(users, order, dial, false);
  const lines = order.map((id) => ruleLine(id, dial));
  const stateOf = (i: number): LineState => (i < ran - 1 ? 'idle' : i === ran - 1 ? 'now' : 'past');
  const bucket = bucketOf(FLAG_KEY, user.id);

  useIntroCaption(
    <>
      Rules run top to bottom and the first match decides. <b>{user.id}</b> ({user.staff ? 'staff, ' : ''}
      {user.country}) matches <span className="hl">{e.rule ? RULES[e.rule].text : 'nothing'}</span>
      {e.rule && (
        <>
          : bucket {bucket} against {percentFor(e.rule, dial)}% is <span className={e.on ? 'hl violet' : 'hl info'}>{e.on ? 'on' : 'off'}</span>
        </>
      )}
      . Rules below it were never asked, even when it says off.
    </>,
    [user.id, e.rule, e.on, dial, bucket],
  );

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="New checkout" value={`${total} / ${USER_COUNT}`} color="var(--violet)" />
          {order.map((id) => (
            <Stat key={id} label={RULES[id].text} value={`${table[id].on} / ${table[id].matched}`} sub="on / matched" />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'new checkout' },
            { color: 'var(--info)', label: 'old checkout' },
            { color: 'var(--hi)', label: 'rule that matched · selected user' },
            { color: 'var(--dim)', label: 'rules not reached' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Default rule (the dial)" value={dial} min={0} max={100} step={5} onChange={setDial} format={(v) => `${v}%`} />
        </>,
      ]}
    >
      <div className="ff stage-pad">
        <div className="ff-row">
          <div className="ff-crowd">
            <Crowd users={users} isOn={(u) => evaluate(order, u, dial, false).on} selected={selected} onSelect={setSelected} />
            <Hint block>Click a user to see which rule decides for them.</Hint>
          </div>
          <div className="ff-rules">
            <CodePanel title="flag rules, first match wins" lines={lines} stateOf={stateOf} />
            <ul className="ff-moves">
              {order.map((id, i) => (
                <li key={id}>
                  <span>{RULES[id].text}</span>
                  <ChipButton tone="info" ariaLabel={`Move ${RULES[id].text} up`} disabled={i === 0} onClick={() => setOrder(moveRule(order, i, -1))}>
                    up
                  </ChipButton>
                  <ChipButton tone="info" ariaLabel={`Move ${RULES[id].text} down`} disabled={i === order.length - 1} onClick={() => setOrder(moveRule(order, i, 1))}>
                    down
                  </ChipButton>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Hint block>Seeded users and a simulated flag service; the hashing is real. Staff and NL percentages are fixed here, and the default rule follows the dial.</Hint>
      </div>
    </StageFrame>
  );
}
