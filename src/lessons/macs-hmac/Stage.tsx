import { useMemo, useState } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, TextArea, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { b64url, hasSubtle, toHex } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import { HONESTY, tripFrames } from './frames';
import {
  DEFAULT_ORDER, constantTimeEqual, deliver, mismatches, naiveEqual, parseOrder, randomKey, type Delivery, type Order, type TagKind,
} from './model';
import './styles.css';

const STEP_MS = 1500;
const SCENE = { w: 560, h: 160 } as const;
const AT = { sender: { x: 80, y: 46 }, channel: { x: 280, y: 46 }, receiver: { x: 480, y: 46 } } as const;
const ROW = { order: 108, tag: 138 } as const;

type UseCase = 'webhook' | 'cookie' | 'jwt';
const USE_CASES: { id: UseCase; label: string }[] = [
  { id: 'webhook', label: 'Webhook signature' },
  { id: 'cookie', label: 'Signed cookie' },
  { id: 'jwt', label: 'HS256 JWT' },
];

/** Where the tag rides in each use case, with the real tag in it. */
function carrier(useCase: UseCase, d: Delivery) {
  if (useCase === 'webhook') return `X-Signature: sha256=${toHex(d.tagSent)}`;
  if (useCase === 'cookie') return `order=${b64url(new TextEncoder().encode(d.sent))}.${b64url(d.tagSent)}`;
  return `<header>.<payload>.${b64url(d.tagSent)}  (an HS256 JWT's signature is HMAC-SHA-256 over header.payload)`;
}

const NAIVE = ['function naiveEqual(a, b) {', '  for (let i = 0; i < a.length; i++)', '    if (a[i] !== b[i]) return false; // early exit', '  return true;', '}'];
const CONSTANT = ['function constantTimeEqual(a, b) {', '  let diff = 0;', '  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];', '  return diff === 0; // always reads every byte', '}'];

/** The order with the edited span marked. */
function MessageView({ text, edit }: { text: string; edit: Delivery['edit'] }) {
  if (!edit) return <code className="mac-msg">{text}</code>;
  return (
    <code className="mac-msg">
      {text.slice(0, edit.from)}
      <mark className="mac-edit">{text.slice(edit.from, edit.to)}</mark>
      {text.slice(edit.to)}
    </code>
  );
}

