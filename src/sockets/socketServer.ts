import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    },
  });

  io.on('connection', (socket: Socket) => {
    logger.debug(`Socket client connected: ${socket.id}`);

    // Join table session room (for diners at this table)
    socket.on('join_session', (sessionId: string) => {
      if (sessionId) {
        socket.join(`session:${sessionId}`);
        logger.debug(`Socket ${socket.id} joined session:${sessionId}`);
      }
    });

    socket.on('leave_session', (sessionId: string) => {
      if (sessionId) {
        socket.leave(`session:${sessionId}`);
        logger.debug(`Socket ${socket.id} left session:${sessionId}`);
      }
    });

    // Join staff rooms
    socket.on('join_kitchen', (station?: string) => {
      socket.join('kitchen');
      if (station) {
        socket.join(`station:${station}`);
        logger.debug(`Socket ${socket.id} joined kitchen station:${station}`);
      } else {
        logger.debug(`Socket ${socket.id} joined kitchen all-stations`);
      }
    });

    socket.on('join_waiter', () => {
      socket.join('waiter');
      logger.debug(`Socket ${socket.id} joined waiter room`);
    });

    socket.on('join_dashboard', () => {
      socket.join('dashboard');
      logger.debug(`Socket ${socket.id} joined dashboard room`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket client disconnected: ${socket.id}`);
    });
  });

  logger.info('Socket.IO real-time engine initialized');
  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO has not been initialized yet!');
  }
  return io;
}

// Broadcaster helper methods
export const socketBroadcaster = {
  // Session update (new diner joined, bill requested, etc.)
  emitSessionUpdated: (sessionId: string, sessionData: any) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('SESSION_UPDATED', sessionData);
    io.to('dashboard').emit('SESSION_UPDATED', sessionData);
    io.to('waiter').emit('SESSION_UPDATED', sessionData);
  },

  // New order placed
  emitNewOrder: (order: any, sessionId: string) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('NEW_ORDER', order);
    io.to('kitchen').emit('NEW_ORDER', order);
    io.to('waiter').emit('NEW_ORDER', order);
    io.to('dashboard').emit('NEW_ORDER', order);

    // Also emit to specific stations
    order.items?.forEach((item: any) => {
      if (item.kitchenStation) {
        io?.to(`station:${item.kitchenStation}`).emit('STATION_NEW_ITEM', {
          orderId: order._id,
          tableNumber: order.tableNumber,
          roundNumber: order.roundNumber,
          item,
        });
      }
    });
  },

  // Order status transitions
  emitOrderAccepted: (order: any, sessionId: string) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('ORDER_ACCEPTED', order);
    io.to('kitchen').emit('ORDER_ACCEPTED', order);
    io.to('waiter').emit('ORDER_ACCEPTED', order);
    io.to('dashboard').emit('ORDER_ACCEPTED', order);
    io.to(`session:${sessionId}`).emit('ORDER_UPDATED', order);
    io.to('kitchen').emit('ORDER_UPDATED', order);
    io.to('waiter').emit('ORDER_UPDATED', order);
    io.to('dashboard').emit('ORDER_UPDATED', order);
  },

  emitOrderPreparing: (order: any, sessionId: string) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('ORDER_PREPARING', order);
    io.to('kitchen').emit('ORDER_PREPARING', order);
    io.to('waiter').emit('ORDER_PREPARING', order);
    io.to('dashboard').emit('ORDER_PREPARING', order);
    io.to(`session:${sessionId}`).emit('ORDER_UPDATED', order);
    io.to('kitchen').emit('ORDER_UPDATED', order);
    io.to('waiter').emit('ORDER_UPDATED', order);
    io.to('dashboard').emit('ORDER_UPDATED', order);
  },

  emitOrderReady: (order: any, sessionId: string) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('ORDER_READY', order);
    io.to('kitchen').emit('ORDER_READY', order);
    io.to('waiter').emit('ORDER_READY', order);
    io.to('dashboard').emit('ORDER_READY', order);
    io.to(`session:${sessionId}`).emit('ORDER_UPDATED', order);
    io.to('kitchen').emit('ORDER_UPDATED', order);
    io.to('waiter').emit('ORDER_UPDATED', order);
    io.to('dashboard').emit('ORDER_UPDATED', order);
  },

  emitOrderUpdated: (order: any, sessionId: string) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('ORDER_UPDATED', order);
    io.to('kitchen').emit('ORDER_UPDATED', order);
    io.to('waiter').emit('ORDER_UPDATED', order);
    io.to('dashboard').emit('ORDER_UPDATED', order);

    if (order.status === 'ACCEPTED') {
      io.to('kitchen').emit('ORDER_ACCEPTED', order);
      io.to(`session:${sessionId}`).emit('ORDER_ACCEPTED', order);
    } else if (order.status === 'PREPARING') {
      io.to('kitchen').emit('ORDER_PREPARING', order);
      io.to(`session:${sessionId}`).emit('ORDER_PREPARING', order);
    } else if (order.status === 'READY') {
      io.to('kitchen').emit('ORDER_READY', order);
      io.to('waiter').emit('ORDER_READY', {
        orderId: order._id,
        tableNumber: order.tableNumber,
        roundNumber: order.roundNumber,
        items: order.items,
      });
      io.to(`session:${sessionId}`).emit('ORDER_READY', order);
    }
  },

  // Service requests (call waiter, water, cutlery, bill)
  emitStaffRequest: (request: any, sessionId: string) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('STAFF_REQUEST_UPDATED', request);
    io.to('waiter').emit('STAFF_REQUEST', request);
    io.to('dashboard').emit('STAFF_REQUEST', request);
  },

  // Table state changed (occupied, bill requested, available)
  emitTableUpdated: (table: any) => {
    if (!io) return;
    io.to('dashboard').emit('TABLE_UPDATED', table);
    io.to('waiter').emit('TABLE_UPDATED', table);
  },

  // Payment completed
  emitPaymentCompleted: (payment: any, sessionId: string) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('PAYMENT_COMPLETED', payment);
    io.to('dashboard').emit('PAYMENT_COMPLETED', payment);
    io.to('waiter').emit('PAYMENT_COMPLETED', payment);
  },

  // Menu item availability changed (e.g. 86'd / sold out)
  emitAvailabilityChanged: (item: any) => {
    if (!io) return;
    io.emit('AVAILABILITY_CHANGED', item);
  },

  // DineSetu V2: Table Ideas (Shared Wishlist) updated
  emitTableIdeasUpdated: (sessionId: string, tableIdeas: any[]) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('TABLE_IDEAS_UPDATED', { sessionId, tableIdeas });
  },

  // DineSetu V2: Taste Journey preferences updated
  emitPreferencesUpdated: (sessionId: string, preferences: any) => {
    if (!io) return;
    io.to(`session:${sessionId}`).emit('PREFERENCES_UPDATED', { sessionId, preferences });
  },

  // DineSetu V2: Dining Moment updated
  emitDiningMomentUpdated: (moment: any) => {
    if (!io) return;
    io.emit('DINING_MOMENT_UPDATED', moment);
  },
};
