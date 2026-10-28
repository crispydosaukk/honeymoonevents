'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import {
  InvoiceBookingData,
  downloadInvoicePDFFile,
  getInvoiceCalculations,
  verifyInvoiceAccessToken,
} from '@/utils/invoicePDF';

function InvoiceContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id');
  const token = searchParams.get('token');
  const invoiceType = searchParams.get('type'); // 'deposit' or null/final

  const isDepositOnly = invoiceType === 'deposit';

  const [booking, setBooking] = useState<InvoiceBookingData | null>(null);
  const [rawBookingData, setRawBookingData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Security & Authorization state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verifyPhoneInput, setVerifyPhoneInput] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // 1. Check if an admin is already logged in (staff bypass)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAdmin(true);
        setIsAuthorized(true);
        setNeedsVerification(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch booking and validate access token
  useEffect(() => {
    if (!bookingId) {
      setError('No Booking Reference provided. Please check the direct link provided in your confirmation message.');
      setLoading(false);
      return;
    }

    async function fetchBooking() {
      try {
        let docSnap = await getDoc(doc(db, 'booking_requests', bookingId!));
        if (!docSnap.exists()) {
          docSnap = await getDoc(doc(db, 'bookings', bookingId!));
        }

        if (!docSnap.exists()) {
          setError(`Booking #${bookingId} could not be found. Please contact Honeymoon Events support.`);
          setLoading(false);
          return;
        }

        const data = docSnap.data();
        setRawBookingData({ id: docSnap.id, ...data });

        const mappedBooking: InvoiceBookingData = {
          id: docSnap.id,
          name: data.name || 'Valued Client',
          email: data.email || '',
          phone: data.phone || '',
          eventType: data.eventType || 'Event / Function',
          date: data.date || '',
          time: data.timeOfDay || data.time || '',
          guests: data.guests || 0,
          adults: data.adults ?? data.guests,
          kids4to10: data.kids4to10 || 0,
          kidsUnder4: data.kidsUnder4 || 0,
          status: data.status || 'deposit_pending',
          package: data.package || 'Custom Catering Package',
          selectedMenu: data.selectedMenu,
          baseAmount: data.baseAmount || 0,
          deposit: data.deposit || 0,
          depositPaid: data.depositPaid ?? false,
          finalPaymentPaid: data.finalPaymentPaid ?? false,
          extraCharges: data.extraCharges || [],
          discount: data.discount,
          venueHallCharge: data.venueHallCharge,
          enquiryDate: data.createdAt ? new Date(data.createdAt).toISOString().split('T')[0] : '',
          paymentMethodDeposit: data.paymentMethodDeposit,
          paymentMethodFinal: data.paymentMethodFinal,
        };

        // Admin logged in: always grant immediate access
        if (auth.currentUser) {
          setIsAdmin(true);
          setIsAuthorized(true);
          setBooking(mappedBooking);
          setLoading(false);
          return;
        }

        // Cryptographic token validation (from WhatsApp link)
        const isTokenValid = verifyInvoiceAccessToken(token, docSnap.id, data.phone, data.createdAt);
        if (isTokenValid) {
          setIsAuthorized(true);
          setBooking(mappedBooking);
          setLoading(false);
          return;
        }

        // If direct URL was typed without valid token, or if someone changed the ID:
        // Do NOT expose any client details. Require phone verification challenge.
        setIsAuthorized(false);
        setNeedsVerification(true);
        setLoading(false);
      } catch (err: any) {
        console.error('Error fetching invoice booking:', err);
        setError('Unable to load invoice details. Please check your connection and try again.');
        setLoading(false);
      }
    }

    fetchBooking();
  }, [bookingId, token]);

  // 3. Handle Phone Verification Challenge for direct URL visits / altered IDs
  const handleVerifyPhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawBookingData) return;
    setVerifyError(null);
    setIsVerifying(true);

    const inputClean = verifyPhoneInput.replace(/\D/g, '');
    const storedClean = (rawBookingData.phone || '').replace(/\D/g, '');

    // Allow full phone match or last 4-6 digits verification
    const isMatch =
      inputClean.length >= 4 &&
      (storedClean === inputClean ||
        storedClean.endsWith(inputClean) ||
        inputClean.endsWith(storedClean) ||
        (inputClean.length >= 7 && storedClean.includes(inputClean)));

    if (isMatch) {
      setBooking({
        id: rawBookingData.id,
        name: rawBookingData.name || 'Valued Client',
        email: rawBookingData.email || '',
        phone: rawBookingData.phone || '',
        eventType: rawBookingData.eventType || 'Event / Function',
        date: rawBookingData.date || '',
        time: rawBookingData.timeOfDay || rawBookingData.time || '',
        guests: rawBookingData.guests || 0,
        adults: rawBookingData.adults ?? rawBookingData.guests,
        kids4to10: rawBookingData.kids4to10 || 0,
        kidsUnder4: rawBookingData.kidsUnder4 || 0,
        status: rawBookingData.status || 'deposit_pending',
        package: rawBookingData.package || 'Custom Catering Package',
        selectedMenu: rawBookingData.selectedMenu,
        baseAmount: rawBookingData.baseAmount || 0,
        deposit: rawBookingData.deposit || 0,
        depositPaid: rawBookingData.depositPaid ?? false,
        finalPaymentPaid: rawBookingData.finalPaymentPaid ?? false,
        extraCharges: rawBookingData.extraCharges || [],
        discount: rawBookingData.discount,
        venueHallCharge: rawBookingData.venueHallCharge,
        enquiryDate: rawBookingData.createdAt ? new Date(rawBookingData.createdAt).toISOString().split('T')[0] : '',
        paymentMethodDeposit: rawBookingData.paymentMethodDeposit,
        paymentMethodFinal: rawBookingData.paymentMethodFinal,
      });
      setIsAuthorized(true);
      setNeedsVerification(false);
      setIsVerifying(false);
    } else {
      setIsVerifying(false);
      setVerifyError('The phone number entered does not match our records for this booking. For security and privacy, access is restricted.');
    }
  };

  const handleDownloadPDF = () => {
    if (!booking) return;
    setIsDownloading(true);
    try {
      downloadInvoicePDFFile(booking, isDepositOnly);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsDownloading(false), 1200);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-bold tracking-tight text-amber-400">Loading Official Invoice...</h2>
        <p className="text-neutral-400 text-sm mt-1">Honeymoon Events Banqueting &amp; Catering</p>
      </div>
    );
  }

  // Security Challenge Screen: shown when someone manually opened a direct URL or changed the ID without a matching token
  if (needsVerification && !isAuthorized) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-neutral-900 rounded-3xl p-6 sm:p-8 border border-neutral-800 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-5 text-3xl shadow-inner">
            🔒
          </div>
          <div className="text-center mb-6">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
              Privacy &amp; Security Verification
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white">Protected Invoice Access</h2>
            <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
              Booking Ref <strong className="text-amber-400">#{bookingId}</strong> contains confidential client and financial details.
              To view this document, please verify the contact number registered with this event.
            </p>
          </div>

          <form onSubmit={handleVerifyPhone} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Registered Mobile Number (or Last 4 Digits)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. 07700 900000 or last 4 digits"
                  value={verifyPhoneInput}
                  onChange={(e) => setVerifyPhoneInput(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 transition-colors"
                  autoFocus
                />
              </div>
            </div>

            {verifyError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <span className="text-sm">⚠️</span>
                <span>{verifyError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying || !verifyPhoneInput.trim()}
              className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
            >
              {isVerifying ? 'Verifying...' : 'Unlock & View Invoice'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-neutral-800 text-center text-xs text-neutral-500 space-y-2">
            <p>
              💡 If you received this invoice via WhatsApp, you can also use the direct link in your message.
            </p>
            <p>
              Need assistance?{' '}
              <a href="https://wa.me/447700900000" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">
                Contact Honeymoon Events on WhatsApp
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="max-w-md bg-neutral-900 p-8 rounded-2xl border border-neutral-800 shadow-xl">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Invoice Not Available</h2>
          <p className="text-neutral-400 text-sm mb-6 leading-relaxed">{error}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors"
          >
            Return to Homepage
          </a>
        </div>
      </div>
    );
  }

  const calc = getInvoiceCalculations(booking, isDepositOnly);
  const invoiceTitle = isDepositOnly ? 'DEPOSIT INVOICE' : 'INVOICE & ORDER SUMMARY';

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 py-6 px-3 sm:px-6 lg:px-8">
      {/* Sticky Action Toolbar */}
      <div className="max-w-4xl mx-auto mb-6 bg-neutral-900 text-white rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 sticky top-4 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center font-bold text-neutral-950 text-base shadow-md">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-wide text-amber-400">HONEYMOON EVENTS</span>
              {isAdmin && (
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Staff View
                </span>
              )}
            </div>
            <div className="text-xs text-neutral-400">Ref: #{booking.id} • {invoiceTitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <span>⬇️</span>
            <span>{isDownloading ? 'Generating PDF...' : 'Download PDF Invoice'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition-all"
          >
            <span>🖨️</span>
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Main Printable Sheet */}
      <div className="max-w-4xl mx-auto bg-white rounded-3xl p-6 sm:p-10 shadow-lg border border-neutral-200">
        {/* Header */}
        <div className="border-b-2 border-amber-600 pb-6 mb-8 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">HONEYMOON EVENTS</h1>
            <p className="text-amber-700 font-semibold text-xs tracking-wider uppercase mt-0.5">
              Luxury Banqueting &amp; Catering Specialists
            </p>
            <p className="text-neutral-500 text-xs mt-1">London, UK • Tel: +44 7700 900000 • hello@honeymoon.com</p>
          </div>
          <div className="sm:text-right">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200 mb-2">
              {invoiceTitle}
            </span>
            <div className="text-sm font-bold text-neutral-900">Booking Ref: #{booking.id}</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              Issued: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            {calc.formattedEnquiryDate && (
              <div className="text-xs text-neutral-400">Enquiry Date: {calc.formattedEnquiryDate}</div>
            )}
          </div>
        </div>

        {/* Customer & Event Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-200">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 border-b border-amber-200 pb-2 mb-3">
              Client Information
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">Name:</span>
                <span className="font-bold text-neutral-900">{booking.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Phone:</span>
                <span className="font-semibold text-neutral-900">{booking.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Email:</span>
                <span className="font-semibold text-neutral-900">{booking.email || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Status:</span>
                <span className="font-bold text-emerald-700 uppercase">
                  {(booking.status || 'Active').replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-200">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 border-b border-amber-200 pb-2 mb-3">
              Event Logistics
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">Event Type:</span>
                <span className="font-bold text-neutral-900">{booking.eventType || 'Celebration'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Event Date:</span>
                <span className="font-semibold text-neutral-900">{calc.formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Serving Time:</span>
                <span className="font-semibold text-neutral-900">{booking.time || 'To be confirmed'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Guests:</span>
                <span className="font-semibold text-neutral-900">
                  {calc.totalGuests} ({calc.adults} Adults, {calc.kids4to10} Kids 4-10y)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Order Items Table */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-amber-600 text-white font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Description &amp; Package Specifications</th>
                <th className="py-3 px-4 text-right w-36">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 bg-white">
              {(calc.baseAmount > 0 || !((booking.package || booking.selectedMenu || '').toLowerCase().includes('venue hire only') || (booking.eventType || '').toLowerCase().includes('venue hire'))) && (
                <tr>
                  <td className="py-4 px-4">
                    <div className="font-bold text-sm text-neutral-900">
                      Catering Package: {booking.selectedMenu || booking.package || 'Custom Banquet Package'}
                    </div>
                    <div className="text-neutral-500 text-xs mt-1 space-y-0.5">
                      <div>• Adults: {calc.adults} × £{(booking.pricePerPerson || 0).toFixed(2)}/person</div>
                      <div>• Kids (4-10 yrs): {calc.kids4to10} × £{(booking.kidsPricePerPerson || 0).toFixed(2)}/person</div>
                      <div>• Infants (0-4 yrs): {calc.kidsUnder4} × Free</div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-sm text-neutral-900 align-middle">
                    £{calc.baseAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              {calc.hallCharge && calc.hallCharge.amount > 0 && (
                <tr className="bg-neutral-50/50">
                  <td className="py-3 px-4 font-semibold text-neutral-800">
                    🏛️ {calc.hallCharge.label || 'Venue Hall Hire'}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-neutral-900">
                    £{calc.hallCharge.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              {calc.extraCharges.map((e, idx) => (
                <tr key={idx}>
                  <td className="py-3 px-4 font-semibold text-neutral-800">✨ {e.label}</td>
                  <td className="py-3 px-4 text-right font-bold text-neutral-900">
                    +£{Number(e.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-full sm:w-80 bg-neutral-50 rounded-2xl p-5 border border-neutral-200 space-y-2 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal:</span>
              <span className="font-semibold text-neutral-900">
                £{(calc.baseAmount + calc.hallAmount + calc.extraChargesTotal).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {booking.discount && calc.discountAmount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Discount ({booking.discount.reason}):</span>
                <span className="font-semibold">-£{calc.discountAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-sm text-amber-700 pt-2 border-t-2 border-amber-500">
              <span>Grand Total:</span>
              <span>£{calc.grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="pt-2 border-t border-neutral-200 font-bold uppercase tracking-wider text-[10px] text-neutral-400">
              Payment Breakdown
            </div>
            <div className="flex justify-between text-neutral-700">
              <span>Deposit ({calc.isDepositPaid ? 'Paid ✓' : 'Pending'}):</span>
              <span className={`font-semibold ${calc.isDepositPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                {calc.isDepositPaid ? '-' : ''}£{calc.deposit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {!isDepositOnly && (
              <>
                <div className="flex justify-between text-neutral-700">
                  <span>Final Payment ({calc.isFinalPaid ? 'Paid ✓' : 'Pending'}):</span>
                  <span className={`font-semibold ${calc.isFinalPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {calc.isFinalPaid ? '-' : ''}£{calc.finalPaymentAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-neutral-900 pt-1 border-t border-neutral-200">
                  <span>Total Paid:</span>
                  <span className="text-emerald-700">£{calc.totalPaid.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            )}

            <div className={`p-3 rounded-xl flex justify-between font-bold text-sm ${calc.balanceDue <= 0 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-950 border border-amber-300'}`}>
              <span>{isDepositOnly ? 'Balance After Deposit:' : 'Remaining Balance:'}</span>
              <span>{calc.balanceDue <= 0 ? 'PAID IN FULL ✓' : `£${calc.balanceDue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}</span>
            </div>
          </div>
        </div>

        {/* Bank Transfer Details Box */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8">
          <div className="text-xs font-black uppercase tracking-wider text-amber-900 mb-2">
            🏦 Official Bank Transfer Details for Payment
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-amber-700 font-semibold text-[10px] uppercase">Account Name</span>
              <div className="font-bold text-neutral-900">Honeymoon Events Ltd</div>
            </div>
            <div>
              <span className="text-amber-700 font-semibold text-[10px] uppercase">Sort Code</span>
              <div className="font-bold text-neutral-900">20-00-00</div>
            </div>
            <div>
              <span className="text-amber-700 font-semibold text-[10px] uppercase">Account Number</span>
              <div className="font-bold text-neutral-900">12345678</div>
            </div>
            <div>
              <span className="text-amber-700 font-semibold text-[10px] uppercase">Payment Reference</span>
              <div className="font-bold text-neutral-900">#{booking.id}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-neutral-400 border-t border-neutral-200 pt-6">
          <p>Thank you for choosing Honeymoon Events. For any questions, please contact our support desk.</p>
          <p className="mt-1 font-semibold text-neutral-500">Booking #{booking.id} • Honeymoon Events Banqueting &amp; Catering</p>
        </div>
      </div>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">
          Loading Invoice...
        </div>
      }
    >
      <InvoiceContent />
    </Suspense>
  );
}
