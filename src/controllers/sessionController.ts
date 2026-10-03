import { Request, Response, NextFunction } from 'express';
import { Table } from '../models/Table.js';
import { TableSession } from '../models/TableSession.js';
import { SessionMember } from '../models/SessionMember.js';
import { Restaurant } from '../models/Restaurant.js';
import { generateSecureToken, generateSessionNumber } from '../utils/tokens.js';
import { AppError } from '../middleware/errorHandler.js';
import { socketBroadcaster } from '../sockets/socketServer.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';

export const sessionController = {
  // Join or Create Session when customer submits display name
  async joinTableSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { displayName, temporaryMemberId } = req.body;
      const token = req.body.token || req.body.qrToken;

      if (!token) throw new AppError('Table QR token is required', 400);
      if (!displayName || !displayName.trim()) {
        throw new AppError('Please enter your display name to join the dining table', 400);
      }

      // 1. Identify Table by token
      const table = await Table.findOne({ 'qrCode.token': token });
      if (!table) throw new AppError('Invalid table QR code', 404);
      if (!table.active) throw new AppError(`Table ${table.tableNumber} is not active`, 403);
      if (!table.qrCode.active) throw new AppError('This table QR code has been disabled', 403);

      // 2. Find active session for this table
      let session = await TableSession.findOne({
        tableId: table._id,
        status: { $in: ['ACTIVE', 'PAYMENT_PENDING'] },
      });

      let isNewSession = false;

      // 3. Create session if none active
      if (!session) {
        isNewSession = true;
        const sessionNumber = generateSessionNumber();
        session = await TableSession.create({
          tableId: table._id,
          tableNumber: table.tableNumber,
          sessionNumber,
          status: 'ACTIVE',
          startedAt: new Date(),
          memberCount: 0,
          paymentStatus: 'UNPAID',
        });

        // Set table status to OCCUPIED
        table.status = 'OCCUPIED';
        table.activeSessionId = session._id;
        await table.save();
        socketBroadcaster.emitTableUpdated(table);
      }

      // 4. Generate or use existing temporary member identity
      const memberTempId = temporaryMemberId || `guest_${generateSecureToken(12)}`;

      // Check if this member is already in the session
      let member = await SessionMember.findOne({
        sessionId: session._id,
        temporaryMemberId: memberTempId,
      });

      if (!member) {
        member = await SessionMember.create({
          sessionId: session._id,
          displayName: displayName.trim(),
          temporaryMemberId: memberTempId,
          joinedAt: new Date(),
          active: true,
        });

        // Update member count
        const activeMemberCount = await SessionMember.countDocuments({
          sessionId: session._id,
          active: true,
        });
        session.memberCount = activeMemberCount;
        await session.save();
      } else {
        // If returning guest changed name
        member.displayName = displayName.trim();
        member.active = true;
        await member.save();
      }

      // 5. Get full member roster
      const allMembers = await SessionMember.find({
        sessionId: session._id,
        active: true,
      }).select('displayName temporaryMemberId joinedAt');

      // 6. Broadcast real-time session update
      socketBroadcaster.emitSessionUpdated(session._id.toString(), {
        session,
        members: allMembers,
        newMember: member,
      });

      // Record Phase 14 Telemetry Events
      AnalyticsEvent.create({
        eventType: 'QR_SCAN',
        sessionId: session._id.toString(),
        tableNumber: table.tableNumber,
        metadata: { token: token.slice(0, 8) },
        timestamp: new Date(),
      }).catch(() => {});

      if (isNewSession) {
        AnalyticsEvent.create({
          eventType: 'SESSION_STARTED',
          sessionId: session._id.toString(),
          tableNumber: table.tableNumber,
          metadata: { sessionNumber: session.sessionNumber, initiatedBy: member.displayName },
          timestamp: new Date(),
        }).catch(() => {});
      }

      AnalyticsEvent.create({
        eventType: 'SESSION_JOINED',
        sessionId: session._id.toString(),
        tableNumber: table.tableNumber,
        metadata: { memberName: member.displayName, memberCount: allMembers.length },
        timestamp: new Date(),
      }).catch(() => {});

      const restaurant = await Restaurant.findOne();

      res.status(isNewSession ? 201 : 200).json({
        success: true,
        message: `Welcome to Table ${table.tableNumber}, ${member.displayName}!`,
        data: {
          session: {
            id: session._id,
            sessionNumber: session.sessionNumber,
            tableNumber: session.tableNumber,
            status: session.status,
            startedAt: session.startedAt,
            memberCount: session.memberCount,
          },
          currentMember: {
            displayName: member.displayName,
            temporaryMemberId: member.temporaryMemberId,
            joinedAt: member.joinedAt,
          },
          members: allMembers,
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity,
            section: table.section,
          },
          restaurant: {
            name: restaurant?.name || 'Rasrang',
            description: restaurant?.description || 'Modern Indian Dining',
            coverImage: restaurant?.coverImage,
            logo: restaurant?.logo,
            currency: restaurant?.currency || '₹',
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Get active session details & members
  async getSessionDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const session = await TableSession.findById(id).populate('tableId');
      if (!session) throw new AppError('Dining session not found', 404);

      const members = await SessionMember.find({
        sessionId: session._id,
        active: true,
      }).select('displayName temporaryMemberId joinedAt');

      res.json({
        success: true,
        data: {
          session,
          members,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Close / Leave session (Customer leaves table without ordering or finishes dining)
  async leaveOrCloseSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { temporaryMemberId, reason } = req.body;

      const session = await TableSession.findById(id);
      if (!session) throw new AppError('Dining session not found', 404);

      // Check if there are active kitchen orders
      const { Order } = await import('../models/Order.js');
      const activeOrders = await Order.find({
        session: session._id,
        status: { $in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] },
      });

      if (activeOrders.length > 0) {
        return res.status(400).json({
          success: false,
          hasActiveOrders: true,
          message: 'Active kitchen orders exist for this table. Please settle your bill or notify your steward.',
        });
      }

      // Mark member inactive if specified
      if (temporaryMemberId) {
        await SessionMember.updateMany(
          { sessionId: session._id, temporaryMemberId },
          { active: false }
        );
      }

      // Close session and release table
      session.status = 'COMPLETED';
      session.endedAt = new Date();
      session.paymentStatus = 'PAID';
      await session.save();

      // Release Table back to AVAILABLE
      const table = await Table.findById(session.tableId);
      if (table) {
        table.status = 'AVAILABLE';
        table.activeSessionId = null as any;
        await table.save();
        socketBroadcaster.emitTableUpdated(table);
      }

      socketBroadcaster.emitSessionUpdated(session._id.toString(), {
        session,
        closed: true,
        reason: reason || 'GUEST_LEFT',
      });

      return res.json({
        success: true,
        message: `Table ${session.tableNumber} released successfully.`,
        data: { tableNumber: session.tableNumber },
      });
    } catch (err) {
      next(err);
    }
  },
};
