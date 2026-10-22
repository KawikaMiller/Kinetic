import { FLOWS, type Direction, type InstanceId, type SubnetId } from './vpc';

const SHORT: Record<string, string> = {
  'user-web': 'internet to web:443',
  'web-app': 'web to app:8080',
  'app-db': 'app to db:5432',
  'app-updates': 'app to the internet',
  'db-updates': 'db to the internet',
  'user-db': 'internet to db:5432',
};
export const FLOW_OPTIONS = FLOWS.map((f) => ({ value: f.id, label: SHORT[f.id] }));

export const SUBNET_OPTIONS: { value: SubnetId; label: string }[] = [
  { value: 'public', label: 'public' },
  { value: 'private', label: 'private' },
  { value: 'isolated', label: 'isolated' },
];
export const INSTANCE_OPTIONS: { value: InstanceId; label: string }[] = [
  { value: 'web', label: 'web-sg' },
  { value: 'app', label: 'app-sg' },
  { value: 'db', label: 'db-sg' },
];
export const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: 'in', label: 'inbound' },
  { value: 'out', label: 'outbound' },
];
