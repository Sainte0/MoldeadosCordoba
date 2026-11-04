import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SesionProvider } from './api';
import { App } from './App';
import './styles.css';

// placeholderData: al cambiar un filtro la lista anterior queda en pantalla hasta que llega la nueva (no parpadea
// ni se desmonta todo). staleTime: lo recién pedido no se vuelve a pedir al ir y volver entre pantallas.
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000, placeholderData: (anterior: unknown) => anterior } } });

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
