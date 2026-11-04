import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SesionProvider } from './api';
import { App } from './App';
import './styles.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

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
