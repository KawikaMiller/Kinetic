import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark } from '../../components/TreeSvg';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { HANDLER_CODE, pathFrames } from './frames';
import { FILE_IDS, ROOT, SAMPLES, UPLOADS, childrenOf, entryAt, nameOf, parseName, type HandlerMode } from './vfs';

const W = 640;
const H = 300;
const NODE = { w: 108, h: 26 };
const SMALLEST_TEXT_PX = 11;
const STEP_MS = 1300;
const LAST_FRAME = 999;
const MODES: { value: HandlerMode; label: string }[] = [
  { value: 'join', label: 'Join the name' },
  { value: 'check', label: 'Resolve, then check the root' },
  { value: 'id', label: 'Look up by ID' },
];
const DEFAULT_NAME = SAMPLES[0].name;

const shape = { root: ROOT, children: (id: string) => childrenOf(id) };

export function PathScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<HandlerMode>('join');
  const [name, setName] = useState(DEFAULT_NAME);
  const [draft, setDraft] = useState<string | null>(null);
  const frames = useMemo(() => pathFrames(mode, name), [mode, name]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const outcome = f.outcome;
  const refusal = draft === null ? null : parseName(draft);
  const refusalText = refusal && !refusal.ok ? refusal.error : null;

  const choose = (next: string) => {
    player.queueNext({ play: true });
    setDraft(null);
    setName(next);
  };
  const type = (text: string) => {
    setDraft(text);
    const r = parseName(text);
    if (r.ok) {
      player.queueNext({ play: false, from: LAST_FRAME });
      setName(r.value);
    }
  };
  const pickMode = (m: HandlerMode) => {
    player.queueNext({ play: true });
    setMode(m);
  };

  const markOf = (id: string): TreeNodeMark | null => {
    if (outcome?.path === id && entryAt(id)) return { tone: outcome.escaped ? 'bad' : 'ok', fill: 'solid' };
    if (f.current === id) return { tone: 'hi', fill: 'solid' };
    if (f.trail.includes(id)) return { tone: 'violet', fill: 'tint' };
    return null;
  };
  const log = [
    mode === 'id' ? `GET /download?id=${name}` : `GET /download?name=${name}`,
    ...(outcome ? [{ text: `${outcome.status === 'served' ? '200 served' : outcome.status === 'rejected' ? '403 rejected' : '404 not found'}${outcome.path ? `: ${outcome.path}` : ''}`, tone: outcome.status === 'served' && outcome.escaped ? ('bad' as const) : outcome.status === 'rejected' ? ('ok' as const) : ('info' as const) }] : []),
    ...(refusalText ? [{ text: `name refused: ${refusalText}`, tone: 'orange' as const }] : []),
  ];

  return (
    <StageFrame
      player={player}
      height={640}
      stats={
        <Stats>
          <Stat className="dpt-open" label="Opens" value={outcome ? (outcome.path ?? 'no path') : '…'} color={!outcome ? undefined : outcome.escaped ? 'var(--bad)' : 'var(--ok)'} sub={outcome ? (outcome.escaped ? 'outside uploads/' : mode === 'id' ? 'a row from the table' : 'inside uploads/') : 'play to find out'} />
          <Stat label="Result" value={outcome ? outcome.status : '…'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'current segment' },
            { color: 'var(--violet)', label: 'climbed (..) and visited' },
            { color: 'var(--ok)', label: 'uploads root, and a result inside it' },
            { color: 'var(--bad)', label: 'a result outside it' },
            { color: 'var(--dim)', label: 'untouched' },
          ]}
        />
      }
      controls={[
        picker,
        <Segmented key="m" label="Handler" value={mode} onChange={pickMode} options={MODES} />,
        <>
          <ControlGroup label="Names">
            {(mode === 'id' ? [...FILE_IDS.map((x) => x.id), ...SAMPLES.slice(0, 1).map((s) => s.name)] : SAMPLES.map((s) => s.name)).map((n) => (
              <ChipButton key={n} tone="info" on={name === n && draft === null} onClick={() => choose(n)}>{n}</ChipButton>
            ))}
          </ControlGroup>
          <TextField label="Your own" value={draft ?? name} onChange={type} onBlur={() => setDraft(null)} width={260} spellCheck={false} />
        </>,
      ]}
    >
      <div className="stage-pad dpt">
        <WideRegion minWidth={minWidthForText(W, SMALLEST_TEXT_PX)} label="Fictional file tree: scroll sideways to see all of it">
          <TreeSvg
            shape={shape}
            layout="tidy"
            width={W}
            height={H}
            levelGap={72}
            top={30}
            className="dpt-tree"
            ariaLabel="A fictional file tree under /srv/shop"
            nodeMark={markOf}
            nodeClass={(id) => `${id === UPLOADS ? 'dpt-uploads' : ''} ${f.trail.includes(id) || f.current === id || outcome?.path === id ? '' : 'dpt-untouched'}`}
            edgeMark={(parent, child) => (f.climbs.some(([from, to]) => from === child && to === parent) ? { tone: 'violet', dashed: false } : null)}
            renderNode={(id) => (
              <>
                <rect className="dpt-box" x={-NODE.w / 2} y={-NODE.h / 2} width={NODE.w} height={NODE.h} rx={7} />
                <text className="dpt-label" y={4} textAnchor="middle">{id === ROOT ? ROOT : nameOf(id)}</text>
                {entryAt(id)?.kind === 'dir' && id !== ROOT && <text className="dpt-slash" x={NODE.w / 2 - 10} y={4} textAnchor="middle">/</text>}
              </>
            )}
          />
        </WideRegion>
        <div className="dpt-split">
          <Box>
            <SectionTitle hint={mode === 'check' ? 'the trailing / matters' : 'toy code'}>Download handler</SectionTitle>
            <CodePanel lines={HANDLER_CODE[mode]} active={f.line} gutter="number" nowStyle="bar" />
          </Box>
          <Box>
            <SectionTitle>Request log</SectionTitle>
            <ConsolePanel lines={log} title="server" />
          </Box>
        </div>
        <Hint block>
          Fictional file tree and loader; nothing on your machine is read, and nothing is executed. Encoded or alternate separators are not modelled: check after decoding, on the platform&apos;s own resolver.
        </Hint>
      </div>
    </StageFrame>
  );
}
