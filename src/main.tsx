import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Suppress the webview's native right-click menu (Reload / Inspect / Save as…)
// everywhere. Our own context menus open via their React onContextMenu handlers,
// which set component state independently — preventing the default native menu
// does not stop them from showing.
window.addEventListener('contextmenu', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
