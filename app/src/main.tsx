import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SesionProvider } from './api';
import { App } from './App';
import './styles.css';
import { persistirConsultas } from './persistencia';

// placeholderData: al cambiar un filtro la lista anterior queda en pantalla hasta que llega la nueva (no parpadea
// ni se desmonta todo). staleTime: lo recién pedido no se vuelve a pedir al ir y volver entre pantallas.
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000, placeholderData: (anterior: unknown) => anterior } } });

persistirConsultas(qc);

// Sin señal: el service worker guarda la app, y se bajan de antemano las pantallas que se usan en el playón para
// que estén aunque nunca se hayan abierto con conexión. Solo en producción (en desarrollo molestaría al editar).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(async () => {
      // Lo que se bajó antes de que el service worker estuviera activo (el código principal, React, los estilos)
      // no pasó por él: se guarda ahora, si no la app no abriría sin señal.
      const yaCargado = performance.getEntriesByType('resource').map((r) => r.name)
        .filter((u) => u.startsWith(location.origin) && /\/assets\//.test(u));
      await caches.open('moldeados-v1').then((c) => c.addAll(['/', '/index.html', ...yaCargado])).catch(() => {});
      setTimeout(() => { void import('./pages/NuevoParte'); void import('./pages/Despacho'); void import('./pages/Pesaje'); void import('./Escaner'); }, 3000);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <SesionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SesionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
