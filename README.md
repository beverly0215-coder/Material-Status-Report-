# React + Express Procurement System

這是一個使用 Vite + React + Express + SQLite 開發的採購系統專案。

## 本地開發與運行

**先決條件:** Node.js (建議 >= 18)

1. **安裝依賴套件**:
   ```bash
   npm install
   ```

2. **設定環境變數**:
   如果需要 Gemini API 等服務，請複製 `.env.example` 並命名為 `.env` (或 `.env.local`)，填入對應的變數。
   ```bash
   cp .env.example .env
   ```

3. **啟動開發伺服器 (包含前端 Vite 及後端 Express)**:
   ```bash
   npm run dev
   ```
   系統將會在 `http://localhost:3000` 啟動，支援 Hot-Reload。

## 生產環境 (Production) 模式

1. **封裝打包靜態資源**:
   ```bash
   npm run build
   ```
   這會將 React 前端編譯並產出至 `dist/` 資料夾。

2. **啟動生產伺服器**:
   ```bash
   npm start
   ```
   Express 伺服器會自動 Serve `dist/` 內的靜態檔案。

## Git & 部署觀念

- `.gitignore` 已經更新，會忽略編譯快取、`node_modules`、暫存檔與本地 `procurement.db` (避免測試資料庫上傳破壞正式機資料)。
- 內建了 GitHub Actions 於 `.github/workflows/deploy.yml`。每次推播至 `main` 時自動檢查 Build。
- 實際部署時推薦使用 **PM2** 管理 Node.js 行程：
  ```bash
  pm2 start server.ts --interpreter tsx --name my-app
  ```
