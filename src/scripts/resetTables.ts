import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Table } from '../models/Table.js';
import { TableSession } from '../models/TableSession.js';
import { SessionMember } from '../models/SessionMember.js';
import { Order } from '../models/Order.js';
import { StaffRequest } from '../models/StaffRequest.js';
import { ORDER_STATUSES } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export async function resetAllTablesToAvailable() {
  await connectDatabase();

  logger.info('Initializing all restaurant tables to fresh AVAILABLE state...');

  // Purge any temporary audit test tables
  await Table.deleteMany({ tableNumber: { $regex: /^AUDIT/i } });

  // 1. Reset all tables to AVAILABLE with no active sessions
  const tableResult = await Table.updateMany(
    {},
    {
      $set: {
        status: 'AVAILABLE',
        activeSessionId: null,
        active: true,
        'qrCode.active': true,
      },
    }
  );

  // 2. Mark all lingering TableSessions as COMPLETED
  const sessionResult = await TableSession.updateMany(
    { status: { $ne: 'COMPLETED' } },
    {
      $set: {
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        endedAt: new Date(),
      },
    }
  );

  // 3. Mark all session members as inactive
  const memberResult = await SessionMember.updateMany(
    { active: true },
    { $set: { active: false } }
  );

  // 4. Mark all active orders as completed
  const orderResult = await Order.updateMany(
    { status: { $nin: [ORDER_STATUSES.COMPLETED, ORDER_STATUSES.CANCELLED] } },
    {
      $set: {
        status: ORDER_STATUSES.COMPLETED,
        completedAt: new Date(),
      },
    }
  );

  // 5. Complete all active staff requests
  const requestResult = await StaffRequest.updateMany(
    { status: { $ne: 'COMPLETED' } },
    {
      $set: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    }
  );

  logger.info(`✅ Tables updated to AVAILABLE: ${tableResult.modifiedCount}`);
  logger.info(`✅ Sessions completed: ${sessionResult.modifiedCount}`);
  logger.info(`✅ Members cleared: ${memberResult.modifiedCount}`);
  logger.info(`✅ Orders completed: ${orderResult.modifiedCount}`);
  logger.info(`✅ Requests completed: ${requestResult.modifiedCount}`);
  logger.info('✨ ALL TABLES ARE NOW CLEAN AND AVAILABLE FOR NEW GUESTS!');

  await disconnectDatabase();
}

// Auto-run if executed directly via CLI
if (process.argv[1]?.includes('resetTables')) {
  resetAllTablesToAvailable()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Failed to reset tables:', err);
      process.exit(1);
    });
}
