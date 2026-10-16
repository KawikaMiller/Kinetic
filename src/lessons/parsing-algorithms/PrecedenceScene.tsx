import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { precedenceCaption } from './captions';
import { TokenField } from './GrammarEditor';
import { OPENING, type ConflictPolicy } from './opening';
import { ParseTree, TREE_MIN_WIDTH } from './ParseTree';
import { CONFLICTS, TOKEN_PRESETS, choiceId, playGame, usualChoice, usualChoices, type Choices } from './precedence';
import { useTokenInput } from './useGrammar';

const OPTIONS: { value: ConflictPolicy; label: string }[] = [
  { value: 'shift', label: 'Shift' },
  { value: 'reduce', label: 'Reduce' },
];

const openingChoices = (): Choices => ({
  '+*': OPENING.precedence.afterPlusSeesStar,
  '*+': OPENING.precedence.afterStarSeesPlus,
  '++': OPENING.precedence.afterPlusSeesPlus,
  '**': OPENING.precedence.afterStarSeesStar,
});

/** Scene 4: choose shift or reduce for each conflict and watch the tree, and its value, change. */
export function PrecedenceScene({ picker }: { picker: ReactNode }) {
  const tokenInput = useTokenInput(OPENING.precedence.tokens);
  const [choices, setChoices] = useState<Choices>(openingChoices);
  const game = useMemo(() => playGame(tokenInput.tokens, choices), [tokenInput.tokens, choices]);
  const usual = useMemo(() => playGame(tokenInput.tokens, usualChoices()), [tokenInput.tokens]);
  const matchesUsual = CONFLICTS.every((c) => choices[choiceId(c)] === usualChoice(c));
  const last = game.run.frames[game.run.frames.length - 1];
  const roots = last.stack.flatMap((e) => (e.node === null ? [] : [e.node]));

  return (
    <StageFrame
      height={420}
      intro={precedenceCaption({ value: game.value, usual: usual.value, matchesUsual, status: game.run.status })}
      introKey={`${tokenInput.tokens.join(' ')}|${Object.values(choices).join(',')}`}
      stats={
        <Stats>
          <Stat label="This tree evaluates to" value={game.value ?? 'no tree'} color={game.value === null ? 'var(--muted)' : game.value === usual.value ? 'var(--ok)' : 'var(--bad)'} sub="ids are 2, 3, 4, ... left to right" />
          <Stat label="Usual precedence gives" value={usual.value ?? 'no tree'} color="var(--muted)" sub="shift before the tighter operator" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'bottom-up tree', shape: 'square' },
            { color: 'var(--ok)', label: 'value matches the usual precedence', shape: 'square' },
            { color: 'var(--bad)', label: 'value differs from the usual precedence', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {CONFLICTS.map((c) => (
            <Segmented
              key={c.cell}
              label={`After E ${c.op} E, next token ${c.look}`}
              value={choices[choiceId(c)]}
              onChange={(v) => setChoices({ ...choices, [choiceId(c)]: v })}
              options={OPTIONS}
            />
          ))}
        </>,
        <>
          <ControlGroup label="Tokens that reach each choice">
            {TOKEN_PRESETS.map((p) => (
              <ChipButton key={p.choice} tone="info" on={tokenInput.text === p.text} onClick={() => tokenInput.load(p.text)}>
                {p.text}
              </ChipButton>
            ))}
          </ControlGroup>
          <TokenField input={tokenInput} />
        </>,
      ]}
    >
      <div className="pa-stage stage-pad">
        <p className="pa-detail">
          The grammar <code>E -&gt; E + E | E * E | id</code> never says which operator binds tighter, so four table cells hold both a shift and a reduce. Your four choices are the precedence rule, but a string only reaches the choices its operators meet: on <code>id + id * id</code> only the first one changes the value, and the token chips pick a string for each choice (the equal-operator ones change the tree's shape, not its value, because + and * are associative). The tree below is built by the real shift-reduce parser from them.
        </p>
        <WideRegion minWidth={TREE_MIN_WIDTH} label="Parse tree: scroll sideways to see all of it">
          <ParseTree nodes={game.run.nodes} roots={roots} hiddenFrom={game.run.nodes.length} marks={new Map()} tone="violet" ariaLabel="Parse tree built from your four choices" />
        </WideRegion>
        <p className="pa-detail" role="status">
          {game.run.message}
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">the four choices stand in for precedence declarations in a real generator (from memory: yacc has %left and %right)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
