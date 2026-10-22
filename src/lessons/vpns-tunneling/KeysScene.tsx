import { useMemo, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { PhoneLadder } from '../../components/PhoneLadder';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { chunkGroups } from '../../core/bits';
import { usePlayer } from '../../core/usePlayer';
import { ladderFrames, replayIntro, verdictText } from './captions';
import { initialKeys, initialReplay, sendAhead, sendNext, sendOld, sendReplayOfLast, sendTyped, type KeysState } from './init';
import { LADDERS } from './ladders';
import { LADDER_OPTIONS } from './options';
import { MAX_NUMBER, WINDOW, numberAt, stripBits } from './replay';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'a handshake message' },
      { color: 'var(--violet)', label: 'a number the window has seen' },
      { color: 'var(--bad)', label: 'a packet dropped: a replay or too old' },
      { color: 'var(--ok)', label: 'a packet accepted' },
    ]}
  />
);

const OLD_BACK = 10;
const JUMP = 20;
const GROUP = 16;

export function KeysScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<KeysState>(initialKeys);
  const ladder = LADDERS[st.ladder];
  const frames = useMemo(() => ladderFrames(ladder), [ladder]);
  const player = usePlayer(frames, { interval: 1800, autoplay: true });
  const actors = useMemo(() => [{ id: 'a', label: ladder.actors.a }, { id: 'b', label: ladder.actors.b }], [ladder]);
  const messages = useMemo(() => ladder.steps.map((s) => ({ id: s.id, from: s.from, to: s.to, label: s.label, note: s.note })), [ladder]);
  const rp = st.replay;
  const setReplay = (f: (r: typeof rp) => typeof rp) => setSt((s) => ({ ...s, replay: f(s.replay) }));
  const last = rp.log.length ? rp.log[rp.log.length - 1] : null;
  const seen = rp.window.bits.reduce<number>((a, b) => a + b, 0);
  const lo = numberAt(rp.window, 0);

  return (
    <StageFrame
      height={760}
      player={player}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Handshake" value={st.ladder} options={LADDER_OPTIONS} onChange={(ladder) => setSt((s) => ({ ...s, ladder }))} />
        </>,
      ]}
    >
      <div className="vpn-stage stage-pad">
        <Box>
          <SectionTitle hint="message names and timers from memory">{ladder.name}: how the keys are agreed</SectionTitle>
          <PhoneLadder actors={actors} messages={messages} step={player.frame.index} fit="shown" ariaLabel={`The ${ladder.name} key exchange as a ladder diagram`} />
          <p className="vpn-note">Keys are replaced {ladder.rekey}.</p>
        </Box>
        <Box>
          <SectionTitle hint={`a sliding window of ${WINDOW} sequence numbers`}>Replay window</SectionTitle>
          <Stats>
            <Stat label="Highest accepted" value={rp.window.top} color="var(--violet)" sub={rp.window.top === 0 ? 'the window is empty' : `window covers ${lo ?? 1} to ${rp.window.top}`} />
            <Stat label="Numbers remembered" value={seen} sub={`of the last ${WINDOW}`} />
            <Stat label="Packets sent" value={rp.sent} sub={`${rp.accepted} accepted, ${rp.sent - rp.accepted} dropped`} />
          </Stats>
          <div className="vpn-strip">
            <BitStrip
              bits={stripBits(rp.window)}
              size="sm"
              toneOf={() => 'violet'}
              groups={chunkGroups(WINDOW, GROUP, {
                tone: 'violet',
                label: (k) => {
                  const a = numberAt(rp.window, k * GROUP);
                  const b = numberAt(rp.window, k * GROUP + GROUP - 1);
                  return b === null ? '' : `${a ?? 1}-${b}`;
                },
              })}
              ariaLabel={`The replay window: ${seen} of ${WINDOW} numbers seen, highest ${rp.window.top}`}
            />
          </div>
          <div className="vpn-form">
            <TextField label="Packet number" value={rp.field} onChange={(field) => setReplay((r) => ({ ...r, field }))} onEnter={() => setReplay(sendTyped)} width={130} maxLength={9} placeholder={`1-${MAX_NUMBER.toLocaleString('en-US')}`} spellCheck={false} />
            <Button variant="primary" onClick={() => setReplay(sendTyped)}>Send</Button>
            <ControlGroup label="Send" inline>
              <ChipButton tone="ok" onClick={() => setReplay(sendNext)}>next in order</ChipButton>
              <ChipButton tone="bad" onClick={() => setReplay(sendReplayOfLast)}>replay the last accepted</ChipButton>
              <ChipButton tone="info" onClick={() => setReplay((r) => sendOld(r, OLD_BACK))}>{OLD_BACK} below the top</ChipButton>
              <ChipButton tone="info" onClick={() => setReplay((r) => sendAhead(r, JUMP))}>{JUMP} above the top</ChipButton>
              <ChipButton tone="info" onClick={() => setReplay((r) => sendAhead(r, WINDOW))}>{WINDOW} above the top</ChipButton>
            </ControlGroup>
            <Button onClick={() => setReplay(initialReplay)}>Reset</Button>
          </div>
          <Hint tone="muted">
            <span role="status">{rp.note ?? replayIntro(rp.window, last)}</span>
          </Hint>
          <ol className="vpn-log" aria-label="The last packets sent">
            {rp.log.map((e) => (
              <li key={e.id} className={e.verdict.kind === 'accepted' ? 'is-ok' : 'is-bad'}>
                packet {e.n}: {verdictText(e.verdict)}
              </li>
            ))}
          </ol>
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">message names and the rekey timer (about 2 minutes in WireGuard) are recalled from the WireGuard whitepaper and the IKEv2 specification: verify against them</Provenance>
          <Provenance kind="not-run">shown, not run: no handshake is performed and no key exists here</Provenance>
          <Provenance kind="simulated">the replay window is a working model of the sliding-window check (size 64 here; the ESP specification names a minimum of 32: verify)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
