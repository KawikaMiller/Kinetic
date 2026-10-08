import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { GraphView } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import {
  ACCESS_LOG, LOG_DAYS, POLICIES, PRINCIPAL, RESOURCES, allowedPairs, blastRadius, keepsServiceWorking, reachOf, suggestPolicy, totalPairs, usedResources,
} from './account';
import { blastCaption } from './captions';
import type { Statement } from './policy';

const W = 580;
const H = 330;
const BOX = { w: 150, h: 32 };
const PRINCIPAL_AT = { x: 100, y: H / 2 };
const RESOURCE_X = 470;
const FIRST_Y = 44;
const GAP = 48;
const SMALLEST_TEXT_PX = 11;

const SUGGESTED = { id: 'suggested', label: 'Suggested from the 90-day log', statements: suggestPolicy(ACCESS_LOG) };
const OPTIONS = [...POLICIES, SUGGESTED];
const DEFAULT_OPTION = 'storage-all';

const statementLine = (s: Statement) => `${s.effect} ${s.action} on ${s.resource}`;
const short = (action: string) => action.split(':')[1];

export function BlastScene({ picker }: { picker: ReactNode }) {
  const [optionId, setOptionId] = useState(DEFAULT_OPTION);
  const [compromised, setCompromised] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const setCaption = useSetCaption();
  const statements = OPTIONS.find((o) => o.id === optionId)!.statements;
  const reach = reachOf(statements);
  const radius = blastRadius(statements);
  const used = usedResources(ACCESS_LOG);
  const works = keepsServiceWorking(statements, ACCESS_LOG);

  useIntroCaption(<>A fictional account and one service role. Compromise the role and every resource it can reach lights up. Narrow the policy and the radius shrinks.</>);

  const update = (id: string, c: boolean) => {
    setOptionId(id);
    setCompromised(c);
    setCaption(blastCaption(OPTIONS.find((o) => o.id === id)!.statements, c), { quiet: true });
  };

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Blast radius" value={`${radius.length} of ${RESOURCES.length}`} color={compromised ? 'var(--bad)' : undefined} sub="resources reachable" />
          <Stat label="Allowed pairs" value={`${allowedPairs(statements)} of ${totalPairs}`} sub={`action on resource; ${ACCESS_LOG.length} used in ${LOG_DAYS} days`} />
          <Stat label="Service still works" value={works ? 'yes' : 'no'} color={works ? 'var(--ok)' : 'var(--orange)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'reachable by the role' },
            { color: 'var(--orange)', label: 'compromised role' },
            { color: 'var(--bad)', label: 'reachable by an attacker' },
            { color: 'var(--violet)', label: 'used in the last 90 days' },
            { color: 'var(--dim)', label: 'not reachable' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="p" label="Policy">
          {OPTIONS.map((o) => (
            <ChipButton key={o.id} tone="info" on={optionId === o.id} onClick={() => update(o.id, compromised)}>{o.label}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Toggle label={`${PRINCIPAL} is`} value={compromised} onChange={(c) => update(optionId, c)} off="Fine" on="Compromised" />
          <Toggle label="90-day usage" value={overlay} onChange={setOverlay} off="Hidden" on="Shown" />
        </>,
      ]}
    >
      <div className="stage-pad iam">
        <WideRegion minWidth={minWidthForText(W, SMALLEST_TEXT_PX)} label="Account graph: scroll sideways to see all of it">
          <GraphView
            nodes={[
              { id: 'principal', label: PRINCIPAL, at: PRINCIPAL_AT, shape: 'box' },
              ...RESOURCES.map((r, i) => ({ id: r.id, label: r.label, at: { x: RESOURCE_X, y: FIRST_Y + i * GAP }, shape: 'box' as const })),
            ]}
            edges={reach.filter((r) => r.allowed.length).map((r) => ({ from: 'principal', to: r.resource.id }))}
            directed
            layout="fixed"
            width={W}
            height={H}
            box={BOX}
            nodeMark={(id) => {
              if (id === 'principal') return compromised ? { tone: 'orange', fill: 'solid' } : null;
              if (!radius.includes(id)) return null;
              return { tone: compromised ? 'bad' : 'info', fill: 'tint' };
            }}
            nodeColor={(id) => (id !== 'principal' && !radius.includes(id) ? 'var(--dim)' : undefined)}
            edgeMark={() => ({ tone: compromised ? 'bad' : 'info' })}
            renderNode={(n, at, base) => {
              const r = reach.find((x) => x.resource.id === n.id);
              if (!r) return base;
              return (
                <>
                  {base}
                  <text x={at.x + BOX.w / 2 + 8} y={at.y + 4} className="iam-badge">
                    {r.allowed.length}/{r.resource.actions.length}
                  </text>
                  {overlay && used.includes(r.resource.id) && <circle cx={at.x - BOX.w / 2 - 10} cy={at.y} r={5} className="iam-used" />}
                </>
              );
            }}
            ariaLabel={`${PRINCIPAL} can reach ${radius.length} of ${RESOURCES.length} resources`}
            className="iam-graph"
          />
        </WideRegion>

        <div className="iam-split">
          <Box>
            <SectionTitle hint={OPTIONS.find((o) => o.id === optionId)!.label}>The policy</SectionTitle>
            <CodePanel lines={statements.map(statementLine)} gutter="none" />
          </Box>
          <Box>
            <SectionTitle hint={`access log, last ${LOG_DAYS} days`}>Allowed versus used</SectionTitle>
            <table className="data-table">
              <thead><tr><th scope="col">Resource</th><th scope="col">Allowed</th><th scope="col">Used</th></tr></thead>
              <tbody>
                {reach.map((r) => (
                  <tr key={r.resource.id}>
                    <th scope="row">{r.resource.label}</th>
                    <td className={r.allowed.length && compromised ? 'iam-bad' : ''}>{r.allowed.map(short).join(', ') || '–'}</td>
                    <td className="iam-usedcell">{ACCESS_LOG.filter((e) => e.resource === r.resource.name).map((e) => `${short(e.action)} (${e.count})`).join(', ') || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </div>
        <p className="iam-risk">
          An attacker with an over-broad role can reach everything that role reaches. A policy that grants only what the log shows leaves them little to reach.
        </p>
        <Hint block>Simulated cloud account with a simplified policy language; the access log is lesson-authored. Real IAM systems add conditions, boundaries and resource policies.</Hint>
      </div>
    </StageFrame>
  );
}
