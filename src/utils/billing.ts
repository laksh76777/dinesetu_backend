import { IOrder } from '../models/Order.js';

export interface BillCalculation {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  serviceChargeRate: number;
  serviceChargeAmount: number;
  totalAmount: number;
  itemsCount: number;
  itemsBreakdown: Array<{
    orderId: string;
    itemId: string;
    name: string;
    quantity: number;
    price: number;
    total: number;
    roundNumber: number;
    sessionMemberId: string;
    sessionMemberName: string;
  }>;
  memberBreakdown: Record<
    string,
    {
      memberId: string;
      memberName: string;
      itemTotal: number;
      items: Array<{ name: string; quantity: number; price: number; total: number; roundNumber: number }>;
      shareOfTax: number;
      shareOfService: number;
      totalShare: number;
    }
  >;
}

export function calculateSessionBill(
  orders: IOrder[],
  taxRate: number = 5,
  serviceChargeRate: number = 5
): BillCalculation {
  let subtotal = 0;
  let itemsCount = 0;
  const itemsBreakdown: BillCalculation['itemsBreakdown'] = [];
  const memberMap: BillCalculation['memberBreakdown'] = {};

  orders.forEach((order) => {
    order.items.forEach((item) => {
      // Exclude cancelled items
      if (item.status === 'CANCELLED') return;

      const itemTotal = item.priceSnapshot * item.quantity;
      subtotal += itemTotal;
      itemsCount += item.quantity;

      const mId = item.sessionMemberId || 'guest';
      const mName = item.sessionMemberName || 'Guest';

      itemsBreakdown.push({
        orderId: order._id.toString(),
        itemId: item._id?.toString() || '',
        name: item.name,
        quantity: item.quantity,
        price: item.priceSnapshot,
        total: itemTotal,
        roundNumber: order.roundNumber,
        sessionMemberId: mId,
        sessionMemberName: mName,
      });

      if (!memberMap[mId]) {
        memberMap[mId] = {
          memberId: mId,
          memberName: mName,
          itemTotal: 0,
          items: [],
          shareOfTax: 0,
          shareOfService: 0,
          totalShare: 0,
        };
      }

      memberMap[mId].itemTotal += itemTotal;
      memberMap[mId].items.push({
        name: item.name,
        quantity: item.quantity,
        price: item.priceSnapshot,
        total: itemTotal,
        roundNumber: order.roundNumber,
      });
    });
  });

  const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
  const serviceChargeAmount = Number(((subtotal * serviceChargeRate) / 100).toFixed(2));
  const totalAmount = Number((subtotal + taxAmount + serviceChargeAmount).toFixed(2));

  // Calculate member shares proportionally
  Object.values(memberMap).forEach((m) => {
    const proportion = subtotal > 0 ? m.itemTotal / subtotal : 0;
    m.shareOfTax = Number((taxAmount * proportion).toFixed(2));
    m.shareOfService = Number((serviceChargeAmount * proportion).toFixed(2));
    m.totalShare = Number((m.itemTotal + m.shareOfTax + m.shareOfService).toFixed(2));
  });

  return {
    subtotal: Number(subtotal.toFixed(2)),
    taxRate,
    taxAmount,
    serviceChargeRate,
    serviceChargeAmount,
    totalAmount,
    itemsCount,
    itemsBreakdown,
    memberBreakdown: memberMap,
  };
}
