import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('Root element #root not found');
}

const root = createRoot(rootEl);

function renderFatalError(error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  root.render(
    <div style={{ padding: '16px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#7f1d1d' }}>
      {'应用启动失败，请把以下错误发给开发者：\n\n' + message}
    </div>,
  );
}

window.addEventListener('error', (event) => {
  renderFatalError(event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  renderFatalError(event.reason);
});

import('./App.tsx')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error) => {
    renderFatalError(error);
  });
