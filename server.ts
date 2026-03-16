import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Turso Connection settings
const url = process.env.TURSO_DATABASE_URL || "libsql://procurement-db-beverly0215-coder.aws-ap-northeast-1.turso.io";
const authToken = process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzM2MzIwMDUsImlkIjoiMDE5Y2Y0YjQtMTAwMS03NTZjLWI5ZjUtYWQ5YzBjYWNlZjAyIiwicmlkIjoiMDE1YzljNjEtZGE0OS00Yzk3LThiZTQtODYxODQ4ZWIyOTE4In0.cEkiDsVh6zPRxUhyyidemVV8fY0mv1Kj1ocww07vc6dv1Y6V3x1IwOHXS4jk7JKWUsZ-CIYY2pY8Zq-C-tMWAQ";

console.log(`[DB] 連線至 Turso: ${url}`);
const db = createClient({
  url,
  authToken,
});

// Initialize Database asynchronously
async function initDB() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS pre_sale_contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_no TEXT NOT NULL,
        vendor TEXT NOT NULL,
        item_name TEXT NOT NULL,
        total_quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        specification TEXT,
        purchase_date TEXT,
        expected_arrival_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add columns if they don't exist
    try { await db.execute("ALTER TABLE pre_sale_contracts ADD COLUMN specification TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE pre_sale_contracts ADD COLUMN purchase_date TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE pre_sale_contracts ADD COLUMN expected_arrival_date TEXT;"); } catch (e) {}

    await db.execute(`
      CREATE TABLE IF NOT EXISTS procurement_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER,
        vendor TEXT,
        delivery_date TEXT NOT NULL,
        receiver TEXT NOT NULL,
        item_name TEXT NOT NULL,
        specification TEXT,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        order_type TEXT NOT NULL, -- 'standard' or 'pre_sale_delivery'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contract_id) REFERENCES pre_sale_contracts(id)
      );
    `);

    try { await db.execute("ALTER TABLE procurement_records ADD COLUMN vendor TEXT;"); } catch (e) {}
  } catch(e) {
    console.error("DB Initialization Error:", e);
  }
}

initDB();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // API Routes
  
  // Pre-sale Contracts
  app.get("/api/contracts", async (req, res) => {
    try {
      const contracts = await db.execute(`
        SELECT c.*, 
               COALESCE(SUM(r.quantity), 0) as received_quantity
        FROM pre_sale_contracts c
        LEFT JOIN procurement_records r ON c.id = r.contract_id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `);
      res.json(contracts.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  app.post("/api/contracts", async (req, res) => {
    const { contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date } = req.body;
    try {
      const info = await db.execute({
        sql: "INSERT INTO pre_sale_contracts (contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id;",
        args: [contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date]
      });
      res.json({ id: info.rows[0].id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  app.delete("/api/contracts/:id", async (req, res) => {
    try {
      // First, set contract_id to NULL in records to avoid foreign key violations
      await db.execute({ sql: "UPDATE procurement_records SET contract_id = NULL WHERE contract_id = ?", args: [req.params.id] });
      const result = await db.execute({ sql: "DELETE FROM pre_sale_contracts WHERE id = ?", args: [req.params.id] });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "找不到該單據" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete contract error:", error);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  app.put("/api/contracts/:id", async (req, res) => {
    const { contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date } = req.body;
    try {
      const result = await db.execute({
        sql: "UPDATE pre_sale_contracts SET contract_no = ?, vendor = ?, item_name = ?, total_quantity = ?, unit_price = ?, specification = ?, purchase_date = ?, expected_arrival_date = ? WHERE id = ?",
        args: [contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date, req.params.id]
      });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "找不到該單據" });
      }
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  // Procurement Records (Deliveries & Standard Orders)
  app.get("/api/records", async (req, res) => {
    try {
      const records = await db.execute(`
        SELECT r.*, c.contract_no, COALESCE(c.vendor, r.vendor) as vendor
        FROM procurement_records r
        LEFT JOIN pre_sale_contracts c ON r.contract_id = c.id
        ORDER BY r.delivery_date DESC, r.created_at DESC
      `);
      res.json(records.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  app.post("/api/records", async (req, res) => {
    const { 
      contract_id, 
      vendor,
      delivery_date, 
      receiver, 
      item_name, 
      specification, 
      quantity, 
      unit_price, 
      total_price, 
      order_type 
    } = req.body;
    
    try {
      const info = await db.execute({
        sql: `
          INSERT INTO procurement_records (
            contract_id, vendor, delivery_date, receiver, item_name, specification, quantity, unit_price, total_price, order_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id;
        `,
        args: [
          contract_id || null, 
          vendor || null,
          delivery_date, 
          receiver, 
          item_name, 
          specification, 
          quantity, 
          unit_price, 
          total_price, 
          order_type
        ]
      });
      res.json({ id: info.rows[0].id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  app.delete("/api/records/:id", async (req, res) => {
    try {
      const result = await db.execute({ sql: "DELETE FROM procurement_records WHERE id = ?", args: [req.params.id] });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "找不到該紀錄" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete record error:", error);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  app.put("/api/records/:id", async (req, res) => {
    const { 
      contract_id, 
      vendor,
      delivery_date, 
      receiver, 
      item_name, 
      specification, 
      quantity, 
      unit_price, 
      total_price, 
      order_type 
    } = req.body;
    
    try {
      const result = await db.execute({
        sql: `
          UPDATE procurement_records SET 
            contract_id = ?, vendor = ?, delivery_date = ?, receiver = ?, item_name = ?, specification = ?, quantity = ?, unit_price = ?, total_price = ?, order_type = ?
          WHERE id = ?
        `,
        args: [
          contract_id || null, 
          vendor || null,
          delivery_date, 
          receiver, 
          item_name, 
          specification, 
          quantity, 
          unit_price, 
          total_price, 
          order_type,
          req.params.id
        ]
      });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "找不到該紀錄" });
      }
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
