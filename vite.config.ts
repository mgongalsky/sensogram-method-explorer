/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static build with relative asset paths, so dist/ can be served from any
// directory or sub-path of a web server without reconfiguration.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts']
  }
});
