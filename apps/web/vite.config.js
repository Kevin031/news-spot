import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const devApiPort = process.env.DEV_API_PORT || "3001";

export default defineConfig({
  plugins: [vue()],
  server: {
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${devApiPort}` },
  },
});
