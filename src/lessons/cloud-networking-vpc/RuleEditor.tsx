import { Button, ChipButton, ControlGroup, Hint, Segmented, TextField } from '../../components/ui';
import { addRule, editDraft, pickList, removeRule, ruleText, type RulesState } from './init';
import { DIRECTION_OPTIONS, INSTANCE_OPTIONS, SUBNET_OPTIONS } from './options';
import { NACL_NUMBER_RANGE } from './rules';
import { EPHEMERAL_RANGE, MAX_RULES, rulesOf, type ListRef, type NaclRule } from './vpc';

type Kind = ListRef['kind'];
const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'route', label: 'Route tables' },
  { value: 'sg', label: 'Security groups' },
  { value: 'nacl', label: 'Network ACLs' },
];
const PROTO_OPTIONS = [
  { value: 'tcp' as const, label: 'tcp' },
  { value: 'all' as const, label: 'all traffic' },
];
const ACTION_OPTIONS = [
  { value: 'allow' as const, label: 'allow' },
  { value: 'deny' as const, label: 'deny' },
];
const TARGET_OPTIONS = [
  { value: 'igw' as const, label: 'internet gateway' },
  { value: 'nat' as const, label: 'NAT gateway' },
];

const defaultList = (kind: Kind, from: ListRef): ListRef => {
  const subnet = 'subnet' in from ? from.subnet : 'public';
  const dir = 'dir' in from ? from.dir : 'in';
  if (kind === 'route') return { kind, subnet };
  if (kind === 'sg') return { kind, dir, instance: 'instance' in from ? from.instance : 'db' };
  return { kind, dir, subnet };
};

const listTitle = (ref: ListRef) => {
  if (ref.kind === 'route') return `Route table of the ${ref.subnet} subnet (the local route for the VPC range is always there)`;
  if (ref.kind === 'sg') return `Security group of ${ref.instance}, ${ref.dir === 'in' ? 'inbound (source)' : 'outbound (destination)'}: allow rules only`;
  return `Network ACL of the ${ref.subnet} subnet, ${ref.dir === 'in' ? 'inbound (source)' : 'outbound (destination)'}: lowest number first, then deny`;
};

/** Pick a list, read its rules, add one or remove one. Every refusal names the field. */
export function RuleEditor({ st, setSt }: { st: RulesState; setSt: (f: (s: RulesState) => RulesState) => void }) {
  const ref = st.list;
  const rules = rulesOf(st.cfg, ref).map((rule, index) => ({ rule, index }));
  const shown = ref.kind === 'nacl' ? [...rules].sort((a, b) => (a.rule as NaclRule).num - (b.rule as NaclRule).num) : rules;
  const draft = st.draft;
  const set = (patch: Partial<typeof draft>) => setSt((s) => editDraft(s, patch));
  const full = rules.length >= MAX_RULES;

  return (
    <div className="vpc-editor">
      <div className="vpc-editor-pick">
        <Segmented label="Edit" value={ref.kind} options={KIND_OPTIONS} onChange={(kind) => setSt((s) => pickList(s, defaultList(kind, s.list)))} />
        {ref.kind === 'sg' ? (
          <Segmented ariaLabel="Which security group" value={ref.instance} options={INSTANCE_OPTIONS} onChange={(instance) => setSt((s) => pickList(s, { ...ref, instance }))} />
        ) : (
          <Segmented ariaLabel="Which subnet" value={ref.subnet} options={SUBNET_OPTIONS} onChange={(subnet) => setSt((s) => pickList(s, { ...ref, subnet }))} />
        )}
        {ref.kind !== 'route' && (
          <Segmented ariaLabel="Direction" value={ref.dir} options={DIRECTION_OPTIONS} onChange={(dir) => setSt((s) => pickList(s, { ...ref, dir }))} />
        )}
      </div>
      <p className="vpc-note">{listTitle(ref)}</p>
      <div className="vpc-scroll" role="region" aria-label="The rules in this list" tabIndex={0}>
        <table className="data-table vpc-rules">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={2}>{ref.kind === 'nacl' ? 'No rules: everything is denied (the implicit rule).' : ref.kind === 'sg' ? 'No rules: nothing is allowed.' : 'No routes beyond the local one: a destination outside the VPC has no route.'}</td>
              </tr>
            )}
            {shown.map(({ rule, index }) => (
              <tr key={index}>
                <td>{ruleText(ref, rule)}</td>
                <td>
                  <ChipButton tone="bad" ariaLabel={`Remove ${ruleText(ref, rule)}`} onClick={() => setSt((s) => removeRule(s, index))}>×</ChipButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="vpc-form">
        {ref.kind === 'route' ? (
          <>
            <TextField label="Destination" value={draft.dest} onChange={(dest) => set({ dest })} onEnter={() => setSt(addRule)} width={140} maxLength={20} placeholder="0.0.0.0/0" spellCheck={false} />
            <Segmented label="Target" value={draft.target} options={TARGET_OPTIONS} onChange={(target) => set({ target })} />
          </>
        ) : (
          <>
            {ref.kind === 'nacl' && (
              <>
                <TextField label="Rule number" value={draft.num} onChange={(num) => set({ num })} width={80} maxLength={6} placeholder={`${NACL_NUMBER_RANGE.min}-${NACL_NUMBER_RANGE.max}`} spellCheck={false} />
                <Segmented ariaLabel="Allow or deny" value={draft.action} options={ACTION_OPTIONS} onChange={(action) => set({ action })} />
              </>
            )}
            <Segmented label="Protocol" value={draft.proto} options={PROTO_OPTIONS} onChange={(proto) => set({ proto })} />
            {draft.proto === 'tcp' && (
              <>
                <TextField label="Port from" value={draft.from} onChange={(from) => set({ from })} width={104} maxLength={5} placeholder="0-65535" spellCheck={false} />
                <TextField label="Port to" value={draft.to} onChange={(to) => set({ to })} width={116} maxLength={5} placeholder="same as from" spellCheck={false} />
              </>
            )}
            <TextField
              label={ref.dir === 'in' ? 'Source' : 'Destination'}
              value={draft.peer}
              onChange={(peer) => set({ peer })}
              onEnter={() => setSt(addRule)}
              width={150}
              maxLength={20}
              placeholder={ref.kind === 'sg' ? 'CIDR or app-sg' : '0.0.0.0/0'}
              spellCheck={false}
            />
          </>
        )}
        <Button variant="primary" softDisabled={full} onClick={() => setSt(addRule)}>Add rule</Button>
        {ref.kind === 'nacl' && (
          <ChipButton tone="info" onClick={() => set({ proto: 'tcp', from: String(EPHEMERAL_RANGE.lo), to: String(EPHEMERAL_RANGE.hi) })}>
            fill ephemeral ports {EPHEMERAL_RANGE.lo}-{EPHEMERAL_RANGE.hi}
          </ChipButton>
        )}
      </div>
      <ControlGroup>
        <Hint tone="muted">
          <span role="status">{st.note ?? `Up to ${MAX_RULES} entries per list. A refused entry changes nothing and says which field to fix.`}</span>
        </Hint>
      </ControlGroup>
    </div>
  );
}
