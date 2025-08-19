import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';

import usersRouter from './routes/users';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const corsOrigin = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Example route using Firebase RDB
app.use('/api/users', usersRouter);

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
