import PDFDocument from 'pdfkit';
import { IRestaurant } from '../models/Restaurant.js';
import { ITableSession } from '../models/TableSession.js';
import { IPayment } from '../models/Payment.js';
import { IOrder } from '../models/Order.js';

interface InvoiceData {
  restaurant: IRestaurant;
  session: ITableSession;
  orders: IOrder[];
  payment?: IPayment | null;
  invoiceNumber: string;
  members?: Array<{ displayName?: string; name?: string }>;
}

export function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      const { restaurant, session, orders, payment, invoiceNumber } = data;

      // Header Banner
      doc
        .rect(0, 0, doc.page.width, 100)
        .fill('#1c1917');

      doc
        .fillColor('#f97316')
        .font('Helvetica-Bold')
        .fontSize(22)
        .text('DINEFLOW', 40, 25);

      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(restaurant.name.toUpperCase(), 40, 52);

      doc
        .fillColor('#a8a29e')
        .font('Helvetica')
        .fontSize(9)
        .text(`${restaurant.address} | GSTIN: ${restaurant.gstNumber}`, 40, 72);

      // Invoice Details Block
      const startY = 120;
      doc
        .fillColor('#1c1917')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('TAX INVOICE', 40, startY);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#44403c');

      doc.text(`Invoice No: ${invoiceNumber}`, 40, startY + 25);
      doc.text(`Date & Time: ${new Date().toLocaleString('en-IN')}`, 40, startY + 40);
      doc.text(`Table: ${session.tableNumber}`, 40, startY + 55);
      doc.text(`Session ID: #${session.sessionNumber}`, 40, startY + 70);

      // Diners info
      const dinersList = data.members?.map((m) => m.displayName || m.name || 'Guest').join(', ') || 'Walk-in Guests';
      doc.text(`Diners: ${dinersList}`, 40, startY + 85);

      // Payment Status Badge
      const paymentStatus = payment?.status || (session.status === 'COMPLETED' ? 'PAID' : 'PENDING');
      const isPaid = paymentStatus === 'SUCCESS' || paymentStatus === 'PAID';

      doc
        .roundedRect(380, startY + 20, 170, 75, 4)
        .fillAndStroke(isPaid ? '#ecfdf5' : '#fffbeb', isPaid ? '#10b981' : '#f59e0b');

      doc
        .fillColor(isPaid ? '#065f46' : '#92400e')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(isPaid ? 'PAYMENT SUCCESSFUL' : 'PAYMENT PENDING', 390, startY + 30);

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#374151')
        .text(`Gateway: DineFlow Pay (Simulated)`, 390, startY + 48)
        .text(`Method: ${payment?.method || 'N/A'}`, 390, startY + 60)
        .text(`Txn ID: ${payment?.transactionId || 'SIMULATED'}`, 390, startY + 72);

      // Items Table Header
      const tableTop = startY + 120;
      doc
        .rect(40, tableTop, 515, 24)
        .fill('#f5f5f4');

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#1c1917');

      doc.text('ITEM DESCRIPTION', 50, tableTop + 7);
      doc.text('ROUND', 260, tableTop + 7);
      doc.text('ORDERED BY', 320, tableTop + 7);
      doc.text('QTY', 420, tableTop + 7, { width: 30, align: 'center' });
      doc.text('PRICE', 460, tableTop + 7, { width: 45, align: 'right' });
      doc.text('TOTAL', 505, tableTop + 7, { width: 45, align: 'right' });

      // Aggregate all items across rounds
      let currentY = tableTop + 28;
      let calculatedSubtotal = 0;

      orders.forEach((order) => {
        order.items.forEach((item) => {
          if (item.status === 'CANCELLED') return;
          const itemTotal = item.priceSnapshot * item.quantity;
          calculatedSubtotal += itemTotal;

          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#292524');

          doc.text(item.name, 50, currentY, { width: 200 });
          doc.text(`R-${order.roundNumber}`, 260, currentY);
          doc.text(item.sessionMemberName || 'Guest', 320, currentY, { width: 90 });
          doc.text(item.quantity.toString(), 420, currentY, { width: 30, align: 'center' });
          doc.text(`${restaurant.currency}${item.priceSnapshot.toFixed(2)}`, 460, currentY, {
            width: 45,
            align: 'right',
          });
          doc.text(`${restaurant.currency}${itemTotal.toFixed(2)}`, 505, currentY, {
            width: 45,
            align: 'right',
          });

          currentY += 20;

          // Draw subtle line
          doc
            .moveTo(40, currentY - 5)
            .lineTo(555, currentY - 5)
            .strokeColor('#e7e5e4')
            .lineWidth(0.5)
            .stroke();
        });
      });

      // Calculations block
      const subtotal = calculatedSubtotal;
      const taxAmount = (subtotal * restaurant.taxRate) / 100;
      const serviceAmount = (subtotal * restaurant.serviceChargeRate) / 100;
      const grandTotal = subtotal + taxAmount + serviceAmount;

      currentY += 15;

      const summaryX = 350;
      doc.font('Helvetica').fontSize(9).fillColor('#44403c');
      doc.text('Subtotal:', summaryX, currentY);
      doc.text(`${restaurant.currency}${subtotal.toFixed(2)}`, 480, currentY, { width: 70, align: 'right' });

      currentY += 16;
      doc.text(`GST (${restaurant.taxRate}%):`, summaryX, currentY);
      doc.text(`${restaurant.currency}${taxAmount.toFixed(2)}`, 480, currentY, { width: 70, align: 'right' });

      currentY += 16;
      doc.text(`Service Charge (${restaurant.serviceChargeRate}%):`, summaryX, currentY);
      doc.text(`${restaurant.currency}${serviceAmount.toFixed(2)}`, 480, currentY, { width: 70, align: 'right' });

      currentY += 20;
      doc
        .rect(summaryX - 10, currentY - 4, 215, 26)
        .fill('#ffedd5');

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#c2410c');
      doc.text('GRAND TOTAL:', summaryX, currentY + 3);
      doc.text(`${restaurant.currency}${grandTotal.toFixed(2)}`, 480, currentY + 3, {
        width: 70,
        align: 'right',
      });

      // Footer
      const footerY = 750;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#78716c')
        .text('Thank you for dining at ' + restaurant.name + '!', 40, footerY, {
          align: 'center',
          width: 515,
        })
        .text('This is a computer-generated tax invoice verified by DineFlow Smart POS.', 40, footerY + 12, {
          align: 'center',
          width: 515,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
