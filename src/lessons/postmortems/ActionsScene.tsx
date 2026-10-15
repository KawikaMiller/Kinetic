import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { DONES, OWNERS, PRESETS, PROBLEM_TEXT, TAGS, TAG_LETTER, WHATS, checklist, passes, problemsOf, tagAdvice, type Item, type Tag } from './actions';
import { actionsCaption } from './captions';
import { LEAF_IDS, factorOf } from './tree';

/** The most actions a list can hold, so the list cannot grow without end. */
export const MAX_ITEMS = 12;

interface Draft {
  what: string | null;
  owner: string | null;
  done: string | null;
  tag: Tag | null;
}
const EMPTY: Draft = { what: null, owner: null, done: null, tag: null };

const whatText = (id: string | null) => WHATS.find((w) => w.id === id)?.text ?? 'no action chosen';
const doneText = (id: string | null) => DONES.find((d) => d.id === id)?.text ?? 'no done-when';

/** A row of chips that picks one value (pressing the picked chip clears it). */
function Slot<T extends string>({ label, options, value, onPick }: { label: string; options: readonly { id: T; text: ReactNode }[]; value: T | null; onPick: (v: T | null) => void }) {
  return (
    <div className="pm-slot" role="group" aria-label={label}>
      <span className="pm-slot-label">{label}</span>
      {options.map((o) => (
        <ChipButton key={o.id} size="md" tone="info" on={value === o.id} onStyle="solid" onClick={() => onPick(value === o.id ? null : o.id)}>
          {o.text}
        </ChipButton>
      ))}
    </div>
  );
}

export function ActionsScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [items, setItems] = useState<readonly Item[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [nextId, setNextId] = useState(1);
  const checks = checklist(items);
  const listRef = useRef<HTMLDivElement>(null);
  /** Where focus goes after an action is removed: the position it had, or the list itself once it is empty. */
  const focusAfterRemove = useRef<number | null>(null);
  const covered = (leaf: string) => items.some((i) => WHATS.find((w) => w.id === i.what)?.covers.includes(leaf));

  useEffect(() => {
    setCaption(actionsCaption(items), { quiet: true });
  }, [setCaption, items]);

  useEffect(() => {
    const at = focusAfterRemove.current;
    if (at === null) return;
    focusAfterRemove.current = null;
    const removes = listRef.current?.querySelectorAll<HTMLButtonElement>('.pm-item button');
    if (removes && removes.length > 0) removes[Math.min(at, removes.length - 1)].focus();
    else listRef.current?.focus();
  }, [items]);

  const remove = (index: number) => {
    focusAfterRemove.current = index;
    setItems(items.filter((_, k) => k !== index));
  };

  const add = () => {
    if (items.length >= MAX_ITEMS) return;
    setItems([...items, { id: nextId, ...draft }]);
    setNextId(nextId + 1);
    setDraft(EMPTY);
  };
  const load = (preset: (typeof PRESETS)[number]) => {
    setItems(preset.items);
    setNextId(preset.items.length + 1);
  };

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Checks passing" value={`${checks.filter((c) => c.pass).length} of ${checks.length}`} color={checks.every((c) => c.pass) ? 'var(--ok)' : undefined} />
          <Stat label="Leaf factors addressed" value={`${LEAF_IDS.filter(covered).length} of ${LEAF_IDS.length}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'an action that passes, a check that passes', shape: 'square' },
            { color: 'var(--bad)', label: 'an action that fails, a leaf with no action', shape: 'square' },
            { color: 'var(--info)', label: 'a slot you picked (filled)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="violet" onClick={() => load(p)}>{p.label}</ChipButton>
          ))}
          <Button onClick={() => setItems([])}>Clear</Button>
        </>,
      ]}
    >
      <div className="pm stage-pad">
        <Box>
          <SectionTitle hint="build one action from the slots, then add it">New action</SectionTitle>
          <Slot label="What" options={WHATS.map((w) => ({ id: w.id, text: w.text }))} value={draft.what} onPick={(v) => setDraft({ ...draft, what: v })} />
          <Slot label="Owner role" options={OWNERS.map((o) => ({ id: o, text: o }))} value={draft.owner} onPick={(v) => setDraft({ ...draft, owner: v })} />
          <Slot label="Done when" options={DONES.map((d) => ({ id: d.id, text: d.text }))} value={draft.done} onPick={(v) => setDraft({ ...draft, done: v })} />
          <Slot label="Tag" options={TAGS.map((t) => ({ id: t, text: `${TAG_LETTER[t]} ${t}` }))} value={draft.tag} onPick={(v) => setDraft({ ...draft, tag: v })} />
          <div className="pm-add"><Button variant="primary" disabled={items.length >= MAX_ITEMS} onClick={add}>Add action</Button></div>
        </Box>

        <Box>
          <SectionTitle hint="an empty slot leaves an action incomplete">Actions</SectionTitle>
          <div ref={listRef} tabIndex={-1} className="pm-list" aria-label="Actions">
            {items.length === 0 ? (
              <p className="empty-note">No actions yet.</p>
            ) : (
              <ul className="pm-items">
                {items.map((i, index) => {
                  const problems = problemsOf(i);
                  const advice = tagAdvice(i);
                  return (
                    <li key={i.id} className={`pm-item ${passes(i) ? 'is-ok' : 'is-bad'}`}>
                      <span className="chip pm-tag">{i.tag ? TAG_LETTER[i.tag] : '?'}</span>
                      <span>
                        <b>{whatText(i.what)}</b> · {i.owner ?? 'no owner role'} · done when: {doneText(i.done)}
                        {problems.length > 0 && <span className="pm-detail-text"> (fails: {problems.map((p) => PROBLEM_TEXT[p]).join('; ')})</span>}
                        {advice && <span className="pm-detail-text"> (advice, not a check: {advice})</span>}
                      </span>
                      <Button onClick={() => remove(index)}>Remove</Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Box>

        <Box variant="sunken">
          <SectionTitle hint="computed from the actions above">Checklist</SectionTitle>
          <ul className="pm-checks">
            {checks.map((c) => (
              <li key={c.id} className={c.pass ? 'is-ok' : 'is-bad'}>
                <span className="pm-mark" aria-hidden="true">{c.pass ? '✓' : '✗'}</span>
                <span><b>{c.pass ? 'Pass' : 'Fail'}</b> {c.label} <span className="pm-detail-text">({c.detail})</span></span>
              </li>
            ))}
          </ul>
          <div className="pm-leaves" role="list" aria-label="Leaf factors and whether each has an action">
            {LEAF_IDS.map((leaf) => (
              <span key={leaf} role="listitem" className={`chip pm-leaf ${covered(leaf) ? 'is-ok' : 'is-bad'}`}>
                {factorOf(leaf).short.join(' ')}: {covered(leaf) ? 'has an action' : 'no action'}
              </span>
            ))}
          </div>
        </Box>
        <Hint block>An action can have a cost of its own: shortening an alert window pages sooner but also pages for more blips, which is why this incident’s window was lengthened. A done-when has to check that action, not just be checkable.</Hint>
        <ProvenanceRow>
          <Provenance kind="invented">invented incident and action list</Provenance>
          <ClaimLabel kind="practice">an owner role, a tag and a done-when someone can check are common practice for action items</ClaimLabel>
          <ClaimLabel kind="view">which tag an action gets is a judgment (rolling out in stages could be called prevent or mitigate), and “not only prevent” is one view of a balanced list, so the tag check and the advice are not facts</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
