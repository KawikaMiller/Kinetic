import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CODE, CLASS_CODE, CLASSES, INSTANCES, PRIVATE_ACCESS_ERROR, affectedByBaseChange, applyAccount, areaOf, describeOf,
  lineOf, resolve, squareAfterSetWidth, type AccountAction, type ClassName, type Method,
} from './model';

type Ctor = new (...args: number[]) => Record<string, unknown>;

/** The on-screen class code, evaluated for real. */
function realClasses(): Record<ClassName, Ctor> {
  return new Function(`${CLASS_CODE.join('\n')}\nreturn { Shape, Circle, Rect, Square };`)();
}

const METHODS: Method[] = ['area', 'describe', 'setWidth'];

/** Which class's prototype actually defines `method` for `obj`, walking the real prototype chain. */
function realOwner(obj: object, classes: Record<ClassName, Ctor>, method: Method): ClassName | null {
  for (let p = Object.getPrototypeOf(obj); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    if (Object.prototype.hasOwnProperty.call(p, method)) {
      return (Object.keys(classes) as ClassName[]).find((name) => classes[name].prototype === p) ?? null;
    }
  }
  return null;
}

describe('method dispatch matches the real prototype chain', () => {
  const classes = realClasses();
  for (const inst of INSTANCES) {
    const obj = new Function('C', `const { Shape, Circle, Rect, Square } = C; return ${inst.create};`)(classes);
    for (const method of METHODS) {
      it(`${inst.create}.${method}()`, () => {
        expect(resolve(inst.cls, method).found).toBe(realOwner(obj, classes, method));
      });
    }
    it(`${inst.create}.area() and describe() give the real results`, () => {
      expect(areaOf(inst.id)).toBeCloseTo(obj.area() as number, 12);
      expect(describeOf(inst.id)).toBe(obj.describe());
    });
  }

  it('every class in the model exists in the real code with the same parent', () => {
    for (const c of CLASSES) {
      const parent = Object.getPrototypeOf(classes[c.name].prototype);
      expect(parent === Object.prototype ? null : (Object.keys(classes) as ClassName[]).find((n) => classes[n].prototype === parent)).toBe(c.parent);
    }
  });

  it('a method nobody defines is not found, and calling it throws', () => {
    expect(resolve('Circle', 'setWidth').found).toBeNull();
    const circle = new classes.Circle(1);
    expect(() => (circle.setWidth as () => void)()).toThrow(TypeError);
  });

  it('points each resolution at the line that defines it', () => {
    expect(CLASS_CODE[lineOf('Rect', 'area')]).toContain('this.w * this.h');
    expect(CLASS_CODE[lineOf('Shape', 'describe')]).toContain('describe()');
  });
});

describe('Square is-a Rect: the invariant', () => {
  it('Rect.setWidth leaves a "square" with unequal sides', () => {
    const { Square } = realClasses();
    const sq = new Square(2) as unknown as { setWidth(w: number): void; area(): number; w: number; h: number };
    sq.setWidth(5);
    const model = squareAfterSetWidth(2, 5);
    expect(model).toEqual({ w: sq.w, h: sq.h, area: sq.area(), isSquare: false });
  });
});

describe('encapsulation', () => {
  const realAccount = () => new Function(`${ACCOUNT_CODE.join('\n')}\nreturn new Account();`)() as {
    deposit(n: number): void;
    withdraw(n: number): void;
    balance: number;
  };

  it('the model enforces the same invariant as the real class', () => {
    const actions: AccountAction[] = [
      { kind: 'deposit', amount: 50 },
      { kind: 'withdraw', amount: 30 },
      { kind: 'withdraw', amount: 500 },
      { kind: 'deposit', amount: -5 },
      { kind: 'deposit', amount: 10 },
    ];
    const acct = realAccount();
    let state = { balance: 0, error: null as string | null };
    for (const a of actions) {
      state = applyAccount(state, a);
      let realError: string | null = null;
      try {
        if (a.kind === 'deposit') acct.deposit(a.amount);
        else if (a.kind === 'withdraw') acct.withdraw(a.amount);
      } catch (e) {
        realError = `${(e as Error).name}: ${(e as Error).message}`;
      }
      expect(state).toEqual({ balance: acct.balance, error: realError });
    }
  });

  it('outside code cannot even mention the private field', () => {
    let error: unknown;
    try {
      new Function(`${ACCOUNT_CODE.join('\n')}\nconst acct = new Account();\nacct.#balance = 1e6;`);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SyntaxError);
    expect(`SyntaxError: ${(error as Error).message}`).toBe(PRIVATE_ACCESS_ERROR);
  });
});

describe('inheritance vs composition', () => {
  it('a method added to the base class reaches every subclass', () => {
    const classes = realClasses();
    (classes.Shape.prototype as Record<string, unknown>).render = () => 'drawn';
    for (const name of affectedByBaseChange('inherit', [])) {
      expect(typeof (classes[name].prototype as Record<string, unknown>).render).toBe('function');
    }
    expect(affectedByBaseChange('inherit', []).sort()).toEqual(['Circle', 'Rect', 'Square']);
  });

  it('with composition only the shapes that opt in are affected', () => {
    expect(affectedByBaseChange('compose', ['Circle'])).toEqual(['Circle']);
  });
});
