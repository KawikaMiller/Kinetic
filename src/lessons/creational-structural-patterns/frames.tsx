import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  BUILD_RULES, CALL_SITES, FACTORY_FILE, LEGACY_XML, NEW_PROVIDER, TIME, buildFrom, runStack, touchedFiles, xmlWeatherAdapter, legacyWeather,
  type BuilderChoice, type LayerId, type TraceEvent,
} from './model';

// ── Factory ────────────────────────────────────────────────────────

export function factoryCaption(factory: boolean, added: boolean) {
  const n = touchedFiles(factory).length;
  if (!added) {
    return factory ? (
      <>With a factory, the four call sites just ask <code>createPaymentClient(config)</code>; only <code>{FACTORY_FILE}</code> knows which classes exist. Add a provider.</>
    ) : (
      <>Four call sites each decide for themselves which client to <code>new</code>. Add a provider and watch what has to change.</>
    );
  }
  return factory ? (
    <>Adding {NEW_PROVIDER} touches <span className="hl ok">{n} file</span>: the factory. The call sites never named a concrete class, so they don&apos;t change.</>
  ) : (
    <>
      Adding {NEW_PROVIDER} touches <span className="hl orange">{n} files</span>: every call site ({CALL_SITES.join(', ')}) repeats the choice, and missing one is a production bug.
    </>
  );
}

// ── Builder ────────────────────────────────────────────────────────

export function builderCaption(c: BuilderChoice) {
  const r = buildFrom(c);
  if (r.ok) return <><code>build()</code> checks the whole request at once and <span className="hl ok">accepts it</span>: every step was named, so nobody has to count arguments.</>;
  return (
    <>
      <code>build()</code> <span className="hl bad">refuses</span>: {r.errors.join('; ')}. It checks all {BUILD_RULES.length} rules in one place, before any request is sent.
    </>
  );
}

// ── Adapter ────────────────────────────────────────────────────────

export type AdapterHop = 'appToAdapter' | 'adapterToLegacy' | 'legacyToAdapter' | 'adapterToApp' | 'appToLegacy';

export interface AdapterFrame extends Frame {
  hop: AdapterHop | null;
  converted: boolean;
  failed: boolean;
  result: string | null;
}

/** What real JavaScript throws when the app calls current() on the legacy object (asserted in the tests). */
export const NO_ADAPTER_ERROR = 'TypeError: legacy.current is not a function';

export function adapterFrames(withAdapter: boolean): AdapterFrame[] {
  const rec = createRecorder<AdapterFrame>({ hop: null, converted: false, failed: false, result: null });
  rec.snap(<>The app is written against <code>WeatherSource.current()</code>, which returns <code>{'{ tempC, sky }'}</code>. The only weather client you have is a legacy one with a different shape.</>);
  if (!withAdapter) {
    rec.set({ hop: 'appToLegacy', failed: true });
    rec.close(
      <>
        Plugged in directly, the shapes don&apos;t fit: the app calls <code>current()</code> and gets <span className="hl bad">{NO_ADAPTER_ERROR}</span>. The legacy client only has{' '}
        <code>fetchReport()</code>, returning XML in Fahrenheit.
      </>,
      2,
    );
    return rec.frames;
  }
  const w = xmlWeatherAdapter(legacyWeather).current();
  rec.snap(<>The app calls <code>weather.current()</code> on the adapter, which looks exactly like any other WeatherSource.</>, undefined, { hop: 'appToAdapter' });
  rec.snap(<>The adapter calls the legacy <code>fetchReport()</code>.</>, undefined, { hop: 'adapterToLegacy' });
  rec.snap(<>Back comes XML: <code>{LEGACY_XML}</code>.</>, undefined, { hop: 'legacyToAdapter' });
  rec.snap(<>The adapter converts the shape: reads the two fields and turns 68 °F into {w.tempC} °C.</>, undefined, { converted: true });
  rec.set({ hop: 'adapterToApp', result: JSON.stringify(w) });
  rec.close(
    <>
      The app gets <span className="hl violet">{`{ tempC: ${w.tempC}, sky: '${w.sky}' }`}</span> and never knew. Neither side changed; the adapter is the only code that knows both shapes.
    </>,
  );
  return rec.frames;
}

