import { useMemo, useState } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { SectionTitle } from '../../components/Panel';
import { Packet, SceneNode } from '../../components/scene';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import type { ByteField } from '../../core/bytes';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { Pt } from '../../core/geometry';
import { usePlayer } from '../../core/usePlayer';
import { ladderActors, ladderMessages, txFrames, type ArpFrame } from './frames';
import {
  ARP_BODY_BYTES, ETH_HEADER_BYTES, HOSTS, REMOTE_IP, TIMEOUTS_S, WAIT_S, clearSwitch, emptyWorld, hostByMac, isExpired, send, wait,
  type Host, type HostId, type Step, type Transmission, type World,
} from './model';
import './styles.css';

const STEP_MS = 1600;
const HONEST = 'Simulated LAN; the MAC addresses are made up, and time only moves when you press Wait.';

const SENDERS = HOSTS.filter((h) => h.id !== 'R').map((h) => ({ value: h.id, label: h.name }));
const TARGETS = [...HOSTS.map((h) => ({ ip: h.ip, label: h.id === 'R' ? `Router ${h.ip}` : `${h.name} ${h.ip}` })), { ip: REMOTE_IP, label: `Web server ${REMOTE_IP}` }];

const INTRO = (
  <>Pick a sender and a destination, then press Send. Every host starts with an empty ARP cache, and the switch starts with an empty MAC
    table.</>
);

