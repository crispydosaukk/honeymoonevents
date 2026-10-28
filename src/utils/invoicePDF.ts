import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface InvoiceExtraCharge {
  label: string;
  amount: number;
}

export interface InvoiceDiscount {
  type: 'percentage' | 'fixed';
  value: number;
  reason: string;
}

export interface InvoiceBookingData {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  eventType?: string;
  date?: string;
  time?: string;
  guests?: number;
  adults?: number;
  kids4to10?: number;
  kidsUnder4?: number;
  status?: string;
  package?: string;
  selectedMenu?: string;
  baseAmount?: number;
  deposit?: number;
  depositPaid?: boolean;
  finalPaymentPaid?: boolean;
  extraCharges?: InvoiceExtraCharge[];
  discount?: InvoiceDiscount;
  paymentMethodDeposit?: string;
  paymentMethodFinal?: string;
  paymentProofDeposit?: string;
  paymentProofFinal?: string;
  paymentProofExtra?: string;
  venueHallCharge?: { label: string; amount: number; isCustom?: boolean; reason?: string } | null;
  createdAt?: string;
  enquiryDate?: string;
  dueDate?: string;
  notes?: string;
  pricePerPerson?: number;
  kidsPricePerPerson?: number;
  kidsUnder4PricePerPerson?: number;
}

export interface BankDetailsConfig {
  accountName: string;
  sortCode: string;
  accountNumber: string;
}

export interface VenueDetailsConfig {
  venueName?: string;
  address?: string;
  phone?: string;
  contactEmail?: string;
  whatsapp?: string;
}

export interface InvoiceConfig {
  bankDetails?: BankDetailsConfig;
  venueDetails?: VenueDetailsConfig;
  baseUrl?: string;
}

const DEFAULT_BANK_DETAILS: BankDetailsConfig = {
  accountName: 'Honeymoon Events Ltd',
  sortCode: '20-00-00',
  accountNumber: '12345678',
};

const DEFAULT_VENUE_DETAILS: VenueDetailsConfig = {
  venueName: 'Honeymoon Events Banqueting & Catering',
  address: '123 Event Plaza, London, UK',
  phone: '+44 7700 900000',
  contactEmail: 'hello@honeymoon.com',
  whatsapp: '+447700900000',
};

// ─── HELPER CALCULATIONS ──────────────────────────────────────────────────────

