import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Toggle } from '../../components/ui';
import { NA } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { APP_RANGE, CI_MONTH, DEV_MONTH, MONTHS, TINY_DATE, type Install } from './deps';
import { lockFrames, type LockFrame, type Where } from './frames';

const STEP_MS = 1500;
const TIMELINE_MONTHS = [1, 2, 3, 4, 5, 6];

export function LockfileScene({ picker }: { picker: ReactNode }) {
  const [useLock, setUseLock] = useState(false);
  const frames = useMemo(() => lockFrames(useLock), [useLock]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  const pkgJson = ['{', '  "name": "my-app",', '  "dependencies": {', `    "tiny-date": "${APP_RANGE}"`, '  }', '}'];
  const lockJson = f.lock
    ? ['{', '  "packages": {', '    "node_modules/tiny-date": {', `      "version": "${f.lock}",`, '      "integrity": "sha512-…"', '    }', '  }', '}']
    : ['(no package-lock.json committed)'];

  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'acting now' },
            { color: 'var(--ok)', label: 'installed & passing' },
            { color: 'var(--bad)', label: 'regressed release / failing' },
            { color: 'var(--dim)', label: 'not published yet' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="package-lock.json" value={useLock} onChange={setUseLock} off="Not committed" on="Committed" />
        </>,
        <Hint key="note">tiny-date is made up; the install rules are npm's (simplified to one dependency).</Hint>,
      ]}
    >
      <div className="dm-lock stage-pad">
        <div className="dm-timeline" aria-label="tiny-date releases on the registry">
          {TIMELINE_MONTHS.map((m) => {
            const rel = TINY_DATE.find((r) => r.month === m);
            const published = m <= f.month;
            return (
              <div key={m} className={`dm-month ${m === DEV_MONTH ? 'is-dev' : ''} ${m === CI_MONTH ? 'is-ci' : ''}`}>
                <span className="dm-month-name">{MONTHS[m]}</span>
                {rel ? (
                  <span className={`dm-release ${!published ? 'is-future' : rel.broken ? 'is-broken' : ''}`} title={rel.note}>
                    {rel.version}
                  </span>
                ) : (
                  <span className="dm-release is-empty" />
                )}
              </div>
            );
          })}
        </div>
        <div className="dm-machines">
          <Machine where="dev" frame={f} />
          <Machine where="ci" frame={f} />
        </div>
        <div className="dm-files">
          <CodePanel title="package.json" lines={pkgJson} active={f.month === DEV_MONTH - 1 ? 3 : null} gutter="none" />
          <CodePanel
            title="package-lock.json"
            lines={lockJson}
            active={f.lock && f.active === 'dev' ? 3 : null}
            gutter="none"
            className={f.lock ? '' : 'dm-nolock'}
          />
        </div>
        <Box variant="sunken" className="dm-ci-note">
          <SectionTitle>npm ci vs npm install</SectionTitle>
          <p>
            <code>npm ci</code> installs exactly the lockfile, fails if it disagrees with <code>package.json</code>, and
            never rewrites it: made for CI. <code>npm install</code> also follows a matching lockfile, but rewrites it when
            <code> package.json</code> changes.
          </p>
        </Box>
      </div>
    </StageFrame>
  );
}

function Machine({ where, frame }: { where: Where; frame: LockFrame }) {
  const inst: Install | null = where === 'dev' ? frame.dev : frame.ci;
  const tests = where === 'dev' ? frame.devTests : frame.ciTests;
  const month = where === 'dev' ? DEV_MONTH : CI_MONTH;
  const command = where === 'dev' ? 'npm install' : frame.lock ? 'npm ci' : 'npm install';
  return (
    <Box className={`dm-machine ${frame.active === where ? 'is-active' : ''} ${tests === 'fail' ? 'is-fail' : tests === 'pass' ? 'is-pass' : ''}`}>
      <SectionTitle hint={MONTHS[month]}>{where === 'dev' ? 'Your laptop' : 'CI server'}</SectionTitle>
      <p className="dm-cmd">
        $ {command}
      </p>
      <p className="dm-installed">
        tiny-date <b>{inst ? inst.version : NA}</b>
        {inst && <span className="dm-src">from the {inst.source}</span>}
      </p>
      <p className="dm-tests">{tests === null ? 'tests: not run' : tests === 'pass' ? '✓ tests pass' : '✗ TypeError in formatDate'}</p>
    </Box>
  );
}
