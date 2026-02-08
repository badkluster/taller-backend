import app from '../src/app';
import { connectDB } from '../src/config/db';
import { startAgenda } from '../src/utils/agenda';
import { logger } from '../src/utils/logger';

let isConnected = false;
let isAgendaStarted = false;

const ensureDatabase = async () => {
  if (isConnected) return;
  await connectDB();
  isConnected = true;
};

const ensureAgenda = async () => {
  if (isAgendaStarted) return;

  try {
    await startAgenda();
    isAgendaStarted = true;
  } catch (error) {
    // Keep API available even if scheduler boot fails in a cold start.
    logger.error({ err: error }, 'Failed to start Agenda in serverless handler');
  }
};

const handler = async (req: any, res: any) => {
  await ensureDatabase();
  await ensureAgenda();

  return app(req as any, res as any);
};

export default handler;
