import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { pageTitle } from '../core/pageTitle';

/** react-router's key for the location the app was opened at (no navigation yet). */
const INITIAL_LOCATION_KEY = 'default';

/**
 * Gives a page its own document title and, after an in-app navigation, moves focus to
 * its heading so keyboard and screen-reader users arrive in the new page instead of
 * being left on <body>. The page you open the app on doesn't steal focus. Put the
 * returned ref on the page's <h1>:
 *
 *   const heading = usePageHeading(topic.title);
 *   <h1 ref={heading} tabIndex={-1}>…</h1>
 */
export function usePageHeading<T extends HTMLElement = HTMLHeadingElement>(title: string | null) {
  const ref = useRef<T>(null);
  const { key } = useLocation();

  useEffect(() => {
    document.title = pageTitle(title);
  }, [title]);

  useEffect(() => {
    if (key !== INITIAL_LOCATION_KEY) ref.current?.focus({ preventScroll: true });
  }, [key]);

  return ref;
}
