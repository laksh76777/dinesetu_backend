import { Request, Response } from 'express';
import mongoose from 'express';
import { Order, IOrderItem } from '../models/Order.js';
import { TableSession } from '../models/TableSession.js';
import { SessionMember } from '../models/SessionMember.js';
import { Table } from '../models/Table.js';
import { MenuItem } from '../models/MenuItem.js';
import { Restaurant } from '../models/Restaurant.js';
import { ORDER_STATUSES, KITCHEN_STATIONS, KitchenStation } from '../config/constants.js';
import { socketBroadcaster } from '../sockets/socketServer.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { logger } from '../utils/logger.js';

export const orderController = {
  // 1. Place a new order / round for a table session
  async placeOrder(req: Request, res: Response) {
    try {
      const { sessionId, memberId, memberName, items } = req.body;

      if (!sessionId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Session ID and a non-empty items list are required',
        });
      }

      // Verify Session
      const session = await TableSession.findById(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Table session not found' });
      }

      if (session.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: 'This dining session is already completed and closed',
        });
      }

      if (session.status === 'PAYMENT_PENDING') {
        return res.status(400).json({
          success: false,
          error: 'Bill has already been requested for this table. Additional rounds are locked.',
        });
      }

      // Verify Member
      let validatedMemberName = (memberName || 'Guest').trim();
      let validatedMemberId = (memberId || 'guest').trim();
      if (memberId && memberId !== 'guest') {
        const memberRecord = await SessionMember.findOne({
          sessionId: session._id,
          temporaryMemberId: memberId,
          active: true,
        });
        if (memberRecord) {
          validatedMemberName = memberRecord.displayName;
          validatedMemberId = memberRecord.temporaryMemberId;
        } else {
          // Auto-register session member so client cannot manipulate fake unlinked members
          const newMember = await SessionMember.create({
            sessionId: session._id,
            displayName: validatedMemberName,
            temporaryMemberId: validatedMemberId,
            active: true,
          });
          validatedMemberName = newMember.displayName;
        }
      }

      // Get Table
      const table = await Table.findById(session.tableId);
      if (!table) {
        return res.status(404).json({ success: false, error: 'Associated table not found' });
      }

      // Snapshot prices and validate items against DB (Client price manipulation rejected)
      const itemIds = items.map((i: any) => i.menuItemId);
      const dbMenuItems = await MenuItem.find({ _id: { $in: itemIds } });
      const menuItemMap = new Map(dbMenuItems.map((m) => [m._id.toString(), m]));

      const preparedOrderItems: IOrderItem[] = [];

      for (const item of items) {
        const dbItem = menuItemMap.get(item.menuItemId);
        if (!dbItem) {
          return res.status(400).json({
            success: false,
            error: `Menu item with ID ${item.menuItemId} no longer exists`,
          });
        }

        if (!dbItem.available) {
          return res.status(400).json({
            success: false,
            error: `"${dbItem.name}" is currently 86'd (out of stock)`,
          });
        }

        const quantity = Math.max(1, parseInt(item.quantity) || 1);

        // Preserve all required item attributes: menuItem, customer, session, quantity, price snapshot, notes, station
        preparedOrderItems.push({
          menuItem: dbItem._id,
          name: dbItem.name,
          priceSnapshot: dbItem.price, // Immutable historical price snapshot - client price ignored!
          quantity,
          session: session._id,
          sessionMemberId: (item.sessionMemberId || validatedMemberId).trim(),
          sessionMemberName: (item.sessionMemberName || validatedMemberName).trim(),
          notes: (item.notes || '').trim(),
          kitchenStation: (dbItem.kitchenStationId as KitchenStation) || KITCHEN_STATIONS.MAIN_KITCHEN,
          status: ORDER_STATUSES.PLACED,
        });
      }

      // Determine Round Number
      const existingRounds = await Order.countDocuments({ session: session._id });
      const roundNumber = existingRounds + 1;

      // Create Order
      const newOrder = new Order({
        session: session._id,
        table: table._id,
        tableNumber: table.tableNumber,
        roundNumber,
        status: ORDER_STATUSES.PLACED,
        items: preparedOrderItems,
        placedByMemberId: validatedMemberId,
        placedByMemberName: validatedMemberName,
      });

      const savedOrder = await newOrder.save();

      // Record Phase 14 Telemetry Event
      AnalyticsEvent.create({
        eventType: 'ORDER_CREATED',
        sessionId: session._id.toString(),
        tableNumber: table.tableNumber,
        metadata: {
          roundNumber,
          itemCount: preparedOrderItems.length,
          placedBy: validatedMemberName,
        },
        timestamp: new Date(),
      }).catch(() => {});

      // Update Table Status to PREPARING
      table.status = 'PREPARING';
      await table.save();

      // Recalculate session totals
      const restaurant = await Restaurant.findOne();
      const taxRate = restaurant?.taxRate ?? 5;
      const serviceRate = restaurant?.serviceChargeRate ?? 5;

      const allSessionOrders = await Order.find({
        session: session._id,
        status: { $ne: ORDER_STATUSES.CANCELLED },
      });

      let subtotal = 0;
      allSessionOrders.forEach((ord) => {
        ord.items.forEach((it) => {
          if (it.status !== ORDER_STATUSES.CANCELLED) {
            subtotal += it.priceSnapshot * it.quantity;
          }
        });
      });

      const tax = (subtotal * taxRate) / 100;
      const serviceCharge = (subtotal * serviceRate) / 100;
      const totalAmount = subtotal + tax + serviceCharge;

      session.subtotal = subtotal;
      session.tax = tax;
      session.serviceCharge = serviceCharge;
      session.totalAmount = totalAmount;
      await session.save();

      // Real-time broadcasts
      socketBroadcaster.emitNewOrder(savedOrder.toObject(), session._id.toString());
      socketBroadcaster.emitTableUpdated(table.toObject());
      socketBroadcaster.emitSessionUpdated(session._id.toString(), session.toObject());

      logger.info(
        `Order Round #${roundNumber} placed for Table ${table.tableNumber} by ${memberName || 'Guest'} (${savedOrder.items.length} items)`
      );

      return res.status(201).json({
        success: true,
        data: savedOrder,
        sessionTotals: {
          subtotal,
          tax,
          serviceCharge,
          totalAmount,
        },
      });
    } catch (err: any) {
      logger.error('Error placing order:', err);
      return res.status(500).json({ success: false, error: err.message || 'Failed to place order' });
    }
  },

  // 2. Get all orders for a specific dining session
  async getSessionOrders(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const orders = await Order.find({ session: sessionId })
        .sort({ roundNumber: 1, createdAt: 1 })
        .populate('items.menuItem', 'name image foodType spiceLevel');

      return res.json({ success: true, data: orders });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 3. Kitchen KDS: Get all active tickets for kitchen displays
  async getActiveKitchenOrders(req: Request, res: Response) {
    try {
      const { station } = req.query;

      const activeStatuses = [
        ORDER_STATUSES.PLACED,
        ORDER_STATUSES.ACCEPTED,
        ORDER_STATUSES.PREPARING,
        ORDER_STATUSES.READY,
      ];

      const query: any = { status: { $in: activeStatuses } };

      const orders = await Order.find(query)
        .sort({ createdAt: 1 }) // FIFO queue
        .populate('items.menuItem', 'name image foodType spiceLevel preparationTime kitchenStationId');

      let filteredOrders = orders;
      if (station && station !== 'ALL') {
        filteredOrders = orders.filter((ord) =>
          ord.items.some((item) => item.kitchenStation === station)
        );
      }

      return res.json({ success: true, data: filteredOrders });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 4. Update individual item status inside an order
  async updateOrderItemStatus(req: Request, res: Response) {
    try {
      const { orderId, itemId } = req.params;
      const { status } = req.body;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      const item = order.items.find((i) => i._id?.toString() === itemId);
      if (!item) {
        return res.status(404).json({ success: false, error: 'Order item not found' });
      }

      item.status = status;
      if (status === ORDER_STATUSES.READY) {
        item.preparedAt = new Date();
      } else if (status === ORDER_STATUSES.SERVED) {
        item.servedAt = new Date();
      }

      // Check if all non-cancelled items are ready
      const nonCancelled = order.items.filter((i) => i.status !== ORDER_STATUSES.CANCELLED);
      const allReady = nonCancelled.length > 0 && nonCancelled.every((i) => i.status === ORDER_STATUSES.READY);
      const allServed = nonCancelled.length > 0 && nonCancelled.every((i) => i.status === ORDER_STATUSES.SERVED);
      const anyPreparing = nonCancelled.some(
        (i) => i.status === ORDER_STATUSES.PREPARING || i.status === ORDER_STATUSES.ACCEPTED
      );

      if (allServed) {
        order.status = ORDER_STATUSES.SERVED;
        order.servedAt = new Date();
      } else if (allReady) {
        order.status = ORDER_STATUSES.READY;
        order.readyAt = new Date();
      } else if (anyPreparing && order.status === ORDER_STATUSES.PLACED) {
        order.status = ORDER_STATUSES.PREPARING;
        order.preparingAt = new Date();
      }

      await order.save();

      // If order became READY, update table status to READY
      if (order.status === ORDER_STATUSES.READY) {
        const table = await Table.findById(order.table);
        if (table && table.status !== 'PAYMENT') {
          table.status = 'READY';
          await table.save();
          socketBroadcaster.emitTableUpdated(table.toObject());
        }
      }

      socketBroadcaster.emitOrderUpdated(order.toObject(), order.session.toString());

      return res.json({ success: true, data: order });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 5. Update entire order status (e.g. ACCEPTED -> PREPARING -> READY -> CANCELLED)
  async updateOrderStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { status, cancelReason } = req.body;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      order.status = status;
      const now = new Date();

      if (status === ORDER_STATUSES.ACCEPTED) {
        order.acceptedAt = now;
      } else if (status === ORDER_STATUSES.PREPARING) {
        order.preparingAt = now;
        order.items.forEach((it) => {
          if (it.status === ORDER_STATUSES.PLACED) it.status = ORDER_STATUSES.PREPARING;
        });
      } else if (status === ORDER_STATUSES.READY) {
        order.readyAt = now;
        order.items.forEach((it) => {
          if (it.status !== ORDER_STATUSES.CANCELLED && it.status !== ORDER_STATUSES.SERVED) {
            it.status = ORDER_STATUSES.READY;
            it.preparedAt = now;
          }
        });

        // Update Table status to READY
        const table = await Table.findById(order.table);
        if (table && table.status !== 'PAYMENT') {
          table.status = 'READY';
          await table.save();
          socketBroadcaster.emitTableUpdated(table.toObject());
        }
      } else if (status === ORDER_STATUSES.SERVED) {
        order.servedAt = now;
        order.items.forEach((it) => {
          if (it.status !== ORDER_STATUSES.CANCELLED) {
            it.status = ORDER_STATUSES.SERVED;
            it.servedAt = now;
          }
        });

        AnalyticsEvent.create({
          eventType: 'ORDER_COMPLETED',
          sessionId: order.session.toString(),
          tableNumber: order.tableNumber,
          metadata: { roundNumber: order.roundNumber, orderId: order._id.toString() },
          timestamp: new Date(),
        }).catch(() => {});
      } else if (status === ORDER_STATUSES.CANCELLED) {
        order.cancelledAt = now;
        order.cancelReason = cancelReason || 'Cancelled by staff';
        order.items.forEach((it) => {
          it.status = ORDER_STATUSES.CANCELLED;
        });
      }

      await order.save();

      const orderObj = order.toObject();
      const sessionIdStr = order.session.toString();

      if (status === ORDER_STATUSES.ACCEPTED) {
        socketBroadcaster.emitOrderAccepted(orderObj, sessionIdStr);
      } else if (status === ORDER_STATUSES.PREPARING) {
        socketBroadcaster.emitOrderPreparing(orderObj, sessionIdStr);
      } else if (status === ORDER_STATUSES.READY) {
        socketBroadcaster.emitOrderReady(orderObj, sessionIdStr);
      } else {
        socketBroadcaster.emitOrderUpdated(orderObj, sessionIdStr);
      }

      return res.json({ success: true, data: order });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 6. Waiter marks order as Served
  async serveOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      const now = new Date();
      order.status = ORDER_STATUSES.SERVED;
      order.servedAt = now;
      order.items.forEach((it) => {
        if (it.status !== ORDER_STATUSES.CANCELLED) {
          it.status = ORDER_STATUSES.SERVED;
          it.servedAt = now;
        }
      });

      await order.save();

      // Check if table has any other pending or ready orders
      const pendingOrders = await Order.find({
        table: order.table,
        status: { $in: [ORDER_STATUSES.PLACED, ORDER_STATUSES.PREPARING, ORDER_STATUSES.READY] },
      });

      const table = await Table.findById(order.table);
      if (table && table.status !== 'PAYMENT') {
        const hasReady = pendingOrders.some((o) => o.status === ORDER_STATUSES.READY);
        const hasPreparing = pendingOrders.some(
          (o) => o.status === ORDER_STATUSES.PLACED || o.status === ORDER_STATUSES.PREPARING
        );

        if (hasReady) {
          table.status = 'READY';
        } else if (hasPreparing) {
          table.status = 'PREPARING';
        } else {
          table.status = 'OCCUPIED';
        }
        await table.save();
        socketBroadcaster.emitTableUpdated(table.toObject());
      }

      socketBroadcaster.emitOrderUpdated(order.toObject(), order.session.toString());

      return res.json({ success: true, data: order });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },
};
