import { TUNNELS, type IpVersion, type Suite, type TunnelId } from './tunnels';
import type { LadderId } from './ladders';
import type { TiePolicy } from './routing';

const SHORT: Record<TunnelId, string> = { gre: 'GRE', esp: 'IPsec ESP', wireguard: 'WireGuard', vxlan: 'VXLAN' };
export const TUNNEL_OPTIONS: { value: TunnelId; label: string }[] = TUNNELS.map((t) => ({ value: t, label: SHORT[t] }));

export const OUTER_OPTIONS: { value: IpVersion; label: string }[] = [
  { value: 4, label: 'IPv4' },
  { value: 6, label: 'IPv6' },
];
export const SUITE_OPTIONS: { value: Suite; label: string }[] = [
  { value: 'gcm', label: 'AES-GCM' },
  { value: 'cbc', label: 'AES-CBC + HMAC' },
];

export const LADDER_OPTIONS: { value: LadderId; label: string }[] = [
  { value: 'wireguard', label: 'WireGuard' },
  { value: 'ikev2', label: 'IPsec IKEv2' },
];
export const TIE_OPTIONS: { value: TiePolicy; label: string }[] = [
  { value: 'direct', label: 'the direct route' },
  { value: 'tunnel', label: 'the tunnel route' },
];
