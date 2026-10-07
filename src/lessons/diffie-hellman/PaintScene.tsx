import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend } from '../../components/ui';
import { popIn } from '../../core/motion';
import { usePlayer } from '../../core/usePlayer';
import { paintFrames } from './frames';
import { mix, paint, sameMix, type Paint } from './model';

const STEP_MS = 1800;

/** Private paints on offer, by token, with the name the captions use. Categorical colours only. */
const ALICE_PAINTS = [{ token: 'sky', name: 'sky blue' }, { token: 'trk-hw', name: 'teal' }] as const;
const BOB_PAINTS = [{ token: 'pink', name: 'pink' }, { token: 'trk-math', name: 'lime' }] as const;

type Kind = 'public' | 'private' | 'eve' | 'final';

function Swatch({ p, label, kind, match }: { p: Paint; label: ReactNode; kind: Kind; match?: boolean }) {
  return (
    <motion.div className={`dh-swatch is-${kind} ${match ? 'is-match' : ''}`} {...popIn}>
      <i style={{ background: p.color }} aria-hidden />
      <span>{label}{kind === 'private' && ' 🔒'}</span>
    </motion.div>
  );
}

export function PaintScene({ picker }: { picker: ReactNode }) {
  const [alice, setAlice] = useState<(typeof ALICE_PAINTS)[number]>(ALICE_PAINTS[0]);
  const [bob, setBob] = useState<(typeof BOB_PAINTS)[number]>(BOB_PAINTS[0]);
  const frames = useMemo(() => paintFrames(alice.name, bob.name), [alice, bob]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { stage } = player.frame;

  const base = paint('amber');
  const aSecret = paint(alice.token);
  const bSecret = paint(bob.token);
  const aMix = mix(base, aSecret);
  const bMix = mix(base, bSecret);
  const aFinal = mix(bMix, aSecret);
  const bFinal = mix(aMix, bSecret);
  const eveTry = mix(aMix, bMix);
  const match = stage >= 4 && sameMix(aFinal, bFinal);

  return (
    <StageFrame
      player={player}
      height={340}
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'public base paint', shape: 'dot' },
            { color: 'var(--violet)', label: 'dashed ring 🔒: private, never sent', shape: 'line' },
            { color: 'var(--orange)', label: 'Eve and what she sees', shape: 'line' },
            { color: 'var(--ok)', label: 'ring: both sides match', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Alice's private paint" inline>
            {ALICE_PAINTS.map((c) => (
              <ChipButton key={c.token} on={alice.token === c.token} onClick={() => setAlice(c)}>
                <i className="dh-dot" style={{ background: `var(--${c.token})` }} aria-hidden />{c.name}
              </ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Bob's" inline>
            {BOB_PAINTS.map((c) => (
              <ChipButton key={c.token} on={bob.token === c.token} onClick={() => setBob(c)}>
                <i className="dh-dot" style={{ background: `var(--${c.token})` }} aria-hidden />{c.name}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad dh-paint-wrap">
        <div className="dh-paint">
          <section className="dh-col" aria-label="Alice">
            <h4>Alice</h4>
            <Swatch p={base} label="base" kind="public" />
            {stage >= 1 && <Swatch p={aSecret} label={alice.name} kind="private" />}
            {stage >= 1 && <Swatch p={aMix} label="her mixture" kind="public" />}
            {stage >= 2 && <Swatch p={bMix} label="Bob's mixture, received" kind="public" />}
            {stage >= 3 && <Swatch p={aFinal} label="+ her own paint" kind="final" match={match} />}
          </section>
          <section className="dh-col dh-wire" aria-label="The wire, where Eve listens">
            <h4>The wire · Eve sees</h4>
            <Swatch p={base} label="base" kind="eve" />
            {stage >= 2 && <Swatch p={aMix} label="Alice's mixture →" kind="eve" />}
            {stage >= 2 && <Swatch p={bMix} label="← Bob's mixture" kind="eve" />}
            {stage >= 4 && <Swatch p={eveTry} label="Eve mixes both: too much amber" kind="eve" />}
          </section>
          <section className="dh-col" aria-label="Bob">
            <h4>Bob</h4>
            <Swatch p={base} label="base" kind="public" />
            {stage >= 1 && <Swatch p={bSecret} label={bob.name} kind="private" />}
            {stage >= 1 && <Swatch p={bMix} label="his mixture" kind="public" />}
            {stage >= 2 && <Swatch p={aMix} label="Alice's mixture, received" kind="public" />}
            {stage >= 3 && <Swatch p={bFinal} label="+ his own paint" kind="final" match={match} />}
          </section>
        </div>
        <p className="dh-note">Real CSS colour blends (color-mix), each paint in equal parts. Paint stands in for the maths: mixing is
          easy, un-mixing is hard.</p>
      </div>
    </StageFrame>
  );
}
