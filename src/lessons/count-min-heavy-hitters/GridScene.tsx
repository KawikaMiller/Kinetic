import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { cellGridFrame } from '../../components/cellGridLayout';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import { gridCaption } from './captions';
import { GRID_D, GRID_W, MAX_ITEMS, MAX_ITEM_LENGTH, STREAM_BURST, buildGrid, cleanItem, inspect, itemsByCount, polluted, undercounted, wordStream } from './grid';

const CELL_SIZE = 'sm';
const CELL_FONT = 10;

export function GridScene({ picker }: { picker: ReactNode }) {
  const [items, setItems] = useState<string[]>([]);
  const [shown, setShown] = useState(0);
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [bursts, setBursts] = useState(0);
  const [note, setNote] = useState('');

  const model = useMemo(() => buildGrid(items.slice(0, shown)), [items, shown]);
  const names = useMemo(() => itemsByCount(model), [model]);
  const look = shown === 0 ? null : inspect(model, picked && model.truth.has(picked) ? picked : items[shown - 1]);
  const own = look ? new Set(look.cells.map((c) => `${c.row}:${c.col}`)) : new Set<string>();
  const shape = { rows: GRID_D, cols: GRID_W, size: CELL_SIZE, rowLabels: Array.from({ length: GRID_D }, (_, r) => `row ${r}`), colLabels: Array.from({ length: GRID_W }, (_, c) => c) } as const;
  const wrong = undercounted(model);

  useIntroCaption(gridCaption({ items: shown, model, look }), [model, look?.item]);

  const add = (batch: string[]) => {
    if (items.length + batch.length > MAX_ITEMS) {
      setNote(`This scene holds ${MAX_ITEMS} items at most; reset to start again.`);
      return;
    }
    const next = [...items, ...batch];
    setItems(next);
    setShown(next.length);
    setPicked(null);
    setNote('');
  };
  const addTyped = () => {
    const c = cleanItem(typed);
    if (!c.ok) {
      setNote(c.error);
      return;
    }
    add([c.item]);
    setPicked(c.item);
    setTyped('');
  };

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Items counted" value={shown} sub={`${model.truth.size} distinct`} />
          <Stat label={look ? `Estimate of ${look.item}` : 'Estimate'} value={look ? look.estimate : '–'} color="var(--ok)" sub={look ? `truth ${look.truth}, error ${look.estimate - look.truth}` : 'nothing yet'} />
          <Stat label="Below the truth" value={wrong} color="var(--ok)" sub="collisions only add, so this stays 0" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the chosen item\'s cell in each row', shape: 'square' },
            { color: 'var(--ok)', label: 'ring: the smallest of them, the estimate', shape: 'square' },
            { color: 'var(--bad)', label: 'a cell shared by two or more different items', shape: 'square' },
            { color: 'var(--ok)', label: 'the truth column: an exact Map', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Item" value={typed} onChange={setTyped} onEnter={addTyped} maxLength={MAX_ITEM_LENGTH} width={140} spellCheck={false} placeholder="a word" />
          <Button variant="primary" onClick={addTyped}>Add</Button>
          <Button onClick={() => { add(wordStream(STREAM_BURST, 7, bursts)); setBursts(bursts + 1); }}>Stream {STREAM_BURST} items</Button>
          <Button onClick={() => { setItems([]); setShown(0); setPicked(null); setNote(''); }} softDisabled={items.length === 0}>Reset</Button>
        </>,
        <>
          <Slider label="Items shown" value={shown} min={0} max={Math.max(items.length, 1)} onChange={setShown} />
          <Hint>drag back to watch the grid fill; click an item in the table to follow it</Hint>
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        <Box>
          <SectionTitle hint={`${GRID_D} rows, ${GRID_W} columns; each row hashes the item its own way`}>The grid</SectionTitle>
          <WideRegion minWidth={minWidthForText(cellGridFrame(shape).width, CELL_FONT)} label="The counter grid: scroll sideways to see all of it">
            <CellGrid
              {...shape}
              cell={(r, c) => {
                const v = model.sketch.counts[r * GRID_W + c];
                if (own.has(`${r}:${c}`)) return { tone: 'hi', fill: 'solid', text: v };
                if (polluted(model, r, c)) return { tone: 'bad', fill: 'tint', intensity: 0.3, text: v };
                return v > 0 ? { tone: 'muted', fill: 'tint', text: v } : { fill: 'none' };
              }}
              highlight={look ? [{ r: look.min.row, c: look.min.col, tone: 'ok' }] : []}
              cellTitle={(r, c) => `row ${r}, column ${c}: ${model.sketch.counts[r * GRID_W + c]}`}
              ariaLabel={`Counter grid, ${GRID_D} rows by ${GRID_W} columns, after ${shown} items`}
            />
          </WideRegion>
          <Hint tone="muted" block>Row i uses its own a and b: h<b>ᵢ</b>(x) = ((aᵢ·x + bᵢ) mod p) mod {GRID_W}, with p = 2³¹ − 1.</Hint>
        </Box>
        <Box>
          <SectionTitle hint="the exact Map beside the sketch">Truth against estimate</SectionTitle>
          {names.length === 0 ? (
            <p className="empty-note">No items yet.</p>
          ) : (
            <div className="cm-scroll" role="region" aria-label="True counts and sketch estimates" tabIndex={0}>
              <table className="data-table cm-table">
                <thead>
                  <tr><th scope="col">Item</th><th scope="col">True</th><th scope="col">Estimate</th><th scope="col">Error</th></tr>
                </thead>
                <tbody>
                  {names.map((n) => {
                    const i = inspect(model, n);
                    return (
                      <tr key={n} className={look?.item === n ? 'is-picked' : ''}>
                        <td><button type="button" className="cm-pick" onClick={() => setPicked(n)} aria-pressed={look?.item === n}>{n}</button></td>
                        <td className="cm-true">{i.truth}</td>
                        <td>{i.estimate}</td>
                        <td>{i.estimate - i.truth}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Box>
        {note && <p className="cm-status" role="status">{note}</p>}
        <ProvenanceRow>
          <Provenance kind="simulated">the stream is seeded Zipf over twelve words; the sketch and the hashes are real code</Provenance>
          <Provenance kind="toy">a hash family for teaching; real systems use stronger hashes such as murmur variants (from memory)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
