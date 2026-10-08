import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  CITY, assertCrashes, FALLBACK, GUARDS, LINKS, checkLength, checkMatch, evaluate, firstNull, members, missingVariants, narrowed, printedFor,
  type Arms, type FixMode, type Guard, type Link, type MatchLang, type Nulls, type ParamType, type Preset,
} from './model';

// ── Scene 1 · the null chain ───────────────────────────────────────

export type ChainStep = Link | 'call' | 'result';

export interface ChainFrame extends Frame {
  /** The link being looked at now. */
  current: ChainStep | null;
  /** Links read so far. */
  seen: ChainStep[];
  crashed: boolean;
  printed: string | null;
  /** The printed line is a silent bug ("undefined"), not a handled value. */
  silentBug: boolean;
  /** Steps never evaluated (after a null stopped the chain). */
  skipped: ChainStep[];
}

const PATH: Record<Link, string> = { user: 'user', address: 'user.address', city: 'user.address.city' };
const NEXT: Record<Link, string> = { user: '.address', address: '.city', city: '.toUpperCase()' };

export function chainFrames(mode: FixMode, n: Nulls): ChainFrame[] {
  const out = evaluate(mode, n);
  const at = firstNull(n);
  const rec = createRecorder<ChainFrame>({ current: null, seen: [], crashed: false, printed: null, silentBug: false, skipped: [] });
  rec.snap(<>Ship an order: read <code>user.address.city</code> and upper-case it. Any link in the chain can be <code>null</code>; toggle them above.</>);
  const seen: ChainStep[] = [];
  for (const l of LINKS) {
    const isNull = n[l];
    seen.push(l);
    if (!isNull) {
      const say =
        mode === 'ladder' ? <><code>{PATH[l]} !== null</code> is true, so go one level in.</>
          : mode === 'option' ? <>{l === 'user' ? <><code>Option.of(user)</code> is Some</> : <>Still Some</>}: <code>map</code> runs and reads <code>{NEXT[l]}</code>.</>
            : <><code>{PATH[l]}</code> is {l === 'city' ? <>&quot;{CITY}&quot;</> : 'an object'}, so <code>{NEXT[l]}</code> can be read.</>;
      rec.snap(say, undefined, { current: l, seen: [...seen] });
      continue;
    }
    const rest: ChainStep[] = [...LINKS.slice(LINKS.indexOf(l) + 1), 'call'];
    if (mode === 'plain') {
      rec.snap(
        <>
          <code>{PATH[l]}</code> is null, and the next dot reads <code>{NEXT[l]}</code> of null: <span className="hl bad">{out.error}</span>. Nothing after it runs.
        </>,
        2,
        { current: l, seen: [...seen], crashed: true, skipped: rest },
      );
      return rec.frames;
    }
    const say = {
      ladder: <><code>{PATH[l]} !== null</code> is false: the inner blocks are skipped and <code>city</code> keeps &quot;{FALLBACK}&quot;.</>,
      optional: <><code>?.</code> sees that <code>{PATH[l]}</code> is null and stops the whole chain: the rest is never evaluated, and <code>city</code> is <code>undefined</code>.</>,
      optionalDefault: <><code>?.</code> stops the chain at the null <code>{PATH[l]}</code>, giving <code>undefined</code>, and <code>??</code> swaps in &quot;{FALLBACK}&quot;.</>,
      option: l === 'user'
        ? <><code>Option.of(user)</code> sees null and gives None. Every <code>map</code> after it sees None and skips its function.</>
        : <><code>{PATH[l]}</code> is null, so this <code>map</code> returns None. Every later <code>map</code> sees None and skips its function.</>,
    }[mode];
    rec.snap(say, undefined, { current: l, seen: [...seen], skipped: rest });
    break;
  }
  if (at === null) {
    rec.snap(<><code>&quot;{CITY}&quot;.toUpperCase()</code> runs: &quot;{CITY.toUpperCase()}&quot;.</>, undefined, { current: 'call', seen: [...seen, 'call'] });
  }
  const silentBug = out.city === undefined;
  rec.set({ current: 'result', printed: out.printed, silentBug });
  if (silentBug) {
    rec.close(
      <>
        It prints <span className="hl bad">{out.printed}</span>. No crash, but the missing city wasn&apos;t handled: <code>?.</code> only turned the crash into an{' '}
        <code>undefined</code> that leaks onto the shipping label. Add <code>??</code> or a check.
      </>,
      2,
    );
  } else if (at === null) {
    rec.close(<>Every link was present: it prints <span className="hl ok">{out.printed}</span>.</>);
  } else {
    rec.close(<>Handled: it prints <span className="hl ok">{out.printed}</span> instead of crashing, and the code says what a missing city means.</>, 2);
  }
  return rec.frames;
}

// ── Scene 2 · narrowing ────────────────────────────────────────────

