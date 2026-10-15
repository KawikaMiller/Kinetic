import { useEffect, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { DONES, OWNERS, PRESETS, TAGS, TAG_LETTER, WHATS, checklist, isComplete, type Item, type Tag } from './actions';
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
  const covered = (leaf: string) => items.some((i) => WHATS.find((w) => w.id === i.what)?.covers.includes(leaf));

  useEffect(() => {
    setCaption(actionsCaption(items), { quiet: true });
  }, [setCaption, items]);

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
          {items.length === 0 ? (
            <p className="empty-note">No actions yet.</p>
          ) : (
            <ul className="pm-items">
              {items.map((i) => (
                <li key={i.id} className={`pm-item ${isComplete(i) ? 'is-ok' : 'is-bad'}`}>
                  <span className="chip pm-tag">{i.tag ? TAG_LETTER[i.tag] : '?'}</span>
                  <span>
                    <b>{whatText(i.what)}</b> · {i.owner ?? 'no owner role'} · done when: {doneText(i.done)}
                  </span>
                  <Button onClick={() => setItems(items.filter((x) => x.id !== i.id))}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
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
        <ProvenanceRow>
          <Provenance kind="invented">invented incident and action list</Provenance>
          <ClaimLabel kind="practice">an owner role, a tag and a done-when someone can check are common practice for action items</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
