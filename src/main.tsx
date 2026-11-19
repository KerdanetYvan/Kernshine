import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from "react-router-dom";

// Polices de la charte, embarquées (l'app doit marcher sans internet).
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/sora/wght.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
