import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  server: { port: 3001, open: true },
  preview: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
    host: true,
    allowedHosts: 'all',
  }
});
