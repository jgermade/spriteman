import { defineConfig } from 'vite';
import { jq79 } from 'jq79/vite';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  plugins: [jq79()],
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
