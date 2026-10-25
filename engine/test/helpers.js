import { newDb } from 'pg-mem';
import { migrate } from '../src/db.js';

export async function memDb() {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = new Pool();
  await migrate(db);
  return db;
}
