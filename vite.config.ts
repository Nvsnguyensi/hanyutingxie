import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all envs regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL || env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const supabaseDatabaseUrl = env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DATABASE_URL || env.VITE_SUPABASE_DATABASE_URL || process.env.VITE_SUPABASE_DATABASE_URL || "";

  // Dynamically write .env file for the frontend to pick up VITE_ variables
  if (supabaseUrl && supabaseAnonKey) {
    let envContent = `VITE_SUPABASE_URL=${supabaseUrl}\nVITE_SUPABASE_ANON_KEY=${supabaseAnonKey}\n`;
    if (supabaseDatabaseUrl) {
      envContent += `VITE_SUPABASE_DATABASE_URL=${supabaseDatabaseUrl}\n`;
    }
    fs.writeFileSync('.env', envContent);
    console.log("Dynamically generated .env file from environment variables.");
  }

  // Only force clientPort 443 if running on a remote/cloud dev URL (e.g., inside AI Studio)
  const isCloudEnv = env.APP_URL || process.env.APP_URL || process.env.VERCEL || process.env.CODESANDBOX_SSE;

  return {
    base: '/',
    plugins: [react(), tailwindcss(), cloudflare()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_SUPABASE_DATABASE_URL': JSON.stringify(supabaseDatabaseUrl),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: isCloudEnv ? {
        clientPort: 443,
      } : true,
    }
  };
});