import type { RequestHandler } from 'express';
import type { DatabaseCheck } from '../services/health.service.js';

export function healthController(checkDatabase: DatabaseCheck): RequestHandler {
  return async (_req, res) => {
    const databaseOk = await checkDatabase();
    res
      .status(databaseOk ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({
        status: databaseOk ? 'ok' : 'unavailable',
        checks: { database: databaseOk ? 'ok' : 'down' },
      });
  };
}
