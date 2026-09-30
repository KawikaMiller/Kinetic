import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';
import { pick } from '../../core/random';
import { Buckets } from './Buckets';
import { ALL_SERVERS, KEY_COUNT, KEYS, owners } from './model';
import { Ring } from './Ring';
import { SidePanel } from './SidePanel';
import './styles.css';

type Mode = 'ring' | 'mod';

interface Change {
  ring: number;
  mod: number;
  moved: Set<number>; // key indexes that moved in the scheme being shown
  version: number;
  label: string;
}

const MIN_SERVERS = 2;

/** Busiest-server load as a multiple of the fair share: amber above 1.2×, red above 1.5×. */
const loadColor = (ratio: number) => (ratio > 1.5 ? 'var(--bad)' : ratio > 1.2 ? 'var(--hi)' : 'var(--ok)');

export function Stage() {
  const setCaption = useSetCaption();
  const [servers, setServers] = useState(['A', 'B', 'C', 'D']);
  const [vnodes, setVnodes] = useState(1);
  const [mode, setMode] = useState<Mode>('ring');
  const [hover, setHover] = useState<number | null>(null);
  const [change, setChange] = useState<Change | null>(null);

  const now = useMemo(() => owners(servers, vnodes), [servers, vnodes]);
  const own = mode === 'ring' ? now.ring : now.mod;

  useIntroCaption(
    <>
      {KEY_COUNT} keys, 4 servers. On the ring, each key walks <b>clockwise</b> to the first server it
      meets. Hover a key to see its path.
    </>,
  );

  const applyChange = (next: string[], label: string) => {
    const after = owners(next, vnodes);
    const ringMoved = new Set(KEYS.filter((k) => after.ring[k.i] !== now.ring[k.i]).map((k) => k.i));
    const modMoved = new Set(KEYS.filter((k) => after.mod[k.i] !== now.mod[k.i]).map((k) => k.i));
    setChange((c) => ({
      ring: ringMoved.size,
      mod: modMoved.size,
      moved: mode === 'ring' ? ringMoved : modMoved,
      version: (c?.version ?? 0) + 1,
      label,
    }));
    setServers(next);
    const r = ringMoved.size;
    const m = modMoved.size;
    setCaption(
      mode === 'ring' ? (
        <>
          {label}. On the ring only <span className="hl ok">{r} keys</span> moved: just the arc next to it. With{' '}
          <code>% N</code> it would have been <span className="hl bad">{m}</span>.
        </>
      ) : (
        <>
          {label}. <code>hash % N</code> changed for <span className="hl bad">{m} of {KEY_COUNT} keys</span>. Almost
          everything reshuffled. A ring would have moved just <span className="hl ok">{r}</span>.
        </>
      ),
    );
  };

  const add = () => {
    const nextName = ALL_SERVERS.find((s) => !servers.includes(s));
    if (!nextName) return;
    applyChange([...servers, nextName], `Server ${nextName} joined`);
  };
  const remove = (s: string) => {
    if (servers.length <= MIN_SERVERS) return;
    applyChange(servers.filter((x) => x !== s), `Server ${s} left`);
  };

  const pickMode = (m: Mode) => {
    setMode(m);
    setChange(null);
    setCaption(
      m === 'ring' ? (
        <>The ring: servers and keys hashed onto the same circle. Ownership only changes <b>locally</b>.</>
      ) : (
        <><code>hash(key) % N</code>: dead simple, perfectly fine… until N changes. Try adding a server.</>
      ),
    );
  };

  const pickVnodes = (v: number) => {
    setVnodes(v);
    setChange(null);
    setCaption(
      v === 1 ? (
        <>One point per server: the arcs are random sizes, so some servers own far more of the ring.</>
      ) : (
        <>
          <span className="hl violet">{v} points</span> per server: many small arcs average out, so the load
          evens up. Watch the bars.
        </>
      ),
    );
  };

  const counts = servers.map((s) => own.filter((o) => o === s).length);
  const fair = KEY_COUNT / servers.length;
  const busiest = Math.max(...counts);
  const moved = change?.moved ?? new Set<number>();
  const version = change?.version ?? 0;

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Servers" value={servers.length} />
          <Stat
            label="Keys moved"
            value={change ? `${mode === 'ring' ? change.ring : change.mod}/${KEY_COUNT}` : NA}
            color={mode === 'ring' ? 'var(--ok)' : 'var(--bad)'}
            sub={change ? `last change · ${mode === 'ring' ? 'ring' : '% N'}` : 'add or remove a server'}
          />
          <Stat
            label="The other scheme"
            value={change ? `${mode === 'ring' ? change.mod : change.ring}/${KEY_COUNT}` : NA}
            color={mode === 'ring' ? 'var(--bad)' : 'var(--ok)'}
            sub={mode === 'ring' ? 'with hash % N' : 'with a ring'}
          />
          <Stat label="Busiest server" value={`${(busiest / fair).toFixed(2)}×`} color={loadColor(busiest / fair)} sub="its fair share" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--text)', label: 'key (coloured by owner)', shape: 'dot' },
            { color: 'var(--hi)', label: 'just moved', shape: 'dot' },
            { color: 'var(--violet)', label: 'server point', shape: 'square' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Scheme"
            options={[
              { value: 'ring', label: 'Hash ring' },
              { value: 'mod', label: 'hash(key) % N' },
            ]}
            value={mode}
            onChange={pickMode}
          />
          <Button variant="primary" onClick={add} disabled={servers.length >= ALL_SERVERS.length}>
            + Add server
          </Button>
          <Button onClick={() => remove(pick(servers))} disabled={servers.length <= MIN_SERVERS}>
            − Remove a server
          </Button>
          {mode === 'ring' && <Slider label="Virtual nodes per server" value={vnodes} min={1} max={50} onChange={pickVnodes} />}
        </Controls>
      }
    >
      <div className="ch">
        <div className="ch-main">
          {mode === 'ring' ? (
            <Ring pts={now.pts} owners={now.ring} vnodes={vnodes} hover={hover} setHover={setHover} moved={moved} version={version} onServer={remove} />
          ) : (
            <Buckets servers={servers} owners={now.mod} hover={hover} setHover={setHover} moved={moved} version={version} />
          )}
        </div>
        <SidePanel servers={servers} counts={counts} fair={fair} hover={hover} own={own} mode={mode} onRemove={remove} />
      </div>
    </StageFrame>
  );
}
