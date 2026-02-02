import mongoose from "mongoose";
import { logger } from "../utils/logger";

export const connectDB = async () => {
  try {
    const enableMongoDebug =
      process.env.MONGO_DEBUG === "true" || process.env.MONGO_DEBUG === "1";
    if (enableMongoDebug) {
      mongoose.set("debug", (collectionName, method, query, doc, options) => {
        logger.info(
          { collection: collectionName, method, query, doc, options },
          "MongoDB query",
        );
      });
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI as string);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
};
