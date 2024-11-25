import { defineConfig } from 'vite';
import path from 'path';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: {}, // For HTTPS
    proxy: {
      // Proxy any requests to your FastAPI server
      '/api': {
        target: 'https://141.64.207.151:8000',
        changeOrigin: true,
        secure: false, // Required since we're using a self-signed certificate
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  plugins: [basicSsl()],
  root: './project',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
});