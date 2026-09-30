import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { assertTokensInSync } from './core/palette';
import './styles/global.css';
import './styles/kit.css';
import './components/scene/scene.css';

if (import.meta.env.DEV) assertTokensInSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
