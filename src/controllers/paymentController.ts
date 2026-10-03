import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment.js';
import { Invoice } from '../models/Invoice.js';
import { TableSession } from '../models/TableSession.js';
import { Table } from '../models/Table.js';
import { Order } from '../models/Order.js';
import { SessionMember } from '../models/SessionMember.js';
import { StaffRequest } from '../models/StaffRequest.js';
import { Restaurant } from '../models/Restaurant.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { ORDER_STATUSES } from '../config/constants.js';
import { socketBroadcaster } from '../sockets/socketServer.js';
import { generateInvoicePdf } from '../utils/pdf.js';
import { logger } from '../utils/logger.js';

// Helper: Calculate bill components from immutable orders on the server
export async function calculateSessionBill(
  sessionId: string | mongoose.Types.ObjectId,
  splitMode: 'FULL' | 'OWN_ITEMS' | 'EQUAL' | 'CUSTOM' = 'FULL',
  customerMemberId?: string,
  splitCount: number = 1,
  customAmount?: number
) {
  const session = await TableSession.findById(sessionId);
  if (!session) throw new Error('Table session not found');

  const restaurant = await Restaurant.findOne();
  const taxRate = restaurant?.taxRate ?? 5;
  const serviceRate = restaurant?.serviceChargeRate ?? 5;
  const currency = restaurant?.currency ?? '₹';

  // Fetch all non-cancelled orders for session
  const orders = await Order.find({
    session: session._id,
    status: { $ne: ORDER_STATUSES.CANCELLED },
  }).sort({ roundNumber: 1 });

  // Compute full table subtotal and item list
  let fullSubtotal = 0;
  const allBillItems: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
    orderedBy?: string;
    roundNumber?: number;
    sessionMemberId?: string;
  }> = [];

  const memberBreakdownMap = new Map<
    string,
    {
      memberId: string;
      memberName: string;
      itemSubtotal: number;
      items: Array<{ name: string; quantity: number; price: number; total: number; roundNumber: number }>;
    }
  >();

  orders.forEach((order) => {
    order.items.forEach((item) => {
      if (item.status === ORDER_STATUSES.CANCELLED) return;
      const itemTotal = item.priceSnapshot * item.quantity;
      fullSubtotal += itemTotal;

      const memberKey = item.sessionMemberId || 'guest';
      const memberName = item.sessionMemberName || 'Guest';

      allBillItems.push({
        name: item.name,
        quantity: item.quantity,
        price: item.priceSnapshot,
        total: itemTotal,
        orderedBy: memberName,
        roundNumber: order.roundNumber,
        sessionMemberId: item.sessionMemberId,
      });

      if (!memberBreakdownMap.has(memberKey)) {
        memberBreakdownMap.set(memberKey, {
          memberId: memberKey,
          memberName,
          itemSubtotal: 0,
          items: [],
        });
      }

      const memberData = memberBreakdownMap.get(memberKey)!;
      memberData.itemSubtotal += itemTotal;
      memberData.items.push({
        name: item.name,
        quantity: item.quantity,
        price: item.priceSnapshot,
        total: itemTotal,
        roundNumber: order.roundNumber,
      });
    });
  });

  const fullTax = Math.round(((fullSubtotal * taxRate) / 100) * 100) / 100;
  const fullService = Math.round(((fullSubtotal * serviceRate) / 100) * 100) / 100;
  const fullGrandTotal = Math.round((fullSubtotal + fullTax + fullService) * 100) / 100;

  // Compute member splits with proportional tax and service
  const memberSplits = Array.from(memberBreakdownMap.values()).map((m) => {
    const proportion = fullSubtotal > 0 ? m.itemSubtotal / fullSubtotal : 0;
    const memberTax = Math.round(fullTax * proportion * 100) / 100;
    const memberService = Math.round(fullService * proportion * 100) / 100;
    const memberGrandTotal = Math.round((m.itemSubtotal + memberTax + memberService) * 100) / 100;

    return {
      ...m,
      proportionalTax: memberTax,
      proportionalService: memberService,
      grandTotal: memberGrandTotal,
    };
  });

  // Calculate specific split requested
  let activeSubtotal = fullSubtotal;
  let activeTax = fullTax;
  let activeService = fullService;
  let activeTotal = fullGrandTotal;
  let activeItems = allBillItems;

  if (splitMode === 'OWN_ITEMS' && customerMemberId) {
    const ownSplit = memberSplits.find(
      (m) => m.memberId === customerMemberId || m.memberName.toLowerCase() === customerMemberId.toLowerCase()
    );
    if (ownSplit) {
      activeSubtotal = ownSplit.itemSubtotal;
      activeTax = ownSplit.proportionalTax;
      activeService = ownSplit.proportionalService;
      activeTotal = ownSplit.grandTotal;
      activeItems = allBillItems.filter(
        (i) => i.sessionMemberId === customerMemberId || i.orderedBy?.toLowerCase() === customerMemberId.toLowerCase()
      );
    }
  } else if (splitMode === 'EQUAL') {
    const count = Math.max(1, splitCount || session.memberCount || 2);
    activeSubtotal = Math.round((fullSubtotal / count) * 100) / 100;
    activeTax = Math.round((fullTax / count) * 100) / 100;
    activeService = Math.round((fullService / count) * 100) / 100;
    activeTotal = Math.round((fullGrandTotal / count) * 100) / 100;
  } else if (splitMode === 'CUSTOM' && customAmount && customAmount > 0) {
    const ratio = fullGrandTotal > 0 ? customAmount / fullGrandTotal : 1;
    activeSubtotal = Math.round(fullSubtotal * ratio * 100) / 100;
    activeTax = Math.round(fullTax * ratio * 100) / 100;
    activeService = Math.round(fullService * ratio * 100) / 100;
    activeTotal = Math.round(customAmount * 100) / 100;
  }

  return {
    session,
    restaurant: {
      name: restaurant?.name || 'Rasrang Modern Indian Dining',
      address: restaurant?.address || 'Plot 42, Galleria Boulevard, Sector 29, Gurugram',
      currency,
      taxRate,
      serviceRate,
      gstNumber: restaurant?.gstNumber || '07AAAAA0000A1Z5',
    },
    orders,
    fullBill: {
      subtotal: fullSubtotal,
      tax: fullTax,
      serviceCharge: fullService,
      grandTotal: fullGrandTotal,
      itemCount: allBillItems.reduce((acc, i) => acc + i.quantity, 0),
      items: allBillItems,
    },
    memberSplits,
    selectedSplit: {
      mode: splitMode,
      subtotal: activeSubtotal,
      tax: activeTax,
      serviceCharge: activeService,
      total: activeTotal,
      items: activeItems,
    },
  };
}

