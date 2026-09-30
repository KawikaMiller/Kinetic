import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark } from '../../components/TreeSvg';
import { Button, ControlGroup, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import {
  ALL_FIXED, FIXES, NONE_FIXED, announce, buildTree, tabOrder, type AxNode, type FixId, type Fixes, type NodeId,
} from './model';

const LOG_LENGTH = 8;
const NAME_CHARS = 14;
const NODE_W = 128;
/** Horizontal room per leaf in the tree's viewBox. */
const LEAF_W = 150;
/** A simple drawn logo, so the <img> has something to show. */
const LOGO_SRC =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='18' fill='orange'/><path d='M12 16h14v8a7 7 0 0 1-14 0z' fill='white'/></svg>";

interface Spoken {
  text: string;
  bad: boolean;
}

const clip = (s: string) => (s.length > NAME_CHARS ? `${s.slice(0, NAME_CHARS - 1)}…` : s);

export function FormScene({ picker }: { picker: ReactNode }) {
  const [fixes, setFixes] = useState<Fixes>(NONE_FIXED);
  const [email, setEmail] = useState('');
  const [errorShown, setErrorShown] = useState(false);
  const [focused, setFocused] = useState<NodeId | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [log, setLog] = useState<Spoken[]>([]);
  const setCaption = useSetCaption();
  const els = useRef<Partial<Record<NodeId, HTMLElement | null>>>({});

  const tree = buildTree(fixes, errorShown);
  const byId = Object.fromEntries(tree.map((n) => [n.id, n])) as Record<NodeId, AxNode>;
  const stops = tabOrder(tree);
  const problems = tree.filter((n) => n.issue);

  useIntroCaption(
    <>A sign-up form with six classic accessibility bugs. Press <span className="hl">Tab</span> in the screen-reader controls
      to hear what a blind user hears, then fix the bugs one by one.</>,
  );

  const speak = (text: string, bad = false) => {
    setLog((prev) => [...prev, { text, bad }].slice(-LOG_LENGTH));
    setCaption(<>Screen reader: <span className={`hl ${bad ? 'bad' : 'info'}`}>“{text}”</span></>, { quiet: true });
  };

  const move = (delta: number) => {
    if (!stops.length) return;
    const next = (cursor + delta + stops.length) % stops.length;
    const node = stops[next];
    setCursor(next);
    els.current[node.id]?.focus();
    setFocused(node.id);
    speak(announce(node), !!node.issue);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (email.trim()) {
      setErrorShown(false);
      speak(fixes.live ? 'Thanks, you are signed up.' : '(the page changed, but nothing was announced)', !fixes.live);
      return;
    }
    setErrorShown(true);
    if (fixes.live) speak('Alert: Please enter your email address.');
    else speak('(silence: the error appeared, but nothing announced it)', true);
  };

  const setFix = (id: FixId, on: boolean) => {
    setFixes((prev) => ({ ...prev, [id]: on }));
    setCursor(-1);
    const f = FIXES.find((x) => x.id === id)!;
    setCaption(
      on ? <><span className="hl ok">Fixed</span> {f.label}: {f.broken} → {f.fixed}.</> : <>{f.label} is broken again ({f.broken}).</>,
    );
  };

  const bind = (id: NodeId) => (el: HTMLElement | null) => {
    els.current[id] = el;
  };
  const onFocus = (id: NodeId) => () => setFocused(id);

  const nodeMark = (id: NodeId): TreeNodeMark | null => {
    const n = byId[id];
    if (!n) return null;
    if (id === focused) return { tone: 'hi', fill: 'solid' };
    if (n.issue) return { tone: 'bad', fill: 'tint' };
    if (n.fix && fixes[n.fix]) return { tone: 'ok', fill: 'tint' };
    return n.focusable ? null : { tone: 'dim', fill: 'tint' };
  };

  return (
    <StageFrame
      height={560}
      minWidth={760}
      stats={
        <Stats>
          <Stat label="Problems" value={problems.length} color={problems.length ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Tab stops" value={stops.length} sub={stops.map((s) => s.id).join(' → ') || 'none'} />
          <Stat label="Headings" value={tree.filter((n) => n.role === 'heading').length} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'focused' },
            { color: 'var(--bad)', label: 'no role or name / broken' },
            { color: 'var(--ok)', label: 'fixed' },
            { color: 'var(--dim)', label: 'non-interactive' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Screen reader (simulated)">
            <Button variant="primary" onClick={() => move(1)} disabled={!stops.length}>Tab ↓</Button>
            <Button onClick={() => move(-1)} disabled={!stops.length}>Shift+Tab ↑</Button>
            <Button onClick={() => { setLog([]); tree.forEach((n) => speak(announce(n), !!n.issue)); }}>Read the whole form</Button>
          </ControlGroup>
        </>,
        <ControlGroup key="fixes" label="Fix it">
          {FIXES.map((f) => (
            <Toggle key={f.id} label={f.label} value={fixes[f.id]} onChange={(on) => setFix(f.id, on)} off={f.broken} on={f.fixed} />
          ))}
        </ControlGroup>,
        <>
          <Button onClick={() => setFixes(ALL_FIXED)}>Fix everything</Button>
          <Button onClick={() => setFixes(NONE_FIXED)}>Break everything</Button>
        </>,
      ]}
    >
      <div className="stage-pad ac">
        <div className="ac-grid">
          <Box className="ac-sandbox">
            <SectionTitle hint="real HTML">The form</SectionTitle>
            <form className="ac-form" aria-label="Sign up" onSubmit={submit} noValidate>
              <div className="ac-brand">
                {fixes.alt ? <img src={LOGO_SRC} alt="Brew & Co" width={40} height={40} /> : <img src={LOGO_SRC} width={40} height={40} />}
                {fixes.heading ? <h2 className="ac-title">Create your account</h2> : <div className="ac-title">Create your account</div>}
              </div>
              <div className="ac-field">
                {fixes.label ? <label htmlFor="ac-email">Email</label> : <span className="ac-fake-label">Email</span>}
                <input
                  ref={bind('email')}
                  id="ac-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={onFocus('email')}
                  className={focused === 'email' ? 'is-reader-focus' : undefined}
                />
              </div>
              <div className="ac-check">
                <input ref={bind('news')} id="ac-news" type="checkbox" onFocus={onFocus('news')} className={focused === 'news' ? 'is-reader-focus' : undefined} />
                <label htmlFor="ac-news">Send me the newsletter</label>
                {!fixes.order && <code className="ac-attr" title="simulated">tabindex="1"</code>}
              </div>
              {fixes.button ? (
                <button ref={bind('submit')} type="submit" className={`ac-submit ${focused === 'submit' ? 'is-reader-focus' : ''}`} onFocus={onFocus('submit')}>
                  Sign up
                </button>
              ) : (
                <div ref={bind('submit')} className="ac-submit is-div" onClick={() => submit()}>
                  Sign up
                </div>
              )}
              {errorShown &&
                (fixes.live ? (
                  <p role="alert" className="ac-error">Please enter your email address.</p>
                ) : (
                  <p className="ac-error">Please enter your email address.</p>
                ))}
            </form>
            <p className="ac-note">
              Clicking works for everyone with a mouse. The problems show up for keyboard and screen-reader users. (The{' '}
              <code>tabindex="1"</code> bug is simulated: the reader's Tab follows it, but it isn't applied for real, or it would
              hijack Tab on this whole page.)
            </p>
          </Box>
          <div className="ac-tree">
            <SectionTitle hint="role · name">Accessibility tree</SectionTitle>
            <TreeSvg
              shape={{ root: 'form' as NodeId, children: (id) => (id === 'form' ? tree.slice(1).map((n) => n.id) : []) }}
              layout="tidy"
              width={Math.max(760, (tree.length - 1) * LEAF_W)}
              pad={NODE_W / 2 + 6}
              height={200}
              top={36}
              levelGap={100}
              nodeMark={nodeMark}
              nodeClass={() => 'ac-node'}
              renderNode={(id) => {
                const n = byId[id];
                return (
                  <>
                    <rect className="ac-node-under" x={-NODE_W / 2} y={-22} width={NODE_W} height={44} rx={8} />
                    <rect className="ac-node-box" x={-NODE_W / 2} y={-22} width={NODE_W} height={44} rx={8} />
                    <text y={-4} className="ac-node-role">{n.role}</text>
                    <text y={12} className="ac-node-name">{n.name ? `"${clip(n.name)}"` : '(no name)'}</text>
                  </>
                );
              }}
              ariaLabel="Simplified accessibility tree of the form"
            />
            <ul className="ac-issues">
              {problems.map((n) => (
                <li key={n.id} className="log-row tone-bad">
                  <b>{n.id}</b>: {n.issue}
                </li>
              ))}
              {!problems.length && <li className="log-row tone-ok">No problems left: every control has a role, a name and a sensible order.</li>}
            </ul>
          </div>
        </div>
        <Box className="ac-reader">
          <SectionTitle hint="what it would say">Screen reader output</SectionTitle>
          {!log.length && <p className="empty-note">Press Tab ↓ or "Read the whole form".</p>}
          {log.map((s, i) => (
            <div key={i} className={`log-row ${s.bad ? 'tone-bad' : 'tone-info'}`}>
              {s.text}
            </div>
          ))}
        </Box>
        <p className="ac-honest">
          Simplified tree computed from our model, not the browser's real accessibility tree; the screen reader is simulated.
        </p>
      </div>
    </StageFrame>
  );
}
