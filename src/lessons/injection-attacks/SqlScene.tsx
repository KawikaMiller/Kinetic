import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import {
  CONCAT_CODE, INTENDED_SHAPE, PARAM_CODE, PARAM_SHAPE, concatenated, parameterised, shapeOf,
  type ConcatResult, type Outcome, type User,
} from './sql';

const NAMES = [
  { id: 'smith', label: 'Smith', value: 'Smith' },
  { id: 'obrien', label: "O'Brien", value: "O'Brien" },
  { id: 'curly', label: 'O’Brien (curly ’)', value: 'O’Brien' },
  { id: 'garcia', label: 'García', value: 'García' },
  { id: 'space', label: '"Smith " (trailing space)', value: 'Smith ' },
];

export function SqlScene({ picker }: { picker: ReactNode }) {
  const [name, setName] = useState('Smith');
  const setCaption = useSetCaption();
  const concat = concatenated(name);
  const param = parameterised(name);

  useIntroCaption(
    <>A search box looks users up by surname. The same name is sent two ways. Try <span className="hl">O&apos;Brien</span>.</>,
  );

  const search = (value: string) => {
    setName(value);
    setCaption(captionFor(value, concatenated(value)), { quiet: true });
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Pasted in" value={verdictLabel(concat.outcome)} color={concat.outcome.kind === 'rows' ? 'var(--ok)' : 'var(--bad)'} sub="concatenation" />
          <Stat label="Sent separately" value={verdictLabel(param.outcome)} color="var(--ok)" sub="parameter" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'your data' },
            { color: 'var(--bad)', label: 'data that became code' },
            { color: 'var(--ok)', label: 'parameter (sent separately)' },
            { color: 'var(--hi)', label: 'rows returned' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextField label="Surname" value={name} onChange={search} spellCheck={false} width={220} />
          <ControlGroup label="Try">
            {NAMES.map((n) => (
              <ChipButton key={n.id} tone="info" on={name === n.value} onClick={() => search(n.value)}>{n.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad inj">
        <div className="inj-pair">
          <Box className="inj-side">
            <SectionTitle hint="string concatenation">Pasted into the query</SectionTitle>
            <code className="inj-code-line">{CONCAT_CODE}</code>
            <p className="inj-label">What the database receives</p>
            <code className="inj-query">
              <ConcatQuery r={concat} />
            </code>
            <Structure shape={shapeOf(concat.tokens)} intended={INTENDED_SHAPE} />
            <Verdict outcome={concat.outcome} />
          </Box>
          <Box className="inj-side">
            <SectionTitle hint="a placeholder">Sent separately</SectionTitle>
            <code className="inj-code-line">{PARAM_CODE}</code>
            <p className="inj-label">What the database receives</p>
            <code className="inj-query">
              {param.sql.slice(0, -1)}
              <span className="inj-param">?</span>
            </code>
            <div className="inj-params">
              <span className="inj-label">parameter 1</span>
              <code className="inj-param-value">{JSON.stringify(name)}</code>
            </div>
            <Structure shape={PARAM_SHAPE} intended={PARAM_SHAPE} />
            <Verdict outcome={param.outcome} />
          </Box>
        </div>
        <p className="inj-honest">Simulated database; nothing is executed. The users table has five rows.</p>
      </div>
    </StageFrame>
  );
}

/** The concatenated SQL, with the name's characters coloured by what they turned into. */
function ConcatQuery({ r }: { r: ConcatResult }) {
  const head = r.sql.slice(0, r.dataStart);
  const tail = r.sql.slice(r.dataStart + r.roles.length);
  return (
    <>
      {head}
      {[...r.sql.slice(r.dataStart, r.dataStart + r.roles.length)].map((c, i) => (
        <span key={i} className={r.roles[i] === 'code' ? 'inj-became-code' : 'inj-data'}>{c}</span>
      ))}
      {tail}
    </>
  );
}

/** The query's token structure, with any token that differs from the intended one in red. */
function Structure({ shape, intended }: { shape: string[]; intended: string[] }) {
  return (
    <div className="inj-shape" aria-label="Query structure">
      <span className="inj-label">structure</span>
      {shape.map((k, i) => (
        <span key={i} className={`chip ${k === intended[i] ? 'tone-dim' : 'tone-bad is-on'}`}>{k}</span>
      ))}
      {shape.length < intended.length && <span className="chip tone-bad is-on">missing</span>}
    </div>
  );
}

function Verdict({ outcome }: { outcome: Outcome }) {
  if (outcome.kind !== 'rows') {
    return (
      <p className="log-row tone-bad inj-verdict">
        {outcome.kind === 'syntax-error' ? `Database error: ${outcome.message}` : `Stopped: ${outcome.message}`}
      </p>
    );
  }
  return (
    <>
      <p className={`log-row ${outcome.rows.length ? 'tone-hi' : 'tone-dim'} inj-verdict`}>
        {outcome.rows.length ? `Found ${plural(outcome.rows.length, 'row')}` : 'No rows match (the lookup is exact)'}
      </p>
      {outcome.rows.length > 0 && <Rows rows={outcome.rows} />}
    </>
  );
}

function Rows({ rows }: { rows: User[] }) {
  return (
    <table className="data-table inj-rows">
      <thead>
        <tr>
          <th>id</th>
          <th>first</th>
          <th>surname</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>{u.id}</td>
            <td>{u.first}</td>
            <td>{u.surname}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const verdictLabel = (o: Outcome) => (o.kind === 'rows' ? plural(o.rows.length, 'row') : 'error');

function captionFor(name: string, r: ConcatResult): ReactNode {
  if (r.outcome.kind === 'syntax-error') {
    return (
      <>The apostrophe in <span className="hl">{name}</span> closed the string early, so the rest of the name was read as{' '}
        <span className="hl bad">SQL code</span> and the query broke. The parameter version found them fine.</>
    );
  }
  if (r.outcome.kind === 'changed') {
    return <>Part of the text escaped the quotes and <span className="hl bad">changed the query itself</span>. With a parameter it can't.</>;
  }
  if (name.endsWith(' ')) {
    return <>Both send the name exactly as typed, trailing space included, so neither matches. Parameters never change your data; trimming is a separate decision.</>;
  }
  if (name.includes('’')) {
    return <>A curly apostrophe (’) isn&apos;t a quote to SQL, so it stays data. The straight one (&apos;) is what breaks out.</>;
  }
  return <>For an ordinary name both work, which is why pasting looks fine until someone real types an apostrophe.</>;
}
