import { useMemo, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { ACTORS, frames as buildFrames, ladder, requestStep, verdictOf } from './frames';
import {
  DEFAULT_CONFIG, KINDS, MODES, STOP_LABELS, evaluate, methodOf, serverLines, type Auth, type Config, type SameSiteMode,
} from './model';
import { cookieLineIndex, requestLines, serverLineStates } from './panels';
import './styles.css';

const STEP_MS = 1700;
const MODE_LABEL: Record<SameSiteMode, string> = { none: 'None', lax: 'Lax', strict: 'Strict' };
const AUTH: { value: Auth; label: string }[] = [
  { value: 'cookie', label: 'Session cookie' },
  { value: 'bearer', label: 'Bearer token in a header' },
];
const HONEST =
  'Simulated browser and sites; nothing leaves your machine. Browser defaults differ: Chromium treats a cookie with no SameSite attribute as Lax, while here you choose explicitly.';

export function Stage() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [cors, setCors] = useState(false);
  const patch = (p: Partial<Config>) => setConfig((c) => ({ ...c, ...p }));
  const o = evaluate(config);
  const verdict = verdictOf(o);
  const messages = useMemo(() => ladder(config), [config]);
  const frames = useMemo(() => buildFrames(config), [config]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const arrived = player.frame.step >= messages.length - 1;
  const requested = player.frame.step >= requestStep(config);
  const head = requestLines(config, o);
  const cookieAt = cookieLineIndex(head);
  const serverStates = serverLineStates(config, o, arrived);

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat
            label="Forged request"
            value={arrived ? verdict : '…'}
            color={!arrived ? undefined : verdict === 'accepted' ? 'var(--bad)' : 'var(--ok)'}
            sub={arrived ? (o.stoppedAt ? `stopped by ${STOP_LABELS[o.stoppedAt]}` : 'the server did what the other site wanted') : 'play to find out'}
          />
          <Stat label="Cookie attached" value={!requested ? '…' : config.auth === 'bearer' ? 'no cookie' : o.cookieSent ? 'yes' : 'no'} color={requested && o.cookieSent ? 'var(--hi)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'your own requests' },
            { color: 'var(--orange)', label: 'the other site and its request' },
            { color: 'var(--hi)', label: 'cookie header, current step' },
            { color: 'var(--bad)', label: 'accepted: the harm' },
            { color: 'var(--ok)', label: 'rejected or stripped' },
            { color: 'var(--dim)', label: 'defence off' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Authentication" value={config.auth} onChange={(auth: Auth) => patch({ auth })} options={AUTH} />
          {config.auth === 'cookie' ? (
            <Segmented
              label="Cookie SameSite"
              value={config.mode}
              onChange={(mode: SameSiteMode) => patch({ mode })}
              options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
            />
          ) : (
            <Hint>SameSite applies to cookies; a bearer token is not a cookie, so there is nothing to set.</Hint>
          )}
        </>,
        <Segmented
          key="kind"
          label="The other site makes your browser send"
          value={config.kind}
          onChange={(kind: Config['kind']) => patch({ kind })}
          options={KINDS.map((k) => ({ value: k.id, label: k.label }))}
        />,
        <>
          {methodOf(config.kind) === 'GET' ? (
            <Hint>CSRF middleware skips GET, so a token or custom header is never checked on a link click. The fix is a GET that changes nothing.</Hint>
          ) : (
            <>
              <Toggle label="CSRF token" value={config.token} onChange={(token) => patch({ token })} />
              <Toggle label="JSON + custom header" value={config.header} onChange={(header) => patch({ header })} />
            </>
          )}
          <Toggle label="Origin / Referer check" value={config.origin} onChange={(origin) => patch({ origin })} />
          <ControlGroup label="Misconception">
            <ChipButton tone="violet" on={cors} onClick={() => setCors(!cors)}>Why CORS doesn&apos;t stop this</ChipButton>
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad csrf">
        <div className="csrf-main">
          <div className="csrf-ladder">
            <SequenceDiagram actors={ACTORS} messages={messages} step={player.frame.step} ariaLabel="A forged cross-site request to shop.example" />
          </div>
          <div className="csrf-side">
            <CodePanel
              title={config.kind === 'link' || o.preflight ? 'What the browser sends' : 'The forged request'}
              lines={head}
              gutter="none"
              stateOf={(i) => (i === cookieAt ? 'now' : 'idle')}
            />
            <CodePanel title="Server check" lines={serverLines(config.kind)} gutter="none" stateOf={(i) => serverStates[i]} />
          </div>
        </div>
        {cors && (
          <Box className="csrf-cors">
            <SectionTitle>Why CORS doesn&apos;t stop it</SectionTitle>
            <p>
              CORS decides whether another site may <b>read</b> a reply. The request itself is still sent, with your cookie if the cookie rules allow it, so
              the server has already acted by the time the browser hides the answer. The one place it helps is a request that needs a custom header:
              that must be approved first, and the server says no.
            </p>
          </Box>
        )}
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
