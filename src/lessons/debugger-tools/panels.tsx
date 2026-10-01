import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Button, ChipButton, TextField } from '../../components/ui';
import type { BreakpointKind } from './debugger';
import { SUPPORTED, evaluate, preview, type Scope } from './expr';
import type { Value, Vars } from './program';

/** A breakpoint marker; shape as well as colour, so it reads without colour too. */
export function BreakpointDot({ kind }: { kind: BreakpointKind | null }) {
  const glyph = kind === 'cond' ? '?' : kind === 'log' ? '◆' : '';
  return <span className={`dbg-dot ${kind ? `is-${kind}` : 'is-empty'}`} aria-hidden="true">{glyph}</span>;
}

export interface ScopeSection {
  title: string;
  hint?: string;
  vars: Vars;
}

/** The Scope pane: the selected frame's variables, by scope, innermost first. */
export function ScopePane({ sections, changed, flashKey }: { sections: readonly ScopeSection[]; changed: ReadonlySet<string>; flashKey: number }) {
  return (
    <Box className="dbg-pane">
      <SectionTitle>Scope</SectionTitle>
      {sections.length === 0 && <p className="empty-note">Not paused.</p>}
      {sections.map((s) => (
        <div key={s.title} className="dbg-scope">
          <span className="dbg-scope-title">
            {s.title} {s.hint && <span className="dbg-faint">{s.hint}</span>}
          </span>
          {Object.keys(s.vars).length === 0 && <span className="dbg-faint dbg-row">(nothing yet)</span>}
          {Object.entries(s.vars).map(([name, v]) => (
            <VarRow key={`${name}-${changed.has(name) ? flashKey : 0}`} name={name} value={v} changed={changed.has(name)} />
          ))}
        </div>
      ))}
    </Box>
  );
}

function VarRow({ name, value, changed }: { name: string; value: Value; changed: boolean }) {
  return (
    <div className={`dbg-row ${changed ? 'is-changed' : ''}`}>
      <span className="dbg-name">{name}</span>: <code>{preview(value)}</code>
    </div>
  );
}

/** Watch expressions, re-evaluated against the selected frame at every pause. */
export function WatchPane({ watches, setWatches, scope }: { watches: readonly string[]; setWatches: (w: string[]) => void; scope: Scope | null }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const w = draft.trim();
    if (w && !watches.includes(w)) setWatches([...watches, w]);
    setDraft('');
  };
  return (
    <Box className="dbg-pane">
      <SectionTitle hint={SUPPORTED}>Watch</SectionTitle>
      {watches.map((w) => {
        const r = scope ? evaluate(w, scope) : null;
        return (
          <div key={w} className="dbg-row dbg-watch">
            <span>
              <span className="dbg-name">{w}</span>:{' '}
              {r === null ? (
                <code className="dbg-faint">&lt;not available&gt;</code>
              ) : r.ok ? (
                <code>{preview(r.value)}</code>
              ) : (
                <code className={r.unsupported ? 'dbg-unsupported' : 'dbg-error'}>{r.error}</code>
              )}
            </span>
            <ChipButton tone="bad" ariaLabel={`Remove watch ${w}`} onClick={() => setWatches(watches.filter((x) => x !== w))}>
              ×
            </ChipButton>
          </div>
        );
      })}
      <div className="dbg-add">
        <TextField ariaLabel="Add a watch expression" value={draft} onChange={setDraft} onEnter={add} placeholder="e.g. total * 0.9" spellCheck={false} className="dbg-grow" />
        <Button onClick={add}>Add</Button>
      </div>
    </Box>
  );
}

const SHORTCUTS: readonly [string, string, string, string][] = [
  ['Resume / continue', 'F8', 'F5', 'Run until the next breakpoint (or the end).'],
  ['Step over', 'F10', 'F10', 'Run this line, including any call on it, and pause on the next line.'],
  ['Step into', 'F11', 'F11', 'If this line calls a function, pause on its first line.'],
  ['Step out', 'Shift+F11', 'Shift+F11', 'Finish this function and pause back in the caller.'],
  ['Restart', 'Ctrl+R (reload)', 'Ctrl+Shift+F5', 'Start the program again from the top.'],
];

/** The closing card: real shortcuts, logpoints versus console.log, and how to open the tools. */
export function CheatSheet() {
  return (
    <div className="dbg-sheet">
      <Box>
        <SectionTitle>The same controls, in the real tools</SectionTitle>
        <table className="data-table dbg-keys">
          <thead>
            <tr>
              <th>Control</th>
              <th>Chrome DevTools</th>
              <th>VS Code</th>
              <th className="dbg-what-col">What it does</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map(([name, chrome, code, what]) => (
              <tr key={name}>
                <td>
                  {name}
                  <span className="dbg-what">{what}</span>
                </td>
                <td><kbd>{chrome}</kbd></td>
                <td><kbd>{code}</kbd></td>
                <td className="dbg-what-col">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dbg-note">
          Breakpoints: click a line number in DevTools' Sources panel, or the gutter left of the line numbers in VS Code (F9). Right-click it for a
          conditional breakpoint or a logpoint. VS Code draws breakpoints as red dots, as this page does; Chrome DevTools marks the line number in blue (orange for a conditional breakpoint, pink for a logpoint).
        </p>
      </Box>
      <div className="dbg-compare">
        <Box className="dbg-before">
          <SectionTitle>console.log debugging</SectionTitle>
          <ol>
            <li>Add <code>console.log(total)</code> to the code</li>
            <li>Save, rebuild, reload</li>
            <li>Click through the app to the bug again</li>
            <li>Not enough? Add another log, go to 2</li>
            <li>Remember to delete them all before committing</li>
          </ol>
        </Box>
        <Box className="dbg-after">
          <SectionTitle>A logpoint</SectionTitle>
          <ol>
            <li>Right-click the line, add a logpoint: <code>'total', total</code></li>
            <li>Keep running: it prints every time the line runs, without pausing</li>
            <li>The code file never changes, so there's nothing to clean up</li>
          </ol>
        </Box>
      </div>
      <Box>
        <SectionTitle>Getting there in a real project</SectionTitle>
        <ul className="dbg-note">
          <li>A <code>debugger;</code> statement pauses right there whenever DevTools is open.</li>
          <li>Node: <code>node --inspect app.js</code> (or <code>--inspect-brk</code> to pause on the first line), then open <code>chrome://inspect</code>. VS Code's JavaScript Debug Terminal does it for you.</li>
          <li>Python, Java, Go and C# debuggers have the same buttons with the same names.</li>
        </ul>
      </Box>
    </div>
  );
}
