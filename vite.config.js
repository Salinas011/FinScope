import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
  ],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 1. Chunks modulares para Firebase
            if (id.includes('firebase') || id.includes('@firebase')) {
              if (id.includes('firestore')) {
                return 'firebase-firestore';
              }
              if (id.includes('auth')) {
                return 'firebase-auth';
              }
              if (id.includes('app')) {
                return 'firebase-app';
              }
              return 'firebase-core';
            }

            // 2. Librerías de iconos o componentes UI (lucide-react, heroicons, etc.)
            if (
              id.includes('lucide') ||
              id.includes('@heroicons') ||
              id.includes('font-awesome') ||
              id.includes('@tabler')
            ) {
              return 'ui-icons';
            }

            // 3. Librerías de gráficos o fechas (chart.js, echarts, date-fns, dayjs, etc.)
            if (
              id.includes('chart') ||
              id.includes('echarts') ||
              id.includes('apexcharts') ||
              id.includes('date-fns') ||
              id.includes('dayjs') ||
              id.includes('moment')
            ) {
              return 'charts-dates';
            }

            // 4. Chunk genérico vendor para el resto de dependencias externas
            return 'vendor';
          }
        },
      },
    },
  },
});