export function Stage() {
  const [key, setKey] = useState(() => (hasSubtle() ? randomKey() : null));
  const [round, setRound] = useState(0);
  const [draft, setDraft] = useState(DEFAULT_ORDER);
  const [order, setOrder] = useState<Order>({ text: DEFAULT_ORDER, amount: 10 });
  const [kind, setKind] = useState<TagKind>('hmac');
  const [tamper, setTamper] = useState(true);
  const [useCase, setUseCase] = useState<UseCase>('webhook');
  const parsed = parseOrder(draft);

  const d = useAsyncValue(
    () => (key ? deliver(kind, key, order, tamper) : Promise.resolve(null)),
    `${kind}:${tamper}:${round}:${order.text}`,
    { keepPrevious: true },
  );
  const frames = useMemo(() => (d ? tripFrames(d, tamper) : [{ phase: 0, say: <>Computing tags…</> }]), [d, tamper]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { phase } = player.frame;

  const edit = (text: string) => {
    setDraft(text);
    const r = parseOrder(text);
    if (r.ok) setOrder(r.order);
  };
  const newKey = () => {
    setKey(randomKey());
    setRound(round + 1);
  };

  if (!key) {
    return (
      <StageFrame>
        <p className="stage-pad mac-error">Web Crypto isn't available here (it needs https or localhost), so there are no real tags to show.</p>
      </StageFrame>
    );
  }

  const arrived = phase >= 4 && d;
  const bad = arrived ? mismatches(d.tagReceived, d.expected) : [];
  const naive = d ? naiveEqual(d.tagReceived, d.expected) : null;
  const constant = d ? constantTimeEqual(d.tagReceived, d.expected) : null;
  const where = phase <= 0 ? [AT.sender] : phase === 1 ? [AT.sender, AT.channel] : phase === 2 ? [AT.channel] : phase === 3 ? [AT.channel, AT.receiver] : [AT.receiver];
  const pathAt = (y: number) => (where.length === 1 ? [{ x: where[0].x, y }, { x: where[0].x, y }] : where.map((p) => ({ x: p.x, y })));
  const edited = !!d?.edit && phase >= 2;
  const recomputed = edited && d?.kind === 'hash';
  const receiverTone = !arrived ? undefined : d.verdict === 'forged' ? 'bad' : 'ok';

  return (
    <StageFrame
      player={player}
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the order (message)' },
            { color: 'var(--violet)', label: 'the tag' },
            { color: 'var(--hi)', label: 'the edited field' },
            { color: 'var(--ok)', label: 'matching tag bytes; tampering caught' },
            { color: 'var(--bad)', label: 'mismatched bytes; forged' },
          ]}
        />
      }
      controls={[
        <>
          <Toggle label="Channel" value={tamper} onChange={setTamper} off="Passes it on" on="Edits the amount" />
          <Toggle label="Tag" value={kind === 'hash'} onChange={(h) => setKind(h ? 'hash' : 'hmac')} off="HMAC-SHA-256" on="Plain SHA-256" />
          <Button onClick={newKey}>New key</Button>
        </>,
        <ControlGroup key="uc" label="Where the tag rides">
          {USE_CASES.map((u) => (
            <ChipButton key={u.id} on={useCase === u.id} onClick={() => setUseCase(u.id)}>{u.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad mac">
        <WideRegion minWidth={SCENE.w} label="Sender, channel and receiver: scroll sideways to see all of it">
          <svg className="mac-scene" viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} role="img" aria-label="The order and its tag travel from the sender through the channel to the receiver">
            <line className="scene-edge" x1={AT.sender.x} y1={AT.sender.y} x2={AT.receiver.x} y2={AT.receiver.y} />
            <SceneNode at={AT.sender} w={124} h={56} title="Sender" sub={kind === 'hmac' ? 'has the key 🔒' : 'no key used'} on={phase === 0} />
            <SceneNode at={AT.channel} w={124} h={56} title="Channel" sub={tamper ? 'an editor, no key' : 'passes it on'} on={phase === 2} />
            <SceneNode at={AT.receiver} w={124} h={56} title="Receiver" sub={kind === 'hmac' ? 'has the key 🔒' : 'no key used'} on={phase >= 3} tone={receiverTone} />
            <Packet key={`o${phase}`} path={pathAt(ROW.order)} label={edited ? 'order (edited)' : 'order'} color={edited ? 'var(--hi)' : 'var(--info)'} arrive="stay" duration={0.9} />
            <Packet key={`t${phase}`} path={pathAt(ROW.tag)} label={recomputed ? 'tag (recomputed)' : 'tag'} color="var(--violet)" arrive="stay" duration={0.9} />
          </svg>
        </WideRegion>
        <div className="mac-cols">
          <Box className="mac-col">
            <TextArea label="The order (JSON)" value={draft} onChange={edit} rows={3} />
            {!parsed.ok && <Hint className="mac-error">{parsed.error} Still sending the last valid order.</Hint>}
            {d && (
              <>
                <SectionTitle>Arrives as</SectionTitle>
                <MessageView text={d.received} edit={phase >= 2 ? d.edit : null} />
                <SectionTitle>Tag rides as</SectionTitle>
                <code className="mac-carrier">{carrier(useCase, d)}</code>
              </>
            )}
          </Box>
          {d && (
            <Box className="mac-col">
              <SectionTitle>Tag that arrived</SectionTitle>
              <ByteGrid bytes={d.tagReceived} toneOf={() => 'violet'} ariaLabel="The tag that arrived" />
              <SectionTitle>Receiver computes {kind === 'hmac' ? 'HMAC-SHA-256(key, order)' : 'SHA-256(order)'}</SectionTitle>
              {arrived ? (
                <ByteGrid bytes={d.expected} toneOf={(i) => (bad.includes(i) ? 'bad' : 'ok')} ariaLabel="The tag the receiver computes" />
              ) : (
                <p className="mac-muted">…when the order arrives.</p>
              )}
            </Box>
          )}
        </div>
        {d && naive && constant && (
          <Box className="mac-compare">
            <SectionTitle>Comparing tags</SectionTitle>
            <div className="mac-code">
              <div>
                <CodePanel title="tempting: stops at the first difference" lines={NAIVE} gutter="none" />
                <p>Looked at {naive.looked} of {d.expected.length} bytes before answering.</p>
              </div>
              <div>
                <CodePanel title="constant time (the idea; in JS use a platform function)" lines={CONSTANT} gutter="none" />
                <p>Looked at all {constant.looked} bytes.</p>
              </div>
            </div>
            <p className="mac-muted">
              An early exit takes longer the more leading bytes match, which can reveal how close a guessed tag is. Compare tags in constant
              time: crypto.timingSafeEqual in Node, hmac.compare_digest in Python, or let crypto.subtle.verify do the check. (Not timed on
              screen.)
            </p>
          </Box>
        )}
        {kind === 'hash' && (
          <p className="mac-muted">
            Putting a key in, as hash(key ‖ message), isn't enough either: with some hash constructions others can extend a tagged message
            without the key. HMAC's nested design exists to rule that out.
          </p>
        )}
        <p className="mac-muted">{HONESTY}</p>
      </div>
    </StageFrame>
  );
}
