// The class hierarchy the lesson draws, and how a method call is resolved on it.
// CLASS_CODE is the JavaScript shown on screen; the tests evaluate it for real and
// check that every resolution and result below matches what the engine does.

export type ClassName = 'Shape' | 'Circle' | 'Rect' | 'Square';
export type Method = 'area' | 'describe' | 'setWidth';
export type InstanceId = 'circle' | 'rect' | 'square';

export interface ClassDef {
  name: ClassName;
  parent: ClassName | null;
  /** Methods defined on this class itself (its own prototype). */
  own: Method[];
}

export const CLASSES: ClassDef[] = [
  { name: 'Shape', parent: null, own: ['describe', 'area'] },
  { name: 'Circle', parent: 'Shape', own: ['area'] },
  { name: 'Rect', parent: 'Shape', own: ['area', 'setWidth'] },
  { name: 'Square', parent: 'Rect', own: [] },
];

export const CLASS_CODE = [
  'class Shape {',
  '  describe() {',
  '    const a = this.area().toFixed(1);',
  '    return `${this.name}: area ${a}`;',
  '  }',
  "  area() { throw new Error('abstract'); }",
  '}',
  'class Circle extends Shape {',
  '  constructor(r) {',
  "    super(); this.name = 'circle';",
  '    this.r = r;',
  '  }',
  '  area() { return Math.PI * this.r ** 2; }',
  '}',
  'class Rect extends Shape {',
  '  constructor(w, h) {',
  "    super(); this.name = 'rect';",
  '    this.w = w; this.h = h;',
  '  }',
  '  area() { return this.w * this.h; }',
  '  setWidth(w) { this.w = w; }',
  '}',
  'class Square extends Rect {',
  '  constructor(s) {',
  "    super(s, s); this.name = 'square';",
  '  }',
  '}',
];

/** The instances the learner can call methods on, and the expressions that create them. */
export const INSTANCES: { id: InstanceId; cls: ClassName; create: string; name: string; fields: [string, number][] }[] = [
  { id: 'circle', cls: 'Circle', create: 'new Circle(1)', name: 'circle', fields: [['r', 1]] },
  { id: 'rect', cls: 'Rect', create: 'new Rect(2, 3)', name: 'rect', fields: [['w', 2], ['h', 3]] },
  { id: 'square', cls: 'Square', create: 'new Square(2)', name: 'square', fields: [['w', 2], ['h', 2]] },
];

/** Every own property the constructor sets, as shown on screen: this.name first, then the numbers. */
export function ownProperties(id: InstanceId): [string, string][] {
  const inst = instance(id);
  return [['name', `'${inst.name}'`], ...inst.fields.map(([n, v]): [string, string] => [n, String(v)])];
}

export const classDef = (name: ClassName) => CLASSES.find((c) => c.name === name)!;
export const instance = (id: InstanceId) => INSTANCES.find((i) => i.id === id)!;

export interface Resolution {
  /** Classes checked, starting at the instance's own class, walking up the prototype chain. */
  path: ClassName[];
  found: ClassName | null;
}

/** Where `method` is found for an object of class `cls`: its class first, then each parent. */
export function resolve(cls: ClassName, method: Method): Resolution {
  const path: ClassName[] = [];
  for (let c: ClassName | null = cls; c; c = classDef(c).parent) {
    path.push(c);
    if (classDef(c).own.includes(method)) return { path, found: c };
  }
  return { path, found: null };
}

/** Every class that inherits from `cls` (directly or not). */
export function descendants(cls: ClassName): ClassName[] {
  const kids = CLASSES.filter((c) => c.parent === cls).map((c) => c.name);
  return kids.flatMap((k) => [k, ...descendants(k)]);
}

// ── What each call evaluates to, per the implementation it resolves to ──

const fieldOf = (id: InstanceId, name: string) => instance(id).fields.find(([n]) => n === name)![1];

/** area() on an instance, using whichever implementation `resolve` picks. */
export function areaOf(id: InstanceId): number {
  const found = resolve(instance(id).cls, 'area').found;
  if (found === 'Circle') return Math.PI * fieldOf(id, 'r') ** 2;
  if (found === 'Rect') return fieldOf(id, 'w') * fieldOf(id, 'h');
  throw new Error('abstract');
}

/** describe() on an instance: Shape's method, which calls this.area(), dispatched on the real object. */
export const describeOf = (id: InstanceId) => `${id}: area ${areaOf(id).toFixed(1)}`;

// ── Square is-a Rect ─────────────────────────────────────────────────

/** A square of side `side` after Rect's setWidth(`width`): Rect only changes w, so the square breaks. */
export function squareAfterSetWidth(side: number, width: number) {
  const w = width;
  const h = side;
  return { w, h, area: w * h, isSquare: w === h };
}

/** Index into CLASS_CODE of `cls`'s own definition of `method`, for highlighting. */
export function lineOf(cls: ClassName, method: Method): number {
  const start = CLASS_CODE.findIndex((l) => l.startsWith(`class ${cls} `));
  const offset = CLASS_CODE.slice(start).findIndex((l) => l.trimStart().startsWith(`${method}(`));
  if (start < 0 || offset < 0) throw new Error(`model: ${cls}.${method} is not in the code`);
  return start + offset;
}

// ── Encapsulation ────────────────────────────────────────────────────

export const ACCOUNT_CODE = [
  'class Account {',
  '  #balance = 0;',
  '  deposit(amount) {',
  "    if (amount <= 0) throw new RangeError('deposit must be positive');",
  '    this.#balance += amount;',
  '  }',
  '  withdraw(amount) {',
  "    if (amount > this.#balance) throw new RangeError('insufficient funds');",
  '    this.#balance -= amount;',
  '  }',
  '  get balance() { return this.#balance; }',
  '}',
];

export type AccountAction = { kind: 'deposit' | 'withdraw'; amount: number } | { kind: 'poke' };

/** What JavaScript says when outside code touches the private field. */
export const PRIVATE_ACCESS_ERROR = "SyntaxError: Private field '#balance' must be declared in an enclosing class";

export interface AccountState {
  balance: number;
  error: string | null;
}

/** Apply one action the way the Account class does. The invariant: balance never goes below 0. */
export function applyAccount(s: AccountState, a: AccountAction): AccountState {
  if (a.kind === 'poke') return { ...s, error: PRIVATE_ACCESS_ERROR };
  if (a.kind === 'deposit') {
    return a.amount <= 0 ? { ...s, error: 'RangeError: deposit must be positive' } : { balance: s.balance + a.amount, error: null };
  }
  return a.amount > s.balance ? { ...s, error: 'RangeError: insufficient funds' } : { balance: s.balance - a.amount, error: null };
}

// ── Inheritance vs composition ───────────────────────────────────────

/** Who picks up a new render() added to Shape, under each design. */
export function affectedByBaseChange(design: 'inherit' | 'compose', optedIn: readonly ClassName[]): ClassName[] {
  return design === 'inherit' ? descendants('Shape') : descendants('Shape').filter((c) => optedIn.includes(c));
}
