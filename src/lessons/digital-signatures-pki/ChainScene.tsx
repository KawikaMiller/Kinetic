import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { ChipButton, ControlGroup, Legend } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import { HONESTY, chainFrames, chainNodes, statuses, type ChainFrame, type ChainNode, type NodeStatus } from './frames';
import { LESSON_NOW, REASON_TEXT, makeKeys, scenario, validate, type Preset } from './pki';

const STEP_MS = 1400;
const CARD = { w: 250, h: 70 } as const;
const TREE_W = 300;
const LEVEL_GAP = 104;

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'valid', label: 'Valid chain' },
  { id: 'expired', label: 'Expired leaf' },
  { id: 'not-yet-valid', label: 'Not yet valid' },
  { id: 'name-mismatch', label: 'www.shop.example' },
  { id: 'unknown-root', label: 'Unknown root' },
  { id: 'missing-intermediate', label: 'Missing intermediate' },
  { id: 'not-ca', label: 'CA flag off' },
  { id: 'tampered', label: 'Tampered leaf' },
  { id: 'self-signed', label: 'Self-signed' },
];

const PLACEHOLDER: ChainFrame[] = [{ shown: 0, done: false, say: <>Generating keys and issuing certificates…</> }];

function Card({ node, status, reason }: { node: ChainNode; status: NodeStatus; reason: string | null }) {
  const x = -CARD.w / 2;
  const y = -CARD.h / 2;
  if (!node.cert) {
    return (
      <g className="dsp-card is-missing">
        <rect x={x} y={y} width={CARD.w} height={CARD.h} rx={10} />
        <text x={0} y={-4}>intermediate: not sent</text>
        {status === 'bad' && <text className="dsp-reason" x={0} y={16}>missing intermediate</text>}
      </g>
    );
  }
  const c = node.cert;
  return (
    <g className={`dsp-card is-${status} ${node.kind === 'anchor' ? 'is-anchor' : ''}`}>
      <rect x={x} y={y} width={CARD.w} height={CARD.h} rx={10} />
      {node.kind === 'anchor' && <rect className="dsp-store" x={x - 6} y={y - 6} width={CARD.w + 12} height={CARD.h + 12} rx={14} />}
      <text className="dsp-subject" x={0} y={-14}>{c.subject}{status === 'ok' ? ' ✓' : status === 'bad' ? ' ✕' : ''}</text>
      <text x={0} y={4}>issued by {c.issuer === c.subject ? 'itself' : c.issuer}</text>
      <text x={0} y={21}>{reason ?? `${c.isCA ? 'CA' : 'not a CA'} · ${c.notBefore.slice(0, 10)} to ${c.notAfter.slice(0, 10)}`}</text>
    </g>
  );
}

export function ChainScene({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<Preset>('valid');
  const keys = useAsyncValue(() => makeKeys(), 'keys');
  const run = useAsyncValue(
    async () => {
      if (!keys) return null;
      const s = await scenario(preset, keys);
      return { s, v: await validate(s.chain, s.store, s.host) };
    },
    `${preset}:${keys ? 'k' : '-'}`,
  );
  const frames = useMemo(() => (run ? chainFrames(run.s, run.v) : PLACEHOLDER), [run]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const nodes = useMemo(() => (run ? chainNodes(run.s) : []), [run]);
  const status = run ? statuses(nodes, run.v, player.frame.shown, player.frame.done) : {};
  const failing = run && run.v.reason && player.frame.shown === run.v.checks.length ? run.v.checks.at(-1)! : null;

  const shape = {
    root: nodes[0]?.id ?? 'none',
    children: (id: string) => {
      const i = nodes.findIndex((n) => n.id === id);
      return i >= 0 && i + 1 < nodes.length ? [nodes[i + 1].id] : [];
    },
  };
  const reasonFor = (n: ChainNode) => {
    if (!failing || !run) return null;
    if (n.kind === 'missing') return null;
    return n.chainIndex === failing.cert ? REASON_TEXT[run.v.reason!].split(' (')[0] : null;
  };

  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'not checked yet' },
            { color: 'var(--hi)', label: 'being checked' },
            { color: 'var(--ok)', label: 'verified link' },
            { color: 'var(--bad)', label: 'failing link, with the reason' },
            { color: 'var(--violet)', label: 'trust store (simulated)', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="p" label="Try">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} on={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad dsp-chain">
        <div className="dsp-chain-row">
          {nodes.length > 0 && (
            <TreeSvg
              className="dsp-tree"
              shape={shape}
              layout="tidy"
              width={TREE_W}
              height={LEVEL_GAP * (nodes.length - 1) + CARD.h + 40}
              top={CARD.h / 2 + 10}
              pad={TREE_W / 2}
              levelGap={LEVEL_GAP}
              renderNode={(id) => {
                const n = nodes.find((x) => x.id === id)!;
                return <Card node={n} status={status[id] ?? 'unchecked'} reason={reasonFor(n)} />;
              }}
              edgeMark={(_, child) => (status[child] === 'bad' ? { tone: 'bad', dashed: true } : null)}
              ariaLabel={`Certificate chain for ${run?.s.host ?? 'shop.example'}`}
            />
          )}
          <Box className="dsp-side">
            <SectionTitle>Visiting</SectionTitle>
            <p className="dsp-host">{run?.s.host ?? '…'}</p>
            <SectionTitle>Lesson clock</SectionTitle>
            <p>{LESSON_NOW.slice(0, 10)} (fixed for the demo)</p>
            <SectionTitle>Trust store</SectionTitle>
            <p className="dsp-store-list">{run ? run.s.store.map((c) => c.subject).join(', ') : '…'}</p>
            <p className="dsp-muted">
              Revocation is a separate check: a CA can withdraw a certificate before it expires and publish that in a CRL or (fading out)
              via OCSP; each browser handles it its own way. Not shown here.
            </p>
          </Box>
        </div>
        <p className="dsp-muted">{HONESTY} The leaf is checked first, then each issuer up to a root you already trust, as in the TLS lesson.</p>
      </div>
    </StageFrame>
  );
}
