import { Router, Request, Response } from 'express';
import { db } from '../db/firebase';
import { ref, get, set, update, remove, push, DataSnapshot } from 'firebase-admin/database';

const router = Router();

// Base path in Realtime Database
const USERS_PATH = '/users';

router.get('/', async (_req: Request, res: Response) => {
  try {
    const snapshot: DataSnapshot = await get(ref(db, USERS_PATH));
    res.json(snapshot.val() || {});
  } catch (err) {
    console.error('GET /users error', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const snapshot = await get(ref(db, `${USERS_PATH}/${req.params.id}`));
    if (!snapshot.exists()) return res.status(404).json({ error: 'User not found' });
    res.json(snapshot.val());
  } catch (err) {
    console.error('GET /users/:id error', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const newRef = push(ref(db, USERS_PATH));
    await set(newRef, { id: newRef.key, ...req.body });
    res.status(201).json({ id: newRef.key });
  } catch (err) {
    console.error('POST /users error', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    await update(ref(db, `${USERS_PATH}/${req.params.id}`), req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /users/:id error', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await remove(ref(db, `${USERS_PATH}/${req.params.id}`));
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /users/:id error', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
