import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { ValidatedField } from './Field';
import { policyFrames, type PolicyFrame } from './frames';
import { MAX_STATEMENTS, evaluate, parseConcrete, parsePattern, type Request, type Statement } from './policy';
import { DEFAULT_PRESET, PRESETS, type Preset } from './presets';

const STEP_MS = 1500;
/** Past the last frame: a `queueNext` start index is clamped, so this means "show the verdict". */
const LAST_FRAME = 999;
const NEW_STATEMENT = { effect: 'Allow', action: 'storage:GetObject', resource: 'bucket/reports/*' } as const;

type RowState = 'idle' | 'now' | 'ok' | 'bad' | 'dim';

function rowState(s: Statement, f: PolicyFrame, matches: Record<string, boolean>): RowState {
  if (f.current === s.id) return 'now';
  if (!f.checked.includes(s.id)) return 'idle';
  if (!matches[s.id]) return 'dim';
  return s.effect === 'Deny' ? 'bad' : 'ok';
}

export function PolicyScene({ picker }: { picker: ReactNode }) {
  const [statements, setStatements] = useState<Statement[]>(DEFAULT_PRESET.statements);
  const [request, setRequest] = useState<Request>(DEFAULT_PRESET.request);
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET.id);
  const [loadId, setLoadId] = useState(0);
  const nextId = useRef(10);
  const addButton = useRef<HTMLButtonElement>(null);

  const frames = useMemo(() => policyFrames(statements, request), [statements, request]);
  const matches = useMemo(() => evaluate(statements, request).matches, [statements, request]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const verdict = f.result;

  const load = (p: Preset) => {
    player.queueNext({ play: true });
    setStatements(p.statements);
    setRequest(p.request);
    setPresetId(p.id);
    setLoadId((n) => n + 1);
  };
  /** An edit shows its verdict at once instead of replaying the walk. */
  const edit = (next: { statements?: Statement[]; request?: Request }) => {
    player.queueNext({ play: false, from: LAST_FRAME });
    if (next.statements) setStatements(next.statements);
    if (next.request) setRequest(next.request);
    setPresetId(null);
  };
  const patch = (id: string, p: Partial<Statement>) => edit({ statements: statements.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const remove = (id: string) => {
    edit({ statements: statements.filter((s) => s.id !== id) });
    addButton.current?.focus();
  };
  const add = () => edit({ statements: [...statements, { id: `s${nextId.current++}`, ...NEW_STATEMENT }] });
  const order = (id: string) => f.checked.indexOf(id) + 1;

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Decision" value={verdict ? verdict.decision : '…'} color={!verdict ? undefined : verdict.decision === 'allow' ? 'var(--ok)' : 'var(--bad)'} sub={verdict ? verdict.reason.replace('-', ' ') : 'play, or step through'} />
          <Stat label="Statements" value={statements.length} sub={`${statements.filter((s) => s.effect === 'Deny').length} deny`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the request' },
            { color: 'var(--hi)', label: 'statement being checked' },
            { color: 'var(--ok)', label: 'matching Allow' },
            { color: 'var(--bad)', label: 'matching Deny, or denied' },
            { color: 'var(--dim)', label: 'does not match' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="presets" label="Presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={presetId === p.id} onClick={() => load(p)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad iam">
        <Box className="iam-request">
          <SectionTitle hint="a request names one real action on one real resource">Request from {request.principal}</SectionTitle>
          <div className="iam-fields" key={`r${loadId}`}>
            <ValidatedField label="Action" value={request.action} parse={parseConcrete} onCommit={(action) => edit({ request: { ...request, action } })} />
            <ValidatedField label="Resource" value={request.resource} parse={parseConcrete} onCommit={(resource) => edit({ request: { ...request, resource } })} width={230} />
          </div>
        </Box>

        <Box className="iam-policy">
          <SectionTitle hint="every Deny is checked first, then every Allow">Policy attached to {request.principal}</SectionTitle>
          <ol className="iam-rows" aria-label="Policy statements" key={`p${loadId}`}>
            {statements.map((s) => (
              <li key={s.id} className={`iam-row is-${rowState(s, f, matches)}`}>
                <span className="iam-order" title="order the rule looked at it">{order(s.id) || ''}</span>
                <ChipButton tone="muted" size="md" ariaLabel={`Effect ${s.effect}: switch`} onClick={() => patch(s.id, { effect: s.effect === 'Allow' ? 'Deny' : 'Allow' })}>{s.effect}</ChipButton>
                <ValidatedField label="Action pattern" value={s.action} parse={parsePattern} onCommit={(action) => patch(s.id, { action })} />
                <ValidatedField label="Resource pattern" value={s.resource} parse={parsePattern} onCommit={(resource) => patch(s.id, { resource })} width={230} />
                <ChipButton tone="bad" ariaLabel={`Remove statement ${s.effect} ${s.action}`} onClick={() => remove(s.id)}>×</ChipButton>
              </li>
            ))}
          </ol>
          <Button ref={addButton} onClick={add} disabled={statements.length >= MAX_STATEMENTS}>Add a statement</Button>
          {statements.length === 0 && <p className="iam-empty">No statements: everything is denied by default.</p>}
        </Box>
        <Hint block>
          Simulated cloud account with a simplified policy language: * matches any run of characters, including /. Real IAM systems add conditions, permission boundaries and resource policies.
        </Hint>
      </div>
    </StageFrame>
  );
}
