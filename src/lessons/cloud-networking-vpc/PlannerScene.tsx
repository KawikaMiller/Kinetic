import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField } from '../../components/ui';
import { blockSize } from '../../core/ipv4';
import { refocusAfterRemove } from '../../core/refocus';
import { carveCaption } from './captions';
import { addRow, initialPlanner, removeRow, setRowText } from './init';
import { AWS_RESERVED_PER_SUBNET, BLOCK_PREFIX_RANGE, DEFAULT_VPC, MAX_SUBNET_ROWS, carve, firstFit, overlapOf, parseBlock, spanOf, spanText, usableAddresses } from './planner';
import { cidrText, type Cidr } from './vpc';

const SLOT_PREFIX = 24;
const SLOTS = 256;
const GRID_SIDE = 16;
const ROW_TONES = ['var(--sky)', 'var(--amber)', 'var(--pink)', 'var(--orange)', 'var(--trk-lang)', 'var(--trk-hw)'];
const FREE_FILL = 'color-mix(in srgb, var(--dim) 14%, transparent)';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--sky)', label: 'each counted subnet takes its own tint and its row number (a category, not a verdict)' },
      { color: 'var(--dim)', label: 'unused addresses of the VPC range' },
    ]}
  />
);

/** The VPC's /16 as 256 slots of /24: each slot is filled in the tint of the rows that cover it, left to right by address. */
function slotStyle(slot: number, rows: { cidr: Cidr; index: number }[]): CSSProperties {
  const first = DEFAULT_VPC.net + slot * blockSize(SLOT_PREFIX);
  const last = first + blockSize(SLOT_PREFIX) - 1;
  const stops: string[] = [];
  let cursor = first;
  const inside = rows
    .map((r) => ({ ...r, span: spanOf(r.cidr) }))
    .filter((r) => r.span.last >= first && r.span.first <= last)
    .sort((a, b) => a.span.first - b.span.first);
  const pct = (a: number) => `${(((a - first) / blockSize(SLOT_PREFIX)) * 100).toFixed(3)}%`;
  for (const r of inside) {
    const from = Math.max(r.span.first, first);
    const to = Math.min(r.span.last, last) + 1;
    if (from > cursor) stops.push(`${FREE_FILL} ${pct(cursor)} ${pct(from)}`);
    stops.push(`${ROW_TONES[r.index % ROW_TONES.length]} ${pct(from)} ${pct(to)}`);
    cursor = to;
  }
  if (cursor <= last) stops.push(`${FREE_FILL} ${pct(cursor)} 100%`);
  return { background: `linear-gradient(to right, ${stops.join(', ')})` };
}

