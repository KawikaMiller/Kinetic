import type { CSSProperties } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { useRadioGroup } from '../../components/useRadioGroup';
import { Stat } from '../../components/ui';
import { integer, pct, sig } from '../../core/format';
import { hurtLimitText, msText, tenantName } from './captions';
import { ERROR_LIMIT, P99_LIMIT_MS, SHARDS, SHARD_CAPACITY, TENANTS, type Run, type TenantStats } from './shardSim';

const tone = (t: TenantStats, actor: number): string => (t.tenant === actor ? 'orange' : t.hurt ? 'bad' : 'ok');
const rateText = (run: Run, i: number) => `${run.config.tenants[i].rate}/s × ${run.config.tenants[i].costMs} ms`;

/** The stat tiles every isolation scene opens with, from one run. */
export function RunStats({ run, actor }: { run: Run; actor: number }) {
  const hurt = run.tenants.filter((t) => t.hurt && t.tenant !== actor);
  const busiest = Math.max(...run.shards.map((s) => s.demandWork)) / SHARD_CAPACITY;
  const throttled = run.tenants.reduce((a, t) => a + t.throttled, 0);
  const a = run.tenants[actor];
  return (
    <>
      <Stat label="Neighbours hurt" value={`${hurt.length} of ${TENANTS - 1}`} color={hurt.length ? 'var(--bad)' : 'var(--ok)'} sub={hurt.length ? hurt.map((t) => tenantName(t.tenant)) : ['every neighbour kept its latency']} />
      <Stat label="Busiest shard asks for" value={`${sig(busiest * 100)}%`} color={busiest > 1 ? 'var(--bad)' : undefined} sub={[`of ${integer(SHARD_CAPACITY)} ms of work a second`]} />
      <Stat label={`${tenantName(actor)} errors`} value={pct(a.errorRate, 0)} color={a.errorRate >= ERROR_LIMIT ? 'var(--orange)' : undefined} sub={[`${integer(a.throttled)} throttled, ${integer(a.dropped)} dropped`]} />
      <Stat label="Throttled requests" value={integer(throttled)} color={throttled ? 'var(--hi)' : undefined} sub={['refused by a rate limit']} />
    </>
  );
}

/** Four shards, each holding its tenants as cells; with `onSelect` the cells are one radio group, without it they are labels. */
export function TenantBoard({ run, actor, onSelect }: { run: Run; actor: number; onSelect?: (i: number) => void }) {
  const radio = useRadioGroup(TENANTS, actor, (i) => onSelect?.(i));
  return (
    <div className="mt-shards" role={onSelect ? 'radiogroup' : undefined} aria-label={onSelect ? 'Tenants: pick one to edit' : undefined}>
      {Array.from({ length: SHARDS }, (_, sh) => {
        const here = run.tenants.filter((t) => t.shard === sh);
        const wanted = run.shards[sh].demandWork / SHARD_CAPACITY;
        return (
          <Box key={sh} className="mt-shard">
            <SectionTitle hint={here.length ? `${sig(wanted * 100)}% asked for` : 'idle'}>Shard {sh + 1}</SectionTitle>
            <div className="mt-cells">
              {here.length === 0 && <span className="empty-note">no tenants</span>}
              {here.map((t) => {
                const c = tone(t, actor);
                const body = (
                  <>
                    <b>{tenantName(t.tenant)}</b>
                    <span>{rateText(run, t.tenant)}</span>
                    <span>p99 {msText(t.p99Ms)}</span>
                    {t.errorRate > 0 && <span>{pct(t.errorRate, 0)} lost</span>}
                  </>
                );
                const style = { '--c': `var(--${c})` } as CSSProperties;
                return onSelect ? (
                  <button key={t.tenant} type="button" {...radio.itemProps(t.tenant)} className={`mt-cell is-${c}`} style={style} onClick={() => onSelect(t.tenant)}>
                    {body}
                  </button>
                ) : (
                  <div key={t.tenant} className={`mt-cell is-${c}`} style={style}>
                    {body}
                  </div>
                );
              })}
            </div>
          </Box>
        );
      })}
    </div>
  );
}

/** Per tenant: where it runs, what it asks for, and what it got, against its fair share. */
export function TenantTable({ run, actor }: { run: Run; actor: number }) {
  return (
    <Box>
      <SectionTitle hint={`hurt means ${hurtLimitText}`}>What each tenant got</SectionTitle>
      <div className="mt-table-wrap">
        <table className="data-table mt-table">
          <thead>
            <tr><th>Tenant</th><th>Shard</th><th>p99</th><th>Lost</th><th>Work served</th><th>Fair share</th></tr>
          </thead>
          <tbody>
            {run.tenants.map((t) => (
              <tr key={t.tenant} className={t.tenant === actor ? 'is-actor' : t.hurt ? 'is-hurt' : ''}>
                <th scope="row">{tenantName(t.tenant)}</th>
                <td>{t.shard + 1}</td>
                <td>{msText(t.p99Ms)}{(t.p99Ms ?? 0) > P99_LIMIT_MS ? ' !' : ''}</td>
                <td>{pct(t.errorRate, 1)}</td>
                <td>{integer(Math.round(t.servedWork))} ms/s</td>
                <td>{integer(Math.round(t.fairWork))} ms/s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Box>
  );
}
