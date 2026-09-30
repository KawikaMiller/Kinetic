import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BUILT_TOPICS } from './core/lessons';
import { useProgress } from './core/progress';
import { Home } from './pages/Home';
import { LessonPage } from './pages/LessonPage';

// Dev-only component showcase (#/dev/kit). The constant condition drops it from production builds.
const DevKit = import.meta.env.DEV ? lazy(() => import('./pages/DevKit').then((m) => ({ default: m.DevKit }))) : null;

export default function App() {
  const { pathname } = useLocation();
  const { done } = useProgress();
  const learned = BUILT_TOPICS.filter((t) => done.includes(t.id)).length;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Kinetic
        </Link>
        <span className="progress-pill" title="Lessons learned">
          <span className="progress-ring" style={{ ['--p' as string]: BUILT_TOPICS.length ? learned / BUILT_TOPICS.length : 0 }} />
          {learned}/{BUILT_TOPICS.length} learned
        </span>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lesson/:id" element={<LessonPage />} />
        {DevKit && (
          <Route
            path="/dev/kit"
            element={
              <Suspense fallback={null}>
                <DevKit />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
