const express = require("express");
const { pool, initDb } = require("./db");
const {
  redisClient,
  connectRedis,
  getCachedProducts,
  setCachedProducts,
  invalidateProductsCache,
} = require("./cache");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "Products API (PostgreSQL + Redis)",
    endpoints: [
      "POST /api/products",
      "GET /api/products",
      "GET /api/products/:id",
      "PATCH /api/products/:id",
      "DELETE /api/products/:id",
    ],
  });
});

// Создание товара
app.post("/api/products", async (req, res) => {
  try {
    const { name, price, description } = req.body;

    if (!name || price === undefined || price === null) {
      return res.status(400).json({
        error: "Поля name и price обязательны",
      });
    }

    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        error: "price должен быть неотрицательным числом",
      });
    }

    const result = await pool.query(
      `INSERT INTO products (name, price, description)
       VALUES ($1, $2, $3)
       RETURNING id, name, price, description, created_at`,
      [name, numericPrice, description ?? null]
    );

    await invalidateProductsCache();

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/products:", err.message);
    res.status(500).json({ error: "Не удалось создать товар" });
  }
});

// Список товаров: сначала Redis, иначе PostgreSQL
app.get("/api/products", async (req, res) => {
  try {
    const cached = await getCachedProducts();
    if (cached) {
      return res.json({
        source: "cache",
        data: cached,
      });
    }

    const result = await pool.query(
      `SELECT id, name, price, description, created_at
       FROM products
       ORDER BY id ASC`
    );

    await setCachedProducts(result.rows);

    res.json({
      source: "database",
      data: result.rows,
    });
  } catch (err) {
    console.error("GET /api/products:", err.message);
    res.status(500).json({ error: "Не удалось получить список товаров" });
  }
});

// Один товар по id (из БД)
app.get("/api/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Некорректный id" });
    }

    const result = await pool.query(
      `SELECT id, name, price, description, created_at
       FROM products
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Товар не найден" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /api/products/:id:", err.message);
    res.status(500).json({ error: "Не удалось получить товар" });
  }
});

// Частичное обновление
app.patch("/api/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Некорректный id" });
    }

    const { name, price, description } = req.body;
    if (name === undefined && price === undefined && description === undefined) {
      return res.status(400).json({
        error: "Укажите хотя бы одно поле: name, price или description",
      });
    }

    const current = await pool.query(
      `SELECT id, name, price, description, created_at FROM products WHERE id = $1`,
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "Товар не найден" });
    }

    const nextName = name !== undefined ? name : current.rows[0].name;
    let nextPrice = current.rows[0].price;
    if (price !== undefined) {
      nextPrice = Number(price);
      if (Number.isNaN(nextPrice) || nextPrice < 0) {
        return res.status(400).json({
          error: "price должен быть неотрицательным числом",
        });
      }
    }
    const nextDescription =
      description !== undefined ? description : current.rows[0].description;

    const result = await pool.query(
      `UPDATE products
       SET name = $1, price = $2, description = $3
       WHERE id = $4
       RETURNING id, name, price, description, created_at`,
      [nextName, nextPrice, nextDescription, id]
    );

    await invalidateProductsCache();

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/products/:id:", err.message);
    res.status(500).json({ error: "Не удалось обновить товар" });
  }
});

// Удаление
app.delete("/api/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Некорректный id" });
    }

    const result = await pool.query(
      `DELETE FROM products
       WHERE id = $1
       RETURNING id, name, price, description, created_at`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Товар не найден" });
    }

    await invalidateProductsCache();

    res.json({
      message: "Товар удалён",
      product: result.rows[0],
    });
  } catch (err) {
    console.error("DELETE /api/products/:id:", err.message);
    res.status(500).json({ error: "Не удалось удалить товар" });
  }
});

async function start() {
  await initDb();
  await connectRedis();

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await pool.end();
  await redisClient.quit();
  process.exit(0);
});
