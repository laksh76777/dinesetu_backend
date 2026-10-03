import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initSocketServer } from './sockets/socketServer.js';
import { initRedis } from './config/redis.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    // 1. Connect to Database (Atlas or embedded MongoMemoryServer)
    await connectDatabase();

    // 2. Bootstrap Core Entities & Ensure All Tables are Clean and AVAILABLE
    const { seedInitialUsers } = await import('./scripts/seed.js');
    await seedInitialUsers();

    // 3. Initialize Redis / Cache
    await initRedis();

    // 4. Create Express App & HTTP Server
    const app = createApp();
    const httpServer = http.createServer(app);

    // 5. Initialize Socket.IO Foundation
    initSocketServer(httpServer);

    // 6. Start Listening and display status banner
    httpServer.listen(PORT, () => {
      console.log('=======================================================');
      console.log('🍽️  DineFlow Restaurant Technology Backend Running');
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`⚡ Real-time Socket.IO: Active`);
      console.log(`🛡️  Security: Helmet + CORS + Rate Limiting + RBAC`);
      console.log(`🤖 AI Advisor: Google Gemini (Active)`);
      console.log(`📋 Floor State: All Tables Initialized to AVAILABLE`);
      console.log('=======================================================');
    });

    // Graceful Shutdown Handling
    const handleShutdown = async (_signal: string) => {
      console.log('\n[Shutdown] Closing server...');
      httpServer.close(async () => {
        await disconnectDatabase();
        console.log('[Shutdown] Server closed cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (err: any) {
    console.error(`[Server] Critical server initialization error: ${err.message}`);
    process.exit(1);
  }
}

bootstrap();
