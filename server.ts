import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("procurement.db");

// Initialize Database
db.exec(`
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
try { db.exec("ALTER TABLE pre_sale_contracts ADD COLUMN specification TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE pre_sale_contracts ADD COLUMN purchase_date TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE pre_sale_contracts ADD COLUMN expected_arrival_date TEXT;"); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS procurement_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER,
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // Pre-sale Contracts
  app.get("/api/contracts", (req, res) => {
    const contracts = db.prepare(`
      SELECT c.*, 
             COALESCE(SUM(r.quantity), 0) as received_quantity
      FROM pre_sale_contracts c
      LEFT JOIN procurement_records r ON c.id = r.contract_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all();
    res.json(contracts);
  });

  app.post("/api/contracts", (req, res) => {
    const { contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date } = req.body;
    const info = db.prepare(
      "INSERT INTO pre_sale_contracts (contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/contracts/:id", (req, res) => {
    try {
      // First, set contract_id to NULL in records to avoid foreign key violations
      db.prepare("UPDATE procurement_records SET contract_id = NULL WHERE contract_id = ?").run(req.params.id);
      const result = db.prepare("DELETE FROM pre_sale_contracts WHERE id = ?").run(req.params.id);
      if (result.changes === 0) {
        return res.status(404).json({ error: "找不到該單據" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete contract error:", error);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  app.put("/api/contracts/:id", (req, res) => {
    const { contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date } = req.body;
    const result = db.prepare(
      "UPDATE pre_sale_contracts SET contract_no = ?, vendor = ?, item_name = ?, total_quantity = ?, unit_price = ?, specification = ?, purchase_date = ?, expected_arrival_date = ? WHERE id = ?"
    ).run(contract_no, vendor, item_name, total_quantity, unit_price, specification, purchase_date, expected_arrival_date, req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "找不到該單據" });
    }
    res.json({ success: true });
  });

  // Procurement Records (Deliveries & Standard Orders)
  app.get("/api/records", (req, res) => {
    const records = db.prepare(`
      SELECT r.*, c.contract_no, c.vendor
      FROM procurement_records r
      LEFT JOIN pre_sale_contracts c ON r.contract_id = c.id
      ORDER BY r.delivery_date DESC, r.created_at DESC
    `).all();
    res.json(records);
  });

  app.post("/api/records", (req, res) => {
    const { 
      contract_id, 
      delivery_date, 
      receiver, 
      item_name, 
      specification, 
      quantity, 
      unit_price, 
      total_price, 
      order_type 
    } = req.body;
    
    const info = db.prepare(`
      INSERT INTO procurement_records (
        contract_id, delivery_date, receiver, item_name, specification, quantity, unit_price, total_price, order_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contract_id || null, 
      delivery_date, 
      receiver, 
      item_name, 
      specification, 
      quantity, 
      unit_price, 
      total_price, 
      order_type
    );
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/records/:id", (req, res) => {
    try {
      const result = db.prepare("DELETE FROM procurement_records WHERE id = ?").run(req.params.id);
      if (result.changes === 0) {
        return res.status(404).json({ error: "找不到該紀錄" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete record error:", error);
      res.status(500).json({ error: "伺服器錯誤" });
    }
  });

  app.put("/api/records/:id", (req, res) => {
    const { 
      contract_id, 
      delivery_date, 
      receiver, 
      item_name, 
      specification, 
      quantity, 
      unit_price, 
      total_price, 
      order_type 
    } = req.body;
    
    const result = db.prepare(`
      UPDATE procurement_records SET 
        contract_id = ?, delivery_date = ?, receiver = ?, item_name = ?, specification = ?, quantity = ?, unit_price = ?, total_price = ?, order_type = ?
      WHERE id = ?
    `).run(
      contract_id || null, 
      delivery_date, 
      receiver, 
      item_name, 
      specification, 
      quantity, 
      unit_price, 
      total_price, 
      order_type,
      req.params.id
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: "找不到該紀錄" });
    }
    res.json({ success: true });
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
