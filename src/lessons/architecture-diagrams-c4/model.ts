/**
 * One made-up system, "Book a table", as a single nested model. The four C4 diagrams are
 * views of it: nothing is drawn that isn't an element or a relationship here, and a
 * zoom shows exactly the children of the element you zoomed into.
 *
 * C4 is Simon Brown's model: System Context, Containers, Components and Code. A "container"
 * is a separately runnable or deployable thing (a web app, a database, a queue), not
 * necessarily a Docker container.
 */

export type Level = 1 | 2 | 3 | 4;
export const LEVELS: readonly Level[] = [1, 2, 3, 4];

export const LEVEL_NAMES: Record<Level, string> = { 1: 'Context', 2: 'Container', 3: 'Component', 4: 'Code' };

export type Kind = 'person' | 'system' | 'external' | 'container' | 'component' | 'class';

export interface Element {
  id: string;
  /** 1 context (people, systems), 2 containers, 3 components, 4 classes. */
  level: Level;
  kind: Kind;
  name: string;
  /** Technology or class role: shown under the name from the container level down. */
  tech?: string;
  /** The element this one lives inside; null for the top level. */
  parent: string | null;
}

export interface Relation {
  from: string;
  to: string;
  intent: string;
  /** How they talk, where that is a design decision: left out at the context level. */
  protocol?: string;
}

const el = (id: string, level: Level, kind: Kind, name: string, parent: string | null, tech?: string): Element => ({
  id, level, kind, name, parent, ...(tech && { tech }),
});

export const ELEMENTS: readonly Element[] = [
  // Level 1: the system and what surrounds it.
  el('diner', 1, 'person', 'Diner', null),
  el('staff', 1, 'person', 'Restaurant staff', null),
  el('book', 1, 'system', 'Book a table', null),
  el('payments', 1, 'external', 'Payment provider', null),
  el('email', 1, 'external', 'Email service', null),
  // Level 2: what runs inside the system.
  el('web', 2, 'container', 'Web app', 'book', 'React single-page app'),
  el('api', 2, 'container', 'API', 'book', 'Node.js, REST'),
  el('db', 2, 'container', 'Database', 'book', 'PostgreSQL'),
  el('queue', 2, 'container', 'Message queue', 'book', 'RabbitMQ'),
  el('worker', 2, 'container', 'Notification worker', 'book', 'Node.js'),
  // Level 3: what is inside the API.
  el('bookingApi', 3, 'component', 'Booking controller', 'api', 'REST controller'),
  el('availability', 3, 'component', 'Availability service', 'api', 'service'),
  el('reservations', 3, 'component', 'Reservation store', 'api', 'repository'),
  el('paymentClient', 3, 'component', 'Payment client', 'api', 'HTTP client'),
  el('eventPublisher', 3, 'component', 'Event publisher', 'api', 'AMQP client'),
  // Level 4: the code of one component.
  el('availabilityService', 4, 'class', 'AvailabilityService', 'availability', 'slotsFor(date, party)'),
  el('slotPolicy', 4, 'class', 'SlotPolicy', 'availability', 'isBookable(slot)'),
  el('tableCalendar', 4, 'class', 'TableCalendar', 'availability', 'freeTables(slot)'),
  el('openingHours', 4, 'class', 'OpeningHours', 'availability', 'isOpen(time)'),
];

const rel = (from: string, to: string, intent: string, protocol?: string): Relation => ({ from, to, intent, ...(protocol && { protocol }) });

export const RELATIONS: readonly Relation[] = [
  // Context
  rel('diner', 'book', 'Books a table'),
  rel('staff', 'book', 'Manages bookings'),
  rel('book', 'payments', 'Takes deposits'),
  rel('book', 'email', 'Sends confirmations'),
  // Containers
  rel('diner', 'web', 'Books a table', 'HTTPS'),
  rel('staff', 'web', 'Manages bookings', 'HTTPS'),
  rel('web', 'api', 'Makes API calls', 'JSON/HTTPS'),
  rel('api', 'db', 'Reads and writes', 'SQL/TCP'),
  rel('api', 'queue', 'Publishes events', 'AMQP'),
  rel('queue', 'worker', 'Delivers events', 'AMQP'),
  rel('api', 'payments', 'Takes deposits', 'HTTPS'),
  rel('worker', 'email', 'Sends mail', 'SMTP'),
  // Components of the API
  rel('web', 'bookingApi', 'Makes API calls', 'JSON/HTTPS'),
  rel('bookingApi', 'availability', 'Checks slots'),
  rel('bookingApi', 'reservations', 'Saves booking'),
  rel('bookingApi', 'paymentClient', 'Takes deposit'),
  rel('bookingApi', 'eventPublisher', 'Announces booking'),
  rel('availability', 'reservations', 'Reads bookings'),
  rel('reservations', 'db', 'Reads and writes', 'SQL/TCP'),
  rel('paymentClient', 'payments', 'Takes deposits', 'HTTPS'),
  rel('eventPublisher', 'queue', 'Publishes events', 'AMQP'),
  // Classes of the availability component
  rel('bookingApi', 'availabilityService', 'Calls slotsFor()'),
  rel('availabilityService', 'slotPolicy', 'Applies rules'),
  rel('availabilityService', 'tableCalendar', 'Reads free tables'),
  rel('slotPolicy', 'openingHours', 'Checks hours'),
  rel('tableCalendar', 'reservations', 'Loads bookings'),
];

