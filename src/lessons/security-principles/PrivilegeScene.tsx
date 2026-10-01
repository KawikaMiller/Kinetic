import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { ACTIONS, EVERYTHING, NEEDED, RESOURCES, blastRadius, missingNeeds, perm } from './model';

const MAX = blastRadius(EVERYTHING);

export function PrivilegeScene({ picker }: { picker: ReactNode }) {
  const [grants, setGrants] = useState<Set<string>>(() => new Set(EVERYTHING));
  const [compromised, setCompromised] = useState(false);
  const setCaption = useSetCaption();
  const radius = blastRadius(grants);
  const missing = missingNeeds(grants);

  useIntroCaption(
    <>The <code>invoice-mailer</code> service only needs three permissions, but it was given everything. Switch on <b>Compromise it</b> to see what an attacker could do.</>,
  );

  const toggle = (p: string) => {
    setGrants((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const compromise = (on: boolean) => {
    setCompromised(on);
    setCaption(
      on ? (
        <>Its credentials leaked. The attacker can now do <span className="hl bad">everything the service could</span>: that&apos;s the blast radius. Trim the permissions and see it shrink.</>
      ) : (
        <>Back to normal: the permissions are the same, but nobody is misusing them.</>
      ),
      { quiet: true },
    );
  };

  const setAll = (next: Set<string>, caption: ReactNode) => {
    setGrants(new Set(next));
    setCaption(caption, { quiet: true });
  };

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Permissions" value={`${grants.size} of ${EVERYTHING.size}`} color="var(--info)" />
          <Stat label="Blast radius" value={pct(radius / MAX)} color={radius > blastRadius(NEEDED) ? 'var(--bad)' : 'var(--ok)'} sub="of full admin" />
          <Stat label="Can do its job" value={missing.length ? 'no' : 'yes'} color={missing.length ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'granted' },
            { color: 'var(--ok)', label: 'needed for the job', shape: 'dot' },
            { color: 'var(--bad)', label: 'what an attacker gets (compromised)' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Button onClick={() => setAll(EVERYTHING, <>Back to &quot;just give it admin&quot;: every permission, and the biggest possible blast radius.</>)}>Grant everything</Button>
          <Button variant="primary" onClick={() => setAll(NEEDED, <>Trimmed to <span className="hl ok">what the job needs</span>. It still works, and a compromise can now only read invoices and customers and send email.</>)}>
            Trim to what&apos;s needed
          </Button>
          <Toggle label="Compromise it" value={compromised} onChange={compromise} off="safe" on="attacker has its credentials" />
        </>,
      ]}
    >
      <div className="stage-pad sp">
        <div className="sp-grid" role="table" aria-label="invoice-mailer permissions">
          <div className="sp-grid-row sp-grid-head" role="row">
            <span role="columnheader">Resource</span>
            {ACTIONS.map((a) => <span key={a} role="columnheader">{a}</span>)}
          </div>
          {RESOURCES.map((r) => (
            <div key={r.id} className="sp-grid-row" role="row">
              <span role="rowheader" className="sp-res">
                {r.label}
                <span className="sp-sens">{'●'.repeat(r.sensitivity)}</span>
              </span>
              {ACTIONS.map((a) => {
                const p = perm(r.id, a);
                const on = grants.has(p);
                const needed = NEEDED.has(p);
                return (
                  <span key={a} role="cell">
                    <button
                      type="button"
                      className={`sp-cell ${on ? (compromised ? 'tone-bad' : 'tone-info') : 'tone-dim'} ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${r.label}: ${a}${needed ? ' (needed)' : ''}`}
                      onClick={() => toggle(p)}
                    >
                      {on ? 'granted' : 'denied'}
                      {needed && <i className="sp-needed" aria-hidden="true" />}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <Bar value={radius} max={MAX} tone={compromised ? 'bad' : 'info'} marker={blastRadius(NEEDED)} markLabel="just what's needed" label="Blast radius" height={10} />
        {missing.length > 0 && (
          <p className="log-row tone-bad sp-missing">
            The service is now broken: it needs {missing.map((m) => m.replace(':', ' ')).join(', ')}. Least privilege means the minimum that still works, not zero.
          </p>
        )}
        {compromised && (
          <p className="log-row tone-bad sp-missing">
            With these credentials an attacker can: {RESOURCES.flatMap((r) => ACTIONS.filter((a) => grants.has(perm(r.id, a))).map((a) => `${a} ${r.label}`)).join(', ') || 'nothing'}.
          </p>
        )}
        <p className="sp-honest">● marks how sensitive each resource is. The blast radius weights delete above write above read. Scripted example.</p>
      </div>
    </StageFrame>
  );
}