export function Stage() {
  const [world, setWorld] = useState<World>(emptyWorld);
  const [tx, setTx] = useState<Transmission | null>(null);
  const [sends, setSends] = useState(0);
  const [sender, setSender] = useState<HostId>('A');
  const [target, setTarget] = useState('192.168.1.20');
  const [timeout, setTimeoutS] = useState<number>(TIMEOUTS_S.initial);
  const setCaption = useSetCaption();
  useIntroCaption(INTRO);

  const frames = useMemo<ArpFrame[]>(() => (tx ? txFrames(tx, timeout) : [{ step: -1 }]), [tx, timeout]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const step: Step | null = tx && player.frame.step >= 0 ? tx.steps[player.frame.step] : null;
  const shown = step?.world ?? world;

  const doSend = () => {
    const t = send(world, sender, target, timeout);
    setTx(t);
    setWorld(t.world);
    setSends((n) => n + 1);
  };
  const doWait = () => {
    const w = wait(world, WAIT_S);
    setWorld(w);
    setTx(null);
    const stale = HOSTS.flatMap((h) => Object.values(w.caches[h.id])).filter((e) => isExpired(e, w.now, timeout)).length;
    setCaption(<>{WAIT_S} s pass (t = {w.now} s). {stale ? `${stale} cached ${stale === 1 ? 'entry is' : 'entries are'} now ${timeout} s old or more (struck through): the host that holds one must ARP again next time it needs it.` : 'Nothing has aged out yet.'}</>);
  };
  const doClear = () => {
    setWorld(clearSwitch(world));
    setTx(null);
    setCaption(<>The switch's MAC table is cleared (as after a reboot). The ARP caches are untouched, so the next send skips ARP, but the switch
      has to <span className="hl info">flood</span> the frame until it learns again.</>);
  };
  const changeSender = (id: HostId) => {
    setSender(id);
    if (target === HOSTS.find((h) => h.id === id)!.ip) setTarget(TARGETS.find((t) => t.ip !== HOSTS.find((h) => h.id === id)!.ip)!.ip);
  };
  const senderIp = HOSTS.find((h) => h.id === sender)!.ip;

  return (
    <StageFrame
      player={player}
      height={360}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'broadcast / flood' },
            { color: 'var(--ok)', label: 'unicast ARP reply' },
            { color: 'var(--sky)', label: 'IPv4 frame' },
            { color: 'var(--hi)', label: 'new table row' },
            { color: 'var(--violet)', label: 'gateway' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Sender" value={sender} onChange={changeSender} options={SENDERS} />
          <Button variant="primary" onClick={doSend}>Send</Button>
        </>,
        <ControlGroup key="to" label="Send to">
          {TARGETS.filter((t) => t.ip !== senderIp).map((t) => (
            <ChipButton key={t.ip} on={target === t.ip} onClick={() => setTarget(t.ip)}>{t.label}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Button onClick={doWait}>Wait {WAIT_S} s</Button>
          <Button onClick={doClear}>Clear switch table</Button>
          <Slider label="ARP cache timeout" value={timeout} min={TIMEOUTS_S.min} max={TIMEOUTS_S.max} step={TIMEOUTS_S.step} onChange={setTimeoutS} format={(v) => `${v} s`} />
        </>,
      ]}
    >
      <div className="stage-pad ea">
        <WideRegion minWidth={LAN_W} label="LAN diagram: scroll sideways to see all of it">
          <Lan step={step} sender={sender} runKey={`${sends}-${player.index}`} />
        </WideRegion>
        {tx && (
          <div className="ea-ladder">
            <SectionTitle weight="regular" hint={`t = ${shown.now} s`}>{tx.sender.name} → {tx.targetIp}</SectionTitle>
            <SequenceDiagram actors={ladderActors(tx)} messages={ladderMessages(tx)} step={player.frame.step} ariaLabel="ARP exchange" />
          </div>
        )}
        {step?.frame && <Inspector step={step} />}
        <div className="ea-tables">
          <SwitchTable world={shown} learned={step?.learnedMacs ?? []} />
          <Caches world={shown} timeout={timeout} learned={step?.learnedCache ?? []} />
        </div>
        <p className="ea-trust">
          <b>Why ARP is trusting.</b> Any host can answer "who has…", and nothing checks the reply, so a machine on the same LAN could claim
          another's IP and receive its traffic. Networks defend with dynamic ARP inspection on the switch (it checks replies against known
          DHCP leases) and static ARP entries on critical hosts such as the gateway.
        </p>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

// ── The LAN ─────────────────────────────────────────────────────────────

const LAN_W = 600;
const LAN_H = 270;
const HOST_Y = 52;
const SWITCH: Pt = { x: 260, y: 190 };
const SWITCH_W = 260;
const NODE = { w: 104, h: 48 };
const POS: Record<HostId, Pt> = {
  A: { x: 70, y: HOST_Y },
  B: { x: 190, y: HOST_Y },
  C: { x: 310, y: HOST_Y },
  D: { x: 430, y: HOST_Y },
  R: { x: 520, y: SWITCH.y },
};
/** Where each port sits on the switch: four along its top edge, the router's on its right edge. */
const portAt = (port: number): Pt =>
  port === 5 ? { x: SWITCH.x + SWITCH_W / 2, y: SWITCH.y } : { x: SWITCH.x - 90 + (port - 1) * 60, y: SWITCH.y - 22 };
/** Where a host's cable meets it. */
const plugOf = (h: Host): Pt => (h.id === 'R' ? { x: POS.R.x - NODE.w / 2, y: POS.R.y } : { x: POS[h.id].x, y: POS[h.id].y + NODE.h / 2 });

const PACKET_TONE: Record<string, string> = { 'arp-request': 'var(--info)', 'arp-reply': 'var(--ok)', data: 'var(--sky)' };
const PACKET_LABEL: Record<string, string> = { 'arp-request': 'ARP who-has', 'arp-reply': 'ARP reply', data: 'IPv4' };

/** `runKey` changes per send and per step, so each step's packets fly afresh. */
function Lan({ step, sender, runKey }: { step: Step | null; sender: HostId; runKey: string }) {
  const from = step?.from ? HOSTS.find((h) => h.id === step.from)! : null;
  const routes =
    step?.frame && from
      ? step.out!.map((p) => {
          const to = HOSTS.find((h) => h.port === p)!;
          return { to, path: [plugOf(from), portAt(from.port), portAt(p), plugOf(to)] };
        })
      : [];
  const flooding = step?.switchAction === 'flood';
  return (
    <svg className="ea-lan" viewBox={`0 0 ${LAN_W} ${LAN_H}`} width={LAN_W} role="img" aria-label={`LAN: four hosts and a router on one switch${step?.switchAction ? `; the switch ${step.switchAction}s this frame` : ''}`}>
      {HOSTS.map((h) => {
        const a = plugOf(h);
        const b = portAt(h.port);
        const lit = routes.some((r) => r.to.id === h.id) || from?.id === h.id;
        return <path key={h.id} className={`ea-cable ${lit ? 'is-lit' : ''}`} d={h.id === 'R' ? `M${a.x},${a.y} L${b.x},${b.y}` : `M${a.x},${a.y} V${(a.y + b.y) / 2} H${b.x} V${b.y}`} />;
      })}
      <path className="scene-edge" d={`M${POS.R.x},${POS.R.y + NODE.h / 2} V${LAN_H - 18}`} />
      <text className="ea-internet" x={POS.R.x} y={LAN_H - 4}>internet → {REMOTE_IP}</text>
      <SceneNode at={SWITCH} w={SWITCH_W} h={44} title="Switch" sub={flooding ? 'flooding' : step?.switchAction === 'forward' ? 'forwarding' : 'learns MAC → port'} on={!!step?.switchAction} tone={flooding ? 'info' : undefined} />
      {HOSTS.map((h) => {
        const p = portAt(h.port);
        return (
          <text key={h.id} className="ea-port" x={p.x + (h.id === 'R' ? -8 : 0)} y={p.y + (h.id === 'R' ? 4 : 13)}>
            {h.port}
          </text>
        );
      })}
      {HOSTS.map((h) => (
        <SceneNode
          key={h.id}
          at={POS[h.id]}
          w={NODE.w}
          h={NODE.h}
          title={h.id === 'R' ? 'Router' : h.name}
          sub={h.ip}
          on={h.id === sender}
          tone={h.id === 'R' ? 'violet' : undefined}
          className={h.id === 'R' ? 'ea-gateway' : ''}
        />
      ))}
      {step?.frame &&
        routes.map((r) => (
          <Packet
            key={`${runKey}-${r.to.id}`}
            path={r.path}
            label={PACKET_LABEL[step.kind]}
            color={PACKET_TONE[step.kind]}
            keyframes="even"
            duration={1.3}
            height={20}
          />
        ))}
    </svg>
  );
}

// ── Inspector and tables ────────────────────────────────────────────────

const HEADER_FIELDS: ByteField[] = [
  { from: 0, to: 5, tone: 'amber', label: 'destination MAC' },
  { from: 6, to: 11, tone: 'sky', label: 'source MAC' },
  { from: 12, to: 13, tone: 'pink', label: 'EtherType' },
];
const ARP_FIELDS: ByteField[] = [
  { from: 14, to: 21, tone: 'muted', label: 'ARP: types, lengths, opcode' },
  { from: 22, to: 31, tone: 'orange', label: 'sender MAC + IP' },
  { from: 32, to: 41, tone: 'violet', label: 'target MAC + IP' },
];

function Inspector({ step }: { step: Step }) {
  const f = step.frame!;
  const isArp = !!f.arp;
  return (
    <div className="ea-inspector">
      <SectionTitle weight="regular" hint={isArp ? `${ETH_HEADER_BYTES}-byte header + ${ARP_BODY_BYTES}-byte ARP body` : `${ETH_HEADER_BYTES}-byte header (IPv4 payload not shown)`}>
        Frame on the wire: {isArp ? `ARP ${f.arp!.op === 1 ? 'request' : 'reply'}` : 'IPv4'}
      </SectionTitle>
      <ByteGrid bytes={f.bytes} fields={isArp ? [...HEADER_FIELDS, ...ARP_FIELDS] : HEADER_FIELDS} ariaLabel="Frame bytes" />
    </div>
  );
}

function SwitchTable({ world, learned }: { world: World; learned: readonly string[] }) {
  const rows = Object.entries(world.table).sort((a, b) => a[1].port - b[1].port);
  return (
    <div className="ea-table">
      <SectionTitle weight="regular">Switch MAC table</SectionTitle>
      <table className="data-table">
        <thead><tr><th>MAC</th><th>Port</th><th>Host</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="ea-empty">empty: unknown destinations get flooded</td></tr>}
          {rows.map(([mac, e]) => (
            <tr key={mac} className={learned.includes(mac) ? 'ea-new' : ''}>
              <td>{mac}</td><td>{e.port}</td><td>{hostByMac(mac)?.name ?? '?'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Caches({ world, timeout, learned }: { world: World; timeout: number; learned: readonly { host: HostId; ip: string }[] }) {
  const rows = HOSTS.flatMap((h) => Object.entries(world.caches[h.id]).map(([ip, e]) => ({ host: h, ip, e })));
  return (
    <div className="ea-table">
      <SectionTitle weight="regular" hint={`entries live ${timeout} s`}>ARP caches</SectionTitle>
      <table className="data-table">
        <thead><tr><th>On</th><th>IP → MAC</th><th>Age</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="ea-empty">all empty</td></tr>}
          {rows.map(({ host, ip, e }) => {
            const expired = isExpired(e, world.now, timeout);
            const fresh = learned.some((l) => l.host === host.id && l.ip === ip);
            return (
              <tr key={`${host.id}-${ip}`} className={fresh ? 'ea-new' : expired ? 'ea-expired' : ''}>
                <td>{host.name}</td>
                <td>{ip} → {e.mac}</td>
                <td>{world.now - e.at} s{expired ? ' (aged out)' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
