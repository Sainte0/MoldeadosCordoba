import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 4801, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // React y el router cambian casi nunca: en su propio archivo, el navegador los guarda entre deploys.
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] },
      },
    },
  },
});
