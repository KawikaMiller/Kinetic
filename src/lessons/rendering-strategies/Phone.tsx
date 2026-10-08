import type { ScreenState } from './model';

const NOTE: Record<ScreenState, string> = {
  blank: 'blank',
  shell: 'shell, no content yet',
  content: 'visible, not interactive',
  interactive: 'interactive',
};

/** A mock phone screen: what the page shows at one moment, and whether it would react to a tap. */
export function Phone({ state, label }: { state: ScreenState; label: string }) {
  const showHeader = state !== 'blank';
  const showContent = state === 'content' || state === 'interactive';
  return (
    <figure className="rs-phone-fig">
      <div className={`rs-phone is-${state}`} role="img" aria-label={`${label}: ${NOTE[state]}`}>
        {showHeader && <div className="rs-phone-head" />}
        {state === 'shell' && (
          <>
            <div className="rs-phone-skel" />
            <div className="rs-phone-skel is-short" />
          </>
        )}
        {showContent && (
          <>
            <div className="rs-phone-line" />
            <div className="rs-phone-line is-short" />
            <div className="rs-phone-btn">Buy</div>
          </>
        )}
      </div>
      <figcaption className={`rs-phone-note is-${state}`}>{NOTE[state]}</figcaption>
    </figure>
  );
}
