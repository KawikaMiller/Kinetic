import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, ClaimLabel, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { signedCaption } from './captions';
import { ATTACK, RETREAT, COMMANDER, generalName, judge, orderName, runOm, setupOf, tryEveryBehaviour, type Behaviour, type Bit } from './om';
import { SIGNED_LIEUTENANTS, runSigned, trySignedBehaviours, type Signed, type SignedBehaviour } from './signed';

interface Choice {
  traitor: number;
  given: readonly [Signed, Signed];
  order: Bit;
  relay: Bit;
  withhold: boolean;
}
/** A traitor lieutenant relaying retreat against a loyal attack order: the case where oral messages break and signed orders hold. */
const DEFAULT_CHOICE: Choice = { traitor: 1, given: [ATTACK, RETREAT], order: ATTACK, relay: RETREAT, withhold: false };

const TRAITORS = [{ value: COMMANDER, label: 'Commander' }, { value: 1, label: 'L1' }, { value: 2, label: 'L2' }];
const GIVEN: { value: string; label: string }[] = [{ value: 'none', label: 'nothing' }, { value: '0', label: 'retreat' }, { value: '1', label: 'attack' }];
const givenValue = (s: Signed) => (s === null ? 'none' : String(s));
const givenOf = (v: string): Signed => (v === 'none' ? null : v === '1' ? ATTACK : RETREAT);

/** The oral behaviour for the same choices: oral messages cannot say "nothing", so it becomes retreat. */
const oralOf = (c: Choice): Behaviour =>
  c.traitor === COMMANDER ? { traitor: 0, order: RETREAT, bits: [c.given[0] ?? RETREAT, c.given[1] ?? RETREAT] } : { traitor: c.traitor, order: c.order, bits: [c.relay] };
const signedOf = (c: Choice): SignedBehaviour => ({ traitor: c.traitor, given: c.traitor === COMMANDER ? c.given : [c.order, c.order], order: c.order, withhold: c.withhold });

export function SignedScene({ picker }: { picker: ReactNode }) {
  const [c, setC] = useState<Choice>(DEFAULT_CHOICE);
  const oralBehaviour = useMemo(() => oralOf(c), [c]);
  const signedBehaviour = useMemo(() => signedOf(c), [c]);
  const oralSetup = useMemo(() => setupOf(3, oralBehaviour), [oralBehaviour]);
  const oralRun = useMemo(() => runOm(oralSetup), [oralSetup]);
  const oral = useMemo(() => judge(oralSetup, oralRun), [oralSetup, oralRun]);
  const signed = useMemo(() => runSigned(signedBehaviour), [signedBehaviour]);
  const oralAll = useMemo(() => tryEveryBehaviour(3), []);
  const signedAll = useMemo(() => trySignedBehaviours(), []);

  const caption = signedCaption({ oral, signed, oralTotal: oralAll.total, oralBreaking: oralAll.breaking.length, signedTotal: signedAll.total, signedBreaking: signedAll.breaking.length });
  const word = (ok: boolean) => (ok ? 'holds' : 'broken');

  return (
    <StageFrame
      height={430}
      intro={caption}
      introKey={`${JSON.stringify(c)}`}
      stats={
        <Stats>
          <Stat label="Oral, every behaviour" value={`${oralAll.breaking.length} of ${oralAll.total} break`} color={oralAll.breaking.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub="exhaustive: one traitor, binary values, OM(1)" />
          <Stat label="Signed, every behaviour" value={`${signedAll.breaking.length} of ${signedAll.total} break`} color={signedAll.breaking.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub="exhaustive: orders, nothing, withheld relays" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--orange)', label: 'the traitor' }, { color: 'var(--violet)', label: 'a signed order (a modelled tag)' }, { color: 'var(--ok)', label: 'a rule that holds' }, { color: 'var(--bad)', label: 'a rule that breaks' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="The traitor is" options={TRAITORS} value={c.traitor} onChange={(traitor) => setC({ ...c, traitor })} />
        </>,
        c.traitor === COMMANDER ? (
          <>
            {SIGNED_LIEUTENANTS.map((l, k) => (
              <Segmented key={l} label={`Commander signs for ${generalName(l)}`} options={GIVEN} value={givenValue(c.given[k])} onChange={(v) => setC({ ...c, given: (k === 0 ? [givenOf(v), c.given[1]] : [c.given[0], givenOf(v)]) as readonly [Signed, Signed] })} />
            ))}
          </>
        ) : (
          <>
            <Toggle label="The loyal commander orders" off="retreat" on="attack" value={c.order === ATTACK} onChange={(v) => setC({ ...c, order: v ? ATTACK : RETREAT })} />
            <Toggle label="Oral relay says" off="0" on="1" value={c.relay === ATTACK} onChange={(v) => setC({ ...c, relay: v ? ATTACK : RETREAT })} />
            <Toggle label="Signed relay is" off="sent" on="withheld" value={c.withhold} onChange={(withhold) => setC({ ...c, withhold })} />
          </>
        ),
      ]}
    >
      <div className="bz-stage stage-pad">
        <div className="bz-pair">
          <Box>
            <SectionTitle hint="a traitor can say anything">Oral messages, n = 3</SectionTitle>
            {[1, 2].filter((i) => i !== oralBehaviour.traitor).map((i) => (
              <div key={i} className="bz-line">{generalName(i)} decides <b className="mono">{oral.loyal.get(i)}</b></div>
            ))}
            <div className="bz-verdict">
              <span className={`chip ${oral.ic1 ? 'tone-ok' : 'tone-bad'}`}>IC1 {word(oral.ic1)}</span>
              <span className={`chip ${oral.ic2 ? 'tone-ok' : 'tone-bad'}`}>IC2 {word(oral.ic2)}</span>
            </div>
            {c.traitor === COMMANDER && c.given.includes(null) && <Hint block>Oral messages cannot say nothing, so a missing order counts as retreat here.</Hint>}
          </Box>
          <Box>
            <SectionTitle hint="a traitor cannot alter a signed order">Signed orders, n = 3</SectionTitle>
            {SIGNED_LIEUTENANTS.filter((i) => i !== c.traitor).map((i) => (
              <div key={i} className="bz-line">{generalName(i)} holds {signed.holds.get(i)!.length === 0 ? 'nothing' : signed.holds.get(i)!.map((v) => `signed ${orderName(v)}`).join(' and ')} and decides <b className="mono">{signed.decisions.get(i)}</b></div>
            ))}
            <div className="bz-verdict">
              <span className={`chip ${signed.ic1 ? 'tone-ok' : 'tone-bad'}`}>IC1 {word(signed.ic1)}</span>
              <span className={`chip ${signed.ic2 ? 'tone-ok' : 'tone-bad'}`}>IC2 {word(signed.ic2)}</span>
            </div>
            <Hint block>One signed value is obeyed; two different signed values show that the commander equivocated, and a lieutenant that holds two or none retreats.</Hint>
          </Box>
        </div>
        <Hint block>A relay that never arrives is detected only because a round has a known length. With unbounded delay this protocol fails.</Hint>
        <ProvenanceRow>
          <Provenance kind="toy">the signature is a modelled tag, not cryptography</Provenance>
          <ClaimLabel kind="standard">signed-message protocols assume synchronous rounds</ClaimLabel>
          <Provenance kind="from-memory">the signed variant is from the same 1982 paper; check it</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
