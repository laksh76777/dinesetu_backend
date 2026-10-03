import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

let mongod: any = null;

export async function connectDatabase(): Promise<string> {
  const uri = process.env.MONGODB_URI;

  if (uri) {
    try {
      console.log('[Database] Connecting to configured MongoDB instance...');
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log('[Database] Connected to MongoDB successfully.');
      return uri;
    } catch (err: any) {
      console.log(`[Database] Could not connect to configured MONGODB_URI. Falling back to embedded MongoMemoryServer...`);
    }
  }

  // Fallback to MongoMemoryServer for effortless zero-config local run
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    console.log('[Database] Starting in-memory MongoDB server for seamless zero-setup execution...');
    mongod = await MongoMemoryServer.create();
    const memoryUri = mongod.getUri();
    await mongoose.connect(memoryUri);
    console.log(`[Database] Connected to in-memory MongoDB at ${memoryUri}`);
    return memoryUri;
  } catch (memErr: any) {
    console.error('[Database] Failed to initialize in-memory MongoDB:', memErr.message);
    throw memErr;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
  console.log('[Shutdown] Disconnected from MongoDB.');
}