export const paymentController = {
  // 1. Get structured bill summary with all split modes (Phase 12 requirement)
  async getBillSummary(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { splitMode = 'FULL', memberId, splitCount = 1, customAmount } = req.query;

      const billCalculation = await calculateSessionBill(
        sessionId,
        splitMode as any,
        memberId as string,
        Number(splitCount) || 1,
        customAmount ? Number(customAmount) : undefined
      );

      // Check existing payment record
      const existingPayment = await Payment.findOne({ session: billCalculation.session._id }).sort({ createdAt: -1 });

      return res.json({
        success: true,
        data: {
          session: {
            id: billCalculation.session._id,
            sessionNumber: billCalculation.session.sessionNumber,
            tableNumber: billCalculation.session.tableNumber,
            status: billCalculation.session.status,
            startedAt: billCalculation.session.startedAt,
            endedAt: billCalculation.session.endedAt,
          },
          restaurant: billCalculation.restaurant,
          orders: billCalculation.orders,
          summary: {
            subtotal: billCalculation.fullBill.subtotal,
            tax: billCalculation.fullBill.tax,
            serviceCharge: billCalculation.fullBill.serviceCharge,
            grandTotal: billCalculation.fullBill.grandTotal,
            itemCount: billCalculation.fullBill.itemCount,
            items: billCalculation.fullBill.items,
          },
          memberSplits: billCalculation.memberSplits,
          selectedSplit: billCalculation.selectedSplit,
          payment: existingPayment || null,
        },
      });
    } catch (err: any) {
      logger.error('Error calculating bill summary:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 2. PHASE 13: POST /api/payments/demo/create
  // Creates payment record with CREATED status, calculating amounts strictly on the server
  async createDemoPayment(req: Request, res: Response) {
    try {
      const {
        sessionId,
        splitMode = 'FULL',
        customerMemberId,
        splitCount = 1,
        customAmount,
        paymentMethod = 'UPI',
        payerName = 'Guest',
      } = req.body;

      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId is required' });
      }

      const session = await TableSession.findById(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      if (session.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: 'This dining session is already settled and closed.',
        });
      }

      // Check duplicate payment prevention
      const existingSuccess = await Payment.findOne({
        session: session._id,
        status: 'SUCCESS',
      });
      if (existingSuccess && splitMode === 'FULL') {
        return res.status(400).json({
          success: false,
          error: 'A successful full payment has already been recorded for this session.',
          payment: existingSuccess,
        });
      }

      // Server recalculates the bill - NEVER trust frontend amounts
      const calculation = await calculateSessionBill(
        session._id,
        splitMode,
        customerMemberId,
        Number(splitCount) || 1,
        customAmount ? Number(customAmount) : undefined
      );

      const amountToCharge = calculation.selectedSplit.total;
      if (amountToCharge <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Calculated bill total is zero or negative. Cannot initiate payment.',
        });
      }

      // Generate demo transaction ID e.g. DF-DEMO-829104
      const demoTransactionId = `DF-DEMO-${Math.floor(100000 + Math.random() * 900000)}`;

      // Create new payment record with CREATED status
      const payment = new Payment({
        session: session._id,
        sessionId: session._id,
        tableNumber: session.tableNumber,
        amount: amountToCharge,
        subtotal: calculation.selectedSplit.subtotal,
        tax: calculation.selectedSplit.tax,
        serviceCharge: calculation.selectedSplit.serviceCharge,
        currency: calculation.restaurant.currency,
        method: paymentMethod,
        paymentMethod,
        status: 'CREATED',
        demoTransactionId,
        transactionId: demoTransactionId,
        splitType: splitMode,
        payerName,
        payerMemberId: customerMemberId,
        customerMemberId,
      });

      const savedPayment = await payment.save();

      return res.status(201).json({
        success: true,
        data: {
          paymentId: savedPayment._id,
          demoTransactionId,
          amount: amountToCharge,
          currency: calculation.restaurant.currency,
          status: savedPayment.status,
          breakdown: calculation.selectedSplit,
        },
      });
    } catch (err: any) {
      logger.error('Error creating demo payment:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 3. PHASE 13: POST /api/payments/demo/confirm
  // Confirms demo payment, generates transaction ID, updates payment, creates invoice, updates session
  async confirmDemoPayment(req: Request, res: Response) {
    try {
      const {
        paymentId,
        paymentMethod = 'UPI',
        demoDetails,
        simulateResult = 'SUCCESS', // 'SUCCESS' or 'FAILED' for predictable testing
        failureReason,
      } = req.body;

      if (!paymentId) {
        return res.status(400).json({ success: false, error: 'paymentId is required' });
      }

      const payment = await Payment.findById(paymentId);
      if (!payment) {
        return res.status(404).json({ success: false, error: 'Payment record not found' });
      }

      if (payment.status === 'SUCCESS') {
        return res.status(400).json({
          success: false,
          error: 'This payment has already been confirmed as SUCCESS.',
          payment,
        });
      }

      const session = await TableSession.findById(payment.session);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Table session not found' });
      }

      // Handle predictable simulated failure for testing
      if (simulateResult === 'FAILED' || demoDetails?.upiVpa?.toLowerCase().includes('fail')) {
        payment.status = 'FAILED';
        payment.failureReason =
          failureReason || 'Demo payment could not be completed (Simulated Provider Decline).';
        payment.paymentDetails = demoDetails;
        await payment.save();

        return res.status(400).json({
          success: false,
          error: 'Demo payment could not be completed.',
          data: {
            payment,
          },
        });
      }

      // Recalculate bill for official Invoice creation
      const billData = await calculateSessionBill(
        session._id,
        payment.splitType as any,
        payment.customerMemberId || payment.payerMemberId
      );

      // Create official Invoice
      const invoiceNumber = `INV-${new Date().getFullYear()}-${session.sessionNumber.replace('#', '')}-${payment.demoTransactionId.replace('DF-DEMO-', '')}`;

      const invoiceItems = billData.selectedSplit.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        total: i.total,
        orderedBy: i.orderedBy,
        roundNumber: i.roundNumber,
      }));

      const invoice = new Invoice({
        invoiceNumber,
        restaurant: billData.restaurant.name,
        address: billData.restaurant.address,
        gstNumber: billData.restaurant.gstNumber,
        table: session.tableNumber,
        session: session._id,
        items: invoiceItems,
        quantities: invoiceItems.reduce((acc, i) => acc + i.quantity, 0),
        subtotal: payment.subtotal,
        tax: payment.tax,
        taxRate: billData.restaurant.taxRate,
        serviceCharge: payment.serviceCharge,
        serviceChargeRate: billData.restaurant.serviceRate,
        total: payment.amount,
        paymentMethod: paymentMethod || payment.paymentMethod,
        transactionId: payment.demoTransactionId,
        status: 'PAID',
        splitType: payment.splitType || 'FULL',
        payerName: payment.payerName,
        payerMemberId: payment.customerMemberId || payment.payerMemberId,
        paidAt: new Date(),
      });

      const savedInvoice = await invoice.save();

      // Update payment to SUCCESS
      payment.status = 'SUCCESS';
      payment.completedAt = new Date();
      payment.paymentMethod = paymentMethod;
      payment.method = paymentMethod;
      payment.paymentDetails = demoDetails;
      payment.invoiceId = savedInvoice._id as any;
      await payment.save();

      // Update TableSession: Mark completed and release table if full bill or final payment
      session.paymentStatus = 'PAID';
      session.status = 'COMPLETED';
      session.subtotal = billData.fullBill.subtotal;
      session.tax = billData.fullBill.tax;
      session.serviceCharge = billData.fullBill.serviceCharge;
      session.totalAmount = billData.fullBill.grandTotal;
      session.endedAt = new Date();
      await session.save();

      // Release Table: make it AVAILABLE for next guests
      const table = await Table.findOne({
        $or: [{ _id: session.tableId }, { tableNumber: session.tableNumber }],
      });
      if (table) {
        table.status = 'AVAILABLE';
        table.activeSessionId = null;
        await table.save();
        socketBroadcaster.emitTableUpdated(table.toObject());
      }

      // Mark all session members as inactive so next session is clean
      await SessionMember.updateMany({ sessionId: session._id }, { active: false });

      // Mark all orders as COMPLETED
      await Order.updateMany(
        { session: session._id, status: { $ne: ORDER_STATUSES.CANCELLED } },
        { status: ORDER_STATUSES.COMPLETED, completedAt: new Date() }
      );

      // Complete all pending staff requests for this session/table
      await StaffRequest.updateMany(
        {
          $or: [{ sessionId: session._id }, { tableNumber: session.tableNumber }],
          status: { $in: ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] },
        },
        { status: 'COMPLETED', completedAt: new Date() }
      );

      // Real-time broadcasts
      socketBroadcaster.emitPaymentCompleted(payment.toObject(), session._id.toString());
      socketBroadcaster.emitSessionUpdated(session._id.toString(), session.toObject());

      // Track Phase 14 Analytics Events
      try {
        await AnalyticsEvent.create({
          eventType: 'PAYMENT_SUCCESS',
          sessionId: session._id.toString(),
          tableNumber: session.tableNumber,
          metadata: {
            amount: payment.amount,
            method: payment.paymentMethod,
            transactionId: payment.demoTransactionId,
            splitType: payment.splitType,
          },
          timestamp: new Date(),
        });

        const durationMinutes = session.startedAt
          ? Math.round((new Date().getTime() - new Date(session.startedAt).getTime()) / 60000)
          : 0;

        await AnalyticsEvent.create({
          eventType: 'SESSION_COMPLETED',
          sessionId: session._id.toString(),
          tableNumber: session.tableNumber,
          metadata: {
            durationMinutes,
            totalAmount: session.totalAmount,
            memberCount: session.memberCount || 1,
          },
          timestamp: new Date(),
        });
      } catch (evtErr) {
        logger.warn('Error recording analytics event for payment:', evtErr);
      }

      logger.info(
        `[DineFlow Pay Demo] Payment SUCCESS: ${payment.demoTransactionId}, Amount: ${payment.currency}${payment.amount}, Table: ${session.tableNumber}`
      );

      return res.status(200).json({
        success: true,
        data: {
          payment,
          invoice: savedInvoice,
          invoiceUrl: `/api/payments/invoice/${session._id}`,
        },
      });
    } catch (err: any) {
      logger.error('Error confirming demo payment:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 4. PHASE 13: GET /api/payments/:id
  async getPaymentById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const payment = await Payment.findById(id).populate('invoiceId').populate('session');
      if (!payment) {
        return res.status(404).json({ success: false, error: 'Payment not found' });
      }
      return res.json({ success: true, data: payment });
    } catch (err: any) {
      logger.error('Error fetching payment by id:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // 5. Download or Stream PDF Tax Invoice (Phase 12 requirement using PDFKit)
  async downloadInvoicePdf(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      const session = await TableSession.findById(sessionId);
      if (!session) {
        return res.status(404).send('Dining session not found');
      }

      let restaurant = await Restaurant.findOne();
      if (!restaurant) {
        restaurant = new Restaurant({
          name: 'Rasrang Modern Indian Dining',
          address: 'Plot 42, Galleria Boulevard, Sector 29, Gurugram',
          gstNumber: '07AAAAA0000A1Z5',
          currency: '₹',
          taxRate: 5,
          serviceChargeRate: 5,
        });
      }

      const orders = await Order.find({
        session: session._id,
        status: { $ne: ORDER_STATUSES.CANCELLED },
      });

      const payment = await Payment.findOne({ session: session._id, status: 'SUCCESS' }).sort({ createdAt: -1 });
      const members = await SessionMember.find({ session: session._id });

      const invoiceRecord = await Invoice.findOne({ session: session._id }).sort({ createdAt: -1 });
      const invoiceNumber = invoiceRecord?.invoiceNumber || `INV-${new Date().getFullYear()}-${session.sessionNumber.replace('#', '')}`;

      const pdfBuffer = await generateInvoicePdf({
        restaurant,
        session,
        orders,
        payment,
        invoiceNumber,
        members: members.map((m) => ({ displayName: m.displayName })),
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="DineFlow-Invoice-${session.tableNumber}-${session.sessionNumber}.pdf"`
      );
      res.setHeader('Content-Length', pdfBuffer.length);

      return res.end(pdfBuffer);
    } catch (err: any) {
      logger.error('Error generating PDF invoice:', err);
      return res.status(500).send(`Failed to generate invoice PDF: ${err.message}`);
    }
  },

  // 6. Backwards compatible payment simulation endpoint
  async simulatePayment(req: Request, res: Response) {
    try {
      const {
        sessionId,
        method = 'UPI',
        payerName = 'Guest',
        payerMemberId,
        paymentDetails,
        shouldFail = false,
      } = req.body;

      // Delegate directly to demo create & confirm flow
      const createReq = {
        body: {
          sessionId,
          paymentMethod: method,
          payerName,
          customerMemberId: payerMemberId,
          splitMode: 'FULL',
        },
      } as Request;

      let paymentId: string = '';
      const createRes = {
        status: (code: number) => ({
          json: (data: any) => {
            if (data.success) {
              paymentId = data.data.paymentId;
            }
          },
        }),
      } as unknown as Response;

      await paymentController.createDemoPayment(createReq, createRes);

      if (!paymentId) {
        const fallbackPayment = await Payment.findOne({ session: sessionId }).sort({ createdAt: -1 });
        if (fallbackPayment) paymentId = fallbackPayment._id.toString();
      }

      if (!paymentId) {
        return res.status(400).json({ success: false, error: 'Could not initialize payment transaction.' });
      }

      // Now confirm with shouldFail simulation
      const confirmReq = {
        body: {
          paymentId,
          paymentMethod: method,
          demoDetails: paymentDetails,
          simulateResult: shouldFail ? 'FAILED' : 'SUCCESS',
        },
      } as Request;

      return await paymentController.confirmDemoPayment(confirmReq, res);
    } catch (err: any) {
      logger.error('Error in backward-compatible simulatePayment:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  // Get all settled invoices / billing records for owner & manager
  async getAllInvoices(req: Request, res: Response) {
    try {
      const { table, status, search } = req.query;
      const query: any = {};
      if (table && table !== 'ALL') query.table = String(table);
      if (status && status !== 'ALL') query.status = String(status);
      if (search) {
        query.$or = [
          { invoiceNumber: { $regex: String(search), $options: 'i' } },
          { payerName: { $regex: String(search), $options: 'i' } },
          { transactionId: { $regex: String(search), $options: 'i' } },
        ];
      }

      const invoices = await Invoice.find(query).sort({ createdAt: -1 });

      const totalRevenue = invoices
        .filter((inv) => inv.status === 'PAID')
        .reduce((sum, inv) => sum + (inv.total || 0), 0);
      const totalTax = invoices
        .filter((inv) => inv.status === 'PAID')
        .reduce((sum, inv) => sum + (inv.tax || 0), 0);

      return res.json({
        success: true,
        data: invoices,
        count: invoices.length,
        summary: {
          totalRevenue,
          totalTax,
          paidCount: invoices.filter((inv) => inv.status === 'PAID').length,
          avgTicket: invoices.length > 0 ? Math.round(totalRevenue / invoices.length) : 0,
        },
      });
    } catch (err: any) {
      logger.error('Error fetching invoices:', err);
      return res.status(500).json({ success: false, message: err.message || 'Failed to fetch invoices' });
    }
  },
};
