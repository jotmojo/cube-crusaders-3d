import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  server: { port: 3001, open: false },
  preview: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 4173,
    host: '0.0.0.0',
    allowedHosts: 'all',
    open: false,
  }
});