// ── Decorator ──────────────────────────────────────────────────────

export interface StackFrame extends Frame {
  /** The layer handling the call now, or the core. */
  active: LayerId | 'core' | null;
  /** The call travelling in, or the response travelling back out. */
  direction: 'in' | 'out' | null;
  ok: boolean;
  /** Which call of the scenario (1 or 2). */
  call: number;
  hit: boolean;
  /** Layers this call has reached so far. */
  reached: (LayerId | 'core')[];
  /** Every log line printed so far. */
  printed: string[];
}

const NAME: Record<LayerId | 'core', string> = { logging: 'logging', caching: 'caching', retry: 'retry', timing: 'timing', core: 'fetchUser' };

function sayEvent(e: TraceEvent, logLine: string | null) {
  const l = <b>{NAME[e.layer]}</b>;
  switch (e.kind) {
    case 'enter':
      return e.layer === 'core' ? <>The call reaches the real {l}.</> : <>Call {e.call} enters {l}.{logLine ? <> It reports <code>{logLine}</code>.</> : null}</>;
    case 'hit':
      return <><span className="hl ok">Cache hit</span>: caching answers itself and the call goes no deeper. Nothing inside it runs.</>;
    case 'retry':
      return <>{l} catches the failure, waits {TIME.backoff} ms and sends attempt {e.attempt} back in.</>;
    case 'store':
      return <>caching stores the answer on its way out.</>;
    case 'exit':
      if (e.layer === 'core') return e.ok ? <>{l} answers Ada; the response travels back out.</> : <><span className="hl bad">{l} times out</span>: the error travels back out.</>;
      return e.ok ? <>The response passes back out through {l}.{logLine ? <> It reports <code>{logLine}</code>.</> : null}</> : <>The error passes back out through {l}.{logLine ? <> It reports <code>{logLine}</code>.</> : null}</>;
    default:
      return null;
  }
}

export function stackFrames(order: readonly LayerId[]) {
  const run = runStack(order);
  const rec = createRecorder<StackFrame>({ active: null, direction: null, ok: true, call: 0, hit: false, reached: [], printed: [] });
  rec.snap(
    <>
      <code>fetchUser(42)</code> wrapped in {order.length ? order.join(' → ') : 'nothing'} (outermost first), called twice. Scripted: the core&apos;s first call times out.
    </>,
  );
  const printed: string[] = [];
  let reached: (LayerId | 'core')[] = [];
  let call = 0;
  const events = run.trace;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind === 'log') {
      printed.push(`${e.layer}: ${e.text}`);
      continue;
    }
    if (e.call !== call) {
      call = e.call;
      reached = [];
    }
    // A log line written by the same layer right after this event belongs to this frame.
    const next = events[i + 1];
    let logLine: string | null = null;
    if (next?.kind === 'log' && next.layer === e.layer && e.kind !== 'store') {
      logLine = next.text;
      printed.push(`${next.layer}: ${next.text}`);
      i++;
    }
    if (e.kind === 'enter' && !reached.includes(e.layer)) reached = [...reached, e.layer];
    const direction = e.kind === 'enter' || e.kind === 'retry' ? 'in' : 'out';
    rec.snap(sayEvent(e, logLine), undefined, {
      active: e.layer, direction, ok: e.kind !== 'exit' || e.ok, call, hit: e.kind === 'hit', reached: [...reached], printed: [...printed],
    });
  }
  rec.set({ active: null, direction: null, printed: [...run.logs] });
  rec.close(
    <>
      Results: <b>{run.results.join(', ')}</b>, with the real <code>fetchUser</code> called <b>{run.coreCalls}</b> time{run.coreCalls === 1 ? '' : 's'}. The same layers in a different order give
      different behaviour: try the presets.
    </>,
    2,
  );
  return rec.frames;
}
