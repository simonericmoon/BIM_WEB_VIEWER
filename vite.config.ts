import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
  },

  root: './project', // This tells Vite to use the project directory as root
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});