export function PlannerScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialPlanner);
  const plan = useMemo(() => carve(DEFAULT_VPC, st.rows), [st.rows]);
  const slotRows = useMemo(() => plan.rows.flatMap((r, index) => (r.ok ? [{ cidr: r.cidr, index }] : [])), [plan]);
  const fit = firstFit(plan, st.prefix);
  const a = parseBlock(st.vpcA, 'VPC A');
  const b = parseBlock(st.vpcB, 'VPC B');
  const shared = a.ok && b.ok ? overlapOf(spanOf(a.value), spanOf(b.value)) : null;
  const total = blockSize(st.prefix);
  const signature = `${plan.accepted.length}|${plan.usable}|${plan.freeAddresses}|${plan.rows.length}`;

  return (
    <StageFrame height={760} legend={LEGEND} intro={carveCaption(plan)} introKey={signature} controls={[<>{picker}</>]}>
      <div className="vpc-stage stage-pad">
        <Box>
          <SectionTitle hint={`/${BLOCK_PREFIX_RANGE.min} to /${BLOCK_PREFIX_RANGE.max}, AWS-style sizes`}>How many addresses a subnet really gives</SectionTitle>
          <div className="vpc-controls">
            <Slider label="Subnet size" value={st.prefix} min={BLOCK_PREFIX_RANGE.min} max={BLOCK_PREFIX_RANGE.max} format={(p) => `/${p}`} onChange={(prefix) => setSt((s) => ({ ...s, prefix }))} />
            <ControlGroup label="Try" inline>
              {[24, 26, 28].map((p) => (
                <ChipButton key={p} on={st.prefix === p} onClick={() => setSt((s) => ({ ...s, prefix: p }))}>/{p}</ChipButton>
              ))}
            </ControlGroup>
          </div>
          <Stats>
            <Stat label="Addresses in the block" value={total.toLocaleString('en-US')} sub={`2 to the power ${32 - st.prefix}`} />
            <Stat label="Reserved" value={AWS_RESERVED_PER_SUBNET} sub="five per subnet (from memory)" />
            <Stat label="Usable by instances" value={usableAddresses(st.prefix).toLocaleString('en-US')} color="var(--ok)" sub={`${total.toLocaleString('en-US')} minus ${AWS_RESERVED_PER_SUBNET}`} />
          </Stats>
          <p className="vpc-note">
            {fit ? `A /${st.prefix} fits in the free space of the VPC below, first at ${cidrText(fit)}.` : `No free aligned /${st.prefix} is left in the VPC below.`}
          </p>
        </Box>
        <Box>
          <SectionTitle hint="a row counts only if it parses, sits inside 10.0.0.0/16 and overlaps no earlier row">Carve 10.0.0.0/16 into subnets</SectionTitle>
          <div className="vpc-slots" role="img" aria-label={`The /16 as ${SLOTS} blocks of /${SLOT_PREFIX}: ${plan.accepted.length} subnets counted, ${plan.freeAddresses.toLocaleString('en-US')} addresses free`}>
            {Array.from({ length: SLOTS }, (_, slot) => (
              <i key={slot} className="vpc-slot" style={slotStyle(slot, slotRows)} />
            ))}
          </div>
          <p className="vpc-note">Each square is one /{SLOT_PREFIX} ({blockSize(SLOT_PREFIX)} addresses), {GRID_SIDE} per row; a subnet smaller than that fills part of a square.</p>
          {st.rows.map((row, i) => {
            const status = plan.rows[i];
            return (
              <div key={i} className="vpc-row">
                <span className="vpc-row-name" style={{ color: ROW_TONES[i % ROW_TONES.length] }}>Row {i + 1}</span>
                <TextField ariaLabel={`Subnet ${i + 1} CIDR`} value={row.text} onChange={(t) => setSt((s) => setRowText(s, i, t))} width={150} maxLength={20} placeholder="10.0.4.0/24" spellCheck={false} />
                <ChipButton tone="bad" ariaLabel={`Remove row ${i + 1}`} onClick={(e) => {
                  refocusAfterRemove(e.currentTarget, { group: '.box', items: 'button[aria-label^="Remove row"]', root: '.box', fallback: '.vpc-controls button' });
                  setSt((s) => removeRow(s, i));
                }}>×</ChipButton>
                <span className={`vpc-row-status ${status.ok ? 'is-ok' : 'is-bad'}`} role={status.ok ? undefined : 'status'}>
                  {status.ok ? `${cidrText(status.cidr)}: ${status.usable.toLocaleString('en-US')} usable of ${blockSize(status.cidr.prefix).toLocaleString('en-US')}` : status.error}
                </span>
              </div>
            );
          })}
          <div className="vpc-controls">
            <Button softDisabled={st.rows.length >= MAX_SUBNET_ROWS} onClick={() => setSt(addRow)}>Add a subnet row</Button>
            <Hint tone="muted">Up to {MAX_SUBNET_ROWS} rows.</Hint>
          </div>
          <Stats>
            <Stat label="Subnets counted" value={plan.accepted.length} sub={`of ${st.rows.length} rows`} />
            <Stat label="Usable addresses" value={plan.usable.toLocaleString('en-US')} color="var(--ok)" />
            <Stat label="Free in the /16" value={plan.freeAddresses.toLocaleString('en-US')} sub={plan.largestFree ? `largest block ${cidrText(plan.largestFree)}` : 'nothing left'} />
          </Stats>
          <p className="vpc-note">
            Free blocks: {plan.free.length === 0 ? 'none' : plan.free.slice(0, 8).map(cidrText).join(', ')}
            {plan.free.length > 8 ? `, and ${plan.free.length - 8} more` : ''}.
          </p>
        </Box>
        <Box>
          <SectionTitle hint="two networks that talk over peering or a VPN need ranges that do not overlap (from memory)">Do two VPC ranges overlap?</SectionTitle>
          <div className="vpc-controls">
            <TextField label="VPC A" value={st.vpcA} onChange={(vpcA) => setSt((s) => ({ ...s, vpcA }))} width={150} maxLength={20} spellCheck={false} />
            <TextField label="VPC B" value={st.vpcB} onChange={(vpcB) => setSt((s) => ({ ...s, vpcB }))} width={150} maxLength={20} spellCheck={false} />
            <ChipButton tone="info" onClick={() => setSt((s) => ({ ...s, vpcB: '10.1.0.0/16' }))}>B = 10.1.0.0/16</ChipButton>
          </div>
          <p className="vpc-note" role="status">
            {!a.ok ? a.error : !b.ok ? b.error : shared ? `They overlap at ${spanText(shared)}: an address there could belong to either network, so a route to it would be ambiguous.` : `${cidrText(a.value)} and ${cidrText(b.value)} share no address, so no address is ambiguous between them.`}
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">five reserved addresses per subnet and /16 to /28 block sizes are AWS-style numbers recalled from memory; verify against the VPC documentation</Provenance>
          <Provenance kind="illustrative">the carve is arithmetic on your rows; no VPC is created and no account is contacted</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
