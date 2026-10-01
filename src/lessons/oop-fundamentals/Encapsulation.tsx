import { motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { SHAKE } from '../../core/motion';
import { ACCOUNT_CODE, applyAccount, type AccountAction, type AccountState } from './model';
import { OOP_MIN_WIDTH } from './shared';

const SCENE_W = 660;
const SCENE_H = 280;
const OBJECT = { x: 250, y: 50, w: 390, h: 200 };
const VAULT = { x: 290, y: 150, w: 310, h: 72 };

interface ActionDef {
  label: string;
  action: AccountAction;
  /** Code lines this action runs, for highlighting. */
  lines: number[];
  /** Which public method it goes through; null for the direct poke at the private field. */
  door: 'deposit' | 'withdraw' | null;
}

const ACTIONS: ActionDef[] = [
  { label: 'deposit(50)', action: { kind: 'deposit', amount: 50 }, lines: [2, 3, 4], door: 'deposit' },
  { label: 'withdraw(30)', action: { kind: 'withdraw', amount: 30 }, lines: [6, 7, 8], door: 'withdraw' },
  { label: 'withdraw(500)', action: { kind: 'withdraw', amount: 500 }, lines: [6, 7], door: 'withdraw' },
  { label: 'acct.#balance = 1e6', action: { kind: 'poke' }, lines: [1], door: null },
];

const DOOR_X = { deposit: 330, withdraw: 470 } as const;
const DOOR_Y = 96;

/** A private field behind public methods: the methods keep the invariant, outside code can't touch the field. */
export function Encapsulation({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState<AccountState>({ balance: 0, error: null });
  const [last, setLast] = useState<ActionDef | null>(null);
  const [attempt, setAttempt] = useState(0);
  const setCaption = useSetCaption();
  // The vault shake is error feedback, not teaching motion: hold still under reduced motion.
  const reduceMotion = useReducedMotion();
  useIntroCaption(<>The balance is a <b>private field</b> (<code>#balance</code>). The only way in is through the public methods. Try each button.</>);

  const reset = () => {
    setState({ balance: 0, error: null });
    setLast(null);
    setCaption(<>A fresh account: <code>#balance</code> is back to 0, and the only way in is still through the public methods.</>);
  };

  const run = (def: ActionDef) => {
    const next = applyAccount(state, def.action);
    setState(next);
    setLast(def);
    setAttempt((n) => n + 1);
    if (def.action.kind === 'poke') {
      setCaption(<>Outside code can&apos;t even <i>write</i> <code>acct.#balance</code>: <span className="hl bad">SyntaxError</span> before anything runs. The field is sealed by the language.</>);
    } else if (next.error) {
      setCaption(<><code>{def.label}</code> is refused by the method: <span className="hl bad">{next.error}</span>. The balance can never go below 0.</>);
    } else {
      setCaption(<><code>{def.label}</code> goes through the public method, which updates the private balance to <span className="hl ok">{next.balance}</span>.</>);
    }
  };

  const blocked = !!state.error;
  return (
    <StageFrame
      minWidth={OOP_MIN_WIDTH}
      height={320}
      stats={
        <Stats>
          <Stat label="acct.balance" value={state.balance} color="var(--ok)" sub="read through the getter" />
          <Stat label="Last call" value={last ? (blocked ? 'refused' : 'ok') : '…'} color={blocked ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'allowed through a method' },
            { color: 'var(--bad)', label: 'refused or blocked' },
            { color: 'var(--violet)', label: 'private field' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {ACTIONS.map((def) => (
            <Button key={def.label} onClick={() => run(def)} variant={def.door ? 'ghost' : 'danger'}>
              {def.label}
            </Button>
          ))}
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="oo">
        <CodePanel title="JavaScript" lines={ACCOUNT_CODE} active={last?.lines ?? null} />
        <svg className="oo-scene" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} role="img" aria-label="An account object with public methods and a sealed private balance">
          <text className="scene-zone" x={16} y={24}>outside code</text>
          <rect className="oo-outside" x={16} y={110} width={170} height={60} rx={10} />
          <text className="oo-outside-label" x={101} y={137} textAnchor="middle">your code</text>
          <text className="oo-outside-sub" x={101} y={155} textAnchor="middle">{last?.label ?? 'waiting…'}</text>

          <rect className="oo-object" x={OBJECT.x} y={OBJECT.y} width={OBJECT.w} height={OBJECT.h} rx={14} />
          <text className="oo-object-title" x={OBJECT.x + 14} y={OBJECT.y + 22}>acct (Account)</text>
          {(['deposit', 'withdraw'] as const).map((door) => (
            <g key={door} className={`oo-door ${last?.door === door ? (blocked ? 'is-bad' : 'is-ok') : ''}`}>
              <rect x={DOOR_X[door] - 56} y={DOOR_Y - 16} width={112} height={30} rx={15} />
              <text x={DOOR_X[door]} y={DOOR_Y + 4} textAnchor="middle">{door}()</text>
            </g>
          ))}

          <motion.g key={attempt} animate={last && !last.door && !reduceMotion ? SHAKE : { x: 0 }}>
            <rect className={`oo-vault ${last && !last.door ? 'is-bad' : ''}`} x={VAULT.x} y={VAULT.y} width={VAULT.w} height={VAULT.h} rx={10} />
            <text className="oo-vault-label" x={VAULT.x + 14} y={VAULT.y + 22}>🔒 private</text>
            <text className="oo-vault-value" x={VAULT.x + 14} y={VAULT.y + 50}>#balance = {state.balance}</text>
          </motion.g>

          {last && (
            <path
              key={`path-${attempt}`}
              className={`oo-call ${blocked ? 'is-bad' : 'is-ok'}`}
              d={last.door ? `M 186 140 L ${DOOR_X[last.door] - 56} ${DOOR_Y}` : `M 186 140 L ${VAULT.x - 6} ${VAULT.y + 30}`}
            />
          )}
          {last && !last.door && (
            <text className="oo-blocked" x={VAULT.x - 20} y={VAULT.y + 34} textAnchor="end">✕</text>
          )}
        </svg>
      </div>
    </StageFrame>
  );
}
