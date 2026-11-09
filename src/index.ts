import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import {
  createPool,
  type ResultSetHeader,
  type RowDataPacket
} from 'mysql2/promise';

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const port = Number(process.env.PORT ?? 3000);
const dbPort = Number(process.env.DB_PORT ?? 3306);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  throw new Error('DB_PORT must be a valid TCP port');
}

const db = createPool({
  host: requiredEnv('DB_HOST'),
  port: dbPort,
  database: requiredEnv('DB_NAME'),
  user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  waitForConnections: true,
  connectionLimit: 10
});

interface TaskRow extends RowDataPacket {
  id: number;
  title: string;
  description: string | null;
  completed: number;
  created_at: Date | string;
}

interface Task {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  createdAt: string;
}

function toTask(row: TaskRow): Task {
  const createdAt =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString();

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: Boolean(row.completed),
    createdAt
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTaskId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.get('/api/tasks', async (_req, res) => {
  const [rows] = await db.execute<TaskRow[]>(
    'SELECT id, title, description, completed, created_at FROM tasks ORDER BY id DESC'
  );

  res.json(rows.map(toTask));
});

app.get('/api/tasks/:id', async (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === undefined) {
    res.status(400).json({ error: 'Invalid task ID' });
    return;
  }

  const [rows] = await db.execute<TaskRow[]>(
    'SELECT id, title, description, completed, created_at FROM tasks WHERE id = ?',
    [id]
  );

  if (!rows[0]) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json(toTask(rows[0]));
});

app.post('/api/tasks', async (req, res) => {
  const body: unknown = req.body;

  if (!isRecord(body)) {
    res.status(400).json({ error: 'Request body must be an object' });
    return;
  }

  const title = body.title;
  const description = body.description === undefined ? null : body.description;
  const completed = body.completed === undefined ? false : body.completed;

  if (
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    title.trim().length > 200
  ) {
    res.status(400).json({ error: 'title must contain 1 to 200 characters' });
    return;
  }

  if (
    description !== null &&
    (typeof description !== 'string' || description.length > 10000)
  ) {
    res.status(400).json({
      error: 'description must be a string of at most 10000 characters or null'
    });
    return;
  }

  if (typeof completed !== 'boolean') {
    res.status(400).json({ error: 'completed must be a boolean' });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO tasks (title, description, completed) VALUES (?, ?, ?)',
    [title.trim(), description, completed]
  );

  const [rows] = await db.execute<TaskRow[]>(
    'SELECT id, title, description, completed, created_at FROM tasks WHERE id = ?',
    [result.insertId]
  );

  if (!rows[0]) {
    throw new Error('Created task could not be retrieved');
  }

  res.status(201).json(toTask(rows[0]));
});

app.patch('/api/tasks/:id', async (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === undefined) {
    res.status(400).json({ error: 'Invalid task ID' });
    return;
  }

  const body: unknown = req.body;

  if (!isRecord(body)) {
    res.status(400).json({ error: 'Request body must be an object' });
    return;
  }

  const allowedFields = new Set(['title', 'description', 'completed']);
  const keys = Object.keys(body);

  if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
    res.status(400).json({ error: 'Provide one or more valid task fields' });
    return;
  }

  const updates: string[] = [];
  const values: Array<string | number | boolean | null> = [];

  if ('title' in body) {
    if (
      typeof body.title !== 'string' ||
      body.title.trim().length === 0 ||
      body.title.trim().length > 200
    ) {
      res.status(400).json({ error: 'title must contain 1 to 200 characters' });
      return;
    }

    updates.push('title = ?');
    values.push(body.title.trim());
  }

  if ('description' in body) {
    if (
      body.description !== null &&
      (typeof body.description !== 'string' || body.description.length > 10000)
    ) {
      res.status(400).json({
        error: 'description must be a string of at most 10000 characters or null'
      });
      return;
    }

    updates.push('description = ?');
    values.push(body.description);
  }

  if ('completed' in body) {
    if (typeof body.completed !== 'boolean') {
      res.status(400).json({ error: 'completed must be a boolean' });
      return;
    }

    updates.push('completed = ?');
    values.push(body.completed);
  }

  values.push(id);

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
    values
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const [rows] = await db.execute<TaskRow[]>(
    'SELECT id, title, description, completed, created_at FROM tasks WHERE id = ?',
    [id]
  );

  if (!rows[0]) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json(toTask(rows[0]));
});

app.delete('/api/tasks/:id', async (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === undefined) {
    res.status(400).json({ error: 'Invalid task ID' });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    'DELETE FROM tasks WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.status(204).end();
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error('Request failed:', error);

  const statusCode =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : 500;

  const message =
    statusCode === 413
      ? 'Request body too large'
      : statusCode < 500
        ? 'Invalid request'
        : 'Internal server error';

  res.status(statusCode).json({ error: message });
};

app.use(errorHandler);

async function start(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT NULL,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  app.listen(port, '0.0.0.0', () => {
    console.log(`AppPulse API listening on port ${port}`);
  });
}

start().catch((error: unknown) => {
  console.error('API startup failed:', error);
  process.exit(1);
});