const byId = new Map(ELEMENTS.map((e) => [e.id, e]));
export const elementOf = (id: string): Element => {
  const e = byId.get(id);
  if (!e) throw new Error(`no element ${id}`);
  return e;
};

export const childrenOf = (parent: string | null): Element[] => ELEMENTS.filter((e) => e.parent === parent);
/** True when the element can be zoomed into: it has children in the model. */
export const isZoomable = (id: string) => childrenOf(id).length > 0;

/** The element itself if it sits at or above `level`, else its ancestor at that level. */
export function ancestorAt(id: string, level: Level): string {
  let e = elementOf(id);
  while (e.level > level) e = elementOf(e.parent!);
  return e.id;
}

/** A relationship belongs to the view of the deeper of its two ends. */
export const relationLevel = (r: Relation): Level => Math.max(elementOf(r.from).level, elementOf(r.to).level) as Level;

/** The element zoomed into to reach each level: level 2 opens the system, 3 the API, 4 one component. */
export const FOCUS: Record<Level, string | null> = { 1: null, 2: 'book', 3: 'api', 4: 'availability' };

export interface View {
  level: Level;
  /** The element opened up (null at the top). */
  focus: string | null;
  /** Exactly the focus element's children. */
  children: Element[];
  /** What the children relate to from outside the focus: drawn, but not part of this zoom. */
  surroundings: Element[];
  relations: Relation[];
}

export function viewAt(level: Level): View {
  const focus = FOCUS[level];
  const children = childrenOf(focus);
  const inView = new Set(children.map((c) => c.id));
  const relations = RELATIONS.filter((r) => relationLevel(r) === level);
  const outside = [...new Set(relations.flatMap((r) => [r.from, r.to]))].filter((id) => !inView.has(id));
  return { level, focus, children, surroundings: outside.map(elementOf), relations };
}

/** The relationship label as drawn: intent, then the protocol in brackets when there is one. */
export const labelText = (r: Pick<Relation, 'intent' | 'protocol'>) => (r.protocol ? `${r.intent} [${r.protocol}]` : r.intent);

/** A relationship seen from a coarser level, or null when both ends collapse into the same element. */
export function lift(r: Relation, level: Level): { from: string; to: string } | null {
  const from = ancestorAt(r.from, level);
  const to = ancestorAt(r.to, level);
  return from === to ? null : { from, to };
}

// ---- who needs which level ----

export type AudienceId = 'all' | 'exec' | 'engineer' | 'oncall';
export type Detail = 'tech' | 'protocol';

export interface Audience {
  id: AudienceId;
  label: string;
  question: string;
  /** The level whose diagram answers the question; null for "show everything". */
  level: Level | null;
  /** Detail at that level they do want; the rest is dimmed. */
  wants: readonly Detail[];
}

export const AUDIENCES: Record<AudienceId, Audience> = {
  all: { id: 'all', label: 'Everyone', question: 'No filter: every level and every detail is shown at full strength.', level: null, wants: ['tech', 'protocol'] },
  exec: { id: 'exec', label: 'Executive', question: 'What does it do, who uses it, and what does it depend on?', level: 1, wants: [] },
  engineer: { id: 'engineer', label: 'New engineer', question: 'What are the moving parts and what is each one built with?', level: 2, wants: ['tech'] },
  oncall: { id: 'oncall', label: 'On-call', question: 'When something breaks, which part talks to which, and over what?', level: 2, wants: ['tech', 'protocol'] },
};
export const AUDIENCE_IDS = Object.keys(AUDIENCES) as AudienceId[];

/** How a diagram at `level` reads for an audience: dimmed wholesale, or with its unwanted detail dimmed. */
export function dimming(a: Audience, level: Level): { whole: boolean; tech: boolean; protocol: boolean } {
  if (a.level === null) return { whole: false, tech: false, protocol: false };
  const whole = a.level !== level;
  return { whole, tech: !whole && !a.wants.includes('tech'), protocol: !whole && !a.wants.includes('protocol') };
}

/** The dashed boundary's title: "API [CONTAINER: NODE.JS, REST]". */
export function frameTitle(id: string): string {
  const e = elementOf(id);
  const what = e.kind === 'system' ? 'software system' : e.kind === 'container' ? `container: ${e.tech}` : e.kind;
  return `${e.name} [${what}]`.toUpperCase();
}
