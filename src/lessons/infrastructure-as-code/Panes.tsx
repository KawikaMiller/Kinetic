import { Box, SectionTitle } from '../../components/Panel';
import { TextArea } from '../../components/ui';
import { plural } from '../../core/format';
import type { World } from './model';
import { MAX_TEXT } from './schema';
import { attrPairs } from './view';

export function ConfigPane({ text, onChange, error, planning }: { text: string; onChange: (t: string) => void; error: { line: number; message: string } | null; planning: boolean }) {
  return (
    <Box className="iac-pane">
      <SectionTitle hint="you edit this">Config</SectionTitle>
      <TextArea label="Declared resources (HCL-like)" value={text} onChange={onChange} rows={14} />
      {error ? (
        <p className="iac-error" role="alert">
          Line {error.line}: {error.message}. {planning ? 'Planning the last config that parsed.' : 'The last config that parsed is kept.'}
        </p>
      ) : (
        <p className="hint">
          Subset: <code>resource "type" "label" {'{'} … {'}'}</code>, one <code>key = value</code> per line, values are <code>"text"</code>, whole numbers, <code>true</code>,{' '}
          <code>type.label</code> references or a one-line tag map. Up to {MAX_TEXT} characters.
        </p>
      )}
    </Box>
  );
}

function Attrs({ attrs, differs }: { attrs: Record<string, string | number | boolean>; differs?: (key: string) => boolean }) {
  return (
    <span className="iac-attrs">
      {attrPairs(attrs).map(([k, v]) => (
        <span key={k} className={`iac-attr ${differs?.(k) ? 'is-drift' : ''}`}>
          {k}: {v}
        </span>
      ))}
    </span>
  );
}

export function StatePane({ world }: { world: World }) {
  const entries = Object.entries(world.state);
  return (
    <Box className="iac-pane">
      <SectionTitle hint="what the tool last recorded">State</SectionTitle>
      {entries.length === 0 ? (
        <p className="empty-note">The state is empty: the tool believes nothing exists.</p>
      ) : (
        <ul className="iac-list">
          {entries.map(([address, e]) => (
            <li key={address}>
              <b>{address}</b> <code>{e.id}</code>
              <Attrs attrs={e.attrs} />
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

export function CloudPane({ world }: { world: World }) {
  const idToState = new Map(Object.values(world.state).map((e) => [e.id, e]));
  const objects = Object.entries(world.cloud.objects);
  return (
    <Box className="iac-pane">
      <SectionTitle hint="simulated cloud">Real world</SectionTitle>
      {objects.length === 0 ? (
        <p className="empty-note">Nothing exists in the cloud.</p>
      ) : (
        <ul className="iac-list">
          {objects.map(([id, o]) => {
            const recorded = idToState.get(id);
            return (
              <li key={id} className={recorded ? '' : 'is-unmanaged'}>
                <b>{o.type}</b> <code>{id}</code>
                {!recorded && <em> not in the state</em>}
                <Attrs attrs={o.attrs} differs={(k) => recorded !== undefined && recorded.attrs[k] !== o.attrs[k]} />
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint">{plural(objects.length, 'object')} exist.</p>
    </Box>
  );
}
