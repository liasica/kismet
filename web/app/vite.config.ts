import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, searchForWorkspaceRoot } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 36578,
    fs: {
      // 区划 JSON 在仓库根的 data/，不在前端工作区内
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        path.resolve(import.meta.dirname, "../../data"),
      ],
    },
    // 命理解读走 Go 接口服务，开发时把 /api 代理过去
    proxy: {
      "/api": "http://localhost:36579",
    },
  },
})
