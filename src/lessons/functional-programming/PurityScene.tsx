import { useRef, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Segmented } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { GLOBAL_DISCOUNTS, PRICE, priceWithGlobal, pricePure, PURE_DISCOUNT, PURITY_CODE } from './model';

interface CallRow {
  id: number;
  call: string;
  result: number;
  /** Same arguments as an earlier call, different answer. */
  surprise: boolean;
}

const DISCOUNT_OPTIONS = GLOBAL_DISCOUNTS.map((d) => ({ value: d, label: pct(d) }));
const MAX_ROWS = 8;

export function PurityScene({ picker }: { picker: ReactNode }) {
  const [global, setGlobal] = useState<number>(PURE_DISCOUNT);
  const [rows, setRows] = useState<CallRow[]>([]);
  const nextId = useRef(0);
  /** What priceWithGlobal(PRICE) returned the first time it was called. */
  const [firstImpure, setFirstImpure] = useState<number | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(
    <>Two functions, same formula. One reads a <b>global</b> discount, the other takes it as an argument. Call them both.</>,
  );

  const impure = priceWithGlobal(PRICE, global);
  const pure = pricePure(PRICE, PURE_DISCOUNT);
  const changed = firstImpure !== null && impure !== firstImpure;
  const lines = global === PURE_DISCOUNT ? PURITY_CODE : [...PURITY_CODE, '', `discount = ${global}; // some other module, later`];

  const call = () => {
    const first = firstImpure ?? impure;
    setFirstImpure(first);
    const surprise = impure !== first;
    const id = nextId.current;
    nextId.current += 2;
    setRows((r) =>
      [
        ...r,
        { id, call: `priceWithGlobal(${PRICE})`, result: impure, surprise },
        { id: id + 1, call: `pricePure(${PRICE}, ${PURE_DISCOUNT})`, result: pure, surprise: false },
      ].slice(-MAX_ROWS),
    );
    setCaption(
      surprise ? (
        <>
          priceWithGlobal({PRICE}) returned <span className="hl bad">{impure}</span>, but it returned {first}{' '}
          before: <b>same input, different output</b>. pricePure is still <span className="hl ok">{pure}</span>.
        </>
      ) : (
        <>Both return <span className="hl ok">{pure}</span>. Now change the global discount and call them again.</>
      ),
    );
  };

  const setDiscount = (d: number) => {
    setGlobal(d);
    setCaption(<>Some other code just set <code>discount = {d}</code>. Neither function's arguments changed. Call them again.</>);
  };

  const clear = () => {
    setRows([]);
    setFirstImpure(null);
    setGlobal(PURE_DISCOUNT);
    setCaption(<>Log cleared and the global is back to {PURE_DISCOUNT}.</>);
  };

  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'hidden input (the global)', shape: 'line' },
            { color: 'var(--ok)', label: 'same answer as before' },
            { color: 'var(--bad)', label: 'same input, new answer' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Someone else sets the global discount to" value={global} onChange={setDiscount} options={DISCOUNT_OPTIONS} />
        </>,
        <>
          <Button variant="primary" onClick={call}>
            Call both with price {PRICE}
          </Button>
          <Button onClick={clear}>Clear the log</Button>
        </>,
      ]}
    >
      <div className="fp stage-pad fp-purity">
        <CodePanel title="Two functions" lines={lines} active={global === PURE_DISCOUNT ? null : lines.length - 1} />
        <div className="fp-machines">
          <Machine name="priceWithGlobal" args={[`price ${PRICE}`]} hidden={`reads global discount = ${global}`} out={impure} bad={changed} />
          <Machine name="pricePure" args={[`price ${PRICE}`, `discount ${PURE_DISCOUNT}`]} out={pure} />
          <Box variant="sunken" className="fp-log">
            {rows.length === 0 ? (
              <span className="empty-note">no calls yet</span>
            ) : (
              rows.map((r) => (
                <div key={r.id} className={`log-row ${r.surprise ? 'tone-bad' : 'tone-ok'}`}>
                  {r.call} → {r.result}
                  {r.surprise && <span className="fp-log-note"> same input, different output</span>}
                </div>
              ))
            )}
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}

function Machine({ name, args, hidden, out, bad = false }: { name: string; args: string[]; hidden?: string; out: number; bad?: boolean }) {
  return (
    <div className="fp-machine">
      <div className="fp-machine-in">
        {args.map((a) => (
          <span key={a} className="chip tone-info">
            {a}
          </span>
        ))}
        {hidden && <span className="fp-hidden">{hidden}</span>}
      </div>
      <span className="fp-arrow" aria-hidden="true">
        →
      </span>
      <code className="fp-machine-name">{name}</code>
      <span className="fp-arrow" aria-hidden="true">
        →
      </span>
      <b className={`fp-machine-out ${bad ? 'is-bad' : 'is-ok'}`}>{out}</b>
    </div>
  );
}
