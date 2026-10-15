import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';
import { pick } from '../../core/random';
import { Buckets } from './Buckets';
import { changeCaption, introCaption, schemeCaption, vnodesCaption, type Scheme } from './captions';
import {
  ALL_SERVERS, busiestRatio, compareChange, countKeys, KEY_COUNT, loadColor, MIN_SERVERS, owners, START_SERVERS, VNODE_RANGE,
  type Change,
} from './model';
import { Ring } from './Ring';
import { SidePanel } from './SidePanel';
import './styles.css';

interface LastChange {
  change: Change;
  version: number;
}

export function Stage() {
  const setCaption = useSetCaption();
  const [servers, setServers] = useState(START_SERVERS);
  const [vnodes, setVnodes] = useState<number>(VNODE_RANGE.min);
  const [mode, setMode] = useState<Scheme>('ring');
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [last, setLast] = useState<LastChange | null>(null);

  const now = useMemo(() => owners(servers, vnodes), [servers, vnodes]);
  const own = mode === 'ring' ? now.ring : now.mod;
  const inspected = hover ?? picked;

  useIntroCaption(introCaption());

  const applyChange = (next: string[]) => {
    const change = compareChange(servers, next, vnodes);
    setLast((l) => ({ change, version: (l?.version ?? 0) + 1 }));
    setServers(next);
    setCaption(changeCaption(mode, change, servers.length));
  };

  const add = () => {
    const nextName = ALL_SERVERS.find((s) => !servers.includes(s));
    if (nextName) applyChange([...servers, nextName]);
  };
  const remove = (s: string) => {
    if (servers.length > MIN_SERVERS) applyChange(servers.filter((x) => x !== s));
  };

  const pickMode = (m: Scheme) => {
    setMode(m);
    setLast(null);
    setCaption(schemeCaption(m));
  };

  const counts = countKeys(servers, own);
  const busiest = busiestRatio(counts, KEY_COUNT);
  const fair = KEY_COUNT / servers.length;

  const pickVnodes = (v: number) => {
    setVnodes(v);
    setLast(null);
    const ringBusiest = busiestRatio(countKeys(servers, owners(servers, v).ring), KEY_COUNT);
    setCaption(vnodesCaption(mode, v, ringBusiest));
  };

  const change = last?.change ?? null;
  const moved = change ? (mode === 'ring' ? change.ringMoved : change.modMoved) : new Set<number>();
  const movedHere = change ? moved.size : 0;
  const movedOther = change ? (mode === 'ring' ? change.modMoved : change.ringMoved).size : 0;
  const version = last?.version ?? 0;

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Servers" value={servers.length} />
          <Stat
            label="Keys moved"
            value={change ? `${movedHere}/${KEY_COUNT}` : NA}
            color={mode === 'ring' ? 'var(--ok)' : 'var(--bad)'}
            sub={change ? `last change · ${mode === 'ring' ? 'ring' : '% N'}` : 'add or remove a server'}
          />
          <Stat
            label="The other scheme"
            value={change ? `${movedOther}/${KEY_COUNT}` : NA}
            color={mode === 'ring' ? 'var(--bad)' : 'var(--ok)'}
            sub={mode === 'ring' ? 'with hash % N' : `with a ring, ${vnodes} ${vnodes === 1 ? 'point' : 'points'} each`}
          />
          <Stat label="Busiest server" value={`${busiest.toFixed(2)}×`} color={loadColor(busiest)} sub="its fair share" />
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--text)', label: 'key (coloured by owner)', shape: 'dot' },
              { color: 'var(--hi)', label: 'just moved', shape: 'dot' },
            ]}
          />
          <ProvenanceRow>
            <Provenance kind="toy">
              {KEY_COUNT} keys, user:1 to user:{KEY_COUNT}, and a small non-cryptographic hash: the counts are exact for these keys, not a benchmark
            </Provenance>
          </ProvenanceRow>
        </>
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
            − Remove a random server
          </Button>
          <Slider
            label="Virtual nodes per server (ring)"
            value={vnodes}
            min={VNODE_RANGE.min}
            max={VNODE_RANGE.max}
            onChange={pickVnodes}
          />
          <Slider
            label="Inspect key"
            value={(picked ?? 0) + 1}
            min={1}
            max={KEY_COUNT}
            onChange={(v) => setPicked(v - 1)}
            format={(v) => `user:${v}`}
          />
        </Controls>
      }
    >
      <div className="ch">
        <div className="ch-main">
          {mode === 'ring' ? (
            <Ring pts={now.pts} owners={now.ring} vnodes={vnodes} hover={inspected} setHover={setHover} moved={moved} version={version} onServer={remove} />
          ) : (
            <Buckets servers={servers} owners={now.mod} hover={inspected} setHover={setHover} moved={moved} version={version} />
          )}
        </div>
        <SidePanel servers={servers} counts={counts} fair={fair} hover={inspected} own={own} mode={mode} onRemove={remove} />
      </div>
    </StageFrame>
  );
}
