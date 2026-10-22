import { Box, SectionTitle } from '../../components/Panel';
import { dollars, plural } from '../../core/format';
import { HORIZON, PRICE_PER_BILLED_SECOND, PRICE_PER_PROVISIONED_SECOND, PRICE_PER_REQUEST, PRICE_VM_PER_SECOND, VM_SLOTS, type Costs, type Run } from './model';

const micro = (dollars: number) => `$${(dollars * 1e6).toFixed(2)} per million`;

/** Pay-per-request plus provisioned against an always-on VM fleet, over the whole run, scaled to a month. */
export function CostPanel({ run, costs }: { run: Run; costs: Costs }) {
  const throttled = run.requests.filter((r) => r.outcome === 'throttled').length;
  const cheaper = costs.functions < costs.vm ? 'functions' : 'vm';
  return (
    <Box className="sc-cost">
      <SectionTitle hint="illustrative prices, the whole run repeated for a 30-day month">Cost against an always-on VM</SectionTitle>
      <table className="data-table">
        <thead>
          <tr>
            <th>Option</th>
            <th>What you pay for in this run</th>
            <th>Per month</th>
          </tr>
        </thead>
        <tbody>
          <tr className={cheaper === 'functions' ? 'sc-cheaper' : ''}>
            <td>Functions</td>
            <td>
              {plural(costs.served, 'served request')}, {run.billedSeconds.toFixed(1)} billed s (handler plus init), {run.provisionedInstances} provisioned
              {run.provisionedInstances === 1 ? ' instance' : ' instances'} × {HORIZON} s
            </td>
            <td>{dollars(costs.functions)}</td>
          </tr>
          <tr className={cheaper === 'vm' ? 'sc-cheaper' : ''}>
            <td>Always-on VM</td>
            <td>
              {plural(costs.vms, 'VM')} running all month, sized for the peak of requests in flight, ignoring cold-start time ({VM_SLOTS} requests at once each)
            </td>
            <td>{dollars(costs.vm)}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        Cheaper here: <b>{cheaper === 'functions' ? 'functions' : 'the always-on VM'}</b>. Functions are billed {micro(PRICE_PER_REQUEST)} requests plus ${PRICE_PER_BILLED_SECOND} per billed
        second, and ${PRICE_PER_PROVISIONED_SECOND} per provisioned instance-second; the VM ${PRICE_VM_PER_SECOND} per second. The bill is linear in requests and duration.
        {throttled > 0 && <> The {plural(throttled, 'throttled request')} were refused, so they are not billed.</>} Whether init time is billed varies by provider and runtime; here it is.
      </p>
    </Box>
  );
}
