import { useMemo, useState } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { Packet as PacketPill, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { ipToString } from '../../core/ipv4';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { actionTone, introText, streamFrames, type FwFrame } from './frames';
import {
  BROAD_RETURN_RULE, PRESETS, SERVER, cloneRules, endpoint, netText, parsePorts, parseSource, portText, runStream, shadowed, type Action, type Rule,
  type StreamStep,
} from './model';
import './styles.css';

const STEP_MS = 1300;
/** The rule grid's natural width (its fixed columns), so it scrolls rather than squashes on a phone. */
const RULES_MIN_W = 680;
const ACTIONS: Action[] = ['ACCEPT', 'DROP', 'REJECT'];
const HONEST = 'Simplified iptables-style model (one INPUT chain, the fields shown only); not a real firewall. Synthetic traffic between documentation addresses.';

export function Stage() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [rules, setRules] = useState(() => cloneRules(preset.rules));
  const [tracking, setTracking] = useState(true);
  const [selected, setSelected] = useState(0);

  const load = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setRules(cloneRules(p.rules));
    setSelected(0);
  };

  const steps = useMemo(() => runStream(rules, preset.packets, tracking, preset.policy), [rules, preset, tracking]);
  const frames = useMemo(
    () => streamFrames(steps, rules, tracking, preset.policy, introText(preset.label, preset.packets.length, tracking)),
    [steps, rules, tracking, preset],
  );
  const player = usePlayer<FwFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const step = f.k >= 0 ? steps[f.k] : null;
  const shadows = shadowed(rules, tracking);
  const hasBroad = rules.some((r) => r.id === 'broad');

  return (
    <StageFrame
      player={player}
      height={480}
      legend={<Legend items={[
        { color: 'var(--hi)', label: 'rule being checked' },
        { color: 'var(--ok)', label: 'ACCEPT' },
        { color: 'var(--bad)', label: 'DROP' },
        { color: 'var(--orange)', label: 'REJECT / shadowed' },
        { color: 'var(--violet)', label: 'default policy' },
        { color: 'var(--info)', label: 'packet / conntrack entry' },
      ]} />}
      controls={[
        <>
          <ControlGroup label="Preset" inline>
            {PRESETS.map((p) => <ChipButton key={p.id} tone="info" size="md" on={presetId === p.id} onClick={() => load(p.id)}>{p.label}</ChipButton>)}
          </ControlGroup>
        </>,
        <>
          <Toggle label="Connection tracking" value={tracking} onChange={setTracking} off="Stateless" on="Stateful (conntrack)" />
          {!tracking && (
            <ChipButton tone="orange" size="md" on={hasBroad}
              onClick={() => setRules(hasBroad ? rules.filter((r) => r.id !== 'broad') : [...rules, BROAD_RETURN_RULE()])}>
              Broad return rule: all ports 1024-65535
            </ChipButton>
          )}
        </>,
        <RuleEditor key="ed" rules={rules} setRules={setRules} selected={selected} setSelected={setSelected} />,
      ]}
    >
      <div className="stage-pad fw">
        <WideRegion minWidth={RULES_MIN_W} label="Firewall rules: scroll sideways to see every column" gutter={{ top: 0, bottom: 0, x: 4 }}>
          <RuleTable rules={rules} frame={f} step={step} shadows={shadows} selected={selected} onSelect={setSelected} policy={preset.policy} />
        </WideRegion>
        <ClientLane frame={f} step={step} />
        <Conntrack frame={f} step={step} tracking={tracking} />
        <Hint block>
          {HONEST} OUTPUT isn't filtered here. Home-router NAT (the IP addresses &amp; ports lesson) rides on this same connection table to send replies back to the
          right inside host.
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── The rule list ───────────────────────────────────────────────────────

function lineState(i: number, rules: readonly Rule[], f: FwFrame, step: StreamStep | null): LineState {
  const v = step?.verdict;
  if (!v || f.phase === 'arrive') return rules[i].enabled ? 'idle' : 'cut';
  const o = v.outcomes[i];
  if (f.phase === 'check') {
    if (i === f.rule) return 'now';
    if (i > f.rule) return rules[i].enabled ? 'idle' : 'cut';
  }
  if (o === 'match') return 'done';
  if (o === 'pass') return 'past';
  if (o === 'unreached') return 'pending';
  return 'cut';
}

function RuleTable({ rules, frame, step, shadows, selected, onSelect, policy }: {
  rules: readonly Rule[]; frame: FwFrame; step: StreamStep | null; shadows: Map<number, number>; selected: number; onSelect: (i: number) => void; policy: Action;
}) {
  const policyLit = step?.verdict?.rule === null && (frame.phase === 'policy' || frame.phase === 'outcome');
  const lines = rules.map((r, i) => `${i + 1} ${netText(r.src)} ${portText(r.dport)} ${r.proto ?? 'any'} ${r.state} ${r.action}`);
  return (
    <div className="fw-table">
      <div className="fw-head" aria-hidden="true">
        <span>#</span><span>chain</span><span>source</span><span>dport</span><span>proto</span><span>state</span><span>action</span>
      </div>
      <CodePanel
        lines={lines}
        gutter="none"
        className="fw-rules"
        stateOf={(i) => lineState(i, rules, frame, step)}
        onLineClick={onSelect}
        pressed={(i) => i === selected}
        lineLabel={(i) => `Rule ${i + 1}: ${lines[i]}${rules[i].enabled ? '' : ', off'}. Select to edit`}
        renderLine={(_, i) => {
          const r = rules[i];
          return (
            <span className={`fw-line ${i === selected ? 'is-selected' : ''}`} data-act={r.action}>
              <span>{i + 1}</span>
              <span>INPUT</span>
              <span>{netText(r.src)}</span>
              <span>{portText(r.dport)}</span>
              <span>{r.proto ?? 'any'}</span>
              <span>{r.state === 'any' ? 'any' : r.state}</span>
              <span className={`fw-act tone-${actionTone(r.action)}`}>{r.enabled ? r.action : `${r.action} (off)`}</span>
            </span>
          );
        }}
        trailing={(i) => (
          <>
            {shadows.has(i) && <span className="chip tone-orange fw-warn">⚠ shadowed by rule {shadows.get(i)! + 1}</span>}
            {rules[i].note && <span className="fw-note">{rules[i].note}</span>}
          </>
        )}
      />
      <p className={`fw-policy ${policyLit ? 'is-lit' : ''}`}>
        <span>default policy</span> <b>{policy}</b> <span className="fw-note">when no rule matches</span>
      </p>
    </div>
  );
}

// ── Editing ─────────────────────────────────────────────────────────────

function RuleEditor({ rules, setRules, selected, setSelected }: {
  rules: Rule[]; setRules: (r: Rule[]) => void; selected: number; setSelected: (i: number) => void;
}) {
  const r = rules[Math.min(selected, rules.length - 1)];
  const [draft, setDraft] = useState({ id: r.id, src: netText(r.src), port: portText(r.dport) });
  const [error, setError] = useState<string | null>(null);
  if (draft.id !== r.id) {
    setDraft({ id: r.id, src: netText(r.src), port: portText(r.dport) });
    setError(null);
  }
  const update = (patch: Partial<Rule>) => setRules(rules.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
  const move = (d: -1 | 1) => {
    const to = selected + d;
    if (to < 0 || to >= rules.length) return;
    const next = [...rules];
    [next[selected], next[to]] = [next[to], next[selected]];
    setRules(next);
    setSelected(to);
  };
  const apply = () => {
    const src = parseSource(draft.src);
    if (!src.ok) return setError(`Source: ${src.error}`);
    const port = parsePorts(draft.port);
    if (!port.ok) return setError(`Port: ${port.error}`);
    setError(null);
    update({ src: src.value, dport: port.value });
    setDraft({ id: r.id, src: netText(src.value), port: portText(port.value) });
  };

  return (
    <div className="fw-editor">
      <span className="fw-editor-title">Rule {selected + 1}</span>
      <Button onClick={() => move(-1)} disabled={selected === 0}>Move up</Button>
      <Button onClick={() => move(1)} disabled={selected === rules.length - 1}>Move down</Button>
      <Toggle label="Rule" value={r.enabled} onChange={(v) => update({ enabled: v })} off="Off" on="On" />
      <Segmented label="Action" value={r.action} onChange={(a) => update({ action: a })} options={ACTIONS.map((a) => ({ value: a, label: a }))} />
      <TextField label="Source" value={draft.src} onChange={(v) => setDraft({ ...draft, src: v })} onEnter={apply} width={170} spellCheck={false} />
      <TextField label="Port" value={draft.port} onChange={(v) => setDraft({ ...draft, port: v })} onEnter={apply} width={110} spellCheck={false} />
      <Button onClick={apply}>Apply</Button>
      <p className={`fw-error ${error ? '' : 'is-empty'}`} role="status" aria-live="polite">{error ?? 'Source: a CIDR or "any". Port: 22, 1024-65535 or "any".'}</p>
    </div>
  );
}

// ── The client's view ───────────────────────────────────────────────────

const LANE_W = 680;
const LANE_H = 118;
const Y = 48;
const AT = { remote: { x: 80, y: Y }, fw: { x: 340, y: Y }, server: { x: 600, y: Y } };
const NODE = { w: 132, h: 50 };
/** Where pills wait: in the gaps either side of the firewall box, never over a label. */
const GAP = { outside: { x: 210, y: Y }, inside: { x: 470, y: Y }, back: { x: 196, y: Y }, gate: { x: 262, y: Y } };

function ClientLane({ frame, step }: { frame: FwFrame; step: StreamStep | null }) {
  const p = step?.packet;
  const remote = p ? (p.dir === 'in' ? p.src : p.dst) : null;
  const action = step?.verdict?.action;
  const done = frame.phase === 'outcome';
  const label = p ? `:${p.dport} ${p.flags}` : '';
  let pill = null;
  let note = '';
  if (p && p.dir === 'out') {
    pill = <PacketPill key={`o${frame.k}`} path={[GAP.inside, GAP.outside]} label={label} color="var(--info)" arrive="stay" duration={1.1} />;
    note = 'outbound: not filtered here';
  } else if (p && !done) {
    pill = <PacketPill key={`i${frame.k}`} path={[{ x: AT.remote.x, y: Y }, GAP.outside]} label={label} color="var(--info)" arrive="stay" duration={0.8} />;
    note = 'being checked';
  } else if (p && action === 'ACCEPT') {
    pill = <PacketPill key={`a${frame.k}`} path={[GAP.outside, GAP.inside]} label={label} color="var(--ok)" arrive="stay" duration={0.8} />;
    note = 'let in';
  } else if (p && action === 'REJECT') {
    pill = <PacketPill key={`r${frame.k}`} path={[GAP.gate, GAP.back]} label="RST" color="var(--orange)" arrive="stay" duration={0.8} />;
    note = 'client: connection refused (at once)';
  } else if (p && action === 'DROP') {
    note = 'client: no answer… retries, then a timeout';
  }
  return (
    <div className="fw-lane">
      <WideRegion minWidth={minWidthForText(LANE_W, 10)} label="Client lane: scroll sideways to see all of it">
        <svg viewBox={`0 0 ${LANE_W} ${LANE_H}`} className="fw-lane-svg" role="img" aria-label={p ? `${p.label}: ${note}` : 'No packet yet'}>
          <line x1={AT.remote.x} y1={AT.remote.y} x2={AT.server.x} y2={AT.server.y} className="scene-edge" />
          <SceneNode at={AT.remote} {...NODE} title={remote === null ? 'remote host' : ipToString(remote)} sub={p?.dir === 'out' ? 'remote server' : 'client'} />
          <SceneNode at={AT.fw} {...NODE} title="firewall" sub="INPUT chain" on={!!p && !done && p.dir === 'in'} />
          <SceneNode at={AT.server} {...NODE} title={ipToString(SERVER)} sub="our server" />
          {pill}
          {p && done && action === 'DROP' && (
            <text x={GAP.outside.x} y={Y + 8} textAnchor="middle" className="fw-x">✕</text>
          )}
          <text x={LANE_W / 2} y={LANE_H - 8} textAnchor="middle" className={`fw-lane-note ${done && action ? `tone-${actionTone(action)}` : ''}`}>{note}</text>
        </svg>
      </WideRegion>
    </div>
  );
}

// ── Conntrack ───────────────────────────────────────────────────────────

function Conntrack({ frame, step, tracking }: { frame: FwFrame; step: StreamStep | null; tracking: boolean }) {
  if (!tracking) return <p className="fw-off">Connection tracking is off: the firewall judges every packet on its own, with no memory of earlier ones.</p>;
  const touched = frame.phase === 'outcome' ? step?.touched : null;
  return (
    <div className="fw-ct">
      <SectionTitle weight="regular" hint="conntrack">Connection table</SectionTitle>
      {frame.table.length === 0 ? <p className="empty-note">no flows yet</p> : (
        <table className="data-table">
          <thead><tr><th>proto</th><th>flow (as first seen)</th><th>state</th></tr></thead>
          <tbody>
            {frame.table.map((e) => (
              <tr key={e.id} className={`fw-ct-row ${e.id === touched ? 'is-new' : ''}`}>
                <td>{e.proto}</td>
                <td>{endpoint(e.src, e.sport)} → {endpoint(e.dst, e.dport)}</td>
                <td>{e.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
