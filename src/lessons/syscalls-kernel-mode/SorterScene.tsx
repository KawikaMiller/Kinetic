import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { BINS, isCorrect, score, SORT_KEY, type Bin } from './model';

type Placed = Partial<Record<string, Bin>>;

/**
 * "What's a syscall?": pick a function, then a bin. Every control is a button, so the
 * keyboard path is Tab + Enter. Check marks each placed chip right (--ok) or wrong (--bad).
 */
export function SorterScene({ picker }: { picker: ReactNode }) {
  const [placed, setPlaced] = useState<Placed>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const setCaption = useSetCaption();
  const root = useRef<HTMLDivElement>(null);
  /** After a chip is placed the bin buttons disable, so focus moves to the next chip to sort (or Check). */
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const next = root.current?.querySelector<HTMLElement>('.sk-pool .chip-button') ?? root.current?.parentElement?.closest('.stage-frame')?.querySelector<HTMLElement>('.sk-check');
    next?.focus();
  });
  useIntroCaption(<>Which of these make a system call? Pick a function, then the bin it belongs in. Then press Check.</>);

  const put = (bin: Bin) => {
    if (!picked) return;
    refocus.current = true;
    setPlaced({ ...placed, [picked]: bin });
    setPicked(null);
    setChecked(false);
  };
  const check = () => {
    const s = score(placed);
    setChecked(true);
    setCaption(
      s.placed < s.total ? (
        <>
          {s.right} of {s.placed} placed so far are right; {s.total - s.placed} still to sort.
        </>
      ) : s.right === s.total ? (
        <span className="hl ok">All {s.total} right. A library call is not automatically a system call, and not every system call needs a library to make it.</span>
      ) : (
        <>
          {s.right} of {s.total} right. Read the notes under each bin for the ones marked wrong.
        </>
      ),
    );
  };
  const reset = () => {
    setPlaced({});
    setPicked(null);
    setChecked(false);
    setCaption(<>Cleared. Pick a function, then a bin.</>);
  };
  const chip = (fn: string) => {
    const bin = placed[fn];
    const mark = checked && bin ? (isCorrect(SORT_KEY.find((i) => i.fn === fn)!, bin) ? 'ok' : 'bad') : null;
    return (
      <ChipButton
        key={fn}
        tone={mark ?? 'violet'}
        size="md"
        on={picked === fn || mark !== null}
        onStyle={mark ? 'solid' : 'tint'}
        ariaLabel={`${fn}${bin ? `, in ${bin}` : ''}${mark ? (mark === 'ok' ? ', right' : ', wrong') : ''}${picked === fn ? ', picked' : ''}`}
        onClick={() => setPicked(picked === fn ? null : fn)}
      >
        {fn}()
      </ChipButton>
    );
  };
  const unplaced = SORT_KEY.filter((i) => !placed[i.fn]);
  const actions = (
    <>
      <Button variant="primary" className="sk-check" onClick={check} disabled={Object.keys(placed).length === 0}>
        Check
      </Button>
      <Button onClick={reset}>Reset</Button>
    </>
  );

  return (
    <StageFrame height={360} controls={[picker, actions]}>
      <div className="sk stage-pad" ref={root}>
        <Box className="sk-pool" role="group" aria-label="Functions to sort">
          <SectionTitle>{picked ? `Now pick a bin for ${picked}()` : 'Functions'}</SectionTitle>
          <div className="sk-chips">{unplaced.length ? unplaced.map((i) => chip(i.fn)) : <span className="empty-note">all sorted</span>}</div>
        </Box>
        <div className="sk-bins">
          {BINS.map((b) => {
            const here = SORT_KEY.filter((i) => placed[i.fn] === b.id);
            return (
              <Box key={b.id} className="sk-bin" role="group" aria-label={b.label}>
                <Button className="sk-bin-put" onClick={() => put(b.id)} disabled={!picked}>
                  {picked ? `Put ${picked}() here: ${b.label.toLowerCase()}` : b.label}
                </Button>
                <div className="sk-chips">{here.length ? here.map((i) => chip(i.fn)) : <span className="empty-note">empty</span>}</div>
                {checked && (
                  <ul className="sk-notes">
                    {here.map((i) => (
                      <li key={i.fn} className={isCorrect(i, b.id) ? 'is-ok' : 'is-bad'}>
                        <b>{i.fn}</b>: {isCorrect(i, b.id) ? '' : `it ${i.answer === 'always' ? 'always makes one' : i.answer === 'never' ? 'never makes one' : 'only sometimes makes one'}. `}
                        {i.why} <span className="sk-source">({i.source})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Box>
            );
          })}
        </div>
        <Hint block>The key is for glibc on Linux x86-64; other C libraries and kernels can differ.</Hint>
      </div>
    </StageFrame>
  );
}
