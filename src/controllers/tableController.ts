import { Request, Response, NextFunction } from 'express';
import { Table, TableStatus } from '../models/Table.js';
import { TableSession } from '../models/TableSession.js';
import { SessionMember } from '../models/SessionMember.js';
import { Restaurant } from '../models/Restaurant.js';
import { Order } from '../models/Order.js';
import { StaffRequest } from '../models/StaffRequest.js';
import { Payment } from '../models/Payment.js';
import { generateSecureToken } from '../utils/tokens.js';
import { generateQrDataUrl, generateQrBuffer } from '../utils/qr.js';
import { AppError } from '../middleware/errorHandler.js';
import { socketBroadcaster } from '../sockets/socketServer.js';

export const tableController = {
  // Get all tables with active session details
  async getAllTables(_req: Request, res: Response, next: NextFunction) {
    try {
      const tables = await Table.find().sort({ tableNumber: 1 });
      const tableIds = tables.map((t) => t._id);

      // Find active sessions for these tables
      const activeSessions = await TableSession.find({
        tableId: { $in: tableIds },
        status: { $in: ['ACTIVE', 'PAYMENT_PENDING'] },
      });

      const sessionMap = new Map();
      activeSessions.forEach((s) => sessionMap.set(s.tableId.toString(), s));

      const normalizeSection = (sec?: string) => {
        if (!sec) return 'Main Dining Hall';
        if (sec === 'Window Booth') return 'Main Dining Hall';
        if (sec === 'Patio Terrace') return 'Terrace Garden';
        if (sec === 'Courtyard') return 'Bar & Lounge';
        return sec;
      };

      const enrichedTables = tables.map((t) => {
        const activeSession = sessionMap.get(t._id.toString());
        return {
          ...t.toObject(),
          section: normalizeSection(t.section),
          activeSession: activeSession || null,
        };
      });

      res.json({ success: true, data: enrichedTables });
    } catch (err) {
      next(err);
    }
  },

  // Public tables directory for guest QR dining & table selector
  async getPublicTables(_req: Request, res: Response, next: NextFunction) {
    try {
      const normalizeSection = (sec?: string) => {
        if (!sec) return 'Main Dining Hall';
        if (sec === 'Window Booth') return 'Main Dining Hall';
        if (sec === 'Patio Terrace') return 'Terrace Garden';
        if (sec === 'Courtyard') return 'Bar & Lounge';
        return sec;
      };

      const tables = await Table.find({ active: true, 'qrCode.active': true })
        .select('tableNumber capacity status section qrCode')
        .sort({ tableNumber: 1 });

      const mapped = tables.map((t) => ({
        ...t.toObject(),
        section: normalizeSection(t.section),
      }));

      res.json({ success: true, data: mapped });
    } catch (err) {
      next(err);
    }
  },

  // Create table & generate QR code
  async createTable(req: Request, res: Response, next: NextFunction) {
    try {
      const { tableNumber, capacity, section } = req.body;
      if (!tableNumber) throw new AppError('Table number is required', 400);

      const existing = await Table.findOne({ tableNumber: tableNumber.trim() });
      if (existing) {
        throw new AppError(`Table "${tableNumber}" already exists`, 409);
      }

      // Generate secure non-predictable token (e.g. X7k92Lm)
      const token = generateSecureToken(8);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const scanUrl = `${frontendUrl}/q/${token}`;
      const qrDataUrl = await generateQrDataUrl(scanUrl);

      const table = await Table.create({
        tableNumber: tableNumber.trim(),
        capacity: Number(capacity) || 4,
        section: section || 'Main Dining Hall',
        status: 'AVAILABLE',
        active: true,
        qrCode: {
          token,
          active: true,
          generatedAt: new Date(),
          qrDataUrl,
        },
      });

      socketBroadcaster.emitTableUpdated(table);
      res.status(201).json({ success: true, message: `Table ${table.tableNumber} created`, data: table });
    } catch (err) {
      next(err);
    }
  },

  // Edit table
  async updateTable(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tableNumber, capacity, section } = req.body;

      const table = await Table.findById(id);
      if (!table) throw new AppError('Table not found', 404);

      if (tableNumber) table.tableNumber = tableNumber.trim();
      if (capacity) table.capacity = Number(capacity);
      if (section) table.section = section;

      await table.save();
      socketBroadcaster.emitTableUpdated(table);

      res.json({ success: true, message: 'Table updated', data: table });
    } catch (err) {
      next(err);
    }
  },

  // Update status (AVAILABLE, OCCUPIED, PREPARING, READY, PAYMENT)
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'PREPARING', 'READY', 'PAYMENT'];
      if (!validStatuses.includes(status)) {
        throw new AppError(`Invalid table status. Allowed: ${validStatuses.join(', ')}`, 400);
      }

      const table = await Table.findByIdAndUpdate(id, { status }, { new: true });
      if (!table) throw new AppError('Table not found', 404);

      socketBroadcaster.emitTableUpdated(table);
      res.json({ success: true, message: `Table ${table.tableNumber} status set to ${status}`, data: table });
    } catch (err) {
      next(err);
    }
  },

  // Toggle active / deactivate table
  async toggleActive(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const table = await Table.findById(id);
      if (!table) throw new AppError('Table not found', 404);

      table.active = !table.active;
      await table.save();

      socketBroadcaster.emitTableUpdated(table);
      res.json({
        success: true,
        message: `Table ${table.tableNumber} is now ${table.active ? 'Active' : 'Deactivated'}`,
        data: table,
      });
    } catch (err) {
      next(err);
    }
  },

  // Regenerate QR Token
  async regenerateQr(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const table = await Table.findById(id);
      if (!table) throw new AppError('Table not found', 404);

      const newToken = generateSecureToken(8);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const scanUrl = `${frontendUrl}/q/${newToken}`;
      const qrDataUrl = await generateQrDataUrl(scanUrl);

      table.qrCode = {
        token: newToken,
        active: true,
        generatedAt: table.qrCode.generatedAt || new Date(),
        regeneratedAt: new Date(),
        qrDataUrl,
      };

      await table.save();
      socketBroadcaster.emitTableUpdated(table);

      res.json({
        success: true,
        message: `New QR Token generated for Table ${table.tableNumber}`,
        data: table,
      });
    } catch (err) {
      next(err);
    }
  },

  // Toggle QR Active state
  async toggleQrActive(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const table = await Table.findById(id);
      if (!table) throw new AppError('Table not found', 404);

      table.qrCode.active = !table.qrCode.active;
      await table.save();

      socketBroadcaster.emitTableUpdated(table);
      res.json({
        success: true,
        message: `QR code for Table ${table.tableNumber} is now ${table.qrCode.active ? 'Enabled' : 'Disabled'}`,
        data: table,
      });
    } catch (err) {
      next(err);
    }
  },

  // Resolve QR token when scanned by customer (/q/:token)
  async resolveQrToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      const table = await Table.findOne({ 'qrCode.token': token });
      if (!table) {
        throw new AppError('Invalid table QR code. Please ask your server for assistance.', 404);
      }

      if (!table.active) {
        throw new AppError(`Table ${table.tableNumber} is currently unavailable for dining.`, 403);
      }

      if (!table.qrCode.active) {
        throw new AppError(`This QR code has been disabled. Please ask your server for a refreshed QR card.`, 403);
      }

      // Check for active session
      const activeSession = await TableSession.findOne({
        tableId: table._id,
        status: { $in: ['ACTIVE', 'PAYMENT_PENDING'] },
      });

      let members: any[] = [];
      if (activeSession) {
        members = await SessionMember.find({
          sessionId: activeSession._id,
          active: true,
        }).select('displayName temporaryMemberId joinedAt');
      }

      const restaurant = await Restaurant.findOne();

      res.json({
        success: true,
        data: {
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity,
            status: table.status,
            section: table.section,
            qrToken: table.qrCode.token,
          },
          restaurant: {
            name: restaurant?.name || 'Rasrang',
            description: restaurant?.description || 'Modern Indian Dining',
            coverImage: restaurant?.coverImage || '',
            logo: restaurant?.logo || '',
            currency: restaurant?.currency || '₹',
            openingTime: restaurant?.openingTime,
            closingTime: restaurant?.closingTime,
          },
          activeSession: activeSession
            ? {
                id: activeSession._id,
                sessionNumber: activeSession.sessionNumber,
                status: activeSession.status,
                startedAt: activeSession.startedAt,
                memberCount: activeSession.memberCount,
              }
            : null,
          existingMembers: members,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Download QR code buffer as PNG
  async downloadQrImage(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const table = await Table.findOne({ 'qrCode.token': token });
      if (!table) throw new AppError('Table QR token not found', 404);

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const scanUrl = `${frontendUrl}/q/${table.qrCode.token}`;
      const buffer = await generateQrBuffer(scanUrl);

      res.setHeader('Content-Type', 'image/png');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="DineFlow-Table-${table.tableNumber}-QR.png"`
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  // Phase 11: Get full live state for a specific table (members, orders, bill, requests, payment, timeline)
  async getTableLiveDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const table = await Table.findById(id);
      if (!table) throw new AppError('Table not found', 404);

      // Find active or most recent session
      let session = null;
      if (table.activeSessionId) {
        session = await TableSession.findById(table.activeSessionId);
      }
      if (!session) {
        session = await TableSession.findOne({ tableId: table._id, status: { $ne: 'COMPLETED' } }).sort({ createdAt: -1 });
      }

      let members: any[] = [];
      let orders: any[] = [];
      let requests: any[] = [];
      let payment: any = null;
      let currentBill = {
        subtotal: 0,
        tax: 0,
        serviceCharge: 0,
        grandTotal: 0,
        itemCount: 0,
      };
      const timeline: any[] = [];

      if (session) {
        // Members
        members = await SessionMember.find({ sessionId: session._id, active: true }).sort({ joinedAt: 1 });

        // Orders
        orders = await Order.find({ session: session._id }).sort({ roundNumber: 1, createdAt: 1 });

        // Service Requests
        requests = await StaffRequest.find({ session: session._id }).sort({ createdAt: -1 });

        // Payment
        payment = await Payment.findOne({ session: session._id, status: 'SUCCESS' }).sort({ createdAt: -1 });

        // Bill calculation
        const restaurant = await Restaurant.findOne();
        const taxRate = restaurant?.taxRate ?? 5;
        const serviceRate = restaurant?.serviceChargeRate ?? 5;

        let subtotal = 0;
        let itemCount = 0;
        orders.forEach((ord: any) => {
          if (ord.status !== 'CANCELLED') {
            ord.items.forEach((it: any) => {
              if (it.status !== 'CANCELLED') {
                subtotal += it.priceSnapshot * it.quantity;
                itemCount += it.quantity;
              }
            });
          }
        });

        const tax = (subtotal * taxRate) / 100;
        const serviceCharge = (subtotal * serviceRate) / 100;
        const grandTotal = subtotal + tax + serviceCharge;

        currentBill = {
          subtotal,
          tax,
          serviceCharge,
          grandTotal,
          itemCount,
        };

        // Build Chronological Timeline
        timeline.push({
          type: 'SESSION_STARTED',
          title: `Session #${session.sessionNumber} Opened`,
          time: session.startedAt,
          description: `Table ${table.tableNumber} occupied and QR session started`,
        });

        members.forEach((m) => {
          timeline.push({
            type: 'MEMBER_JOINED',
            title: `${m.displayName} Joined Table`,
            time: m.joinedAt,
            description: `Seated at Table ${table.tableNumber}`,
          });
        });

        orders.forEach((ord: any) => {
          timeline.push({
            type: 'ORDER_PLACED',
            title: `Round #${ord.roundNumber} Sent to Kitchen`,
            time: ord.createdAt,
            description: `${ord.items.length} items ordered by ${ord.placedByMemberName}`,
          });

          if (ord.acceptedAt) {
            timeline.push({
              type: 'ORDER_ACCEPTED',
              title: `Round #${ord.roundNumber} Accepted by Chef`,
              time: ord.acceptedAt,
              description: 'Kitchen queued dishes',
            });
          }

          if (ord.preparingAt) {
            timeline.push({
              type: 'ORDER_PREPARING',
              title: `Round #${ord.roundNumber} Cooking on Stations`,
              time: ord.preparingAt,
              description: 'Dishes in active preparation',
            });
          }

          if (ord.readyAt) {
            timeline.push({
              type: 'ORDER_READY',
              title: `Round #${ord.roundNumber} Ready on Kitchen Pass`,
              time: ord.readyAt,
              description: 'Waiting for waiter pickup',
            });
          }

          if (ord.servedAt) {
            timeline.push({
              type: 'ORDER_SERVED',
              title: `Round #${ord.roundNumber} Served to Guests`,
              time: ord.servedAt,
              description: 'Delivered to table',
            });
          }
        });

        requests.forEach((r: any) => {
          timeline.push({
            type: 'REQUEST_MADE',
            title: `Assistance: ${r.requestType}`,
            time: r.requestedAt,
            description: r.notes ? `"${r.notes}"` : `Status: ${r.status}`,
          });
        });

        if (payment) {
          timeline.push({
            type: 'PAYMENT_COMPLETED',
            title: `Payment Settled (${payment.paymentMethod})`,
            time: payment.createdAt,
            description: `Txn: ${payment.transactionId} • ₹${payment.amount.toFixed(2)}`,
          });
        }

        // Sort timeline chronologically
        timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      }

      res.json({
        success: true,
        data: {
          table,
          session,
          members,
          orders,
          currentBill,
          requests,
          payment,
          timeline,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Reset all tables to AVAILABLE and clear lingering sessions
  async resetAllTables(_req: Request, res: Response, next: NextFunction) {
    try {
      await Table.updateMany(
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

      await TableSession.updateMany(
        { status: { $ne: 'COMPLETED' } },
        {
          $set: {
            status: 'COMPLETED',
            paymentStatus: 'PAID',
            endedAt: new Date(),
          },
        }
      );

      await SessionMember.updateMany({ active: true }, { $set: { active: false } });

      await Order.updateMany(
        { status: { $nin: ['COMPLETED', 'CANCELLED'] } },
        { $set: { status: 'COMPLETED', completedAt: new Date() } }
      );

      await StaffRequest.updateMany(
        { status: { $ne: 'COMPLETED' } },
        { $set: { status: 'COMPLETED', completedAt: new Date() } }
      );

      // Fetch all refreshed tables and broadcast to all connected staff & guests
      const allTables = await Table.find().sort({ tableNumber: 1 });
      for (const t of allTables) {
        socketBroadcaster.emitTableUpdated(t.toObject());
      }

      res.json({
        success: true,
        message: 'All restaurant tables initialized to fresh AVAILABLE state with 0 active customers.',
        data: allTables,
      });
    } catch (err) {
      next(err);
    }
  },
};
