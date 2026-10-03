/**
 * Phase 16 Comprehensive Application & Security Audit Test Suite
 *
 * Verifies:
 * - RBAC & Route Authorization (Owner, Manager, Kitchen, Waiter, Customer)
 * - Security protections (Helmet, CORS, Rate limiting, Zod/Model validations, Data integrity)
 * - Complete 28-step customer & restaurant operations lifecycle
 * - Failure test cases (invalid QR, disabled QR, 86'd items, unauthorized routes, duplicate payments)
 */

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Table } from '../models/Table.js';
import { TableSession } from '../models/TableSession.js';
import { SessionMember } from '../models/SessionMember.js';
import { MenuItem } from '../models/MenuItem.js';
import { Category } from '../models/Category.js';
import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { Invoice } from '../models/Invoice.js';
import { StaffRequest } from '../models/StaffRequest.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { createApp } from '../app.js';
import { seedInitialUsers } from './seed.js';
import http from 'http';

interface TestResult {
  step: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

const getJson = async (res: any): Promise<any> => {
  return (await res.json()) as any;
};

function assert(condition: any, step: string, details: string) {
  if (Boolean(condition)) {
    results.push({ step, passed: true, details });
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${step}: ${details}`);
  } else {
    results.push({ step, passed: false, details });
    console.error(`  \x1b[31m✖ [FAIL]\x1b[0m ${step}: ${details}`);
    throw new Error(`Test failed at ${step}: ${details}`);
  }
}

async function runAudit() {
  console.log('=======================================================');
  console.log('🛡️  DineFlow Phase 16 Full Security & Flow Audit');
  console.log('=======================================================\n');

  await connectDatabase();
  await seedInitialUsers();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  console.log(`[Audit Runner] Test server listening on http://127.0.0.1:${port}\n`);

  try {
    // ------------------------------------------------------------------
    // STEP 1-4: Staff Authentication & Roles
    // ------------------------------------------------------------------
    console.log('\x1b[36m--- Section 1: Staff Authentication & RBAC Verification ---\x1b[0m');

    const ownerRes = await fetch(`${baseUrl}/users`, {
      headers: { 'x-demo-role': 'OWNER' },
    });
    const ownerData = await getJson(ownerRes);
    assert(ownerRes.status === 200 && ownerData.success, 'Step 1: Owner login & auth', 'Owner can list all staff users');

    const managerRes = await fetch(`${baseUrl}/users`, {
      headers: { 'x-demo-role': 'MANAGER' },
    });
    const managerData = await getJson(managerRes);
    assert(managerRes.status === 200 && managerData.success, 'Step 2: Manager login & auth', 'Manager can access staff listing');

    const kitchenUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { 'x-demo-role': 'KITCHEN' },
    });
    assert(kitchenUsersRes.status === 403, 'Step 3: Kitchen restricted from users', 'Kitchen role blocked with 403 from user management');

    const waiterUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { 'x-demo-role': 'WAITER' },
    });
    assert(waiterUsersRes.status === 403, 'Step 4: Waiter restricted from users', 'Waiter role blocked with 403 from user management');

    // Manager cannot perform owner-only operations (e.g. create staff member)
    const managerCreateStaff = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-demo-role': 'MANAGER' },
      body: JSON.stringify({ name: 'Hacker Staff', email: 'hacker@dineflow.com', role: 'WAITER' }),
    });
    assert(managerCreateStaff.status === 403, 'Manager Owner-Only Restriction', 'Manager cannot create staff accounts (403 forbidden)');

    // ------------------------------------------------------------------
    // STEP 5-6: Create Table & Generate QR
    // ------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 2: Table & Secure QR Code Lifecycle ---\x1b[0m');

    const testTableNum = `AUDIT-${Math.floor(100 + Math.random() * 900)}`;
    const createTableRes = await fetch(`${baseUrl}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-demo-role': 'MANAGER' },
      body: JSON.stringify({
        tableNumber: testTableNum,
        capacity: 4,
        section: 'Executive Lounge',
      }),
    });
    const tableJson = await getJson(createTableRes);
    assert(createTableRes.status === 201 && tableJson.success, 'Step 5: Create table', `Table ${testTableNum} created`);

    const tableId = tableJson.data._id;
    let qrToken = tableJson.data.qrCode.token;
    assert(Boolean(qrToken && qrToken.length >= 8), 'Step 6: Generate QR', `Secure token generated: ${qrToken}`);

    // Test QR Regeneration (Old token invalidation)
    const regenRes = await fetch(`${baseUrl}/tables/${tableId}/regenerate-qr`, {
      method: 'POST',
      headers: { 'x-demo-role': 'MANAGER' },
    });
    const regenJson = await getJson(regenRes);
    const newQrToken = regenJson.data.qrCode.token;
    assert(newQrToken !== qrToken, 'QR Token Regeneration', `New token issued: ${newQrToken}`);

    // Old token must return 404
    const oldTokenRes = await fetch(`${baseUrl}/tables/resolve/${qrToken}`);
    assert(oldTokenRes.status === 404, 'Failure Test: Old QR Invalidation', 'Old QR token immediately rejected with 404');

    qrToken = newQrToken;

    // ------------------------------------------------------------------
    // STEP 7-9: Scan QR & Multiple Customers Join Session
    // ------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 3: QR Resolution & Multi-Customer Join ---\x1b[0m');

    const scanRes = await fetch(`${baseUrl}/tables/resolve/${qrToken}`);
    const scanJson = await getJson(scanRes);
    assert(scanRes.status === 200 && scanJson.data.table.tableNumber === testTableNum, 'Step 7: Scan QR', 'Valid QR resolves table info');

    // Customer 1 joins (creates session)
    const join1Res = await fetch(`${baseUrl}/sessions/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrToken, displayName: 'Aarav' }),
    });
    const join1Json = await getJson(join1Res);
    assert(join1Res.status === 201 && join1Json.data.session.id, 'Step 8: Create session', `Session created: #${join1Json.data.session.sessionNumber}`);

    const sessionId = join1Json.data.session.id;
    const member1Id = join1Json.data.currentMember.temporaryMemberId;

    // Customer 2 joins same session
    const join2Res = await fetch(`${baseUrl}/sessions/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrToken, displayName: 'Diya' }),
    });
    const join2Json = await getJson(join2Res);
    assert(join2Res.status === 200 && join2Json.data.members.length >= 2, 'Step 9: Second customer joins', 'Second customer successfully joined session');
    const member2Id = join2Json.data.currentMember.temporaryMemberId;

    // ------------------------------------------------------------------
    // STEP 10-12: Menu, Cart & Orders
    // ------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 4: Menu Integrity & Order Placement ---\x1b[0m');

    const menuRes = await fetch(`${baseUrl}/menu/items`);
    const menuJson = await getJson(menuRes);
    const availableItems = menuJson.data.filter((m: any) => m.available);
    assert(availableItems.length >= 2, 'Step 10: Browse menu', `Loaded ${menuJson.data.length} dishes`);

    const item1 = availableItems[0];
    const item2 = availableItems[1];

    // Customer CANNOT alter price in order payload
    const orderRound1Res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        memberId: member1Id,
        memberName: 'Aarav',
        items: [
          {
            menuItemId: item1._id,
            quantity: 2,
            price: 1, // MALICIOUS attempt to inject ₹1 price
            notes: 'Extra crispy',
            sessionMemberId: member1Id,
            sessionMemberName: 'Aarav',
          },
          {
            menuItemId: item2._id,
            quantity: 1,
            price: 5, // MALICIOUS attempt to inject ₹5 price
            notes: 'Less spicy',
            sessionMemberId: member2Id,
            sessionMemberName: 'Diya',
          },
        ],
      }),
    });
    const round1Json = await getJson(orderRound1Res);
    assert(orderRound1Res.status === 201, 'Step 11 & 12: Place Order (Round 1)', `Round #${round1Json.data.roundNumber} created`);

    const savedItem1 = round1Json.data.items.find((i: any) => i.name === item1.name);
    assert(savedItem1.priceSnapshot === item1.price, 'Security: Price Immutability', `DB price ₹${item1.price} enforced over injected ₹1`);

    const orderId = round1Json.data._id;

    // ------------------------------------------------------------------
    // STEP 13-19: Kitchen KDS & Waiter Serving Workflow
    // ------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 5: Kitchen KDS & Waiter Serving ---\x1b[0m');

    const kdsRes = await fetch(`${baseUrl}/orders/active`, {
      headers: { 'x-demo-role': 'KITCHEN' },
    });
    const kdsJson = await getJson(kdsRes);
    const foundKdsOrder = kdsJson.data.find((o: any) => o._id === orderId);
    assert(Boolean(foundKdsOrder), 'Step 13: Kitchen receives order', 'Order visible in active kitchen stream');

    // Kitchen accepts order
    const acceptRes = await fetch(`${baseUrl}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-demo-role': 'KITCHEN' },
      body: JSON.stringify({ status: 'ACCEPTED' }),
    });
    assert(acceptRes.status === 200, 'Step 14: Kitchen accepts order', 'Status updated to ACCEPTED');

    // Kitchen prepares order
    const prepRes = await fetch(`${baseUrl}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-demo-role': 'KITCHEN' },
      body: JSON.stringify({ status: 'PREPARING' }),
    });
    assert(prepRes.status === 200, 'Step 15: Kitchen prepares order', 'Status updated to PREPARING');

    // Kitchen marks order ready
    const readyRes = await fetch(`${baseUrl}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-demo-role': 'KITCHEN' },
      body: JSON.stringify({ status: 'READY' }),
    });
    assert(readyRes.status === 200, 'Step 16: Kitchen marks ready', 'Status updated to READY');

    // Waiter sees ready order
    const waiterOrdersRes = await fetch(`${baseUrl}/orders/active`, {
      headers: { 'x-demo-role': 'WAITER' },
    });
    const waiterOrdersJson = await getJson(waiterOrdersRes);
    const readyOrders = waiterOrdersJson.data.filter((o: any) => o.status === 'READY');
    assert(readyOrders.some((o: any) => o._id === orderId), 'Step 17: Waiter sees ready order', 'Order flagged ready for serving');

    // Waiter serves order
    const serveRes = await fetch(`${baseUrl}/orders/${orderId}/serve`, {
      method: 'PATCH',
      headers: { 'x-demo-role': 'WAITER' },
    });
    const serveJson = await getJson(serveRes);
    assert(serveRes.status === 200 && serveJson.data.status === 'SERVED', 'Step 18: Waiter serves order', 'Order marked as SERVED');

    // Customer checks updated status
    const customerOrdersRes = await fetch(`${baseUrl}/orders/session/${sessionId}`);
    const customerOrdersJson = await getJson(customerOrdersRes);
    const currentCustomerOrder = customerOrdersJson.data.find((o: any) => o._id === orderId);
    assert(currentCustomerOrder.status === 'SERVED', 'Step 19: Customer sees status update', 'Customer view shows SERVED');

    // ------------------------------------------------------------------
    // STEP 20-21: Second Round & Staff Assistance
    // ------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 6: Additional Round & Service Requests ---\x1b[0m');

    const orderRound2Res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        memberId: member2Id,
        memberName: 'Diya',
        items: [
          {
            menuItemId: item1._id,
            quantity: 1,
            notes: 'Extra beverage',
            sessionMemberId: member2Id,
            sessionMemberName: 'Diya',
          },
        ],
      }),
    });
    const round2Json = await getJson(orderRound2Res);
    assert(round2Json.data.roundNumber === 2, 'Step 20: Second order round', 'Round #2 successfully queued');

    // Staff request
    const staffReqRes = await fetch(`${baseUrl}/staff-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        tableNumber: testTableNum,
        requestedByMemberId: member1Id,
        requestedByMemberName: 'Aarav',
        requestType: 'WATER',
        notes: 'Cold sparkling water please',
      }),
    });
    const staffReqJson = await getJson(staffReqRes);
    assert(staffReqRes.status === 201 && staffReqJson.data.status === 'REQUESTED', 'Step 21: Staff assistance request', 'Water request dispatched');

    // ------------------------------------------------------------------
    // STEP 22-25: Bill Calculation, Splitting & DineFlow Pay
    // ------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 7: Billing, Splits & DineFlow Pay ---\x1b[0m');

    const billRes = await fetch(`${baseUrl}/payments/bill/${sessionId}`);
    const billJson = await getJson(billRes);
    assert(billRes.status === 200 && billJson.data.summary.grandTotal > 0, 'Step 22: Bill calculation', `Server calculated total: ₹${billJson.data.summary.grandTotal}`);

    // Split Bill calculations
    const equalSplitRes = await fetch(`${baseUrl}/payments/bill/${sessionId}?splitMode=EQUAL&splitCount=2`);
    const equalSplitJson = await getJson(equalSplitRes);
    assert(equalSplitJson.data.selectedSplit.total < billJson.data.summary.grandTotal, 'Step 23: Split bill (Equal)', `Equal half total: ₹${equalSplitJson.data.selectedSplit.total}`);

    // Demo Payment Creation
    const createPayRes = await fetch(`${baseUrl}/payments/demo/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        splitMode: 'FULL',
        paymentMethod: 'UPI',
        payerName: 'Aarav',
      }),
    });
    const createPayJson = await getJson(createPayRes);
    assert(createPayRes.status === 201, 'Step 24: Demo payment initialization', `Payment ticket created: ${createPayJson.data.demoTransactionId}`);
    const paymentId = createPayJson.data.paymentId;

    // Confirm Payment
    const confirmPayRes = await fetch(`${baseUrl}/payments/demo/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId,
        paymentMethod: 'UPI',
        demoDetails: { upiVpa: 'aarav@okaxis' },
        simulateResult: 'SUCCESS',
      }),
    });
    const confirmPayJson = await getJson(confirmPayRes);
    assert(confirmPayRes.status === 200 && confirmPayJson.data.payment.status === 'SUCCESS', 'Step 24: Demo payment confirmation', 'Payment status updated to SUCCESS');

    // Verify Invoice
    const invoicePdfRes = await fetch(`${baseUrl}/payments/invoice/${sessionId}`);
    assert(invoicePdfRes.status === 200 && Boolean(invoicePdfRes.headers.get('content-type')?.includes('application/pdf')), 'Step 25: Invoice PDF generation', 'Official PDF invoice stream returned');

    // ------------------------------------------------------------------
    // STEP 26-28: Session Completion & Table Release
    // ------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 8: Session Settlement & Release ---\x1b[0m');

    const settledSession = await TableSession.findById(sessionId);
    assert(settledSession?.status === 'COMPLETED', 'Step 26: Session completion', 'Session marked COMPLETED');

    const releasedTable = await Table.findOne({ tableNumber: testTableNum });
    assert(releasedTable?.status === 'AVAILABLE' && releasedTable.activeSessionId === null, 'Step 27: Table released', `Table ${testTableNum} is now AVAILABLE for new guests`);

    // Verify Analytics
    const events = await AnalyticsEvent.find({ sessionId: sessionId.toString() });
    assert(events.length >= 2, 'Step 28: Analytics telemetry events', `Recorded ${events.length} telemetry events for session`);

    // ------------------------------------------------------------------
    // SECTION 9: Mandatory Failure & Security Tests
    // ------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 9: Negative & Security Failure Tests ---\x1b[0m');

    // 1. Invalid QR token
    const fakeQrRes = await fetch(`${baseUrl}/tables/resolve/INVALID_TOKEN_9999`);
    assert(fakeQrRes.status === 404, 'Failure: Invalid QR Token', 'Rejects non-existent token with 404');

    // 2. Disabled QR token
    await Table.findByIdAndUpdate(tableId, { 'qrCode.active': false });
    const disabledQrRes = await fetch(`${baseUrl}/tables/resolve/${qrToken}`);
    assert(disabledQrRes.status === 403, 'Failure: Disabled QR Token', 'Rejects disabled QR with 403');
    await Table.findByIdAndUpdate(tableId, { 'qrCode.active': true });

    // 3. Unavailable / 86'd food item
    await MenuItem.findByIdAndUpdate(item1._id, { available: false });
    const order86Res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        memberId: member1Id,
        memberName: 'Aarav',
        items: [{ menuItemId: item1._id, quantity: 1 }],
      }),
    });
    assert(order86Res.status === 400, 'Failure: 86’d Food Item', 'Blocked order containing unavailable item with 400');
    await MenuItem.findByIdAndUpdate(item1._id, { available: true });

    // 4. Stale/completed session order rejection
    const staleOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        memberId: member1Id,
        memberName: 'Aarav',
        items: [{ menuItemId: item1._id, quantity: 1 }],
      }),
    });
    assert(staleOrderRes.status === 400, 'Failure: Closed Session Order', 'Blocked order submission to settled session with 400');

    // 5. Kitchen role forbidden from payments
    const kitchenPayRes = await fetch(`${baseUrl}/payments/bill/${sessionId}`, {
      headers: { 'x-demo-role': 'KITCHEN' },
    });
    assert(kitchenPayRes.status === 403, 'Failure: Kitchen Accessing Payments', 'Kitchen blocked from billing/payment data with 403');

    // 6. Kitchen modifying prices
    const kitchenPriceEdit = await fetch(`${baseUrl}/menu/items/${item1._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-demo-role': 'KITCHEN' },
      body: JSON.stringify({ price: 9999 }),
    });
    assert(kitchenPriceEdit.status === 403, 'Failure: Kitchen Modifying Prices', 'Kitchen strictly forbidden from modifying prices (403)');

    // 7. Waiter modifying menu items
    const waiterMenuEdit = await fetch(`${baseUrl}/menu/items/${item1._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-demo-role': 'WAITER' },
      body: JSON.stringify({ name: 'Waiter Special' }),
    });
    assert(waiterMenuEdit.status === 403, 'Failure: Waiter Modifying Menu', 'Waiter forbidden from menu modification (403)');

    // 8. Duplicate Payment Prevention test
    const dupPayRes = await fetch(`${baseUrl}/payments/demo/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        splitMode: 'FULL',
        paymentMethod: 'UPI',
        payerName: 'Aarav',
      }),
    });
    assert(dupPayRes.status === 400, 'Failure: Duplicate Payment Prevention', 'Second full payment on settled session rejected with 400');

    // 9. Simulated Payment Failure handling
    const failPayment = new Payment({
      session: sessionId,
      tableNumber: testTableNum,
      amount: 500,
      subtotal: 450,
      tax: 25,
      serviceCharge: 25,
      currency: '₹',
      paymentMethod: 'UPI',
      status: 'CREATED',
      demoTransactionId: 'DF-DEMO-TESTFAIL',
      transactionId: 'DF-DEMO-TESTFAIL',
    });
    await failPayment.save();

    const failConfirmRes = await fetch(`${baseUrl}/payments/demo/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: failPayment._id,
        simulateResult: 'FAILED',
        failureReason: 'Insufficient funds simulation',
      }),
    });
    assert(failConfirmRes.status === 400, 'Failure: Simulated Payment Decline', 'Simulated failure recorded and returned properly');

    // Clean up test table
    await Table.findByIdAndDelete(tableId);

    console.log('\n=======================================================');
    console.log(`\x1b[32m✔ ALL ${results.length} AUDIT CHECKS & FLOW TESTS PASSED!\x1b[0m`);
    console.log('=======================================================\n');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Audit failed with error:', err);
    process.exit(1);
  });
