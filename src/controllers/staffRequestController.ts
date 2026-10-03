import { Request, Response } from 'express';
import { StaffRequest } from '../models/StaffRequest.js';
import { TableSession } from '../models/TableSession.js';
import { Table } from '../models/Table.js';
import { STAFF_REQUEST_STATUSES, STAFF_REQUEST_TYPES } from '../config/constants.js';
import { socketBroadcaster } from '../sockets/socketServer.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { logger } from '../utils/logger.js';

export const staffRequestController = {
  // 1. Customer initiates a service assistance request
  async createRequest(req: Request, res: Response) {
    try {
      const { sessionId, tableNumber, memberId, memberName, requestType, notes } = req.body;

      if (!sessionId || !requestType) {
        return res.status(400).json({ success: false, error: 'Session ID and requestType are required' });
      }

      const session = await TableSession.findById(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Table session not found' });
      }

      const effectiveTableNumber = tableNumber || session.tableNumber;

      // Normalize requestType to match Model Enum: 'Water' | 'Cutlery' | 'Call Waiter' | 'Request Bill' | 'Other'
      let normalizedType = requestType;
      const upper = String(requestType).toUpperCase().replace(/[\s_-]+/g, '');
      if (upper === 'WATER') normalizedType = 'Water';
      else if (upper === 'CUTLERY') normalizedType = 'Cutlery';
      else if (upper === 'CALLWAITER' || upper === 'WAITER') normalizedType = 'Call Waiter';
      else if (upper === 'REQUESTBILL' || upper === 'BILL') normalizedType = 'Request Bill';
      else if (upper === 'OTHER') normalizedType = 'Other';

      const newRequest = new StaffRequest({
        session: session._id,
        tableNumber: effectiveTableNumber,
        memberId: memberId || 'guest',
        memberName: memberName || 'Guest',
        requestType: normalizedType,
        notes: (notes || '').trim(),
        status: STAFF_REQUEST_STATUSES.REQUESTED,
        requestedAt: new Date(),
      });

      const savedRequest = await newRequest.save();

      // Record Phase 14 Telemetry Event
      AnalyticsEvent.create({
        eventType: 'STAFF_REQUEST',
        sessionId: session._id.toString(),
        tableNumber: effectiveTableNumber,
        metadata: { requestType, memberName: memberName || 'Guest' },
        timestamp: new Date(),
      }).catch(() => {});

      // If customer requested BILL, update session & table state
      if (requestType === STAFF_REQUEST_TYPES.BILL || requestType === 'BILL' || requestType === 'Request Bill') {
        session.status = 'PAYMENT_PENDING';
        await session.save();

        const table = await Table.findById(session.tableId);
        if (table) {
          table.status = 'PAYMENT';
          await table.save();
          socketBroadcaster.emitTableUpdated(table.toObject());
        }

        socketBroadcaster.emitSessionUpdated(session._id.toString(), session.toObject());
      }

      socketBroadcaster.emitStaffRequest(savedRequest.toObject(), session._id.toString());
      logger.info(`Service Request [${requestType}] created for Table ${effectiveTableNumber} by ${memberName || 'Guest'}`);

      return res.status(201).json({ success: true, data: savedRequest });
    } catch (err: any) {
      logger.error('Error creating staff request:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 2. Waiter / Manager: Get all active assistance alerts
  async getActiveRequests(req: Request, res: Response) {
    try {
      const requests = await StaffRequest.find({
        status: { $ne: STAFF_REQUEST_STATUSES.COMPLETED },
      }).sort({ createdAt: -1 });

      return res.json({ success: true, data: requests });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 3. Waiter acknowledges request ("On my way")
  async acknowledgeRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const staffName = (req as any).user?.name || 'Staff Member';

      const request = await StaffRequest.findById(id);
      if (!request) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }

      request.status = STAFF_REQUEST_STATUSES.IN_PROGRESS;
      request.handledByStaffName = staffName;
      await request.save();

      socketBroadcaster.emitStaffRequest(request.toObject(), request.session.toString());

      return res.json({ success: true, data: request });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 4. Waiter resolves request ("Assistance completed")
  async resolveRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const staffName = (req as any).user?.name || 'Staff Member';

      const request = await StaffRequest.findById(id);
      if (!request) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }

      request.status = STAFF_REQUEST_STATUSES.COMPLETED;
      request.resolvedAt = new Date();
      request.handledByStaffName = staffName;
      await request.save();

      socketBroadcaster.emitStaffRequest(request.toObject(), request.session.toString());

      return res.json({ success: true, data: request });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 5. Update request status (REQUESTED | ACCEPTED | IN_PROGRESS | COMPLETED)
  async updateRequestStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const staffName = (req as any).user?.name || 'Staff Member';

      const request = await StaffRequest.findById(id);
      if (!request) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }

      request.status = status;
      request.handledByStaffName = staffName;
      if (status === STAFF_REQUEST_STATUSES.COMPLETED) {
        request.resolvedAt = new Date();
      }
      await request.save();

      socketBroadcaster.emitStaffRequest(request.toObject(), request.session.toString());

      return res.json({ success: true, data: request });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },
};
