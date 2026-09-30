import type { MouseEvent } from 'react';
import { UNIT_SAMPLES } from './model';

/** Links on the fake site go nowhere. */
const stay = (e: MouseEvent) => e.preventDefault();

/**
 * A small café site that reflows at the breakpoints in PAGE_CSS. Every interactive
 * element carries `data-tap` so the tap-target check can measure it.
 */
export function SamplePage({ smallTaps }: { smallTaps: Set<string> }) {
  const tap = (id: string, base = '') => ({
    'data-tap': id,
    className: [base, smallTaps.has(id) && 'rd-too-small'].filter(Boolean).join(' ') || undefined,
  });
  return (
    <>
      <span className="rd-probe" aria-hidden="true" />
      <header className="rd-header">
        <b className="rd-logo">Brew &amp; Co</b>
        <nav className="rd-links" aria-label="Sample site">
          {['Menu', 'Locations', 'Order'].map((l) => (
            <a key={l} href="#" onClick={stay} {...tap(`nav-${l}`)}>
              {l}
            </a>
          ))}
        </nav>
        <button type="button" aria-label="Open menu" {...tap('menu', 'rd-menu')}>
          ☰
        </button>
      </header>
      <div className="rd-layout">
        <main className="rd-main">
          <section className="rd-hero">
            <h2>Coffee, delivered</h2>
            <p>Fresh beans to your door every week.</p>
            <button type="button" {...tap('cta', 'rd-cta')}>
              Start a subscription
            </button>
          </section>
          <div className="rd-cards">
            {['Espresso', 'Filter', 'Cold brew'].map((c) => (
              <article key={c} className="rd-card">
                <b>{c}</b>
                <span>from £9 a bag</span>
              </article>
            ))}
          </div>
        </main>
        <aside className="rd-side">
          <b>Opening hours</b>
          <span>Mon–Fri 7–18</span>
          <span>Sat–Sun 8–16</span>
        </aside>
      </div>
      <footer className="rd-footer">
        <span>© Brew &amp; Co</span>
        <span className="rd-icons">
          {['in', 'ig', 'x'].map((s) => (
            <a key={s} href="#" onClick={stay} aria-label={`Social link ${s}`} {...tap(`social-${s}`)}>
              {s}
            </a>
          ))}
        </span>
      </footer>
      <div className="rd-unit-probes" aria-hidden="true">
        {UNIT_SAMPLES.map((u) => (
          <span key={u.id} data-unit={u.id} style={u.style}>
            Aa
          </span>
        ))}
      </div>
    </>
  );
}
