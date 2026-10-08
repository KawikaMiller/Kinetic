import { useMemo, useState, type ReactNode } from 'react';
import { ChipButton, ControlGroup, Slider, Toggle } from '../../components/ui';
import { GOTCHAS, GOTCHA_DEFAULTS, OLD_INTERMEDIATE, formatUtc, gotchaScenario, type GotchaId, type GotchaOptions } from './model';
import { ScenarioView } from './ScenarioView';

/** Where Today starts for each gotcha, so its failure is on screen from the first look. */
const START_DAY: Record<GotchaId, number> = { intermediate: 130, skew: 61, reload: 100, pinned: 80 };

const TAIL: Record<GotchaId, (o: GotchaOptions) => string> = {
  intermediate: (o) =>
    o.chainUpdated ? 'The server sends the fresh intermediate, so every leaf renewal just works.' : `The leaf renews on time, but the server still sends an intermediate that expired on ${formatUtc(OLD_INTERMEDIATE.notAfter).slice(0, 10)}.`,
  skew: (o) => (o.skewDays === 0 ? 'The unlucky client has a correct clock, so it behaves like everyone else.' : `A client whose clock is ${Math.abs(o.skewDays)} days ${o.skewDays < 0 ? 'slow' : 'fast'} judges the certificate on its own clock.`),
  reload: (o) => (o.reloadHook ? 'A reload hook makes the server pick up each renewed certificate.' : 'The renewal job wrote the new files, but the running server still holds the old certificate in memory.'),
  pinned: () => 'The app only trusts the first certificate it was built with, so the first renewal breaks it.',
};

const HINT: Record<GotchaId, string> = {
  intermediate: 'Every certificate in the chain needs to be inside its validity period (some validators treat the trust anchor differently). The old intermediate and its date are made up for the demo. A CA would not normally issue a leaf that outlives its intermediate: the failure shown is the stale chain file the server keeps sending.',
  skew: 'Many CAs backdate notBefore by about an hour, which does not cover a clock that is days off. The skew is simulated; a clock far enough ahead would see a certificate expire early, which renewals 30 days ahead hide here.',
  reload: 'Monitoring that probes the endpoint sees the old certificate and alerts; a check that reads the files would be happy. Whether a server reloads on a signal or needs a restart depends on the software.',
  pinned: 'Pinning the exact certificate is the strictest form; pinning a public key survives renewal only if the key is reused. Many teams avoid pinning because of outages like this one.',
};

export function GotchaScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<GotchaId>('intermediate');
  const [options, setOptions] = useState<GotchaOptions>(GOTCHA_DEFAULTS);
  const scenario = useMemo(() => gotchaScenario(id, options), [id, options]);
  const set = <K extends keyof GotchaOptions>(key: K, value: GotchaOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));
  return (
    <ScenarioView
      key={id}
      picker={picker}
      scenario={scenario}
      initialDay={START_DAY[id]}
      controls={
        <>
          <ControlGroup label="Gotcha" inline>
            {GOTCHAS.map((g) => (
              <ChipButton key={g.id} tone="info" on={id === g.id} onClick={() => setId(g.id)}>
                {g.label}
              </ChipButton>
            ))}
          </ControlGroup>
          {id === 'intermediate' && <Toggle label="Server sends" value={options.chainUpdated} onChange={(v) => set('chainUpdated', v)} off="Old chain file" on="Fresh chain" />}
          {id === 'skew' && (
            <Slider label="Client clock is off by" value={options.skewDays} min={-7} max={7} onChange={(v) => set('skewDays', v)} format={(d) => (d === 0 ? 'nothing' : `${Math.abs(d)} days ${d < 0 ? 'behind' : 'ahead'}`)} />
          )}
          {id === 'reload' && <Toggle label="Reload hook after renewal" value={options.reloadHook} onChange={(v) => set('reloadHook', v)} off="Off" on="On" />}
        </>
      }
      tail={TAIL[id](options)}
      hint={<>Scripted timeline for a fictional service that renews automatically every 60 days. {HINT[id]}</>}
    />
  );
}