/** The caption for one parameter type and guard, built from the checker's verdict. */
export function narrowCaption(param: ParamType, guard: Guard) {
  const v = checkLength(param, guard);
  const all = members(param);
  const kept = narrowed(param, guard);
  const guardLabel = GUARDS.find((g) => g.value === guard)!.label;
  if (v.unchecked) {
    return (
      <>
        <code>x!</code> tells the checker &quot;trust me, not null or undefined&quot;, so it compiles, but nothing was ruled out.{' '}
        {assertCrashes(param).map((c, i) => (
          <span key={c.arg}>
            {i > 0 ? ' ' : ''}
            <span className="hl bad">len({c.arg})</span> still throws <code>{c.message}</code>.
          </span>
        ))}
      </>
    );
  }
  if (v.ok) {
    return (
      <>
        <span className="hl ok">tsc accepts it</span>: where <code>x.length</code> is read, x can only be <code>{kept.join(' | ')}</code>
        {all.length > kept.length ? <>, because the guard <code>{guardLabel}</code> ruled the rest out</> : all.length === 1 ? ': the type never allowed null' : ''}.
      </>
    );
  }
  return (
    <>
      <span className="hl orange">tsc rejects it</span>: <code>{v.message}</code> At <code>x.length</code>, x could still be <code>{kept.join(' | ')}</code>
      {guard === 'none' ? '. Add a guard.' : <>: <code>{guardLabel}</code> doesn&apos;t rule out {kept.filter((m) => m !== 'string').join(' or ')}.</>}
    </>
  );
}

// ── Scene 3 · exhaustive matching ──────────────────────────────────

export interface MatchFrame extends Frame {
  /** The compiler has checked the match. */
  checked: boolean;
  /** The sample value being dropped into the sorter now, by variant index. */
  current: number | null;
  /** Samples rendered so far, by variant index, with what they printed. */
  done: { index: number; printed: string; byDefault: boolean }[];
}

export function matchFrames(lang: MatchLang, p: Preset, arms: Arms, catchAll: boolean): MatchFrame[] {
  const v = checkMatch(lang, p, arms, catchAll);
  const missing = missingVariants(p, arms);
  const rec = createRecorder<MatchFrame>({ checked: false, current: null, done: [] });
  rec.snap(
    <>
      A <code>{p.type}</code> is exactly one of {p.variants.map((x) => x.name).join(', ').replace(/, ([^,]*)$/, ' or $1')}, never two at once. <code>render</code> needs an arm for each
      shape.
    </>,
  );
  if (!v.ok) {
    rec.set({ checked: true });
    rec.close(
      <>
        <span className="hl orange">{lang === 'rust' ? 'Rust refuses to compile' : 'tsc reports an error'}</span>: <code>{v.message}</code>{v.message!.endsWith('.') ? ' ' : '. '}The missing arm{missing.length === 1 ? '' : 's'} ({missing.map((x) => x.name).join(', ')}) {missing.length === 1 ? 'is' : 'are'}{' '}
        caught at build time, not by a user.
        {lang === 'ts' ? <> (tsc still emits JavaScript unless <code>noEmitOnError</code> is set, so the build has to fail on type errors for that to hold.)</> : null}
      </>,
      2,
    );
    return rec.frames;
  }
  rec.snap(
    v.warning ? <>It compiles, with <span className="hl">{v.message}</span>: every variant already has its own arm, so the catch-all can never run.</>
      : missing.length ? <>It compiles: the catch-all arm covers {missing.map((x) => x.name).join(' and ')}.</>
        : <>It compiles: every variant has an arm{lang === 'ts' ? ', so in the default branch s has type never' : ''}.</>,
    undefined,
    { checked: true },
  );
  const done: MatchFrame['done'] = [];
  p.variants.forEach((x, i) => {
    const byDefault = !arms[i];
    done.push({ index: i, printed: printedFor(x, !byDefault), byDefault });
    rec.snap(
      byDefault ? (
        <>
          <code>{x.sample.label}</code> has no arm of its own and lands in the catch-all: <span className="hl info">&quot;fallback&quot;</span>. The compiler can&apos;t tell you it was
          forgotten.
        </>
      ) : (
        <><code>{x.sample.label}</code> drops into its own arm and prints <span className="hl ok">&quot;{x.sample.prints}&quot;</span>.</>
      ),
      undefined,
      { current: i, done: [...done] },
    );
  });
  rec.set({ current: null });
  rec.close(
    missing.length ? (
      <>
        {missing.length} variant{missing.length === 1 ? '' : 's'} went to the catch-all. It compiled, but if someone later adds a fourth variant it will land there too, silently. Without
        the catch-all, the compiler would list what is missing.
      </>
    ) : catchAll ? (
      <>Every variant has an arm, so the catch-all is unreachable (dim). Leave it out and the compiler will flag the next variant someone adds.</>
    ) : (
      <>Every value found its arm. Add a variant to the type and this match stops compiling until it is handled: that is what exhaustiveness buys.</>
    ),
    2,
  );
  return rec.frames;
}