export function getInvoiceCalculations(booking: InvoiceBookingData, isDepositOnly: boolean = false) {
  const adults = booking.adults ?? (booking.guests || 0);
  const kids4to10 = booking.kids4to10 || 0;
  const kidsUnder4 = booking.kidsUnder4 || 0;
  const totalGuests = (booking.guests && booking.guests > 0) ? booking.guests : (adults + kids4to10 + kidsUnder4);

  const baseAmount = Number(booking.baseAmount) || 0;
  const rawExtras = booking.extraCharges || [];

  // Separate Hall Hire from other Extras so Hall Hire is NEVER counted twice
  const hallExtra = rawExtras.find((e) =>
    e.label.toLowerCase().includes('hall hire') ||
    e.label.toLowerCase().includes('dry hire') ||
    e.label.toLowerCase().includes('venue hire')
  );

  let hallCharge = booking.venueHallCharge || null;
  let hallAmount = 0;

  if (hallExtra) {
    hallAmount = Number(hallExtra.amount) || 0;
    hallCharge = {
      label: hallExtra.label.replace(/^Hall Hire:\s*/i, '').replace(/^Venue Hire:\s*/i, ''),
      amount: hallAmount,
    };
  } else if (booking.venueHallCharge && typeof booking.venueHallCharge.amount === 'number' && booking.venueHallCharge.amount > 0) {
    hallAmount = Number(booking.venueHallCharge.amount) || 0;
    hallCharge = booking.venueHallCharge;
  }

  // Other extra charges (strictly excluding any hall hire to prevent double counting)
  const extraCharges = rawExtras.filter((e) => e !== hallExtra);
  const extraChargesTotal = extraCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  // Discount
  let discountAmount = 0;
  if (booking.discount) {
    const sub = baseAmount + hallAmount + extraChargesTotal;
    if (booking.discount.type === 'percentage') {
      discountAmount = (sub * booking.discount.value) / 100;
    } else {
      discountAmount = Number(booking.discount.value) || 0;
    }
  }

  // Grand Total: Food Package + Hall Hire + Other Extras - Discount
  const grandTotal = Math.max(0, baseAmount + hallAmount + extraChargesTotal - discountAmount);

  // Deposit logic
  const deposit = Number(booking.deposit) || 0;
  const isDepositPaid = isDepositOnly
    ? true
    : !!(booking.depositPaid || !['new_enquiry', 'menu_sent', 'menu_selected', 'deposit_pending'].includes(booking.status || ''));

  // Final payment logic
  const isCompleted = booking.status === 'completed';
  const isFinalPaid = isDepositOnly ? false : !!(booking.finalPaymentPaid || isCompleted);
  const finalPaymentAmt = Math.max(0, grandTotal - deposit);

  let totalPaid = 0;
  if (isCompleted) {
    totalPaid = grandTotal;
  } else {
    totalPaid = (isDepositPaid ? deposit : 0) + (isFinalPaid ? finalPaymentAmt : 0);
  }

  const balanceDue = isDepositOnly
    ? Math.max(0, grandTotal - deposit)
    : Math.max(0, grandTotal - totalPaid);

  const formattedDate = booking.date
    ? new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'To be confirmed';

  const formattedEnquiryDate = booking.enquiryDate
    ? new Date(booking.enquiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return {
    adults,
    kids4to10,
    kidsUnder4,
    totalGuests,
    baseAmount,
    extraCharges,
    extraChargesTotal,
    discountAmount,
    hallCharge,
    hallAmount,
    grandTotal,
    deposit,
    isDepositPaid,
    finalPaymentAmt,
    isFinalPaid,
    totalPaid,
    balanceDue,
    formattedDate,
    formattedEnquiryDate,
  };
}

// ─── REAL JSPDF VECTOR DOCUMENT GENERATOR ─────────────────────────────────────

export function generateInvoicePDFDoc(
  bookingData: InvoiceBookingData,
  isDepositOnly: boolean = false,
  config?: InvoiceConfig
): jsPDF {
  const bank = config?.bankDetails || DEFAULT_BANK_DETAILS;
  const venue = config?.venueDetails || DEFAULT_VENUE_DETAILS;
  const calc = getInvoiceCalculations(bookingData, isDepositOnly);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  // 1. Top Decorative Brand Banner
  doc.setFillColor(200, 134, 10); // #C8860A Brand Gold
  doc.rect(margin, 12, contentWidth, 2, 'F');

  // 2. Header: Company Info (Left) and Invoice Meta (Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39); // Charcoal #111827
  doc.text('HONEYMOON EVENTS', margin, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128); // Gray #6B7280
  doc.text(venue.venueName || 'Luxury Banqueting & Catering Specialists', margin, 27);
  doc.text(`${venue.address || 'London, UK'} • Tel: ${venue.phone || '+44 7700 900000'}`, margin, 31.5);
  doc.text(`Email: ${venue.contactEmail || 'hello@honeymoon.com'}`, margin, 36);

  // Invoice Title & Badges (Right side)
  const invoiceTypeTitle = isDepositOnly ? 'DEPOSIT INVOICE' : 'INVOICE & ORDER SUMMARY';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(200, 134, 10);
  doc.text(invoiceTypeTitle, pageWidth - margin, 22, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text(`Booking Ref: #${bookingData.id}`, pageWidth - margin, 27.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  doc.text(`Date of Issue: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, pageWidth - margin, 32, { align: 'right' });
  doc.text(`Enquiry Date: ${calc.formattedEnquiryDate}`, pageWidth - margin, 36.5, { align: 'right' });

  // 3. Customer & Event Details Cards (Two Columns)
  const cardY = 42;
  const colWidth = (contentWidth - 6) / 2; // 88mm each

  // Left Card: Customer Details
  doc.setFillColor(249, 250, 251); // #F9FAFB
  doc.setDrawColor(229, 231, 235); // #E5E7EB
  doc.roundedRect(margin, cardY, colWidth, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(200, 134, 10);
  doc.text('CUSTOMER DETAILS', margin + 4, cardY + 6);
  doc.setDrawColor(200, 134, 10);
  doc.line(margin + 4, cardY + 8, margin + 40, cardY + 8);

  const renderRow = (label: string, val: string, x: number, y: number, maxW: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(val, x + maxW, y, { align: 'right' });
  };

  renderRow('Name:', bookingData.name || 'N/A', margin + 4, cardY + 14, colWidth - 8);
  renderRow('Phone:', bookingData.phone || 'N/A', margin + 4, cardY + 20, colWidth - 8);
  renderRow('Email:', bookingData.email || 'N/A', margin + 4, cardY + 26, colWidth - 8);
  renderRow('Status:', (bookingData.status || 'Active').replace(/_/g, ' ').toUpperCase(), margin + 4, cardY + 32, colWidth - 8);

  // Right Card: Event Details
  const rightX = margin + colWidth + 6;
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(rightX, cardY, colWidth, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(200, 134, 10);
  doc.text('EVENT DETAILS', rightX + 4, cardY + 6);
  doc.setDrawColor(200, 134, 10);
  doc.line(rightX + 4, cardY + 8, rightX + 35, cardY + 8);

  renderRow('Event Type:', bookingData.eventType || 'Celebration', rightX + 4, cardY + 14, colWidth - 8);
  renderRow('Event Date:', calc.formattedDate, rightX + 4, cardY + 20, colWidth - 8);
  renderRow('Serving Time:', bookingData.time || 'TBC', rightX + 4, cardY + 26, colWidth - 8);
  renderRow('Total Guests:', `${calc.totalGuests} (${calc.adults} Ad, ${calc.kids4to10} Ch, ${calc.kidsUnder4} Inf)`, rightX + 4, cardY + 32, colWidth - 8);

  // 4. Itemized Package & Service Table
  const packageName = bookingData.selectedMenu || bookingData.package || 'Custom Catering Package';
  const pricePerPerson = bookingData.pricePerPerson || 0;
  const kidsPrice = bookingData.kidsPricePerPerson || 0;

  const itemRows: (string | number)[][] = [];

  const isVenueOnly = packageName.toLowerCase().includes('venue hire only') || 
                      packageName.toLowerCase().includes('hall hire only') ||
                      packageName.toLowerCase().includes('no package') ||
                      packageName.toLowerCase().includes('no food package');

  if (calc.baseAmount > 0 || !isVenueOnly) {
    itemRows.push([
      `Catering Package: ${packageName}\n• Adults: ${calc.adults} × £${pricePerPerson.toFixed(2)}\n• Kids (4-10 yrs): ${calc.kids4to10} × £${kidsPrice.toFixed(2)}\n• Kids (<4 yrs): ${calc.kidsUnder4} × Free`,
      `£${calc.baseAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]);
  }

  if (calc.hallCharge && calc.hallCharge.amount > 0) {
    itemRows.push([
      `🏛️ Venue / Hall Hire: ${calc.hallCharge.label || 'Venue Hall Hire'}`,
      `£${calc.hallCharge.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]);
  }

  calc.extraCharges.forEach((extra) => {
    itemRows.push([
      `✨ ${extra.label}`,
      `+£${Number(extra.amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]);
  });

  autoTable(doc, {
    startY: cardY + 44,
    margin: { left: margin, right: margin },
    head: [['Item Description & Services', 'Amount (£)']],
    body: itemRows,
    theme: 'grid',
    headStyles: {
      fillColor: [200, 134, 10],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 3,
    },
    bodyStyles: {
      textColor: [17, 24, 39],
      fontSize: 8.5,
      cellPadding: 3.5,
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 40 },
      1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: [253, 253, 253],
    },
  });

  // 5. Payment Summary & Balance Calculation
  // @ts-ignore
  let finalY = (doc as any).lastAutoTable?.finalY || 130;

  const summaryRows: (string | number)[][] = [
    ['Subtotal (Base & Add-ons):', `£${(calc.baseAmount + calc.hallAmount + calc.extraChargesTotal).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`],
  ];

  if (bookingData.discount && calc.discountAmount > 0) {
    summaryRows.push([
      `Discount (${bookingData.discount.reason || 'Approved'}):`,
      `-£${calc.discountAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
    ]);
  }

  summaryRows.push([
    'Grand Total (All inclusive):',
    `£${calc.grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
  ]);

  // Payment Breakdown
  const depStatus = calc.isDepositPaid
    ? `Paid ✓${bookingData.paymentMethodDeposit ? ` (${bookingData.paymentMethodDeposit.replace('Paid by ', '')})` : ''}`
    : 'Pending';
  summaryRows.push([
    `Deposit Payment (${depStatus}):`,
    `${calc.isDepositPaid ? '-' : ''}£${calc.deposit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
  ]);

  if (!isDepositOnly) {
    const finalStatus = calc.isFinalPaid
      ? `Paid ✓${bookingData.paymentMethodFinal ? ` (${bookingData.paymentMethodFinal.replace('Paid by ', '')})` : ''}`
      : 'Pending';
    summaryRows.push([
      `Final Payment (${finalStatus}):`,
      `${calc.isFinalPaid ? '-' : ''}£${calc.finalPaymentAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
    ]);

    summaryRows.push([
      'Total Amount Paid to Date:',
      `£${calc.totalPaid.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
    ]);
  }

  const remainingLabel = isDepositOnly ? 'Balance After Deposit:' : 'Remaining Balance Due:';
  const remainingValue = calc.balanceDue <= 0 ? 'PAID IN FULL ✓' : `£${calc.balanceDue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
  summaryRows.push([remainingLabel, remainingValue]);

  autoTable(doc, {
    startY: finalY + 4,
    margin: { left: margin + (contentWidth - 110), right: margin },
    body: summaryRows,
    theme: 'plain',
    bodyStyles: {
      fontSize: 8.5,
      textColor: [55, 65, 81],
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 70, halign: 'left' },
      1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Highlight Grand Total and Remaining Balance rows
      if (data.row.index === (bookingData.discount ? 2 : 1)) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [17, 24, 39];
      }
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 9.5;
        data.cell.styles.textColor = calc.balanceDue <= 0 ? [5, 150, 105] : [200, 134, 10];
      }
    },
  });

  // @ts-ignore
  finalY = (doc as any).lastAutoTable?.finalY || finalY + 50;

  // 6. Bank Details Box (Left of Summary or below if space is tight)
  if (finalY < 235) {
    const bankBoxY = finalY + 4;
    doc.setFillColor(255, 251, 235); // #FFFBEB Amber tint
    doc.setDrawColor(253, 230, 138); // #FDE68A
    doc.roundedRect(margin, bankBoxY, contentWidth, 24, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(146, 64, 14); // #92400E
    doc.text('🏦 OFFICIAL BANK TRANSFER DETAILS FOR PAYMENT', margin + 4, bankBoxY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(31, 41, 55);
    doc.text(`Account Name: ${bank.accountName}`, margin + 4, bankBoxY + 11);
    doc.text(`Sort Code: ${bank.sortCode}`, margin + 4, bankBoxY + 16);
    doc.text(`Account Number: ${bank.accountNumber}`, margin + 65, bankBoxY + 16);
    doc.text(`Payment Reference: #${bookingData.id}`, margin + 125, bankBoxY + 16);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text('Please quote your Booking Ref as payment reference and notify us upon transfer. Thank you!', margin + 4, bankBoxY + 21);

    finalY = bankBoxY + 26;
  }

  // 7. Footer
  const footerY = 282;
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(200, 134, 10);
  doc.text('HONEYMOON EVENTS', margin, footerY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(`Booking #${bookingData.id} • Registered in England & Wales • All prices in GBP (£)`, margin + 35, footerY);
  doc.text('Page 1 of 1', pageWidth - margin, footerY, { align: 'right' });

  return doc;
}

// ─── BLOB & FILE GENERATION ──────────────────────────────────────────────────

export function generateInvoicePDFBlob(
  bookingData: InvoiceBookingData,
  isDepositOnly: boolean = false,
  config?: InvoiceConfig
): { blob: Blob; file: File; filename: string; doc: jsPDF } {
  const doc = generateInvoicePDFDoc(bookingData, isDepositOnly, config);
  const cleanName = (bookingData.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
  const typeTag = isDepositOnly ? 'Deposit' : 'Invoice';
  const filename = `Honeymoon_${typeTag}_#${bookingData.id}_${cleanName}.pdf`;

  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  return { blob, file, filename, doc };
}

// ─── DIRECT BROWSER FILE DOWNLOAD ─────────────────────────────────────────────

export function downloadInvoicePDFFile(
  bookingData: InvoiceBookingData,
  isDepositOnly: boolean = false,
  config?: InvoiceConfig
): { success: boolean; filename: string } {
  try {
    const { blob, filename } = generateInvoicePDFBlob(bookingData, isDepositOnly, config);

    // Modern Blob Anchor Download (works on Desktop, iOS Safari, Android)
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 10000);

    return { success: true, filename };
  } catch (err) {
    console.error('Error generating and downloading Invoice PDF:', err);
    return { success: false, filename: '' };
  }
}

// ─── GORGEOUS RESPONSIVE HTML GENERATOR (FOR PREVIEW / PRINTING) ─────────────

export function buildInvoiceHTML(
  bookingData: InvoiceBookingData,
  isDepositOnly: boolean = false,
  config?: InvoiceConfig,
  blobUrl?: string
): string {
  const bank = config?.bankDetails || DEFAULT_BANK_DETAILS;
  const venue = config?.venueDetails || DEFAULT_VENUE_DETAILS;
  const calc = getInvoiceCalculations(bookingData, isDepositOnly);

  const cleanName = (bookingData.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
  const packageName = (bookingData.selectedMenu || bookingData.package || '').toLowerCase();
  const typeTag = isDepositOnly ? 'Deposit' : 'Invoice';
  const filename = `Honeymoon_${typeTag}_#${bookingData.id}_${cleanName}.pdf`;

  const origin = typeof window !== 'undefined' ? window.location.origin : (config?.baseUrl || '');
  const logoUrl = origin + '/assets/images/oie_gAxqzQFu0Ixw-1777831503416.png';

  const invoiceTitle = isDepositOnly ? 'DEPOSIT INVOICE' : 'INVOICE & ORDER SUMMARY';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${invoiceTitle} - #${bookingData.id} - ${bookingData.name}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      margin: 0;
      padding: 30px;
      line-height: 1.5;
      font-size: 13px;
    }
    @media print {
      body {
        padding: 0 !important;
      }
      .no-print-bar {
        display: none !important;
      }
    }
    .no-print-bar {
      position: sticky;
      top: 0;
      background: #111827;
      color: white;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 9999;
      border-radius: 10px;
      margin-bottom: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .bar-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 7px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-gold {
      background: #C8860A;
      color: white;
    }
    .btn-gold:hover {
      background: #9A6205;
    }
    .btn-dark {
      background: #374151;
      color: white;
    }
    .btn-dark:hover {
      background: #4B5563;
    }
    .btn-green {
      background: #059669;
      color: white;
    }
    .btn-green:hover {
      background: #047857;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2.5px solid #C8860A;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header-left h1 {
      margin: 0 0 4px 0;
      font-size: 22px;
      font-weight: 800;
      color: #111827;
      letter-spacing: -0.02em;
    }
    .header-left p {
      margin: 0;
      color: #6B7280;
      font-size: 12px;
      line-height: 1.4;
    }
    .header-right {
      text-align: right;
    }
    .invoice-tag {
      font-size: 16px;
      font-weight: 800;
      color: #C8860A;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .header-right p {
      margin: 2px 0;
      font-size: 12px;
      color: #4B5563;
    }
    .logo {
      max-height: 48px;
      object-fit: contain;
      margin-bottom: 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .card {
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 14px;
    }
    .card h3 {
      margin: 0 0 10px 0;
      font-size: 11px;
      font-weight: 800;
      color: #C8860A;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1.5px solid #FDE68A;
      padding-bottom: 4px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .row-label {
      color: #6B7280;
      font-weight: 500;
    }
    .row-value {
      font-weight: 700;
      color: #111827;
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    th {
      background: #C8860A;
      color: white;
      font-weight: 700;
      text-align: left;
      padding: 10px 12px;
      font-size: 12px;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #E5E7EB;
      vertical-align: top;
      font-size: 12px;
    }
    .text-right {
      text-align: right;
    }
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 24px;
    }
    .totals-table {
      width: 55%;
      border-collapse: collapse;
    }
    .totals-table td {
      border: none;
      padding: 5px 10px;
    }
    .grand-total-row td {
      font-size: 15px;
      font-weight: 800;
      color: #C8860A;
      border-top: 2px solid #C8860A !important;
      border-bottom: 2px solid #C8860A !important;
      padding: 8px 10px !important;
    }
    .balance-row td {
      font-size: 15px;
      font-weight: 800;
      padding: 8px 10px !important;
    }
    .paid-badge {
      color: #059669;
      font-weight: 800;
    }
    .bank-card {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 24px;
    }
    .bank-card h4 {
      margin: 0 0 6px 0;
      font-size: 11px;
      font-weight: 800;
      color: #92400E;
      text-transform: uppercase;
    }
    .bank-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      font-size: 12px;
    }
    .bank-item .label {
      color: #78350F;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .bank-item .val {
      font-weight: 700;
      color: #111827;
      margin-top: 2px;
    }
    .footer {
      border-top: 1px solid #E5E7EB;
      padding-top: 16px;
      text-align: center;
      color: #9CA3AF;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div>
      <span style="font-weight:800; font-size:14px; color:#FDE68A;">Honeymoon Events</span>
      <span style="margin-left:8px; font-size:12px; color:#9CA3AF;">#${bookingData.id} • ${invoiceTitle}</span>
    </div>
    <div class="bar-actions">
      <button class="btn btn-dark" onclick="if(window.opener){window.close();}else{history.back();}">✕ Close</button>
      ${blobUrl ? `<a href="${blobUrl}" download="${filename}" class="btn btn-gold" id="btn-download-pdf" style="text-decoration:none;">⬇️ Download PDF File</a>` : `<button class="btn btn-gold" id="btn-download-pdf">⬇️ Download PDF File</button>`}
      <button class="btn btn-green" onclick="window.print()">🖨️ Print Invoice</button>
    </div>
  </div>

  <div class="header">
    <div class="header-left">
      <h1>HONEYMOON EVENTS</h1>
      <p>Luxury Banqueting &amp; Catering Specialists</p>
      <p>${venue.address || 'London, UK'} &bull; Tel: ${venue.phone || '+44 7700 900000'} &bull; Email: ${venue.contactEmail || 'hello@honeymoon.com'}</p>
    </div>
    <div class="header-right">
      <div class="invoice-tag">${invoiceTitle}</div>
      <p>Booking Ref: <strong>#${bookingData.id}</strong></p>
      <p>Date of Issue: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      <p>Enquiry Date: ${calc.formattedEnquiryDate}</p>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h3>Customer Details</h3>
      <div class="row">
        <span class="row-label">Client Name:</span>
        <span class="row-value">${bookingData.name || 'N/A'}</span>
      </div>
      <div class="row">
        <span class="row-label">Phone:</span>
        <span class="row-value">${bookingData.phone || 'N/A'}</span>
      </div>
      <div class="row">
        <span class="row-label">Email:</span>
        <span class="row-value">${bookingData.email || 'N/A'}</span>
      </div>
      <div class="row">
        <span class="row-label">Order Status:</span>
        <span class="row-value" style="color:#C8860A;">${(bookingData.status || 'Active').replace(/_/g, ' ').toUpperCase()}</span>
      </div>
    </div>

    <div class="card">
      <h3>Event &amp; Venue Details</h3>
      <div class="row">
        <span class="row-label">Event Type:</span>
        <span class="row-value">${bookingData.eventType || 'Celebration'}</span>
      </div>
      <div class="row">
        <span class="row-label">Event Date:</span>
        <span class="row-value">${calc.formattedDate}</span>
      </div>
      <div class="row">
        <span class="row-label">Serving Time:</span>
        <span class="row-value">${bookingData.time || 'TBC'}</span>
      </div>
      <div class="row">
        <span class="row-label">Total Guests:</span>
        <span class="row-value">${calc.totalGuests} (${calc.adults} Adults, ${calc.kids4to10} Kids 4-10y, ${calc.kidsUnder4} Inf)</span>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description &amp; Package Specifications</th>
        <th class="text-right" style="width: 130px;">Amount (£)</th>
      </tr>
    </thead>
    <tbody>
      ${(calc.baseAmount > 0 || !(packageName.toLowerCase().includes('venue hire only') || packageName.toLowerCase().includes('hall hire only') || packageName.toLowerCase().includes('no package') || packageName.toLowerCase().includes('no food package'))) ? `
      <tr>
        <td>
          <strong>Catering Package: ${bookingData.selectedMenu || bookingData.package || 'Custom Banquet'}</strong>
          <div style="font-size:11.5px; color:#6B7280; margin-top:4px;">
            &bull; Adults: ${calc.adults} &times; &pound;${(bookingData.pricePerPerson || 0).toFixed(2)} / person<br/>
            &bull; Kids (4-10 yrs): ${calc.kids4to10} &times; &pound;${(bookingData.kidsPricePerPerson || 0).toFixed(2)} / person<br/>
            &bull; Kids (&lt;4 yrs): ${calc.kidsUnder4} &times; Free
          </div>
        </td>
        <td class="text-right" style="vertical-align:middle; font-weight:700;">
          &pound;${calc.baseAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
      ` : ''}
      ${
        calc.hallCharge && calc.hallCharge.amount > 0
          ? `
      <tr>
        <td>🏛️ Venue / Hall Hire: ${calc.hallCharge.label || 'Venue Hall Hire'}</td>
        <td class="text-right" style="font-weight:700;">&pound;${calc.hallCharge.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
      </tr>
      `
          : ''
      }
      ${calc.extraCharges
        .map(
          (e) => `
      <tr>
        <td>✨ ${e.label}</td>
        <td class="text-right" style="font-weight:700;">+&pound;${Number(e.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
      </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="totals-wrap">
    <table class="totals-table">
      <tbody>
        <tr>
          <td>Subtotal (Base &amp; Add-ons):</td>
          <td class="text-right">&pound;${(calc.baseAmount + calc.hallAmount + calc.extraChargesTotal).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
        </tr>
        ${
          bookingData.discount && calc.discountAmount > 0
            ? `
        <tr style="color: #DC2626;">
          <td>Discount (${bookingData.discount.reason || 'Approved'}):</td>
          <td class="text-right">-&pound;${calc.discountAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
        </tr>
        `
            : ''
        }
        <tr class="grand-total-row">
          <td>Grand Total:</td>
          <td class="text-right">&pound;${calc.grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:10px; font-weight:800; font-size:11px; color:#C8860A; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid #E5E7EB;">
            Payment Breakdown
          </td>
        </tr>
        <tr>
          <td style="color:#4B5563;">
            &bull; Deposit Payment:
            ${
              calc.isDepositPaid && bookingData.paymentMethodDeposit
                ? `<span style="font-style:italic; font-size:11px; color:#6B7280;">(via ${bookingData.paymentMethodDeposit.replace('Paid by ', '')})</span>`
                : ''
            }
          </td>
          <td class="text-right" style="color: ${calc.isDepositPaid ? '#059669' : '#D97706'}; font-weight:600;">
            ${calc.isDepositPaid ? `-£${calc.deposit.toLocaleString('en-GB', { minimumFractionDigits: 2 })} (Paid)` : `£${calc.deposit.toLocaleString('en-GB', { minimumFractionDigits: 2 })} (Pending)`}
          </td>
        </tr>
        ${
          !isDepositOnly
            ? `
        <tr>
          <td style="color:#4B5563;">
            &bull; Final Payment:
            ${
              calc.isFinalPaid && bookingData.paymentMethodFinal
                ? `<span style="font-style:italic; font-size:11px; color:#6B7280;">(via ${bookingData.paymentMethodFinal.replace('Paid by ', '')})</span>`
                : ''
            }
          </td>
          <td class="text-right" style="color: ${calc.isFinalPaid ? '#059669' : '#D97706'}; font-weight:600;">
            ${calc.isFinalPaid ? `-£${calc.finalPaymentAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })} (Paid)` : `£${calc.finalPaymentAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })} (Pending)`}
          </td>
        </tr>
        <tr style="border-top:1px solid #E5E7EB;">
          <td style="font-weight:700; color:#111827; padding-top:8px;">Total Paid:</td>
          <td class="text-right" style="font-weight:700; color:#059669; padding-top:8px;">
            &pound;${calc.totalPaid.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </td>
        </tr>
        `
            : ''
        }
        <tr class="balance-row" style="background:${calc.balanceDue <= 0 ? '#ECFDF5' : '#FFFBEB'}; border-radius:6px;">
          <td style="color: ${calc.balanceDue <= 0 ? '#059669' : '#92400E'};">
            ${isDepositOnly ? 'Balance After Deposit:' : 'Remaining Balance Due:'}
          </td>
          <td class="text-right" style="color: ${calc.balanceDue <= 0 ? '#059669' : '#C8860A'};">
            ${calc.balanceDue <= 0 ? '<span class="paid-badge">PAID IN FULL ✓</span>' : `&pound;${calc.balanceDue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="bank-card">
    <h4>Official Bank Transfer Details for Payment</h4>
    <div class="bank-grid">
      <div class="bank-item">
        <div class="label">Account Name</div>
        <div class="val">${bank.accountName}</div>
      </div>
      <div class="bank-item">
        <div class="label">Sort Code</div>
        <div class="val">${bank.sortCode}</div>
      </div>
      <div class="bank-item">
        <div class="label">Account Number</div>
        <div class="val">${bank.accountNumber}</div>
      </div>
      <div class="bank-item">
        <div class="label">Payment Reference</div>
        <div class="val">#${bookingData.id}</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>Thank you for choosing Honeymoon Events. If you have any questions regarding this invoice, please contact us at ${venue.contactEmail || 'hello@honeymoon.com'} or ${venue.phone || '+44 7700 900000'}.</p>
    <p style="font-size:10px; color:#9CA3AF;">Honeymoon Events Banqueting &amp; Catering &bull; Booking ID #${bookingData.id}</p>
  </div>

  <script>
    // Direct PDF Download Button Handler in the preview bar
    document.getElementById('btn-download-pdf')?.addEventListener('click', function() {
      // Trigger native print or download
      if (window.opener && window.opener.triggerInvoiceDownload) {
        window.opener.triggerInvoiceDownload('${bookingData.id}', ${isDepositOnly});
      } else {
        window.print();
      }
    });

    // Automatically trigger print on desktop after loading
    window.addEventListener('load', function() {
      // If not on mobile, provide quick print prompt
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        setTimeout(function() {
          window.print();
        }, 600);
      }
    });
  </script>
</body>
</html>
  `;
}

// ─── OPEN PRINT / PREVIEW WINDOW SAFELY ────────────────────────────────────────

export function openInvoicePrintWindow(
  bookingData: InvoiceBookingData,
  isDepositOnly: boolean = false,
  config?: InvoiceConfig
): Window | null {
  let blobUrl = '';
  try {
    const { blob } = generateInvoicePDFBlob(bookingData, isDepositOnly, config);
    blobUrl = URL.createObjectURL(blob);
  } catch (e) {
    console.error('Failed to create preview PDF blob:', e);
  }

  const htmlContent = buildInvoiceHTML(bookingData, isDepositOnly, config, blobUrl);
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    // Popup was blocked on mobile — fallback directly to downloading the PDF file!
    downloadInvoicePDFFile(bookingData, isDepositOnly, config);
    return null;
  }

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  return printWindow;
}

// ─── DELIVER INVOICE TO CUSTOMER VIA WHATSAPP AS PDF ──────────────────────────

export function getPublicInvoiceBaseUrl(config?: InvoiceConfig): string {
  if (config?.baseUrl) return config.baseUrl.replace(/\/$/, '');

  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.');
    // If running on real production website, use the current origin
    if (!isLocal) {
      return window.location.origin;
    }
  }

  // Default to live production domain so customers on WhatsApp can open their invoice from anywhere
  return 'https://honeymoonevents.com';
}

// ─── CRYPTOGRAPHIC ACCESS TOKEN (PREVENTS URL TAMPERING & ID GUESSING) ───────

export function generateInvoiceAccessToken(
  bookingId: string,
  phone?: string,
  createdAt?: string
): string {
  const secret = process.env.NEXT_PUBLIC_INVOICE_SECRET || 'honeymoon_events_secure_invoice_key_2026';
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const cleanDate = (createdAt || '').toString().split('T')[0];
  const input = `${bookingId}:${cleanPhone}:${cleanDate}:${secret}`;

  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = input.length * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  function isPrime(n: number) {
    for (let f = 2, sqrt = Math.sqrt(n); f <= sqrt; f++) if (n % f === 0) return false;
    return true;
  }
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) hash[primeCounter] = (mathPow(candidate, 1 / 2) * maxWord) | 0;
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;
  for (i = 0; i < input.length; i++) words[i >> 2] |= input.charCodeAt(i) << (24 - (i % 4) * 8);

  for (i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    const oldHash = hash.slice(0, 8);
    for (j = 0; j < 64; j++) {
      const w15 = w[j - 15] || 0, w2 = w[j - 2] || 0;
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[j] = j < 16 ? (w[j] | 0) : ((w[j - 16] + s0 + w[j - 7] + s1) | 0);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const s0_ = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const s1_ = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const t1 = (hash[7] + s1_ + ch + k[j] + w[j]) | 0;
      const t2 = (s0_ + maj) | 0;
      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + t1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (t1 + t2) | 0;
    }
    for (j = 0; j < 8; j++) hash[j] = (hash[j] + oldHash[j]) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  // Return a clean 20-character secure token
  return result.slice(0, 20);
}

export function verifyInvoiceAccessToken(
  providedToken: string | null | undefined,
  bookingId: string,
  phone?: string,
  createdAt?: string
): boolean {
  if (!providedToken) return false;
  const token = providedToken.trim().toLowerCase();

  // 1. Normalized date match
  const cleanDate = (createdAt || '').toString().split('T')[0];
  const expected1 = generateInvoiceAccessToken(bookingId, phone, cleanDate).toLowerCase();
  if (token === expected1) return true;

  // 2. Raw timestamp match
  if (createdAt) {
    const rawExpected = generateInvoiceAccessToken(bookingId, phone, String(createdAt)).toLowerCase();
    if (token === rawExpected) return true;
  }

  // 3. ID + phone match
  const phoneOnly = generateInvoiceAccessToken(bookingId, phone, '').toLowerCase();
  if (token === phoneOnly) return true;

  return false;
}

export function buildInvoiceWhatsAppMessage(
  bookingData: InvoiceBookingData,
  isDepositOnly: boolean = false,
  config?: InvoiceConfig
): string {
  const origin = getPublicInvoiceBaseUrl(config);
  const token = generateInvoiceAccessToken(bookingData.id, bookingData.phone, bookingData.createdAt || bookingData.enquiryDate);
  const invoiceOnlineLink = `${origin}/invoice?id=${bookingData.id}&token=${token}${isDepositOnly ? '&type=deposit' : ''}`;

  if (!isDepositOnly) {
    return `Please find attached your final invoice:
${invoiceOnlineLink}`;
  }

  const bank = config?.bankDetails || DEFAULT_BANK_DETAILS;
  const calc = getInvoiceCalculations(bookingData, isDepositOnly);
  const firstName = (bookingData.name || 'Client').split(' ')[0];

  let msg = `Hi ${firstName}, thank you for choosing *Honeymoon Events* for your ${bookingData.eventType || 'Event'}! 🎉\n\n`;

  msg += `📄 *DEPOSIT INVOICE & ORDER SUMMARY*\n`;
  msg += `*Ref:* #${bookingData.id}\n`;
  msg += `*Event Date:* ${calc.formattedDate} (${bookingData.time || 'TBC'})\n`;
  msg += `*Guests:* ${calc.totalGuests} Guests (${calc.adults} Adults, ${calc.kids4to10} Kids)\n`;
  msg += `*Package:* ${bookingData.selectedMenu || bookingData.package || 'Catering Package'}\n\n`;

  msg += `💰 *FINANCIAL BREAKDOWN:*\n`;
  msg += `• Grand Total: *£${calc.grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}*\n`;
  msg += `• Deposit (${calc.isDepositPaid ? 'Paid ✓' : 'Pending'}): £${calc.deposit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}\n`;
  msg += `• Balance After Deposit: *£${calc.balanceDue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}*\n\n`;

  if (calc.balanceDue > 0) {
    msg += `🏦 *Bank Transfer Details:*\n`;
    msg += `• Account Name: ${bank.accountName}\n`;
    msg += `• Sort Code: ${bank.sortCode}\n`;
    msg += `• Account No: ${bank.accountNumber}\n`;
    msg += `• Reference: #${bookingData.id}\n\n`;
  }

  msg += `📥 *VIEW & DOWNLOAD YOUR OFFICIAL PDF INVOICE HERE:*\n`;
  msg += `${invoiceOnlineLink}\n\n`;
  msg += `Please let us know once received or if you have any questions. Thank you! 🙏✨`;

  return msg;
}

export function cleanPhoneNumber(phone?: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '44' + cleaned.slice(1);
  }
  return cleaned;
}

export async function shareInvoicePDFViaWhatsApp(
  bookingData: InvoiceBookingData,
  isDepositOnly: boolean = false,
  config?: InvoiceConfig,
  customMessage?: string
): Promise<{ shared: boolean; method: 'whatsapp_link' | 'download_only'; error?: string }> {
  // 1. Download the official PDF file to device so the user has the actual document file
  downloadInvoicePDFFile(bookingData, isDepositOnly, config);

  // 2. Build the clean, permanent WhatsApp message with clickable HTTPS link
  const textMessage = customMessage || buildInvoiceWhatsAppMessage(bookingData, isDepositOnly, config);
  const cleanPhone = cleanPhoneNumber(bookingData.phone);

  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(textMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(textMessage)}`;

  // 3. Open WhatsApp chat directly (never passes raw files to avoid the browser mangling into blob: URLs)
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  return { shared: true, method: 'whatsapp_link' };
}
