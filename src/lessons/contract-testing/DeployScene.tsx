import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { mismatchText } from './contract';
import { deployCaption } from './captions';
import { FIELDS, type Field } from './consumer';
import {
  MAX_VERSIONS, START_WORLD, consumerGate, deployProvider, matrixOf, providerGate, releaseConsumer, releaseProvider, setConsumerLive, type World,
} from './deploy';
import { CHANGES, type ChangeId } from './provider';

const MATRIX_MIN_WIDTH = 460;

export function DeployScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [world, setWorld] = useState<World>(START_WORLD);
  const [change, setChange] = useState<ChangeId>('add-nickname');
  const [field, setField] = useState<Field>('plan');

  const caption = useMemo(() => deployCaption(world), [world]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const matrix = matrixOf(world);
  const providerFull = world.providers.length >= MAX_VERSIONS;
  const consumerFull = world.consumers.length >= MAX_VERSIONS;

  return (
    <StageFrame
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'verifies, or the gate is open' },
            { color: 'var(--bad)', label: 'a contract fails, or the gate is closed' },
            { color: 'var(--info)', label: 'running in production' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <label className="ct-select-label">
            <span>Next provider version adds</span>
            <select className="ct-select" value={change} onChange={(e) => setChange(e.target.value as ChangeId)}>
              {CHANGES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <Button disabled={providerFull} onClick={() => setWorld((w) => releaseProvider(w, change))}>Release provider version</Button>
        </>,
        <>
          <label className="ct-select-label">
            <span>Next consumer version also reads</span>
            <select className="ct-select" value={field} onChange={(e) => setField(e.target.value as Field)}>
              {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <Button disabled={consumerFull} onClick={() => setWorld((w) => releaseConsumer(w, field))}>Release consumer version</Button>
          <Button onClick={() => setWorld(START_WORLD)}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad ct">
        <WideRegion minWidth={MATRIX_MIN_WIDTH} label="Verification matrix: scroll sideways to see all of it">
          <table className="data-table ct-matrix">
            <caption className="ct-caption">Each cell replays a consumer version's contract against a provider version</caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                {world.consumers.map((c, ci) => (
                  <th key={ci} scope="col">
                    <div>Consumer v{ci + 1}</div>
                    <ChipButton tone="info" on={c.live} onClick={() => setWorld((w) => setConsumerLive(w, ci, !c.live))}>{c.live ? 'in production' : 'not live'}</ChipButton>
                  </th>
                ))}
                <th scope="col">Gate</th>
              </tr>
            </thead>
            <tbody>
              {world.providers.map((p, pi) => {
                const gate = providerGate(world, pi);
                return (
                  <tr key={pi}>
                    <th scope="row" className="ct-rowhead">
                      <div>Provider v{pi + 1}</div>
                      <span className="muted">{p.changes.length ? p.changes.join(', ') : 'the base handler'}</span>
                      {pi === world.liveProvider && <span className="chip tone-info">in production</span>}
                    </th>
                    {world.consumers.map((_, ci) => {
                      const v = matrix[pi][ci];
                      return (
                        <td key={ci} className={`tone-${v.ok ? 'ok' : 'bad'} ct-cell`} title={v.ok ? 'verifies' : mismatchText(v.mismatches[0])}>
                          <b>{v.ok ? 'verifies' : 'fails'}</b>
                          {!v.ok && <span className="ct-why">{v.mismatches[0].path}</span>}
                        </td>
                      );
                    })}
                    <td>
                      <span className={`chip tone-${gate.ok ? 'ok' : 'bad'}`}>{gate.ok ? 'can deploy' : 'blocked'}</span>
                      {pi !== world.liveProvider && <Button disabled={!gate.ok} onClick={() => setWorld((w) => deployProvider(w, pi))}>Deploy</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </WideRegion>

        <Box className="ct-card">
          <SectionTitle weight="regular" hint="consumer versions against the provider in production">Can this consumer go out?</SectionTitle>
          <ul className="ct-list">
            {world.consumers.map((_, ci) => {
              const gate = consumerGate(world, ci);
              return (
                <li key={ci} className={`log-row tone-${gate.ok ? 'ok' : 'bad'}`}>
                  Consumer v{ci + 1} {gate.ok ? `can go out: it verifies against provider v${world.liveProvider + 1}` : `cannot: ${gate.blockers[0].detail}`}.
                </li>
              );
            })}
          </ul>
        </Box>
        <div className="ct-chips">
          <Provenance kind="toy">a toy version of a verification matrix and deploy check</Provenance>
          <Provenance kind="from-memory">tools such as Pact's broker offer a can-i-deploy check on the same idea; check Pact's documentation for what it really does</Provenance>
        </div>
        <Hint block>A provider is blocked by the consumer versions marked in production, since an old app on phones still sends old requests; a version nobody runs cannot block it.</Hint>
      </div>
    </StageFrame>
  );
}
