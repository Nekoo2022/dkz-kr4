const { createClient } = require("redis");

const PRODUCTS_CACHE_KEY = "products:all";
const PRODUCTS_CACHE_TTL = Number(process.env.REDIS_CACHE_TTL) || 60;

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err.message);
});

async function connectRedis(retries = 30, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }
      await redisClient.ping();
      console.log("Redis connected");
      return;
    } catch (err) {
      console.log(
        `Waiting for Redis... (${attempt}/${retries}): ${err.message}`
      );
      try {
        if (redisClient.isOpen) {
          await redisClient.quit();
        }
      } catch (_) {
        // ignore
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Redis is not available");
}

async function getCachedProducts() {
  const raw = await redisClient.get(PRODUCTS_CACHE_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}

async function setCachedProducts(products) {
  await redisClient.set(PRODUCTS_CACHE_KEY, JSON.stringify(products), {
    EX: PRODUCTS_CACHE_TTL,
  });
}

async function invalidateProductsCache() {
  await redisClient.del(PRODUCTS_CACHE_KEY);
}

module.exports = {
  redisClient,
  connectRedis,
  getCachedProducts,
  setCachedProducts,
  invalidateProductsCache,
  PRODUCTS_CACHE_TTL,
};
