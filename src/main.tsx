import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AppCrashed, ErrorBoundary } from './components/ErrorBoundary';
import { assertTokensInSync } from './core/palette';
import './styles/global.css';
import './styles/kit.css';
import './components/scene/scene.css';
import './components/colorField.css';

if (import.meta.env.DEV) assertTokensInSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={(error) => <AppCrashed error={error} />}>
      {/* The app's chrome (page entrances, quiz shakes, card reveals) honours prefers-reduced-motion.
          Lesson stages opt back out in LessonPage: their motion is the teaching, and stage
          components that loop for decoration (Pulse) already go still on their own. */}
      <MotionConfig reducedMotion="user">
        <HashRouter>
          <App />
        </HashRouter>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
);
