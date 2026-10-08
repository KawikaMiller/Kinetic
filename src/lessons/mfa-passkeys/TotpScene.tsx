import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { ByteGrid } from '../../components/ByteGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, PauseButton, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { hasSubtle, toHex } from '../../core/crypto';
import { plural, power } from '../../core/format';
import { useAsyncValue } from '../../core/useAsyncValue';
import { useInterval } from '../../core/useInterval';
import { skewAdvice } from './captions';
import {
  ACCEPT_WINDOW, SECRET_BYTES, STEP_SECONDS, base32Encode, counterAt, groupSecret, secondsLeft, totpSteps, type TotpSteps,
} from './totp';

const SKEW_MAX = 120;
const SKEW_STEP = 5;
const TICK_MS = 1000;

const newSecret = () => crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
const clockText = (unix: number) => new Date(unix * 1000).toISOString().slice(11, 19);

export function TotpScene({ picker }: { picker: ReactNode }) {
  const [secret, setSecret] = useState(() => (hasSubtle() ? newSecret() : null));
  const [shown, setShown] = useState(true);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [paused, setPaused] = useState(false);
  const [skew, setSkew] = useState(0);
  const setCaption = useSetCaption();
  useInterval(() => setNow((n) => n + 1), TICK_MS, !paused);

  const b32 = secret ? base32Encode(secret) : '';
  const phoneUnix = now + skew;
  const phone = useAsyncValue(() => (secret ? totpSteps(secret, phoneUnix) : Promise.resolve(null)), `p:${b32}:${counterAt(phoneUnix)}`, { keepPrevious: true });
  const server = useAsyncValue(
    async () => {
      if (!secret) return null;
      const out: (TotpSteps | null)[] = [];
      for (let d = -ACCEPT_WINDOW; d <= ACCEPT_WINDOW; d++) out.push(await totpSteps(secret, now + d * STEP_SECONDS));
      return out;
    },
    `s:${b32}:${counterAt(now)}`,
    { keepPrevious: true },
  );

  useIntroCaption(<>The phone and the server never talk: each computes the code on its own from the shared secret and the time. Slide the phone&apos;s clock to see how much drift the server forgives.</>);

  const accepted = phone && server ? server.some((s) => s?.code === phone.code) : null;
  const verdictColor = accepted === null ? undefined : accepted ? 'var(--ok)' : 'var(--bad)';
  const left = secondsLeft(phoneUnix);

  const changeSkew = (v: number) => {
    setSkew(v);
    setCaption(skewAdvice(v), { quiet: true });
  };

  if (!secret) {
    return (
      <StageFrame height={200} controls={[picker]}>
        <div className="stage-pad"><Hint block>This lesson&apos;s TOTP needs the browser&apos;s crypto API (a secure context), which isn&apos;t available here.</Hint></div>
      </StageFrame>
    );
  }

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Phone code" value={phone?.code ?? '…'} color="var(--info)" sub={`counter ${phone?.counter ?? '…'}`} />
          <Stat label="Server" value={accepted === null ? '…' : accepted ? 'accepts' : 'refuses'} color={verdictColor} sub={`window ±${plural(ACCEPT_WINDOW, 'step')}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'shared secret' },
            { color: 'var(--info)', label: 'counter, countdown' },
            { color: 'var(--hi)', label: 'offset nibble and the 4 selected bytes' },
            { color: 'var(--ok)', label: 'accepted code' },
            { color: 'var(--bad)', label: 'refused code' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Phone clock is off by" value={skew} min={-SKEW_MAX} max={SKEW_MAX} step={SKEW_STEP} onChange={changeSkew} format={(v) => `${v > 0 ? '+' : ''}${v} s`} />
          <PauseButton paused={paused} onToggle={() => setPaused(!paused)} />
          <Button onClick={() => { setSecret(newSecret()); setShown(true); }}>New secret (enrol again)</Button>
        </>,
      ]}
    >
      <div className="stage-pad mfa">
        <Box className="mfa-enrol">
          <SectionTitle hint="like a QR code on the setup screen">Shared secret, shown once</SectionTitle>
          <div className="mfa-secret">
            <span aria-hidden="true">🔒</span>
            <code className="mfa-secret-code">{shown ? groupSecret(b32) : '•••• •••• •••• •••• •••• •••• •••• ••••'}</code>
            <Button onClick={() => setShown(!shown)}>{shown ? 'I scanned it: hide' : 'Show (demo only)'}</Button>
          </div>
        </Box>

        <div className="mfa-pair">
          <Box className="mfa-side">
            <SectionTitle hint={`phone clock ${clockText(phoneUnix)}`}>Phone</SectionTitle>
            <Bar value={left} max={STEP_SECONDS} tone="info" height={8} label={`${left} s left in this 30-second window`} animate={false} />
            <Steps steps={phone} />
          </Box>
          <Box className="mfa-side">
            <SectionTitle hint={`server clock ${clockText(now)}`}>Server</SectionTitle>
            <p className="mfa-note">Computes the codes for the window it is in and one either side, then compares.</p>
            <table className="data-table">
              <thead><tr><th scope="col">Window</th><th scope="col">Counter</th><th scope="col">Code</th></tr></thead>
              <tbody>
                {(server ?? []).map((s, i) => (
                  <tr key={i}>
                    <th scope="row">{['previous', 'current', 'next'][i]}</th>
                    <td>{s?.counter}</td>
                    <td className={phone && s?.code === phone.code ? 'mfa-match' : ''}>{s?.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`log-row ${accepted ? 'tone-ok' : 'tone-bad'} mfa-verdict`}>
              {accepted === null ? '…' : accepted ? `The phone's code ${phone?.code} matches a code the server accepts.` : `The phone's code ${phone?.code} matches none of the three: refused.`}
            </p>
          </Box>
        </div>
        <Hint block>
          Real HMAC-SHA-1 in your browser; the phone and server are simulated and share one clock plus the skew you set. Your secret is random each visit and never leaves the page.
        </Hint>
      </div>
    </StageFrame>
  );
}

function Steps({ steps }: { steps: TotpSteps | null }) {
  if (!steps) return <p className="mfa-note">Computing…</p>;
  const sel = { from: steps.offset, to: steps.offset + 3, tone: 'hi' as const, label: 'the 4 selected bytes' };
  return (
    <ol className="mfa-steps">
      <li>
        <b>counter</b> = ⌊{steps.unix} ÷ {STEP_SECONDS}⌋ = <span className="mfa-counter">{steps.counter}</span>
        <code className="mfa-hex">{toHex(steps.counterBytes)}</code>
      </li>
      <li>
        <b>HMAC-SHA-1</b>(secret, counter) = 20 bytes
        <ByteGrid bytes={steps.mac} perRow={8} fields={[sel]} highlight={[{ i: steps.mac.length - 1, tone: 'hi' }]} ariaLabel="HMAC-SHA-1 output" />
      </li>
      <li>
        <b>offset</b> = low nibble of the last byte = <span className="mfa-hi">{steps.offset}</span>; take bytes {steps.offset} to {steps.offset + 3} and clear the top bit:{' '}
        <span className="mfa-hi">{steps.truncated}</span>
      </li>
      <li>
        <b>code</b> = {steps.truncated} mod {power(steps.digits, 10)} = <span className="mfa-code">{steps.code}</span>
      </li>
    </ol>
  );
}
