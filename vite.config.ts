import { defineConfig } from 'vite';
import path from 'path';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: {} // Changed from true to empty object to satisfy TypeScript
  },
  plugins: [basicSsl()],
  root: './project',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
});