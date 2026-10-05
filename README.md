# Контрольное задание №4 — Products API

Серверное веб-приложение для управления списком товаров.

Стек: **Node.js + Express + PostgreSQL (`pg`) + Redis + Docker Compose**.

## Что делает приложение

- REST API сущности `Product` с полями `id`, `name`, `price`, `description`, `created_at`
- Все CRUD-операции идут через PostgreSQL (данные не хранятся только в памяти)
- Список товаров `GET /api/products` кэшируется в Redis
- В ответе списка видно источник данных: `source: "database"` или `source: "cache"`
- При создании / изменении / удалении товара кэш списка очищается

## Маршруты

| Метод  | Адрес               | Описание              |
|--------|---------------------|-----------------------|
| POST   | `/api/products`     | Создать товар         |
| GET    | `/api/products`     | Список товаров + кэш  |
| GET    | `/api/products/:id` | Один товар            |
| PATCH  | `/api/products/:id` | Изменить товар        |
| DELETE | `/api/products/:id` | Удалить товар         |

Пример тела для создания:

```json
{
  "name": "Ноутбук",
  "price": 75000,
  "description": "Игровой ноутбук"
}
```

## Запуск

Нужны установленные **Docker** и **Docker Compose**.

Из корня проекта:

```bash
docker compose up --build
```

API будет доступно на [http://localhost:3000](http://localhost:3000).

Остановка (volume с данными БД **не** удаляется):

```bash
docker compose down
```

Удалить и данные БД (только если нужно начать с нуля):

```bash
docker compose down -v
```

## Зачем нужны части стека (для сдачи)

- **PostgreSQL** — основная база данных. В ней постоянно хранятся товары. Все `POST` / `GET` / `PATCH` / `DELETE` работают с таблицей `products`.
- **Redis** — быстрый кэш списка товаров. Первый `GET /api/products` читает из БД и кладёт результат в Redis; повторный запрос (пока не истёк TTL и кэш не очищен) отдаёт данные из Redis без обращения к PostgreSQL.
- **Dockerfile** — инструкция сборки образа backend: берёт Node.js, ставит зависимости и запускает сервер.
- **Docker Compose** — описывает и поднимает сразу три сервиса (`backend`, `db`, `redis`) в одной сети одной командой.
- **Docker Volume `postgres_data`** — сохраняет файлы PostgreSQL на диске хоста. После `docker compose down` и повторного `up` товары остаются на месте.
- **Переменные окружения (`.env`)** — хост/порт/логин БД, URL Redis, TTL кэша, порт API. В коде нет захардкоженных паролей для Docker-среды: backend получает настройки из `environment` в `docker-compose.yml`.

## Переменные окружения

Файл `.env` уже есть в проекте. Основные значения:

| Переменная           | Назначение                          |
|----------------------|-------------------------------------|
| `PORT`               | Порт API                            |
| `POSTGRES_HOST`      | Хост БД (`db` — имя сервиса Compose)|
| `POSTGRES_PORT`      | Порт PostgreSQL                     |
| `POSTGRES_USER`      | Пользователь БД                     |
| `POSTGRES_PASSWORD`  | Пароль БД                           |
| `POSTGRES_DB`        | Имя базы                            |
| `REDIS_URL`          | Строка подключения к Redis          |
| `REDIS_CACHE_TTL`    | Время жизни кэша списка (секунды)   |

## Сценарий демонстрации на сдаче

1. Запустить стек: `docker compose up --build`
2. Создать товар:
   ```bash
   curl -s -X POST http://localhost:3000/api/products \
     -H "Content-Type: application/json" \
     -d '{"name":"Ноутбук","price":75000,"description":"Игровой"}'
   ```
3. Первый список — данные из БД:
   ```bash
   curl -s http://localhost:3000/api/products
   ```
   В ответе должно быть `"source":"database"`.
4. Второй список — из кэша:
   ```bash
   curl -s http://localhost:3000/api/products
   ```
   В ответе должно быть `"source":"cache"`.
5. Изменить товар (кэш очистится):
   ```bash
   curl -s -X PATCH http://localhost:3000/api/products/1 \
     -H "Content-Type: application/json" \
     -d '{"price":70000}'
   ```
6. Снова список — снова `"source":"database"`, затем повтор — `"cache"`.
7. Проверить данные в PostgreSQL:
   ```bash
   docker compose exec db psql -U postgres -d products_db -c "SELECT * FROM products;"
   ```
8. Перезапуск без потери данных:
   ```bash
   docker compose down
   docker compose up --build
   curl -s http://localhost:3000/api/products
   ```
   Созданный товар должен остаться (volume `postgres_data`).

## Структура проекта

```
kr4/
  src/
    server.js   # Express и маршруты API
    db.js       # Подключение к PostgreSQL и создание таблицы
    cache.js    # Redis: чтение, запись и очистка кэша
  Dockerfile
  docker-compose.yml
  .env
  package.json
  README.md
```
