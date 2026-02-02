import dotenv from 'dotenv';
import { connectDB } from './config/db';
import app from './app';
import { startAgenda } from './utils/agenda';
import { logger } from './utils/logger';

dotenv.config();

const startServer = async () => {
  try {
    await connectDB();
    await startAgenda();
  } catch (error) {
    logger.error({ err: error }, 'Startup failure');
  }

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
};

startServer();

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
});
