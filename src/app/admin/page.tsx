'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import { INDIAN_MENU, SRI_LANKAN_MENU, LIVE_COUNTER_PACKAGE, BANQUET_PACKAGES, VENUE_HALL_CHARGES, TABLE_SERVICE, KIDS_PRICING, DRY_HIRE_PRICES } from '@/app/data/menuData';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db, storage } from '@/lib/firebase';
import { collection, onSnapshot, query, where, orderBy, doc, setDoc, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import AccessControl from '@/components/admin/AccessControl';
import ManualBookingForm from '@/components/admin/ManualBookingForm';
import ExtraChargesSettings, { ConfiguredExtraCharge, DEFAULT_CONFIGURED_CHARGES } from '@/components/admin/ExtraChargesSettings';
import { generateChefMenuPDF, downloadChefMenuPDF, openChefWhatsApp } from '@/utils/chefMenuPDF';
import {
  downloadInvoicePDFFile,
  openInvoicePrintWindow,
  shareInvoicePDFViaWhatsApp,
  buildInvoiceWhatsAppMessage,
  getInvoiceCalculations,
  cleanPhoneNumber,
  InvoiceBookingData,
} from '@/utils/invoicePDF';
import { getKidsPriceFromList } from '@/utils/kidsPricing';

// ─── TYPES ───────────────────────────────────────────────────────────────────

type BookingStatus =
  | 'new_enquiry' | 'menu_sent' | 'menu_selected' | 'deposit_pending' | 'deposit_confirmed' | 'event_scheduled' | 'event_completed' | 'final_invoice_sent' | 'final_payment_received' | 'completed' | 'cancelled';

interface ExtraCharge {
  label: string;
  amount: number;
  isPreset?: boolean;
}

interface Discount {
  type: 'fixed' | 'percentage';
  value: number;
  reason: string;
}

interface DiscountRequest {
  type: 'fixed' | 'percentage';
  value: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt?: string;
}

interface Booking {
  id: string;
  name: string;
  email: string;
  phone: string;
  eventType: string;
  date: string;
  time: string;
  guests: number;
  adults?: number;
  kids4to10?: number;
  kidsUnder4?: number;
  status: BookingStatus;
  notes: string;
  baseAmount: number;
  deposit: number;
  depositPaid: boolean;
  finalPaymentPaid: boolean;
  dueDate?: string;
  package: string;
  selectedMenu?: string;
  extraCharges: ExtraCharge[];
  paymentProofDeposit?: string;
  paymentProofFinal?: string;
  paymentProofExtra?: string;
  paymentMethodDeposit?: string;
  paymentMethodFinal?: string;
  discount?: Discount;
  discountRequest?: DiscountRequest;
  selectedDishes?: {
    vegStarters?: string[];
    nonVegStarters?: string[];
    vegMains?: string[];
    nonVegMains?: string[];
    sundries?: string[];
    desserts?: string[];
    [key: string]: any;
  };
  pricePerPerson?: number;
  kidsPricePerPerson?: number;
  kidsUnder4PricePerPerson?: number;
  priceOverrides?: Record<string, any>;
  customPriceReasons?: string[];
  includeVenueHall?: boolean;
  venueHallCharge?: {
    label: string;
    amount: number;
    isCustom?: boolean;
    reason?: string;
  } | null;
  cancellationDetails?: {
    cancelledAt: string;
    cancelledBy?: string;
    reason: string;
    customReason?: string;
    advancePaid: number;
    depositPaid?: boolean;
    depositMethod?: string;
    notes?: string;
  };
  enquiryDate: string;
  updatedAt?: string;
  createdAt?: string;
  orderClosedAt?: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalBookings: number;
  totalSpent: number;
  lastEvent: string;
  status: 'active' | 'inactive';
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const STATUS_FLOW: BookingStatus[] = [
  'new_enquiry',
  'menu_sent',
  'menu_selected',
  'deposit_pending',
  'deposit_confirmed',
  'final_invoice_sent',
  'final_payment_received',
  'event_scheduled',
  'event_completed',
  'completed',
];

const STATUS_LABELS: Record<BookingStatus, string> = {
  new_enquiry: 'New Enquiry',
  menu_sent: 'Menu Sent',
  menu_selected: 'Menu Selected',
  deposit_pending: 'Deposit Pending',
  deposit_confirmed: 'Deposit Confirmed',
  event_scheduled: 'Event Scheduled',
  event_completed: 'Event Completed',
  final_invoice_sent: 'Final Invoice Sent',
  final_payment_received: 'Final Payment Received',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<BookingStatus, string> = {
  new_enquiry: 'bg-blue-50 text-blue-700 border border-blue-200',
  menu_sent: 'bg-purple-50 text-purple-700 border border-purple-200',
  menu_selected: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  deposit_pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  deposit_confirmed: 'bg-orange-50 text-orange-700 border border-orange-200',
  event_scheduled: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
  event_completed: 'bg-teal-50 text-teal-700 border border-teal-200',
  final_invoice_sent: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  final_payment_received: 'bg-lime-50 text-lime-700 border border-lime-200',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border border-rose-200',
};

const STATUS_DOT: Record<BookingStatus, string> = {
  new_enquiry: 'bg-blue-500',
  menu_sent: 'bg-purple-500',
  menu_selected: 'bg-indigo-500',
  deposit_pending: 'bg-amber-400',
  deposit_confirmed: 'bg-orange-500',
  event_scheduled: 'bg-cyan-500',
  event_completed: 'bg-teal-500',
  final_invoice_sent: 'bg-yellow-500',
  final_payment_received: 'bg-lime-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-rose-500',
};

const MENU_PACKAGES = [
  {
    name: 'Classic Buffet',
    price: 38,
    tag: 'Most Popular',
    items: ['Garden Salad', 'Grilled Chicken', 'Pasta Primavera', 'Seasonal Vegetables', 'Dinner Rolls', 'Dessert Station'],
  },
  {
    name: 'Premium Plated',
    price: 62,
    tag: 'Best Value',
    items: ['Soup or Salad', 'Choice of Entrée (Beef/Fish/Veg)', 'Sides', 'Bread Service', 'Plated Dessert', 'Coffee & Tea'],
  },
  {
    name: 'Cocktail Reception',
    price: 45,
    tag: '',
    items: ["Passed Hors d'Oeuvres (6 varieties)", 'Cheese & Charcuterie Board', 'Mini Desserts', 'Soft Drinks', 'Bartender Service'],
  },
  {
    name: 'Continental Breakfast',
    price: 22,
    tag: '',
    items: ['Assorted Pastries', 'Fresh Fruit Platter', 'Yogurt Parfait', 'Juice & Coffee', 'Bagels & Cream Cheese'],
  },
];

const SAMPLE_BOOKINGS: Booking[] = [
  {
    id: 'BK001', name: 'Sarah Johnson', email: 'sarah@email.com', phone: '+447700900101',
    eventType: 'Wedding', date: '2026-06-15', time: '4:00 PM', guests: 200,
    status: 'deposit_confirmed', notes: 'Floral décor, DJ required. Bride prefers white roses.',
    baseAmount: 12500, deposit: 3750, depositPaid: true, finalPaymentPaid: false,
    package: 'Premium Plated', selectedMenu: 'Premium Plated', extraCharges: [],
    paymentProofDeposit: 'proof_attached', enquiryDate: '2026-04-10',
  },
  {
    id: 'BK002', name: 'Michael Chen', email: 'mchen@corp.com', phone: '+447700900102',
    eventType: 'Corporate', date: '2026-05-20', time: '12:00 PM', guests: 80,
    status: 'menu_sent', notes: 'AV setup, buffet lunch. Projector needed.',
    baseAmount: 4800, deposit: 1200, depositPaid: false, finalPaymentPaid: false,
    package: 'Classic Buffet', selectedMenu: undefined, extraCharges: [],
    enquiryDate: '2026-04-22',
  },
  {
    id: 'BK003', name: 'Emily Rodriguez', email: 'emily@email.com', phone: '+447700900103',
    eventType: 'Birthday', date: '2026-05-28', time: '6:00 PM', guests: 50,
    status: 'new_enquiry', notes: 'Custom cake, cocktail style. 30th birthday.',
    baseAmount: 2750, deposit: 825, depositPaid: false, finalPaymentPaid: false,
    package: 'Cocktail Reception', selectedMenu: undefined, extraCharges: [],
    enquiryDate: '2026-05-01',
  },
  {
    id: 'BK004', name: 'David Park', email: 'dpark@email.com', phone: '+447700900104',
    eventType: 'Anniversary', date: '2026-07-04', time: '7:00 PM', guests: 120,
    status: 'event_scheduled', notes: 'Plated dinner, open bar. 25th anniversary.',
    baseAmount: 8200, deposit: 2460, depositPaid: true, finalPaymentPaid: false,
    package: 'Premium Plated', selectedMenu: 'Premium Plated', extraCharges: [],
    paymentProofDeposit: 'proof_attached', enquiryDate: '2026-03-15',
  },
  {
    id: 'BK005', name: 'James Wilson', email: 'jwilson@email.com', phone: '+447700900106',
    eventType: 'Wedding', date: '2026-08-22', time: '5:00 PM', guests: 180,
    status: 'deposit_pending', notes: 'Garden theme, outdoor ceremony. Backup plan needed.',
    baseAmount: 15000, deposit: 4500, depositPaid: false, finalPaymentPaid: false,
    package: 'Premium Plated', selectedMenu: 'Premium Plated', extraCharges: [],
    enquiryDate: '2026-04-05',
  },
  {
    id: 'BK006', name: 'Priya Sharma', email: 'priya@email.com', phone: '+447700900107',
    eventType: 'Corporate', date: '2026-05-30', time: '9:00 AM', guests: 60,
    status: 'event_completed', notes: 'Morning conference, continental breakfast.',
    baseAmount: 3200, deposit: 960, depositPaid: true, finalPaymentPaid: false,
    package: 'Classic Buffet', selectedMenu: 'Classic Buffet',
    extraCharges: [{ label: 'Extra 10 guests', amount: 380 }, { label: 'AV Equipment', amount: 150 }],
    paymentProofDeposit: 'proof_attached', enquiryDate: '2026-03-20',
  },
  {
    id: 'BK007', name: 'Carlos Mendez', email: 'carlos@email.com', phone: '+447700900108',
    eventType: 'Birthday', date: '2026-04-08', time: '7:00 PM', guests: 40,
    status: 'completed', notes: 'Surprise party. All went well.',
    baseAmount: 2200, deposit: 2200, depositPaid: true, finalPaymentPaid: true,
    package: 'Cocktail Reception', selectedMenu: 'Cocktail Reception', extraCharges: [],
    paymentProofDeposit: 'proof_attached', paymentProofFinal: 'proof_attached',
    enquiryDate: '2026-02-28',
  },
  {
    id: 'BK008', name: 'Aisha Patel', email: 'aisha@email.com', phone: '+447700900109',
    eventType: 'Wedding', date: '2026-09-12', time: '3:00 PM', guests: 250,
    status: 'menu_selected', notes: 'Traditional ceremony, halal menu required.',
    baseAmount: 18500, deposit: 5550, depositPaid: false, finalPaymentPaid: false,
    package: 'Premium Plated', selectedMenu: 'Premium Plated', extraCharges: [],
    enquiryDate: '2026-04-30',
  },
];



const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function getKidsPrice(
  kidsPricingList?: { ageRange: string; price: string }[],
  packageName?: string,
  directKidsPrice?: number
): number {
  return getKidsPriceFromList(kidsPricingList, packageName, directKidsPrice);
}

function buildWhatsAppLink(phone: string, message: string) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '44' + cleaned.slice(1);
  }
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

type AdminTab = 'overview' | 'enquiries' | 'bookings' | 'manual_booking' | 'calendar' | 'customers' | 'payments' | 'menus' | 'history' | 'settings' | 'access' | 'discount_approvals' | 'tracker';

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const openImagePreview = (imgUrl?: string, title: string = 'Payment Proof') => {
    if (!imgUrl) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #111827;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            min-height: 100vh;
            font-family: system-ui, sans-serif;
          }
          .nav {
            position: sticky;
            top: 0;
            width: 100%;
            background: #1f2937;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
            border-bottom: 1px solid #374151;
            z-index: 50;
          }
          .title {
            color: #f3f4f6;
            font-size: 14px;
            font-weight: 600;
          }
          .btn {
            background: #ef4444;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
          }
          .img-container {
            padding: 16px;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            box-sizing: border-box;
          }
          img {
            max-width: 100%;
            max-height: 85vh;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
          }
        </style>
      </head>
      <body>
        <div class="nav">
          <span class="title">${title}</span>
          <button class="btn" onclick="if(window.opener){window.close();}else{history.back();}">✕ Close / Go Back</button>
        </div>
        <div class="img-container">
          <img src="${imgUrl}" alt="${title}"/>
        </div>
      </body>
      </html>
    `);
    w.document.close();
  };
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [bookings, setBookings] = useState<Booking[]>(SAMPLE_BOOKINGS);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isEditingBookingDate, setIsEditingBookingDate] = useState(false);
  const [isEditingEventType, setIsEditingEventType] = useState(false);
  const [isEditingPackage, setIsEditingPackage] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [isEditingGuests, setIsEditingGuests] = useState(false);
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [isEditingDeposit, setIsEditingDeposit] = useState(false);
  const [editDepositValue, setEditDepositValue] = useState<string>('');
  const [discountTab, setDiscountTab] = useState<'pending' | 'history'>('pending');
  const [trackingBookingId, setTrackingBookingId] = useState<string>('');
  const [trackerSearch, setTrackerSearch] = useState<string>('');
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<string>('');
  const [finalPaymentMethod, setFinalPaymentMethod] = useState<string>('');

  // Customer Inline Edit States
  const [isEditingCustomerName, setIsEditingCustomerName] = useState(false);
  const [isEditingCustomerPhone, setIsEditingCustomerPhone] = useState(false);
  const [isEditingCustomerEmail, setIsEditingCustomerEmail] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editingBookingForManual, setEditingBookingForManual] = useState<Booking | null>(null);

  // Month & Year Filter States across tabs
  const [paymentFilterMonth, setPaymentFilterMonth] = useState<number | 'all'>('all');
  const [paymentFilterYear, setPaymentFilterYear] = useState<number | 'all'>(new Date().getFullYear());
  const [bookingsFilterMonth, setBookingsFilterMonth] = useState<number | 'all'>('all');
  const [bookingsFilterYear, setBookingsFilterYear] = useState<number | 'all'>(new Date().getFullYear());
  const [enquiriesFilterMonth, setEnquiriesFilterMonth] = useState<number | 'all'>('all');
  const [enquiriesFilterYear, setEnquiriesFilterYear] = useState<number | 'all'>(new Date().getFullYear());
  const [historyFilterMonth, setHistoryFilterMonth] = useState<number | 'all'>('all');
  const [historyFilterYear, setHistoryFilterYear] = useState<number | 'all'>(new Date().getFullYear());

  // Cancellation Modal States (Works for both manual and website booking orders)
  const [cancellationModalBooking, setCancellationModalBooking] = useState<Booking | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('Client requested cancellation');
  const [cancellationCustomReason, setCancellationCustomReason] = useState<string>('');
  const [cancellationNotes, setCancellationNotes] = useState<string>('');
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState<boolean>(false);

  // Hall Hire Drawer Modal States
  const [showAddHallModal, setShowAddHallModal] = useState<boolean>(false);
  const [customHallLabel, setCustomHallLabel] = useState<string>('Bespoke Venue Hall Hire');
  const [customHallAmount, setCustomHallAmount] = useState<string>('300');
  const [customHallReason, setCustomHallReason] = useState<string>('');

  // WhatsApp Invoice Delivery Modal States
  const [whatsAppInvoiceBooking, setWhatsAppInvoiceBooking] = useState<Booking | null>(null);
  const [whatsAppInvoiceType, setWhatsAppInvoiceType] = useState<'final' | 'deposit'>('final');
  const [whatsAppCustomPhone, setWhatsAppCustomPhone] = useState<string>('');
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState<boolean>(false);
  const [whatsAppCustomMessage, setWhatsAppCustomMessage] = useState<string>('');

  // Booking Tracker Filter States
  const [trackerStatusFilter, setTrackerStatusFilter] = useState<string>('all');
  const [trackerEventFilter, setTrackerEventFilter] = useState<string>('all');
  const [trackerDateFilter, setTrackerDateFilter] = useState<string>('');

  // Pagination States
  const [bookingPage, setBookingPage] = useState<number>(1);
  const [bookingPageSize, setBookingPageSize] = useState<number>(10);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyPageSize, setHistoryPageSize] = useState<number>(10);

  const getPaginationRange = (current: number, total: number): (number | string)[] => {
    if (total <= 5) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 3) {
      return [1, 2, 3, 4, '...', total];
    }
    if (current >= total - 2) {
      return [1, '...', total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
  };

  const resetAllEditStates = () => {
    setIsEditingDeposit(false);
    setIsEditingCustomerName(false);
    setIsEditingCustomerPhone(false);
    setIsEditingCustomerEmail(false);
    setIsEditingNotes(false);
    setIsEditingBookingDate(false);
    setIsEditingEventType(false);
    setIsEditingPackage(false);
    setIsEditingTime(false);
    setIsEditingGuests(false);
    setIsEditingDueDate(false);
  };

  useEffect(() => {
    resetAllEditStates();
    if (selectedBooking) {
      setDepositPaymentMethod(selectedBooking.paymentMethodDeposit || '');
      setFinalPaymentMethod(selectedBooking.paymentMethodFinal || '');
    } else {
      setDepositPaymentMethod('');
      setFinalPaymentMethod('');
    }
  }, [selectedBooking?.id, selectedBooking?.paymentMethodDeposit, selectedBooking?.paymentMethodFinal]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('adminActiveTab') as AdminTab | null;
      if (savedTab) setActiveTab(savedTab);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('adminActiveTab', activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    const q = query(collection(db, 'booking_requests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveBookings: Booking[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || 'Unknown',
          email: data.email || 'N/A',
          phone: data.phone || 'N/A',
          eventType: data.eventType || 'N/A',
          date: data.date || 'N/A',
          time: data.timeOfDay || 'N/A',
          guests: data.guests || 0,
          adults: data.adults ?? undefined,
          kids4to10: data.kids4to10 ?? 0,
          kidsUnder4: data.kidsUnder4 ?? 0,
          status: data.status || 'new_enquiry',
          notes: data.message || '',
          baseAmount: data.baseAmount || 0,
          deposit: data.deposit || 0,
          depositPaid: data.depositPaid || false,
          finalPaymentPaid: data.finalPaymentPaid || false,
          package: data.package || 'Not Selected',
          selectedMenu: data.selectedMenu,
          extraCharges: data.extraCharges || [],
          paymentProofDeposit: data.paymentProofDeposit,
          paymentProofFinal: data.paymentProofFinal,
          paymentProofExtra: data.paymentProofExtra,
          paymentMethodDeposit: data.paymentMethodDeposit,
          paymentMethodFinal: data.paymentMethodFinal,
          discount: data.discount,
          discountRequest: data.discountRequest,
          selectedDishes: data.selectedDishes,
          pricePerPerson: data.pricePerPerson,
          kidsPricePerPerson: data.kidsPricePerPerson,
          kidsUnder4PricePerPerson: data.kidsUnder4PricePerPerson,
          priceOverrides: data.priceOverrides,
          customPriceReasons: data.customPriceReasons,
          includeVenueHall: data.includeVenueHall,
          venueHallCharge: data.venueHallCharge,
          cancellationDetails: data.cancellationDetails,
          enquiryDate: data.createdAt ? new Date(data.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          dueDate: (() => {
            if (data.dueDate) return data.dueDate;
            if (data.date && data.date !== 'N/A') {
              const evDate = new Date(data.date);
              const today = new Date();
              evDate.setDate(evDate.getDate() - 14);
              return (evDate < today ? today : evDate).toISOString().split('T')[0];
            }
            return '';
          })(),
          updatedAt: data.updatedAt,
          createdAt: data.createdAt,
        } as Booking;
      });
      setBookings(liveBookings);
    });
    return () => unsubscribe();
  }, []);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEvent, setFilterEvent] = useState<string>('all');
  const [loggedIn, setLoggedIn] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [userPermissions, setUserPermissions] = useState<string[] | 'all'>('all');
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; role: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Query by uid field (not document ID, since we use addDoc)
          const usersQuery = query(collection(db, 'users'), where('uid', '==', user.uid));
          const usersSnap = await getDocs(usersQuery);

          if (!usersSnap.empty) {
            // Found a managed user document
            const userData = usersSnap.docs[0].data();
            let roleName = 'Staff';
            if (userData.roleId) {
              const roleDoc = await getDoc(doc(db, 'roles', userData.roleId));
              if (roleDoc.exists()) {
                roleName = roleDoc.data().name || 'Staff';
                const rolePermIds: string[] = roleDoc.data().permissionIds || [];
                // Resolve permission IDs → title strings for sidebar filtering
                const permTitles: string[] = [];
                for (const permId of rolePermIds) {
                  const permDoc = await getDoc(doc(db, 'permissions', permId));
                  if (permDoc.exists()) {
                    permTitles.push(permDoc.data().title);
                  }
                }
                setUserPermissions(permTitles);
              } else {
                setUserPermissions([]); // Role doc missing
              }
            } else {
              setUserPermissions([]); // No role assigned
            }
            setCurrentUser({ name: userData.name || 'User', email: userData.email || user.email || '', role: roleName });
          } else {
            // No user doc found → original super admin (honeymoonadmin)
            setCurrentUser({ name: 'Admin', email: user.email || '', role: 'Super Admin' });
            setUserPermissions('all');
          }
        } catch (e) {
          console.error("Error fetching permissions:", e);
          setCurrentUser({ name: 'Admin', email: user.email || '', role: 'Super Admin' });
          setUserPermissions([]);
        }
        setLoggedIn(true);
      } else {
        setLoggedIn(false);
        setCurrentUser(null);
        setUserPermissions([]);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);
  const [calendarMonth, setCalendarMonth] = useState(4);
  const [calendarYear] = useState(2026);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [extraLabel, setExtraLabel] = useState('');
  const [extraAmount, setExtraAmount] = useState('');

  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [discountError, setDiscountError] = useState('');
  const [showMenuPanel, setShowMenuPanel] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    setBookingPage(1);
  }, [filterStatus, filterEvent, bookingsFilterMonth, bookingsFilterYear]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyFilterMonth, historyFilterYear, historySearch]);
  const [customAlert, setCustomAlert] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [bookingToDelete, setBookingToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [isUploadingFinalProof, setIsUploadingFinalProof] = useState(false);
  const [isUploadingExtraProof, setIsUploadingExtraProof] = useState(false);

  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [blockDateInput, setBlockDateInput] = useState('');

  const [configuredExtraCharges, setConfiguredExtraCharges] = useState<ConfiguredExtraCharge[]>(DEFAULT_CONFIGURED_CHARGES);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'site_data', 'extra_charges_config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.charges) && data.charges.length > 0) {
          setConfiguredExtraCharges(data.charges);
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'blocked_dates'), (snapshot) => {
      const dates = snapshot.docs.map(doc => doc.id);
      setBlockedDates(dates.sort());
    });
    return () => unsubscribe();
  }, []);

  const [bankDetails, setBankDetails] = useState({
    accountName: 'Honeymoon Events Ltd',
    sortCode: '20-00-00',
    accountNumber: '12345678'
  });

  useEffect(() => {
    return onSnapshot(doc(db, 'site_data', 'bank_details'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBankDetails({
          accountName: data.accountName || 'Honeymoon Events Ltd',
          sortCode: data.sortCode || '20-00-00',
          accountNumber: data.accountNumber || '12345678'
        });
      }
    });
  }, []);

  const [venueDetails, setVenueDetails] = useState({
    venueName: 'Honeymoon Banquet Hall',
    maxCapacity: '500',
    contactEmail: 'hello@honeymoon.com',
    phone: '+44 7700 900000',
    whatsapp: '+447700900000',
    address: '123 Event Plaza, London, UK'
  });

  useEffect(() => {
    return onSnapshot(doc(db, 'site_data', 'venue_details'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setVenueDetails({
          venueName: data.venueName || 'Honeymoon Banquet Hall',
          maxCapacity: data.maxCapacity || '500',
          contactEmail: data.contactEmail || 'hello@honeymoon.com',
          phone: data.phone || '+44 7700 900000',
          whatsapp: data.whatsapp || '+447700900000',
          address: data.address || '123 Event Plaza, London, UK'
        });
      }
    });
  }, []);

  const [pricingDetails, setPricingDetails] = useState({
    depositPercentage: 500,
    depositAmount: 500,
    minimumBookingHours: 4,
    weekdayRate: 350,
    weekendRate: 550,
    minimumGuests: 30,
  });

  useEffect(() => {
    return onSnapshot(doc(db, 'site_data', 'pricing_details'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const dep = data.depositAmount !== undefined ? data.depositAmount : (data.depositPercentage !== undefined ? data.depositPercentage : 500);
        setPricingDetails({
          depositPercentage: dep,
          depositAmount: dep,
          minimumBookingHours: data.minimumBookingHours || 4,
          weekdayRate: data.weekdayRate || 350,
          weekendRate: data.weekendRate || 550,
          minimumGuests: data.minimumGuests !== undefined ? data.minimumGuests : 30,
        });
      }
    });
  }, []);

  // ─── REAL MENU EDITABLE STATE ─────────────────────────────────────────────
  type AdminMenuTab = 'banquet' | 'indian' | 'srilankan' | 'live';
  const [adminMenuTab, setAdminMenuTab] = useState<AdminMenuTab>('banquet');

  // Editable banquet packages
  const [editableBanquetPackages, setEditableBanquetPackages] = useState(
    BANQUET_PACKAGES.map(pkg => ({ ...pkg, desserts: [...pkg.desserts], drinks: [...pkg.drinks] }))
  );
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editingPackageData, setEditingPackageData] = useState<typeof BANQUET_PACKAGES[0] | null>(null);

  // Editable Indian menu
  const [editableIndianMenu, setEditableIndianMenu] = useState({
    vegStarters: [...INDIAN_MENU.starters.vegetarian],
    nonVegStarters: [...INDIAN_MENU.starters.nonVegetarian],
    vegMains: [...INDIAN_MENU.mains.vegetarian],
    nonVegMains: [...INDIAN_MENU.mains.nonVegetarian],
    sundries: [...INDIAN_MENU.sundries],
    desserts: [...INDIAN_MENU.desserts],
  });

  // Editable Sri Lankan menu
  const [editableSLMenu, setEditableSLMenu] = useState({
    vegStarters: [...SRI_LANKAN_MENU.starters.vegetarian],
    nonVegStarters: [...SRI_LANKAN_MENU.starters.nonVegetarian],
    vegMains: [...SRI_LANKAN_MENU.mains.vegetarian],
    nonVegMains: [...SRI_LANKAN_MENU.mains.nonVegetarian],
    sundries: [...SRI_LANKAN_MENU.sundries],
    desserts: [...SRI_LANKAN_MENU.desserts],
  });

  // Editable live counter
  const [editableLiveCounter, setEditableLiveCounter] = useState({
    srilankanSouthIndian: LIVE_COUNTER_PACKAGE.srilankanSouthIndian.map(i => ({ ...i })),
    northIndian: LIVE_COUNTER_PACKAGE.northIndian.map(i => ({ ...i })),
    extras: LIVE_COUNTER_PACKAGE.extras.map(i => ({ ...i })),
  });

  // Editable venue/table/kids
  const [editableVenueCharges, setEditableVenueCharges] = useState(VENUE_HALL_CHARGES.map(v => ({ ...v })));
  const [editableTableService, setEditableTableService] = useState(TABLE_SERVICE.map(t => ({ ...t })));
  const [editableKidsPricing, setEditableKidsPricing] = useState(KIDS_PRICING.map(k => ({ ...k })));
  const [editableDryHirePrices, setEditableDryHirePrices] = useState(DRY_HIRE_PRICES.map(p => ({ ...p })));

  // New item inputs
  const [newMenuItemInput, setNewMenuItemInput] = useState('');
  const [newLiveItemName, setNewLiveItemName] = useState('');
  const [newLiveItemPrice, setNewLiveItemPrice] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'site_data', 'menus'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.INDIAN_MENU) {
          setEditableIndianMenu({
            vegStarters: data.INDIAN_MENU.starters?.vegetarian || [],
            nonVegStarters: data.INDIAN_MENU.starters?.nonVegetarian || [],
            vegMains: data.INDIAN_MENU.mains?.vegetarian || [],
            nonVegMains: data.INDIAN_MENU.mains?.nonVegetarian || [],
            sundries: data.INDIAN_MENU.sundries || [],
            desserts: data.INDIAN_MENU.desserts || [],
          });
        }
        if (data.SRI_LANKAN_MENU) {
          setEditableSLMenu({
            vegStarters: data.SRI_LANKAN_MENU.starters?.vegetarian || [],
            nonVegStarters: data.SRI_LANKAN_MENU.starters?.nonVegetarian || [],
            vegMains: data.SRI_LANKAN_MENU.mains?.vegetarian || [],
            nonVegMains: data.SRI_LANKAN_MENU.mains?.nonVegetarian || [],
            sundries: data.SRI_LANKAN_MENU.sundries || [],
            desserts: data.SRI_LANKAN_MENU.desserts || [],
          });
        }
        if (data.LIVE_COUNTER_PACKAGE) setEditableLiveCounter(data.LIVE_COUNTER_PACKAGE);
        if (data.BANQUET_PACKAGES) setEditableBanquetPackages(data.BANQUET_PACKAGES);
        if (data.VENUE_HALL_CHARGES) setEditableVenueCharges(data.VENUE_HALL_CHARGES);
        if (data.TABLE_SERVICE) setEditableTableService(data.TABLE_SERVICE);
        if (data.KIDS_PRICING) setEditableKidsPricing(data.KIDS_PRICING);
        if (data.DRY_HIRE_PRICES) setEditableDryHirePrices(data.DRY_HIRE_PRICES);
      }
    });
    return () => unsub();
  }, []);

  const [isSavingMenus, setIsSavingMenus] = useState(false);
  const saveAllMenusToDatabase = async () => {
    setIsSavingMenus(true);
    try {
      await setDoc(doc(db, 'site_data', 'menus'), {
        INDIAN_MENU: {
          name: 'Indian Menu',
          starters: {
            vegetarian: editableIndianMenu.vegStarters,
            nonVegetarian: editableIndianMenu.nonVegStarters,
          },
          mains: {
            vegetarian: editableIndianMenu.vegMains,
            nonVegetarian: editableIndianMenu.nonVegMains,
          },
          sundries: editableIndianMenu.sundries,
          desserts: editableIndianMenu.desserts,
          allergyNotice: 'Food Prepared in our restaurant may contain following ingredients such as Milk, Egg, Wheat, Gluten, Crustaceans, Lupin, Mustard, Nuts, Sulphur',
        },
        SRI_LANKAN_MENU: {
          name: 'Sri Lankan Menu',
          starters: {
            vegetarian: editableSLMenu.vegStarters,
            nonVegetarian: editableSLMenu.nonVegStarters,
          },
          mains: {
            vegetarian: editableSLMenu.vegMains,
            nonVegetarian: editableSLMenu.nonVegMains,
          },
          sundries: editableSLMenu.sundries,
          desserts: editableSLMenu.desserts,
          allergyNotice: 'Food Prepared in our restaurant may contain following ingredients such as Milk, Egg, Wheat, Gluten, Crustaceans, Lupin, Mustard, Nuts, Sulphur',
        },
        LIVE_COUNTER_PACKAGE: editableLiveCounter,
        BANQUET_PACKAGES: editableBanquetPackages,
        VENUE_HALL_CHARGES: editableVenueCharges,
        TABLE_SERVICE: editableTableService,
        KIDS_PRICING: editableKidsPricing,
        DRY_HIRE_PRICES: editableDryHirePrices,
      }, { merge: true });
      setCustomAlert({ message: 'Menus successfully updated on the website!', type: 'success' });
    } catch (error) {
      console.error(error);
      setCustomAlert({ message: 'Error saving menus.', type: 'error' });
    } finally {
      setIsSavingMenus(false);
    }
  };

  const startEditPackage = (pkg: typeof BANQUET_PACKAGES[0]) => {
    setEditingPackageId(pkg.id);
    setEditingPackageData({ ...pkg, desserts: [...pkg.desserts], drinks: [...pkg.drinks] });
  };

  const saveEditPackage = () => {
    if (!editingPackageData) return;
    const updated = editableBanquetPackages.map(p => p.id === editingPackageData.id ? { ...editingPackageData } : p);
    setEditableBanquetPackages(updated);

    // Keep editableKidsPricing row in sync for Over 4-10 Yr
    const kidsRowString = updated.map(p => {
      const shortName = p.name.replace(/package/i, '').trim();
      const kPrice = (p as any).kidsPrice || getKidsPrice(editableKidsPricing, p.name);
      return `${shortName}: £${kPrice}`;
    }).join(', ');

    setEditableKidsPricing(prev => prev.map(kp => {
      const lower = kp.ageRange.toLowerCase();
      if (lower.includes('4-10') || lower.includes('3-10')) {
        return { ...kp, price: kidsRowString };
      }
      return kp;
    }));

    setEditingPackageId(null);
    setEditingPackageData(null);
  };

  const buildMenuWhatsAppText = (customerName: string, customerPhone: string, menuType: string, guestCount: number) => {
    let text = `Hi ${customerName}, here are our *${menuType}* options from Honeymoon:\n\n`;
    if (menuType === 'Indian Menu') {
      text += `🥗 *Vegetarian Starters:*\n${(editableIndianMenu.vegStarters || []).map(i => `• ${i}`).join('\n')}\n\n`;
      text += `🍗 *Non-Veg Starters:*\n${(editableIndianMenu.nonVegStarters || []).map(i => `• ${i}`).join('\n')}\n\n`;
      text += `🍛 *Vegetarian Mains:*\n${(editableIndianMenu.vegMains || []).map(i => `• ${i}`).join('\n')}\n\n`;
      text += `🍖 *Non-Veg Mains:*\n${(editableIndianMenu.nonVegMains || []).map(i => `• ${i}`).join('\n')}\n\n`;
      text += `🍮 *Desserts:*\n${(editableIndianMenu.desserts || []).map(i => `• ${i}`).join('\n')}\n\n`;
    } else if (menuType === 'Sri Lankan Menu') {
      text += `🥗 *Vegetarian Starters:*\n${(editableSLMenu.vegStarters || []).map(i => `• ${i}`).join('\n')}\n\n`;
      text += `🍗 *Non-Veg Starters:*\n${(editableSLMenu.nonVegStarters || []).map(i => `• ${i}`).join('\n')}\n\n`;
      text += `🍛 *Vegetarian Mains:*\n${(editableSLMenu.vegMains || []).map(i => `• ${i}`).join('\n')}\n\n`;
      text += `🍖 *Non-Veg Mains:*\n${(editableSLMenu.nonVegMains || []).map(i => `• ${i}`).join('\n')}\n\n`;
      text += `🍮 *Desserts:*\n${(editableSLMenu.desserts || []).map(i => `• ${i}`).join('\n')}\n\n`;
    } else if (menuType === 'Venue Hall Charges') {
      text += editableVenueCharges.map(row => `• *${row.day}:* ${row.charge} ${row.note ? `(${row.note})` : ''}`).join('\n') + '\n\n';
      text += `🍷 *ALCOHOL:*\nCorkage fee - Charges for outside Alcohol in Venue which will be discussed as per guests.\n\n`;
    } else if (menuType === 'Dry Hire') {
      text += editableDryHirePrices.map(row => `• *${row.day} (${row.session}):* £${row.price}`).join('\n') + '\n\n';
    } else if (menuType === 'Kids Pricing') {
      text += `(Only Applies for over 50 Adults)\n\n`;
      text += editableKidsPricing.map(kp => `• *${kp.ageRange}:* ${kp.price}`).join('\n') + '\n\n';
      text += `*NOTE:* Minimum Number of Guests will be charged as agreed. As per our policy and food safety, we don't allow any food takeaway from Banquet Venue.\n\n`;
    } else if (menuType === 'Extras') {
      text += (editableLiveCounter.extras || []).map(e => `• *${e.name}:* £${e.price}`).join('\n') + '\n\n';
    }
    
    if (menuType.includes('Menu') || menuType === 'Extras') {
      text += `Please reply with your preferred selections. We look forward to serving you! 🙏`;
    } else {
      text += `Please let us know if you have any questions or would like to proceed with booking! 🙏`;
    }
    return buildWhatsAppLink(customerPhone, text);
  };

  const buildCompletedWhatsAppText = (booking: Booking) => {
    const calc = getInvoiceCalculations({
      ...booking,
      venueHallCharge: getBookingHallCharge(booking),
    });

    let discountText = '';
    if (booking.discount && calc.discountAmount > 0) {
      discountText = `\n• Discount (${booking.discount.reason}): -£${calc.discountAmount.toLocaleString()}`;
    }

    const hallCharge = getBookingHallCharge(booking);
    const hallText = hallCharge ? `\n• ${hallCharge.label}: £${hallCharge.amount.toLocaleString()}` : '';

    const adults = booking.adults ?? booking.guests;
    const kids4to10 = booking.kids4to10 || 0;
    const kidsUnder4 = booking.kidsUnder4 || 0;
    const kidsPrice = booking.kidsPricePerPerson ?? getKidsPrice(editableKidsPricing, booking.selectedMenu || booking.package);

    const guestBreakdown = `• Adults: ${adults} × £${editableBanquetPackages.find(p => p.name === (booking.selectedMenu || booking.package))?.pricePerPerson || 0}/person\n• Kids (4-10 yrs): ${kids4to10} × £${kidsPrice}/person\n• Kids (0-4 yrs): ${kidsUnder4} × Free`;

    return `Hi ${booking.name.split(' ')[0]},

Thank you so much for booking with Honeymoon Events! 🎊 Your event was a success and your booking is now fully completed.

*📝 Event Summary:*
• Event: ${booking.eventType}
• Date: ${booking.date}
• Package: ${booking.selectedMenu || booking.package}

*👥 Guest Breakdown:*
${guestBreakdown}
• Total Guests: ${adults + kids4to10 + kidsUnder4}

*💰 Final Invoice Details:*
• Subtotal: £${(calc.baseAmount + calc.hallAmount + calc.extraChargesTotal).toLocaleString()}${discountText}${hallText}
• Grand Total: £${calc.grandTotal.toLocaleString()}

*💳 Payment Breakdown:*
• Deposit: £${calc.deposit.toLocaleString()} (${calc.isDepositPaid ? 'Paid' : 'Pending'})
• Main Balance: £${calc.finalPaymentAmt.toLocaleString()} (${calc.isFinalPaid ? 'Paid' : 'Pending'})
• Total Paid: £${calc.totalPaid.toLocaleString()}
• Remaining Balance: ${calc.balanceDue <= 0 ? '*PAID IN FULL ✅*' : `*£${calc.balanceDue.toLocaleString()} due*`}

It was an absolute pleasure serving you. We hope you and your guests had a wonderful time! We'd love to host your future events. 🙏✨`;
  };

  const buildFinalInvoiceWhatsAppText = (booking: Booking, bank: typeof bankDetails) => {
    let extrasText = '';
    if (booking.extraCharges && booking.extraCharges.length > 0) {
      extrasText = '\n\n*➕ Additional Adjustments:*\n' + booking.extraCharges.map(c => `• ${c.label}: £${c.amount.toLocaleString()}`).join('\n');
    }

    let discountText = '';
    if (booking.discount) {
      discountText = `\n\n*🏷️ Discount (${booking.discount.reason}):* -£${getDiscountAmount(booking).toLocaleString()}`;
    }

    const hallCharge = getBookingHallCharge(booking);
    const hallText = hallCharge ? `\n\n*🏛️ ${hallCharge.label}:* £${hallCharge.amount.toLocaleString()}` : '';

    const dueDateText = booking.dueDate ? `\n\n*⏰ Payment Due By:* ${booking.dueDate}` : '';

    const adults = booking.adults ?? booking.guests;
    const kids4to10 = booking.kids4to10 || 0;
    const kidsUnder4 = booking.kidsUnder4 || 0;
    const pkgName = booking.selectedMenu || booking.package;
    const pkgObj = editableBanquetPackages.find(p => p.name === pkgName);
    const kidsPrice = booking.kidsPricePerPerson ?? (pkgObj?.kidsPrice || getKidsPrice(editableKidsPricing, pkgName));
    const pricePerPerson = booking.pricePerPerson ?? (pkgObj?.pricePerPerson || 0);

    const guestBreakdown = `*👥 Guest Breakdown:*\n• Adults: ${adults} × £${pricePerPerson}/person = £${(adults * pricePerPerson).toLocaleString()}\n• Kids (4-10 yrs): ${kids4to10} × £${kidsPrice}/person = £${(kids4to10 * kidsPrice).toLocaleString()}\n• Kids (0-4 yrs): ${kidsUnder4} × Free = £0\n• Total Guests: ${adults + kids4to10 + kidsUnder4}`;

    const calc = getInvoiceCalculations({
      ...booking,
      venueHallCharge: getBookingHallCharge(booking),
    });
    
    const breakdownText = `*💳 Payment Breakdown:*\n` +
      `• Deposit: £${calc.deposit.toLocaleString()} (${calc.isDepositPaid ? (booking.paymentMethodDeposit ? `Paid via ${booking.paymentMethodDeposit.replace('Paid by ', '')}` : 'Paid') : 'Pending'})\n` +
      `• Final Payment (Main Balance): £${calc.finalPaymentAmt.toLocaleString()} (${calc.isFinalPaid ? (booking.paymentMethodFinal ? `Paid via ${booking.paymentMethodFinal.replace('Paid by ', '')}` : 'Paid') : 'Pending'})\n` +
      `• Total Paid: £${calc.totalPaid.toLocaleString()}\n` +
      `• *Remaining Balance Due: ${calc.balanceDue <= 0 ? 'PAID IN FULL ✓' : `£${calc.balanceDue.toLocaleString()}`}*`;

    return `Hi ${booking.name.split(' ')[0]}, thank you for choosing Honeymoon Events for your ${booking.eventType}! 🎉\n\nHere is your final invoice summary:\n\n*📋 Booking Ref:* ${booking.id}\n*📦 Package:* ${booking.selectedMenu || booking.package}\n\n${guestBreakdown}\n\n*💰 Subtotal:* £${(calc.baseAmount + calc.hallAmount + calc.extraChargesTotal).toLocaleString()}${extrasText}${discountText}${hallText}\n*Grand Total:* £${calc.grandTotal.toLocaleString()}\n\n${breakdownText}${dueDateText}\n\n${calc.balanceDue > 0 ? `Please transfer the outstanding balance to:\n🏦 Account Name: ${bank.accountName}\n📋 Sort Code: ${bank.sortCode}\n🔢 Account No: ${bank.accountNumber}\n📌 Reference: ${booking.id}\n\nOnce paid, please send a screenshot of the transfer confirmation here. Thank you!` : 'Thank you, your invoice is paid in full.'}`;
  };

  const buildExtraInvoiceWhatsAppText = (booking: Booking, bank: typeof bankDetails) => {
    const nonPreset = (booking.extraCharges || []).filter(c => !c.isPreset && !(editableLiveCounter?.extras || []).some(preset => preset.name === c.label));
    const extraChargesTotal = nonPreset.reduce((sum, c) => sum + c.amount, 0);
    const extrasList = nonPreset.map(c => `• ${c.label}: £${c.amount.toLocaleString()}`).join('\n');

    return `Hi ${booking.name.split(' ')[0]},

Thank you for celebrating with us at Honeymoon Events! 🎉 We hope you had a fantastic time.

There were some additional adjustments/services added during your event:
${extrasList}

*💰 Extra Balance Due: £${extraChargesTotal.toLocaleString()}*

Please transfer this outstanding balance to:
🏦 Account Name: ${bank.accountName}
📋 Sort Code: ${bank.sortCode}
🔢 Account No: ${bank.accountNumber}
📌 Reference: ${booking.id} (Extras)

Once paid, please send a screenshot of the transfer confirmation here so we can finalize and close your booking. Thank you! 🙏`;
  };

  const buildFinalPaymentBankWhatsAppText = (booking: Booking, bank: typeof bankDetails) => {
    const grandTotal = getTotalAmount(booking);
    const remainingBalance = Math.max(0, grandTotal - booking.deposit);

    return `Hi ${booking.name.split(' ')[0]},

Regarding your ${booking.eventType} booking on ${booking.date} (Booking Ref: *${booking.id}*) with Honeymoon Events 🎉:

*💰 Final Balance Due: £${remainingBalance.toLocaleString()}*

Please transfer this balance to our official bank account:
🏦 *Account Name:* ${bank.accountName}
📋 *Sort Code:* ${bank.sortCode}
🔢 *Account Number:* ${bank.accountNumber}
📌 *Payment Reference:* ${booking.id}

Once you have completed the transfer, please send us a screenshot of the payment confirmation here. After payment confirmation, your order will be officially closed and completed. Thank you! 🙏`;
  };

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
      setLoggedIn(true);
      setLoginError('');
    } catch (error) {
      console.error(error);
      setLoginError('Invalid credentials or user not found in Firebase Authentication.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const updateStatus = async (id: string, status: BookingStatus) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    setSelectedBooking(prev => prev?.id === id ? { ...prev, status } : prev);
    try {
      await setDoc(doc(db, 'booking_requests', id), { status }, { merge: true });
      if (status !== 'new_enquiry') {
        const currentBooking = bookings.find(b => b.id === id);
        if (currentBooking) {
          const bookingData = {
            ...currentBooking,
            status,
            updatedAt: new Date().toISOString()
          };
          const cleanBookingData = Object.fromEntries(
            Object.entries(bookingData).filter(([_, v]) => v !== undefined)
          );
          await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
        }
      }
    } catch (error) {
      console.error('Error updating status in database:', error);
    }
  };

  const advanceStatus = async (booking: Booking) => {
    const idx = STATUS_FLOW.indexOf(booking.status);
    if (idx < STATUS_FLOW.length - 1) {
      await updateStatus(booking.id, STATUS_FLOW[idx + 1]);
    }
  };

  const handleGoBackStatus = async (id: string) => {
    const currentBooking = bookings.find(b => b.id === id);
    if (!currentBooking) return;
    const idx = STATUS_FLOW.indexOf(currentBooking.status);
    if (idx > 0) {
      const prevStatus = STATUS_FLOW[idx - 1];
      await updateStatus(id, prevStatus);
    }
  };

  const handleGoForwardStatus = async (id: string) => {
    const currentBooking = bookings.find(b => b.id === id);
    if (!currentBooking) return;
    const idx = STATUS_FLOW.indexOf(currentBooking.status);
    if (idx < STATUS_FLOW.length - 1) {
      const nextStatus = STATUS_FLOW[idx + 1];
      await updateStatus(id, nextStatus);
    }
  };

  const confirmDepositPaid = async (id: string, method: string) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, depositPaid: true, status: 'deposit_confirmed', paymentMethodDeposit: method } : b));
    setSelectedBooking(prev => prev?.id === id ? { ...prev, depositPaid: true, status: 'deposit_confirmed', paymentMethodDeposit: method } : prev);
    try {
      await setDoc(doc(db, 'booking_requests', id), { depositPaid: true, status: 'deposit_confirmed', paymentMethodDeposit: method }, { merge: true });
      const currentBooking = bookings.find(b => b.id === id);
      if (currentBooking) {
        const bookingData = {
          ...currentBooking,
          depositPaid: true,
          status: 'deposit_confirmed',
          paymentMethodDeposit: method,
          updatedAt: new Date().toISOString()
        };
        const cleanBookingData = Object.fromEntries(
          Object.entries(bookingData).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
      }
    } catch (error) {
      console.error('Error confirming deposit paid in database:', error);
    }
  };

  const handleUploadProof = async (id: string, file: File) => {
    setIsUploadingProof(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise((resolve, reject) => {
        reader.onload = resolve;
        reader.onerror = reject;
      });

      const img = new window.Image();
      img.src = reader.result as string;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      const base64String = canvas.toDataURL('image/jpeg', 0.7);

      setBookings(prev => prev.map(b => b.id === id ? { ...b, paymentProofDeposit: base64String } : b));
      setSelectedBooking(prev => prev?.id === id ? { ...prev, paymentProofDeposit: base64String } : prev);

      await setDoc(doc(db, 'booking_requests', id), { paymentProofDeposit: base64String }, { merge: true });
      const currentBooking = bookings.find(b => b.id === id);
      if (currentBooking) {
        const bookingData = {
          ...currentBooking,
          paymentProofDeposit: base64String,
          updatedAt: new Date().toISOString()
        };

        // Remove undefined values which Firestore rejects
        const cleanBookingData = Object.fromEntries(
          Object.entries(bookingData).filter(([_, v]) => v !== undefined)
        );

        await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
      }
      setCustomAlert({ message: 'Payment proof uploaded successfully!', type: 'success' });
    } catch (error: any) {
      console.error('Error uploading payment proof:', error);
      setCustomAlert({ message: `Error uploading payment proof: ${error.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsUploadingProof(false);
    }
  };

  const handleUploadFinalProof = async (id: string, file: File) => {
    setIsUploadingFinalProof(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise((resolve, reject) => {
        reader.onload = resolve;
        reader.onerror = reject;
      });

      const img = new window.Image();
      img.src = reader.result as string;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      const base64String = canvas.toDataURL('image/jpeg', 0.7);

      setBookings(prev => prev.map(b => b.id === id ? { ...b, paymentProofFinal: base64String } : b));
      setSelectedBooking(prev => prev?.id === id ? { ...prev, paymentProofFinal: base64String } : prev);

      await setDoc(doc(db, 'booking_requests', id), { paymentProofFinal: base64String }, { merge: true });
      const currentBooking = bookings.find(b => b.id === id);
      if (currentBooking) {
        const bookingData = {
          ...currentBooking,
          paymentProofFinal: base64String,
          updatedAt: new Date().toISOString()
        };

        const cleanBookingData = Object.fromEntries(
          Object.entries(bookingData).filter(([_, v]) => v !== undefined)
        );

        await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
      }
      setCustomAlert({ message: 'Final payment proof uploaded successfully!', type: 'success' });
    } catch (error: any) {
      console.error('Error uploading final payment proof:', error);
      setCustomAlert({ message: `Error uploading final payment proof: ${error.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsUploadingFinalProof(false);
    }
  };

  const handleUploadExtraProof = async (id: string, file: File) => {
    setIsUploadingExtraProof(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise((resolve, reject) => {
        reader.onload = resolve;
        reader.onerror = reject;
      });

      const img = new window.Image();
      img.src = reader.result as string;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      const base64String = canvas.toDataURL('image/jpeg', 0.7);

      setBookings(prev => prev.map(b => b.id === id ? { ...b, paymentProofExtra: base64String } : b));
      setSelectedBooking(prev => prev?.id === id ? { ...prev, paymentProofExtra: base64String } : prev);

      await setDoc(doc(db, 'booking_requests', id), { paymentProofExtra: base64String }, { merge: true });
      const currentBooking = bookings.find(b => b.id === id);
      if (currentBooking) {
        const bookingData = {
          ...currentBooking,
          paymentProofExtra: base64String,
          updatedAt: new Date().toISOString()
        };

        const cleanBookingData = Object.fromEntries(
          Object.entries(bookingData).filter(([_, v]) => v !== undefined)
        );

        await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
      }
      setCustomAlert({ message: 'Extra payment proof uploaded successfully!', type: 'success' });
    } catch (error: any) {
      console.error('Error uploading extra payment proof:', error);
      setCustomAlert({ message: `Error uploading extra payment proof: ${error.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsUploadingExtraProof(false);
    }
  };

  const confirmFinalPayment = async (id: string, method: string) => {
    const currentBooking = bookings.find(b => b.id === id);
    const nowIso = new Date().toISOString();
    
    setBookings(prev => prev.map(b => b.id === id ? { ...b, finalPaymentPaid: true, status: 'completed', paymentMethodFinal: method } : b));
    setSelectedBooking(prev => prev?.id === id ? { ...prev, finalPaymentPaid: true, status: 'completed', paymentMethodFinal: method } : prev);
    try {
      await setDoc(doc(db, 'booking_requests', id), { 
        finalPaymentPaid: true, 
        status: 'completed', 
        paymentMethodFinal: method,
        orderClosedAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });
      if (currentBooking) {
        const bookingData = {
          ...currentBooking,
          finalPaymentPaid: true,
          status: 'completed',
          paymentMethodFinal: method,
          orderClosedAt: nowIso,
          updatedAt: nowIso,
        };
        const cleanBookingData = Object.fromEntries(
          Object.entries(bookingData).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
      }
      setCustomAlert({
        message: `Final payment via ${method} confirmed successfully! Order #${id} is now closed and marked as completed.`,
        type: 'success'
      });
    } catch (error: any) {
      console.error('Error confirming final payment in database:', error);
      setCustomAlert({
        message: `Error confirming final payment: ${error?.message || 'Please try again.'}`,
        type: 'error'
      });
    }
  };

  const handleDeleteBooking = (id: string, name: string) => {
    setBookingToDelete({ id, name });
  };

  const confirmDeleteBooking = async () => {
    if (!bookingToDelete) return;
    try {
      await deleteDoc(doc(db, 'booking_requests', bookingToDelete.id));
      await deleteDoc(doc(db, 'bookings', bookingToDelete.id));
      setBookings(prev => prev.filter(b => b.id !== bookingToDelete.id));
      if (selectedBooking?.id === bookingToDelete.id) {
        setSelectedBooking(null);
      }
      setCustomAlert({ message: 'Booking deleted successfully', type: 'success' });
    } catch (error) {
      console.error('Error deleting booking:', error);
      setCustomAlert({ message: 'Error deleting booking. Please try again.', type: 'error' });
    } finally {
      setBookingToDelete(null);
    }
  };

  const addExtraCharge = async (id: string) => {
    if (!extraLabel || !extraAmount) return;
    const charge: ExtraCharge = { label: extraLabel, amount: parseFloat(extraAmount) };
    const currentBooking = bookings.find(b => b.id === id);
    if (!currentBooking) return;
    const newExtraCharges = [...(currentBooking.extraCharges || []), charge];

    setBookings(prev => prev.map(b => b.id === id ? { ...b, extraCharges: newExtraCharges } : b));
    setSelectedBooking(prev => prev?.id === id ? { ...prev, extraCharges: newExtraCharges } : prev);
    setExtraLabel('');
    setExtraAmount('');

    try {
      await setDoc(doc(db, 'booking_requests', id), { extraCharges: newExtraCharges }, { merge: true });
      const bookingData = {
        ...currentBooking,
        extraCharges: newExtraCharges,
        updatedAt: new Date().toISOString()
      };
      const cleanBookingData = Object.fromEntries(
        Object.entries(bookingData).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
    } catch (error) {
      console.error('Error adding extra charge to database:', error);
    }
  };

  const requestDiscount = async (id: string) => {
    if (!discountValue || !discountReason) return;
    const currentBooking = bookings.find(b => b.id === id);
    if (!currentBooking) return;

    const isSuperAdmin = !currentUser?.role || currentUser?.role === 'Super Admin';

    if (isSuperAdmin) {
      const discount: Discount = {
        type: discountType,
        value: parseFloat(discountValue),
        reason: discountReason
      };
      setBookings(prev => prev.map(b => b.id === id ? { ...b, discount, discountRequest: undefined } : b));
      setSelectedBooking(prev => prev?.id === id ? { ...prev, discount, discountRequest: undefined } : prev);

      try {
        await setDoc(doc(db, 'booking_requests', id), { discount, discountRequest: null }, { merge: true });
        const bookingData = {
          ...currentBooking,
          discount,
          discountRequest: null,
          updatedAt: new Date().toISOString()
        };
        const cleanBookingData = Object.fromEntries(
          Object.entries(bookingData).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
      } catch (error) {
        console.error('Error applying discount:', error);
      }
      setDiscountValue('');
      setDiscountReason('');
      setCustomAlert({ message: 'Discount applied successfully!', type: 'success' });
      return;
    }

    const discountReq: DiscountRequest = {
      type: discountType,
      value: parseFloat(discountValue),
      reason: discountReason,
      status: 'pending',
      requestedAt: new Date().toISOString()
    };

    setBookings(prev => prev.map(b => b.id === id ? { ...b, discountRequest: discountReq } : b));
    setSelectedBooking(prev => prev?.id === id ? { ...prev, discountRequest: discountReq } : prev);

    try {
      await setDoc(doc(db, 'booking_requests', id), { discountRequest: discountReq }, { merge: true });
      const bookingData = {
        ...currentBooking,
        discountRequest: discountReq,
        updatedAt: new Date().toISOString()
      };
      const cleanBookingData = Object.fromEntries(
        Object.entries(bookingData).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
    } catch (error) {
      console.error('Error requesting discount:', error);
    }

    setDiscountValue('');
    setDiscountReason('');
    setCustomAlert({ message: 'Request has been sent to Management. Please wait for confirmation.', type: 'success' });
  };

  const handleDiscountApproval = async (bookingId: string, approved: boolean) => {
    const b = bookings.find(x => x.id === bookingId);
    if (!b || !b.discountRequest) return;
    
    if (approved) {
      const discount: Discount = {
        type: b.discountRequest.type,
        value: b.discountRequest.value,
        reason: b.discountRequest.reason
      };
      
      const reqUpdated = { ...b.discountRequest, status: 'approved' as const };
      
      setBookings(prev => prev.map(x => x.id === bookingId ? { ...x, discount, discountRequest: reqUpdated } : x));
      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => prev ? { ...prev, discount, discountRequest: reqUpdated } : prev);
      }
      
      try {
        await setDoc(doc(db, 'booking_requests', bookingId), { discount, discountRequest: reqUpdated }, { merge: true });
        const cleanBookingData = { ...b, discount, discountRequest: reqUpdated, updatedAt: new Date().toISOString() };
        const finalData = Object.fromEntries(Object.entries(cleanBookingData).filter(([_, v]) => v !== undefined));
        await setDoc(doc(db, 'bookings', bookingId), finalData, { merge: true });
      } catch (e) {
        console.error(e);
      }
      setCustomAlert({ message: 'Discount approved successfully!', type: 'success' });
    } else {
      const reqUpdated = { ...b.discountRequest, status: 'rejected' as const };
      setBookings(prev => prev.map(x => x.id === bookingId ? { ...x, discountRequest: reqUpdated } : x));
      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => prev ? { ...prev, discountRequest: reqUpdated } : prev);
      }
      try {
        await setDoc(doc(db, 'booking_requests', bookingId), { discountRequest: reqUpdated }, { merge: true });
        const cleanBookingData = { ...b, discountRequest: reqUpdated, updatedAt: new Date().toISOString() };
        const finalData = Object.fromEntries(Object.entries(cleanBookingData).filter(([_, v]) => v !== undefined));
        await setDoc(doc(db, 'bookings', bookingId), finalData, { merge: true });
      } catch (e) {
        console.error(e);
      }
      setCustomAlert({ message: 'Discount request rejected.', type: 'success' });
    }
  };

  const removeDiscount = async (id: string) => {
    const currentBooking = bookings.find(b => b.id === id);
    if (!currentBooking) return;

    setBookings(prev => prev.map(b => {
      if (b.id === id) {
        const { discount, ...rest } = b;
        return rest as Booking;
      }
      return b;
    }));

    setSelectedBooking(prev => {
      if (prev?.id === id) {
        const { discount, ...rest } = prev;
        return rest as Booking;
      }
      return prev;
    });

    try {
      await setDoc(doc(db, 'booking_requests', id), { discount: null }, { merge: true });
      const { discount, ...restBookingData } = currentBooking;
      const bookingData = {
        ...restBookingData,
        discount: null,
        updatedAt: new Date().toISOString()
      };
      const cleanBookingData = Object.fromEntries(
        Object.entries(bookingData).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'bookings', id), cleanBookingData, { merge: true });
    } catch (error) {
      console.error('Error removing discount:', error);
    }
  };

  const removeExtraCharge = async (bookingId: string, idx: number) => {
    const currentBooking = bookings.find(b => b.id === bookingId);
    if (!currentBooking) return;
    const newExtraCharges = (currentBooking.extraCharges || []).filter((_, i) => i !== idx);

    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, extraCharges: newExtraCharges } : b));
    setSelectedBooking(prev => prev?.id === bookingId ? { ...prev, extraCharges: newExtraCharges } : prev);

    try {
      await setDoc(doc(db, 'booking_requests', bookingId), { extraCharges: newExtraCharges }, { merge: true });
      const bookingData = {
        ...currentBooking,
        extraCharges: newExtraCharges,
        updatedAt: new Date().toISOString()
      };
      const cleanBookingData = Object.fromEntries(
        Object.entries(bookingData).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'bookings', bookingId), cleanBookingData, { merge: true });
    } catch (error) {
      console.error('Error removing extra charge from database:', error);
    }
  };

  // ─── VENUE HALL CHARGE HANDLERS (EXPLICIT SELECT ADD / REMOVE) ───────────────
  const handleRemoveHallChargeFromBooking = async (booking: Booking) => {
    try {
      const updatedCharges = (booking.extraCharges || []).filter(c => !c.label.toLowerCase().includes('hall hire') && !c.label.toLowerCase().includes('dry hire'));
      const updatedBooking: Booking = {
        ...booking,
        includeVenueHall: false,
        venueHallCharge: null,
        extraCharges: updatedCharges,
      };

      setBookings(prev => prev.map(b => b.id === booking.id ? updatedBooking : b));
      if (selectedBooking?.id === booking.id) {
        setSelectedBooking(updatedBooking);
      }

      await setDoc(doc(db, 'booking_requests', booking.id), {
        includeVenueHall: false,
        venueHallCharge: null,
        extraCharges: updatedCharges,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      const cleanData = Object.fromEntries(
        Object.entries({ ...updatedBooking, updatedAt: new Date().toISOString() }).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'bookings', booking.id), cleanData, { merge: true });
      setCustomAlert({ message: 'Venue hall charge removed (£0)', type: 'success' });
    } catch (err) {
      console.error('Error removing hall charge:', err);
      setCustomAlert({ message: 'Could not remove hall charge.', type: 'error' });
    }
  };

  const handleApplyHallChargeToBooking = async (
    booking: Booking,
    charge: { label: string; amount: number; isCustom?: boolean; reason?: string }
  ) => {
    try {
      const updatedBooking: Booking = {
        ...booking,
        includeVenueHall: true,
        venueHallCharge: charge,
      };

      setBookings(prev => prev.map(b => b.id === booking.id ? updatedBooking : b));
      if (selectedBooking?.id === booking.id) {
        setSelectedBooking(updatedBooking);
      }

      await setDoc(doc(db, 'booking_requests', booking.id), {
        includeVenueHall: true,
        venueHallCharge: charge,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      const cleanData = Object.fromEntries(
        Object.entries({ ...updatedBooking, updatedAt: new Date().toISOString() }).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'bookings', booking.id), cleanData, { merge: true });
      setShowAddHallModal(false);
      setCustomAlert({ message: `Venue hall charge added: £${charge.amount}`, type: 'success' });
    } catch (err) {
      console.error('Error applying hall charge:', err);
      setCustomAlert({ message: 'Could not apply hall charge.', type: 'error' });
    }
  };

  // ─── CANCELLATION FLOW HANDLERS (MANUAL & WEBSITE BOOKING ORDERS) ───────────
  const handleOpenCancellationModal = (booking: Booking) => {
    setCancellationModalBooking(booking);
    setCancellationReason('Client requested cancellation');
    setCancellationCustomReason('');
    setCancellationNotes('');
  };

  const handleConfirmCancellation = async () => {
    if (!cancellationModalBooking) return;
    setIsSubmittingCancellation(true);
    try {
      const depositAmt = cancellationModalBooking.deposit || 0;
      const cancellationPayload = {
        cancelledAt: new Date().toISOString(),
        cancelledBy: currentUser?.name || 'Administrator',
        reason: cancellationReason === 'Other' ? (cancellationCustomReason.trim() || 'Other') : cancellationReason,
        customReason: cancellationCustomReason.trim(),
        advancePaid: depositAmt,
        depositPaid: cancellationModalBooking.depositPaid,
        depositMethod: cancellationModalBooking.paymentMethodDeposit || 'N/A',
        notes: cancellationNotes.trim(),
      };

      const bookingId = cancellationModalBooking.id;

      await setDoc(doc(db, 'booking_requests', bookingId), {
        status: 'cancelled',
        cancellationDetails: cancellationPayload,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await setDoc(doc(db, 'bookings', bookingId), {
        status: 'cancelled',
        cancellationDetails: cancellationPayload,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      setBookings(prev => prev.map(b => b.id === bookingId ? {
        ...b,
        status: 'cancelled',
        cancellationDetails: cancellationPayload,
      } : b));

      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => prev ? {
          ...prev,
          status: 'cancelled',
          cancellationDetails: cancellationPayload,
        } : null);
      }

      setCancellationModalBooking(null);
      setCustomAlert({ message: 'Order has been successfully cancelled.', type: 'success' });
    } catch (err) {
      console.error('Error cancelling booking:', err);
      setCustomAlert({ message: 'Failed to cancel order. Please try again.', type: 'error' });
    } finally {
      setIsSubmittingCancellation(false);
    }
  };

  const handleRestoreBooking = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to restore and reopen this booking?')) return;
    try {
      const target = bookings.find(b => b.id === bookingId);
      const restoredStatus: BookingStatus = target?.depositPaid ? 'deposit_confirmed' : 'new_enquiry';

      await setDoc(doc(db, 'booking_requests', bookingId), {
        status: restoredStatus,
        cancellationDetails: null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await setDoc(doc(db, 'bookings', bookingId), {
        status: restoredStatus,
        cancellationDetails: null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      setBookings(prev => prev.map(b => b.id === bookingId ? {
        ...b,
        status: restoredStatus,
        cancellationDetails: undefined,
      } : b));

      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => prev ? {
          ...prev,
          status: restoredStatus,
          cancellationDetails: undefined,
        } : null);
      }
      setCustomAlert({ message: 'Booking restored successfully.', type: 'success' });
    } catch (err) {
      console.error('Error restoring booking:', err);
      setCustomAlert({ message: 'Could not restore booking.', type: 'error' });
    }
  };

  const buildCancellationWhatsAppText = (booking: Booking): string => {
    const details = booking.cancellationDetails;
    const clientFirstName = booking.name.split(' ')[0] || booking.name;
    const reasonText = details?.reason || 'Client request';
    const advancePaid = details?.advancePaid || booking.deposit || 0;
    const advanceStatus = booking.depositPaid && advancePaid > 0 
      ? `• Advance Amount Paid: £${advancePaid.toLocaleString()} (${booking.paymentMethodDeposit || 'Received'})\n`
      : '• Advance Amount Paid: £0 / No advance received\n';

    return `Dear ${clientFirstName},

This is an official cancellation confirmation from *Honeymoon Events* regarding your reservation.

*ORDER CANCELLATION DETAILS*
• Order ID: #${booking.id}
• Event Type: ${booking.eventType}
• Original Scheduled Date: ${booking.date}
• Reason for Cancellation: ${reasonText}
${advanceStatus}${details?.notes ? `• Cancellation Remarks: ${details.notes}\n` : ''}
Should you require any further assistance or wish to book an event in the future, please do not hesitate to contact us.

Warm regards,
*Honeymoon Events Management*
📞 +44 20 8570 5678 | 🌐 honeymoonevents.co.uk`;
  };

  // ─── BOOKING TRACKER PDF EXPORT (FILTERED & SINGLE ORDER) ────────────────────
  const handleDownloadFilteredTrackerPDF = (filteredList: Booking[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up was blocked. Please allow pop-ups to download/print the tracker report.');
      return;
    }

    const totalOrders = filteredList.length;
    const totalRevenue = filteredList.reduce((sum, b) => sum + getTotalAmount(b), 0);
    const totalDiscounts = filteredList.reduce((sum, b) => sum + getDiscountAmount(b), 0);
    const totalDeposits = filteredList.reduce((sum, b) => sum + (b.depositPaid ? b.deposit : 0), 0);
    const totalBalance = filteredList.reduce((sum, b) => {
      const isFinalPaid = b.finalPaymentPaid;
      if (isFinalPaid) return sum;
      const grand = getTotalAmount(b);
      const paid = b.depositPaid ? b.deposit : 0;
      return sum + Math.max(0, grand - paid);
    }, 0);

    const nowStr = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    const rowsHTML = filteredList.map((b) => {
      const grandTotal = getTotalAmount(b);
      const discount = getDiscountAmount(b);
      const hallFee = getBookingHallCharge(b);
      const isDepositPaid = b.depositPaid;
      const isFinalPaid = b.finalPaymentPaid;
      const balanceDue = isFinalPaid ? 0 : Math.max(0, grandTotal - (isDepositPaid ? b.deposit : 0));

      return `
        <tr>
          <td style="font-weight:600; font-family:monospace; color:#374151;">#${b.id.slice(0, 8)}</td>
          <td>
            <strong>${b.name}</strong><br/>
            <span style="font-size:11px; color:#6B7280;">${b.phone} | ${b.email}</span>
          </td>
          <td>
            <strong>${b.eventType}</strong><br/>
            <span style="font-size:11px; color:#6B7280;">Date: ${b.date} (${b.time})</span>
          </td>
          <td style="text-align:center;">${b.adults ?? b.guests} adults${(b.kids4to10 || 0) > 0 ? ` + ${b.kids4to10} kids` : ''}</td>
          <td>
            <span style="font-size:11px;">${b.selectedMenu || b.package}</span>
            ${hallFee ? `<br/><span style="font-size:10px; color:#4338CA;">🏛️ ${hallFee.label} (£${hallFee.amount})</span>` : ''}
          </td>
          <td style="text-align:right; font-weight:600;">£${grandTotal.toLocaleString()}</td>
          <td style="text-align:right; color:#DC2626;">${discount > 0 ? `-£${discount.toLocaleString()}` : '—'}</td>
          <td style="text-align:right; color:#059669; font-weight:600;">
            ${isDepositPaid ? `£${b.deposit.toLocaleString()}` : `<span style="color:#D97706;">Pending</span>`}
          </td>
          <td style="text-align:right; font-weight:600; color:${balanceDue === 0 ? '#059669' : '#92400E'};">
            ${balanceDue === 0 ? '£0 (Paid)' : `£${balanceDue.toLocaleString()}`}
          </td>
          <td style="text-align:center;">
            <span style="display:inline-block; padding:3px 8px; border-radius:9999px; font-size:11px; font-weight:700; ${
              b.status === 'completed' ? 'background:#ECFDF5; color:#065F46;' :
              b.status === 'cancelled' ? 'background:#FFE4E6; color:#9F1239;' :
              b.status.includes('deposit') ? 'background:#FEF3C7; color:#92400E;' :
              'background:#F3F4F6; color:#374151;'
            }">
              ${STATUS_LABELS[b.status] || b.status}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Honeymoon Events - Booking Tracker Report</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; color: #1F2937; background: #fff; }
          .no-print-bar { display: flex; justify-content: space-between; align-items: center; background: #111827; color: white; padding: 12px 20px; border-radius: 8px; margin-bottom: 24px; }
          .no-print-btn { background: #C8860A; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
          .no-print-btn:hover { background: #E09812; }
          @media print { .no-print-bar { display: none !important; } @page { margin: 12mm; size: landscape; } body { margin: 0; } }
          .header-box { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #C8860A; padding-bottom: 16px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: 800; color: #111827; margin: 0; }
          .subtitle { font-size: 13px; color: #6B7280; margin-top: 4px; }
          .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
          .kpi-card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 14px; }
          .kpi-title { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; margin-bottom: 4px; }
          .kpi-value { font-size: 18px; font-weight: 800; color: #111827; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #F3F4F6; text-align: left; padding: 8px 10px; font-weight: 700; color: #374151; border-bottom: 2px solid #D1D5DB; }
          td { padding: 9px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
          tr:nth-child(even) td { background: #FAFAFA; }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <div><strong>Booking Tracker Filtered Export</strong> — Ready for PDF download or print</div>
          <div>
            <button class="no-print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
          </div>
        </div>
        <div class="header-box">
          <div>
            <h1 class="title">HONEYMOON EVENTS</h1>
            <div class="subtitle">Comprehensive Booking &amp; Order Tracker Report • Generated: ${nowStr}</div>
            <div style="font-size:11px; color:#4B5563; margin-top:6px;">
              <strong>Active Filters:</strong> Status: ${trackerStatusFilter.toUpperCase()} | Event: ${trackerEventFilter.toUpperCase()} | Date Query: ${trackerDateFilter || 'All'} | Search: "${trackerSearch || 'None'}"
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; font-weight:bold; color:#C8860A;">CONFIDENTIAL OPERATIONS REPORT</div>
            <div style="font-size:11px; color:#6B7280;">Honeymoon Banquet Hall &amp; Catering</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title">Total Bookings</div>
            <div class="kpi-value">${totalOrders}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Gross Revenue</div>
            <div class="kpi-value">£${totalRevenue.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Total Discounts</div>
            <div class="kpi-value" style="color:#DC2626;">-£${totalDiscounts.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Deposits Received</div>
            <div class="kpi-value" style="color:#059669;">£${totalDeposits.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Pending Balance</div>
            <div class="kpi-value" style="color:#B45309;">£${totalBalance.toLocaleString()}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Event &amp; Date</th>
              <th style="text-align:center;">Guests</th>
              <th>Package &amp; Venue</th>
              <th style="text-align:right;">Total</th>
              <th style="text-align:right;">Discount</th>
              <th style="text-align:right;">Advance</th>
              <th style="text-align:right;">Balance</th>
              <th style="text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>

        <div style="margin-top:24px; font-size:11px; color:#9CA3AF; text-align:center; border-top:1px solid #E5E7EB; padding-top:12px;">
          Generated automatically by Honeymoon Events Management Dashboard • All records reconciled with live booking registers.
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  const handleDownloadSingleBookingTrackerPDF = (tb: Booking) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up was blocked. Please allow pop-ups to download/print the tracker sheet.');
      return;
    }

    const grandTotal = getTotalAmount(tb);
    const discountAmt = getDiscountAmount(tb);
    const hallCharge = getBookingHallCharge(tb);
    const depositAmt = tb.deposit || 0;
    const isDepositPaid = tb.depositPaid;
    const isFinalPaid = tb.finalPaymentPaid;
    const balanceDue = isFinalPaid ? 0 : Math.max(0, grandTotal - (isDepositPaid ? depositAmt : 0));
    const nowStr = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Booking #${tb.id} - Complete Timeline & Audit Record</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 25px; color: #1F2937; background: #fff; }
          .no-print-bar { display: flex; justify-content: space-between; align-items: center; background: #111827; color: white; padding: 12px 20px; border-radius: 8px; margin-bottom: 24px; }
          .no-print-btn { background: #C8860A; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
          @media print { .no-print-bar { display: none !important; } @page { margin: 15mm; size: portrait; } body { margin: 0; } }
          .header { border-bottom: 2px solid #C8860A; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .brand { font-size: 22px; font-weight: 800; color: #111827; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; background: #FEF3C7; color: #92400E; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
          .card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 14px; }
          .card-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6B7280; margin-bottom: 8px; }
          .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
          .info-label { color: #6B7280; font-weight: 500; }
          .info-val { font-weight: 600; color: #111827; }
          .timeline { border-left: 2px solid #C8860A; margin: 16px 0 20px 10px; padding-left: 18px; }
          .timeline-item { position: relative; margin-bottom: 16px; font-size: 12px; }
          .timeline-dot { position: absolute; left: -24px; top: 2px; width: 10px; height: 10px; border-radius: 50%; background: #C8860A; border: 2px solid white; box-shadow: 0 0 0 1px #C8860A; }
          .timeline-title { font-weight: 700; color: #111827; }
          .timeline-desc { color: #4B5563; margin-top: 2px; }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <div><strong>Order Tracker Dossier: #${tb.id}</strong> (${tb.name})</div>
          <div><button class="no-print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button></div>
        </div>

        <div class="header">
          <div>
            <div class="brand">HONEYMOON EVENTS</div>
            <div style="font-size:13px; color:#4B5563; margin-top:3px;">Official Booking Dossier &amp; Lifecycle Audit Trail</div>
            <div style="font-size:11px; color:#9CA3AF; margin-top:4px;">Generated: ${nowStr}</div>
          </div>
          <div style="text-align:right;">
            <div class="badge">${STATUS_LABELS[tb.status] || tb.status}</div>
            <div style="font-size:11px; color:#6B7280; margin-top:6px;">Booking ID: #${tb.id}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Customer Information</div>
            <div class="info-row"><span class="info-label">Full Name:</span><span class="info-val">${tb.name}</span></div>
            <div class="info-row"><span class="info-label">Phone:</span><span class="info-val">${tb.phone}</span></div>
            <div class="info-row"><span class="info-label">Email:</span><span class="info-val">${tb.email}</span></div>
            <div class="info-row"><span class="info-label">Enquiry Date:</span><span class="info-val">${tb.enquiryDate || 'N/A'}</span></div>
          </div>

          <div class="card">
            <div class="card-title">Event Logistics</div>
            <div class="info-row"><span class="info-label">Event Type:</span><span class="info-val">${tb.eventType}</span></div>
            <div class="info-row"><span class="info-label">Event Date:</span><span class="info-val">${tb.date}</span></div>
            <div class="info-row"><span class="info-label">Time Session:</span><span class="info-val">${tb.time}</span></div>
            <div class="info-row"><span class="info-label">Guest Count:</span><span class="info-val">${tb.adults ?? tb.guests} Adults, ${tb.kids4to10 || 0} Kids</span></div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Package &amp; Venue Allocation</div>
            <div class="info-row"><span class="info-label">Selected Menu:</span><span class="info-val">${tb.selectedMenu || tb.package}</span></div>
            <div class="info-row"><span class="info-label">Food Package Base:</span><span class="info-val">£${tb.baseAmount.toLocaleString()}</span></div>
            <div class="info-row"><span class="info-label">Venue Hall Hire:</span><span class="info-val">${hallCharge ? `${hallCharge.label} (+£${hallCharge.amount.toLocaleString()})` : 'No Hall Fee (£0 / Offsite)'}</span></div>
            ${(tb.extraCharges || []).length > 0 ? `
              <div class="info-row"><span class="info-label">Extra Services:</span><span class="info-val">£${(tb.extraCharges || []).reduce((s, c) => s + c.amount, 0).toLocaleString()}</span></div>
            ` : ''}
          </div>

          <div class="card">
            <div class="card-title">Financial Settlement &amp; Discount</div>
            <div class="info-row"><span class="info-label">Total Amount:</span><span class="info-val">£${grandTotal.toLocaleString()}</span></div>
            ${discountAmt > 0 ? `
              <div class="info-row"><span class="info-label">Discount Granted:</span><span class="info-val" style="color:#DC2626;">-£${discountAmt.toLocaleString()} (${tb.discount?.reason || 'Approved Discount'})</span></div>
            ` : ''}
            <div class="info-row"><span class="info-label">Advance Deposit:</span><span class="info-val" style="color:#059669;">£${depositAmt.toLocaleString()} (${isDepositPaid ? 'Received ✓' : 'Pending'})</span></div>
            <div class="info-row"><span class="info-label">Payment Method:</span><span class="info-val">${tb.paymentMethodDeposit || 'Bank Transfer'}</span></div>
            <div class="info-row"><span class="info-label">Outstanding Balance:</span><span class="info-val" style="color:${balanceDue === 0 ? '#059669' : '#B45309'};">${balanceDue === 0 ? '£0 (Fully Settled)' : `£${balanceDue.toLocaleString()}`}</span></div>
          </div>
        </div>

        ${tb.cancellationDetails ? `
          <div style="background:#FFF1F2; border:1px solid #FECDD3; border-radius:8px; padding:14px; margin-bottom:20px;">
            <div style="font-size:12px; font-weight:700; color:#9F1239; margin-bottom:6px;">⚠️ CANCELLATION AUDIT RECORD</div>
            <div style="font-size:12px; color:#4C0519;">
              <strong>Cancelled On:</strong> ${new Date(tb.cancellationDetails.cancelledAt).toLocaleString('en-GB')}<br/>
              <strong>Cancelled By:</strong> ${tb.cancellationDetails.cancelledBy || 'Administrator'}<br/>
              <strong>Reason:</strong> ${tb.cancellationDetails.reason}<br/>
              <strong>Advance Paid:</strong> ${tb.cancellationDetails.advancePaid > 0 ? `£${(tb.cancellationDetails.advancePaid || 0).toLocaleString()} (Received)` : '£0 (No advance paid)'}
              ${tb.cancellationDetails.notes ? `<br/><strong>Remarks:</strong> ${tb.cancellationDetails.notes}` : ''}
            </div>
          </div>
        ` : ''}

        <div style="font-size:13px; font-weight:700; color:#111827; margin-bottom:12px;">Complete Chronological Lifecycle &amp; Audit Trail</div>
        <div class="timeline">
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-title">1. Enquiry Ingestion</div>
            <div class="timeline-desc">Initial enquiry logged on ${tb.enquiryDate || 'system launch'} for ${tb.eventType} (${tb.guests} guests).</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-title">2. Menu &amp; Catering Selection</div>
            <div class="timeline-desc">Package assigned: <strong>${tb.selectedMenu || tb.package}</strong>. Selected items and dish checklist catalogued for chef coordination.</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-title">3. Venue &amp; Hall Hire Policy</div>
            <div class="timeline-desc">${hallCharge ? `Venue hall hire fee of £${hallCharge.amount} explicitly applied (${hallCharge.label}).` : 'No venue hall fee applied (£0 / offsite catering). Default dry hire removed.'}</div>
          </div>
          ${tb.discount ? `
            <div class="timeline-item">
              <div class="timeline-dot" style="background:#DC2626; box-shadow:0 0 0 1px #DC2626;"></div>
              <div class="timeline-title">4. Discount Authorized</div>
              <div class="timeline-desc">Special concession granted: ${tb.discount.type === 'percentage' ? `${tb.discount.value}%` : `£${tb.discount.value}`} (-£${discountAmt.toLocaleString()}). Reason: "${tb.discount.reason}".</div>
            </div>
          ` : ''}
          <div class="timeline-item">
            <div class="timeline-dot" style="background:${isDepositPaid ? '#059669' : '#D97706'}; box-shadow:0 0 0 1px ${isDepositPaid ? '#059669' : '#D97706'};"></div>
            <div class="timeline-title">5. Advance Booking Deposit</div>
            <div class="timeline-desc">${isDepositPaid ? `Deposit of £${depositAmt.toLocaleString()} received and confirmed via ${tb.paymentMethodDeposit || 'Bank Transfer'}.` : `Advance deposit of £${depositAmt.toLocaleString()} pending confirmation.`}</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot" style="background:${isFinalPaid ? '#059669' : '#6B7280'}; box-shadow:0 0 0 1px ${isFinalPaid ? '#059669' : '#6B7280'};"></div>
            <div class="timeline-title">6. Final Invoice &amp; Settlement</div>
            <div class="timeline-desc">${isFinalPaid ? `Final settlement received and verified. Balance cleared in full via ${tb.paymentMethodFinal || 'Bank Transfer'}.` : `Remaining balance due: £${balanceDue.toLocaleString()}. Due 14 days before event.`}</div>
          </div>
          ${tb.status === 'cancelled' ? `
            <div class="timeline-item">
              <div class="timeline-dot" style="background:#E11D48; box-shadow:0 0 0 1px #E11D48;"></div>
              <div class="timeline-title">7. Order Cancelled</div>
              <div class="timeline-desc">${tb.cancellationDetails?.reason || 'Cancelled by administrative action.'}</div>
            </div>
          ` : tb.status === 'completed' ? `
            <div class="timeline-item">
              <div class="timeline-dot" style="background:#059669; box-shadow:0 0 0 1px #059669;"></div>
              <div class="timeline-title">7. Event Successfully Completed</div>
              <div class="timeline-desc">Event concluded with complete catering execution and final account closure.</div>
            </div>
          ` : ''}
        </div>

        ${tb.notes ? `
          <div class="card" style="margin-top:16px;">
            <div class="card-title">Customer Requests &amp; Special Notes</div>
            <div style="font-size:12px; font-style:italic; color:#4B5563;">"${tb.notes}"</div>
          </div>
        ` : ''}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  const handleBlockDate = async () => {
    if (!blockDateInput) return;
    try {
      await setDoc(doc(db, 'blocked_dates', blockDateInput), { date: blockDateInput });
      setBlockDateInput('');
    } catch (error) {
      console.error('Error blocking date:', error);
    }
  };

  const handleUnblockDate = async (dateStr: string) => {
    try {
      await deleteDoc(doc(db, 'blocked_dates', dateStr));
    } catch (error) {
      console.error('Error unblocking date:', error);
    }
  };

  const updateBankDetail = async (field: string, value: string) => {
    const updated = { ...bankDetails, [field]: value };
    setBankDetails(updated);
    try {
      await setDoc(doc(db, 'site_data', 'bank_details'), updated, { merge: true });
    } catch (error) {
      console.error('Error saving bank details:', error);
    }
  };

  const [isSavingVenueDetails, setIsSavingVenueDetails] = useState(false);

  const saveVenueDetails = async () => {
    setIsSavingVenueDetails(true);
    try {
      await setDoc(doc(db, 'site_data', 'venue_details'), venueDetails, { merge: true });
      setCustomAlert({ message: 'Venue details successfully updated on the website!', type: 'success' });
    } catch (error) {
      console.error('Error saving venue details:', error);
      setCustomAlert({ message: 'Error saving venue details.', type: 'error' });
    } finally {
      setIsSavingVenueDetails(false);
    }
  };

  const [isSavingPricingDetails, setIsSavingPricingDetails] = useState(false);

  const savePricingDetails = async () => {
    setIsSavingPricingDetails(true);
    try {
      await setDoc(doc(db, 'site_data', 'pricing_details'), pricingDetails, { merge: true });
      setCustomAlert({ message: 'Pricing & Deposits successfully updated!', type: 'success' });
    } catch (error) {
      console.error('Error saving pricing details:', error);
      setCustomAlert({ message: 'Error saving pricing details.', type: 'error' });
    } finally {
      setIsSavingPricingDetails(false);
    }
  };

  const getDiscountAmount = (b: Booking) => {
    if (!b.discount) return 0;
    const subtotal = b.baseAmount + (b.extraCharges || []).reduce((s, c) => s + c.amount, 0);
    if (b.discount.type === 'percentage') {
      return (subtotal * b.discount.value) / 100;
    }
    return b.discount.value;
  };

  const getVenueHallCharge = (date: string, time: string): { label: string; amount: number } | null => {
    if (!date || date === 'N/A') return null;
    const d = new Date(date);
    const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const timeLower = (time || '').toLowerCase();
    const isDinner = timeLower.includes('dinner') || timeLower.includes('evening') || timeLower.includes('pm') || timeLower.includes('18:') || timeLower.includes('19:') || timeLower.includes('20:');

    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      // Mon–Thu: £100
      return { label: 'Venue Hall Hire (Mon–Thu)', amount: 100 };
    } else if (dayOfWeek === 5) {
      // Friday: £250
      return { label: 'Venue Hall Hire (Friday)', amount: 250 };
    } else if (dayOfWeek === 0) {
      // Sunday: £250
      return { label: 'Venue Hall Hire (Sunday)', amount: 250 };
    } else if (dayOfWeek === 6) {
      // Saturday: Lunch=£250, Dinner=£500
      if (isDinner) {
        return { label: 'Venue Hall Hire (Saturday Dinner)', amount: 500 };
      } else {
        return { label: 'Venue Hall Hire (Saturday Lunch)', amount: 250 };
      }
    }
    return null;
  };

  // Helper to determine whether venue hall hire is included for a specific booking
  // NOT automatically added by default! Only when explicitly included or configured.
  const getBookingHallCharge = (b: Booking): { label: string; amount: number; isCustom?: boolean; reason?: string } | null => {
    // 1. Explicit extra charge matching Hall Hire or Dry Hire
    const existingExtra = (b.extraCharges || []).find(e => 
      e.label.toLowerCase().includes('hall hire') || 
      e.label.toLowerCase().includes('dry hire') ||
      e.label.toLowerCase().includes('venue hire')
    );
    if (existingExtra) {
      return { label: existingExtra.label, amount: existingExtra.amount };
    }

    // 2. Explicit venueHallCharge record
    if (b.venueHallCharge && typeof b.venueHallCharge.amount === 'number' && b.venueHallCharge.amount > 0) {
      return b.venueHallCharge;
    }

    // 3. Explicit opt-in flag
    if (b.includeVenueHall === true) {
      return getVenueHallCharge(b.date, b.time);
    }

    // Otherwise by default: NOT added (null)
    return null;
  };

  const getFoodPackageTotal = (b: Booking) => {
    const subtotal = b.baseAmount + (b.extraCharges || []).reduce((s, c) => s + c.amount, 0);
    return subtotal - getDiscountAmount(b);
  };

  const getTotalAmount = (b: Booking) => {
    const food = getFoodPackageTotal(b);
    // If hall hire is already included inside extraCharges, it was already accounted for in getFoodPackageTotal
    const hasHallInExtras = (b.extraCharges || []).some(e => 
      e.label.toLowerCase().includes('hall hire') || 
      e.label.toLowerCase().includes('dry hire') ||
      e.label.toLowerCase().includes('venue hire')
    );
    if (hasHallInExtras) {
      return food;
    }
    const hall = getBookingHallCharge(b);
    return food + (hall?.amount || 0);
  };

  const downloadInvoicePDF = (bookingData: Booking, isDepositOnly: boolean = false) => {
    const booking = { ...bookingData };
    if (isDepositOnly) {
      booking.finalPaymentPaid = false;
      booking.paymentProofFinal = undefined;
      booking.paymentProofExtra = undefined;
      booking.status = 'deposit_confirmed';
    }

    const pkgName = booking.selectedMenu || booking.package;
    const pkgObj = editableBanquetPackages.find(p => p.name === pkgName);
    const kidsPrice = booking.kidsPricePerPerson ?? (pkgObj?.kidsPrice || getKidsPrice(editableKidsPricing, pkgName));
    const pricePerPerson = booking.pricePerPerson ?? (pkgObj?.pricePerPerson || 0);
    const hallCharge = (booking.extraCharges || []).some(e => e.label.toLowerCase().includes('hall hire') || e.label.toLowerCase().includes('dry hire')) ? null : getBookingHallCharge(booking);

    const invoiceData: InvoiceBookingData = {
      ...booking,
      pricePerPerson,
      kidsPricePerPerson: kidsPrice,
      venueHallCharge: hallCharge,
    };

    // 1. Direct real PDF download (bypasses any browser popup block)
    const result = downloadInvoicePDFFile(invoiceData, isDepositOnly, {
      bankDetails,
      venueDetails,
    });

    if (result.success) {
      setCustomAlert({
        message: `Downloaded ${isDepositOnly ? 'Deposit' : 'Final'} Invoice PDF (${result.filename})!`,
        type: 'success',
      });
    }

    // 2. Also open the clean, responsive preview window with working Print & Download buttons
    try {
      openInvoicePrintWindow(invoiceData, isDepositOnly, {
        bankDetails,
        venueDetails,
      });
    } catch (e) {
      // Gracefully handled
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).triggerInvoiceDownload = (id: string, isDepositOnly: boolean = false) => {
        const found = bookings.find(b => b.id === id);
        if (found) {
          downloadInvoicePDF(found, isDepositOnly);
        }
      };
    }
  }, [bookings, bankDetails, venueDetails]);

  const getInitialWhatsAppMsg = (b: Booking, type: 'final' | 'deposit', phoneVal?: string) => {
    const pkgName = b.selectedMenu || b.package;
    const pkgObj = editableBanquetPackages.find(p => p.name === pkgName);
    const kidsPrice = b.kidsPricePerPerson ?? (pkgObj?.kidsPrice || getKidsPrice(editableKidsPricing, pkgName));
    const pricePerPerson = b.pricePerPerson ?? (pkgObj?.pricePerPerson || 0);
    const hallCharge = getBookingHallCharge(b);
    const invData: InvoiceBookingData = {
      ...b,
      phone: (phoneVal ?? b.phone) || '',
      pricePerPerson,
      kidsPricePerPerson: kidsPrice,
      venueHallCharge: hallCharge,
    };
    return buildInvoiceWhatsAppMessage(invData, type === 'deposit', { bankDetails, venueDetails });
  };

  const handleOpenWhatsAppInvoiceModal = (b: Booking, defaultType: 'final' | 'deposit' = 'final') => {
    setWhatsAppInvoiceBooking(b);
    setWhatsAppInvoiceType(defaultType);
    setWhatsAppCustomPhone(b.phone || '');
    setWhatsAppCustomMessage(getInitialWhatsAppMsg(b, defaultType, b.phone || ''));
  };

  const handleSendWhatsAppInvoice = async (mode: 'share_file' | 'open_chat' | 'download_pdf') => {
    if (!whatsAppInvoiceBooking) return;
    const isDepositOnly = whatsAppInvoiceType === 'deposit';
    const pkgName = whatsAppInvoiceBooking.selectedMenu || whatsAppInvoiceBooking.package;
    const pkgObj = editableBanquetPackages.find(p => p.name === pkgName);
    const kidsPrice = whatsAppInvoiceBooking.kidsPricePerPerson ?? (pkgObj?.kidsPrice || getKidsPrice(editableKidsPricing, pkgName));
    const pricePerPerson = whatsAppInvoiceBooking.pricePerPerson ?? (pkgObj?.pricePerPerson || 0);
    const hallCharge = getBookingHallCharge(whatsAppInvoiceBooking);

    const invoiceData: InvoiceBookingData = {
      ...whatsAppInvoiceBooking,
      phone: whatsAppCustomPhone.trim() || whatsAppInvoiceBooking.phone,
      pricePerPerson,
      kidsPricePerPerson: kidsPrice,
      venueHallCharge: hallCharge,
    };

    if (mode === 'download_pdf') {
      downloadInvoicePDFFile(invoiceData, isDepositOnly, { bankDetails, venueDetails });
      setCustomAlert({ message: 'Downloaded invoice PDF!', type: 'success' });
      return;
    }

    const messageText = whatsAppCustomMessage.trim() || buildInvoiceWhatsAppMessage(invoiceData, isDepositOnly, { bankDetails, venueDetails });

    if (mode === 'share_file') {
      setIsSharingWhatsApp(true);
      try {
        const res = await shareInvoicePDFViaWhatsApp(invoiceData, isDepositOnly, { bankDetails, venueDetails }, messageText);
        if (res.shared) {
          setCustomAlert({ message: 'Invoice shared to WhatsApp successfully!', type: 'success' });
          setWhatsAppInvoiceBooking(null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSharingWhatsApp(false);
      }
      return;
    }

    if (mode === 'open_chat') {
      const cleanPhone = cleanPhoneNumber(whatsAppCustomPhone.trim() || whatsAppInvoiceBooking.phone);
      const waUrl = cleanPhone
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`
        : `https://wa.me/?text=${encodeURIComponent(messageText)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setWhatsAppInvoiceBooking(null);
    }
  };

  const enquiries = bookings.filter(b => {
    if (b.status !== 'new_enquiry') return false;
    if (enquiriesFilterMonth === 'all' && enquiriesFilterYear === 'all') return true;
    const targetDate = b.date || b.enquiryDate;
    if (!targetDate) return true;
    const d = new Date(targetDate);
    if (isNaN(d.getTime())) return true;
    const monthMatch = enquiriesFilterMonth === 'all' || d.getMonth() === enquiriesFilterMonth;
    const yearMatch = enquiriesFilterYear === 'all' || d.getFullYear() === enquiriesFilterYear;
    return monthMatch && yearMatch;
  });
  const activeBookings = bookings.filter(b => b.status !== 'new_enquiry' && b.status !== 'completed');
  const completedBookings = bookings.filter(b => b.status === 'completed').sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime());
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime());
    return bTime - aTime;
  });

  const historyBookings = bookings.filter(b => {
    const statusIndex = STATUS_FLOW.indexOf(b.status);
    if (statusIndex < STATUS_FLOW.indexOf('deposit_confirmed')) return false;
    if (historyFilterMonth === 'all' && historyFilterYear === 'all') return true;
    const targetDate = b.date || b.enquiryDate;
    if (!targetDate) return true;
    const d = new Date(targetDate);
    if (isNaN(d.getTime())) return true;
    const monthMatch = historyFilterMonth === 'all' || d.getMonth() === historyFilterMonth;
    const yearMatch = historyFilterYear === 'all' || d.getFullYear() === historyFilterYear;
    return monthMatch && yearMatch;
  }).sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime());
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime());
    return bTime - aTime;
  });

  // Derive real-time customers dynamically from the live bookings list
  const customers: Customer[] = useMemo(() => {
    const customerMap: Record<string, Customer> = {};

    bookings.forEach((b) => {
      const nameKey = (b.name || 'Unknown').trim().toLowerCase();
      const contactKey = (b.email || b.phone || '').trim().toLowerCase();
      const key = `${nameKey}_${contactKey}`;
      if (!key) return;

      const eventCost = getTotalAmount(b);
      const isDepositPaid = b.depositPaid || b.status === 'deposit_confirmed' || b.status === 'event_scheduled' || b.status === 'event_completed' || b.status === 'final_invoice_sent' || b.status === 'final_payment_received' || b.status === 'completed';
      const spent = isDepositPaid ? eventCost : 0;
      const isActive = b.status !== 'completed';

      if (!customerMap[key]) {
        customerMap[key] = {
          id: key,
          name: b.name || 'Unknown',
          email: b.email || 'N/A',
          phone: b.phone || 'N/A',
          totalBookings: 1,
          totalSpent: spent,
          lastEvent: b.date || 'N/A',
          status: isActive ? 'active' : 'inactive'
        };
      } else {
        const existing = customerMap[key];
        existing.totalBookings += 1;
        existing.totalSpent += spent;

        if (b.date && b.date > existing.lastEvent) {
          existing.lastEvent = b.date;
        }

        if (isActive) {
          existing.status = 'active';
        }
      }
    });

    return Object.values(customerMap);
  }, [bookings]);

  const stats = {
    total: bookings.length,
    newEnquiries: enquiries.length,
    active: activeBookings.length,
    completed: completedBookings.length,
    revenue: bookings.filter(b => b.status === 'completed').reduce((s, b) => s + getTotalAmount(b), 0),
    depositsCollected: bookings.filter(b => b.depositPaid).reduce((s, b) => s + b.deposit, 0),
    outstanding: bookings.filter(b => b.depositPaid && !b.finalPaymentPaid && b.status !== 'new_enquiry').reduce((s, b) => s + (getTotalAmount(b) - b.deposit), 0),
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    years.add(currentYear - 1);
    years.add(currentYear + 1);
    bookings.forEach(b => {
      if (b.date) {
        const y = new Date(b.date).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [bookings]);

  const eventTypes = [...new Set(bookings.map(b => b.eventType))];

  const filtered = bookings.filter(b => {
    const statusMatch = filterStatus === 'all' || (filterStatus === 'event_completed' ? (b.status === 'event_completed' || b.status === 'completed') : b.status === filterStatus);
    const eventMatch = filterEvent === 'all' || b.eventType === filterEvent;
    let monthMatch = true;
    let yearMatch = true;
    if (bookingsFilterMonth !== 'all' || bookingsFilterYear !== 'all') {
      if (b.date) {
        const d = new Date(b.date);
        if (bookingsFilterMonth !== 'all' && !isNaN(d.getTime())) {
          monthMatch = d.getMonth() === bookingsFilterMonth;
        }
        if (bookingsFilterYear !== 'all' && !isNaN(d.getTime())) {
          yearMatch = d.getFullYear() === bookingsFilterYear;
        }
      } else {
        monthMatch = false;
      }
    }
    return statusMatch && eventMatch && monthMatch && yearMatch;
  });

  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
  const calendarBookings = bookings.filter(b => {
    const d = new Date(b.date);
    return d.getFullYear() === calendarYear && d.getMonth() === calendarMonth && b.status !== 'new_enquiry';
  });

  const getBookingsForDay = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return calendarBookings.filter(b => b.date === dateStr);
  };

  const pendingDiscounts = bookings.filter(b => b.discountRequest?.status === 'pending');
  
  const navItems: { id: AdminTab; label: string; icon: string; badge?: number; requiredPerm?: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'Squares2X2Icon' },
    { id: 'enquiries', label: 'Enquiries', icon: 'InboxIcon', badge: stats.newEnquiries, requiredPerm: 'manage_enquiries' },
    { id: 'bookings', label: 'Bookings', icon: 'CalendarDaysIcon', badge: activeBookings.length || undefined, requiredPerm: 'manage_bookings' },
    { id: 'manual_booking', label: 'Manual Booking', icon: 'PlusCircleIcon', requiredPerm: 'manage_bookings' },
    { id: 'calendar', label: 'Calendar', icon: 'CalendarIcon', requiredPerm: 'manage_calendar' },
    { id: 'customers', label: 'Customers', icon: 'UsersIcon', requiredPerm: 'manage_customers' },
    { id: 'payments', label: 'Payments', icon: 'CreditCardIcon', requiredPerm: 'manage_payments' },
    { id: 'menus', label: 'Menus', icon: 'ClipboardDocumentListIcon', requiredPerm: 'manage_menus' },
    { id: 'history', label: 'History', icon: 'ArchiveBoxIcon', requiredPerm: 'manage_history' },
    { id: 'discount_approvals', label: 'Discount Approvals', icon: 'TagIcon', badge: pendingDiscounts.length || undefined, requiredPerm: 'manage_discounts' },
    { id: 'settings', label: 'Settings', icon: 'Cog6ToothIcon', requiredPerm: 'manage_settings' },
    { id: 'access', label: 'Access Control', icon: 'ShieldCheckIcon', requiredPerm: 'manage_access' },
    { id: 'tracker', label: 'Booking Tracker', icon: 'MapIcon', requiredPerm: 'manage_tracker' },
  ];

  const visibleNavItems = navItems.filter(item => {
    if (userPermissions === 'all') return true;
    if (!item.requiredPerm) return true; // always show overview if they log in
    return userPermissions.includes(item.requiredPerm);
  });

  // ─── AUTHENTICATION LOADING ────────────────────────────────────────────────
  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1A0F00 0%, #2C1A00 50%, #3D2800 100%)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#C8860A] border-t-transparent" />
      </div>
    );
  }

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(135deg, #1A0F00 0%, #2C1A00 50%, #3D2800 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #F0A830, transparent)' }} />
          <div className="absolute bottom-20 right-20 w-80 h-80 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #C8860A, transparent)' }} />
        </div>
        <div className="relative bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <div className="flex flex-col items-center mb-6">
            <img
              src="/assets/images/oie_gAxqzQFu0Ixw-1777831503416.png"
              alt="Honeymoon logo"
              style={{ maxHeight: '60px', width: 'auto', objectFit: 'contain' }}
              className="mb-1"
            />
            <p className="text-sm text-gray-400 mt-1">Admin Portal</p>
          </div>
          <div className="border-t border-gray-100 mb-6" />
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email Address</label>
              <input type="email" required value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" placeholder="honeymoonadmin@gmail.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} className="w-full border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none bg-gray-50" placeholder="••••••••" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={20} />
                </button>
              </div>
            </div>
            {loginError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-xs">{loginError}</div>}
            <button type="submit" disabled={isLoggingIn} className="w-full text-white font-semibold py-2.5 rounded-xl transition-all text-sm shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed" style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
              {isLoggingIn ? 'Signing In...' : 'Sign In to Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-full bg-gray-50 flex overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed md:relative top-0 inset-y-0 left-0 z-40 w-60 h-screen flex-shrink-0 flex flex-col overflow-hidden transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} style={{ background: 'linear-gradient(180deg, #1A0F00 0%, #2C1A00 100%)' }}>
        <div className="px-5 py-4 border-b flex items-center gap-2.5 flex-shrink-0" style={{ borderColor: '#3D2800' }}>
          <div>
            <img
              src="/assets/images/oie_gAxqzQFu0Ixw-1777831503416.png"
              alt="Honeymoon logo"
              style={{ maxHeight: '40px', width: 'auto', objectFit: 'contain' }}
            />
            <div className="text-xs mt-1" style={{ color: '#A08060' }}>Admin Dashboard</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map((item) => (
            <button key={item.id} onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === item.id ? 'text-white shadow-md' : 'hover:text-white'}`}
              style={activeTab === item.id ? { background: 'linear-gradient(135deg, #C8860A, #F0A830)', color: 'white' } : { color: '#A08060' }}>
              <Icon name={item.icon as 'CalendarDaysIcon'} size={17} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge ? <span className="bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t flex-shrink-0" style={{ borderColor: '#3D2800' }}>
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(200,134,10,0.2)' }}>
              <Icon name="UserCircleIcon" size={16} style={{ color: '#F0A830' }} />
            </div>
            <div>
              <div className="text-xs font-semibold" style={{ color: '#F0A830' }}>{currentUser?.role || 'Super Admin'}</div>
              <div className="text-xs" style={{ color: '#A08060' }}>{currentUser?.email || ''}</div>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                await signOut(auth);
                setActiveTab('overview');
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('adminActiveTab');
                }
                setLoggedIn(false);
              } catch (error) {
                console.error("Error signing out:", error);
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:text-white"
            style={{ color: '#A08060' }}
          >
            <Icon name="ArrowRightOnRectangleIcon" size={17} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 h-screen overflow-y-auto min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-gray-500 hover:text-gray-700" onClick={() => setSidebarOpen(true)}>
              <Icon name="Bars3Icon" size={22} />
            </button>
            <div>
              <h1 className="text-base font-semibold text-gray-900 capitalize">{navItems.find(n => n.id === activeTab)?.label}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">
                {activeTab === 'overview' && 'Business at a glance'}
                {activeTab === 'enquiries' && `${stats.newEnquiries} new enquiries awaiting action`}
                {activeTab === 'bookings' && `${activeBookings.length} active bookings in progress`}
                {activeTab === 'manual_booking' && 'Create step-wise booking with menu & payment'}
                {activeTab === 'calendar' && `${MONTHS[calendarMonth]} ${calendarYear}`}
                {activeTab === 'customers' && `${customers.length} registered customers`}
                {activeTab === 'payments' && 'Track deposits and balances'}
                {activeTab === 'menus' && 'Manage catering packages'}
                {activeTab === 'history' && `${historyBookings.length} history records`}
                {activeTab === 'settings' && 'Venue configuration'}
                {activeTab === 'access' && 'Manage roles and permissions'}
                {activeTab === 'discount_approvals' && 'Review discount requests'}
                {activeTab === 'tracker' && 'Track booking progress step-by-step'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab !== 'manual_booking' && (
              <button
                onClick={() => setActiveTab('manual_booking')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
              >
                <Icon name="PlusIcon" size={14} />
                <span>New Booking</span>
              </button>
            )}
            {stats.newEnquiries > 0 && (
              <button onClick={() => setActiveTab('enquiries')} className="hidden sm:flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                {stats.newEnquiries} new
              </button>
            )}
          </div>
        </div>

        <div className="p-4 md:p-6">

          {/* ─── OVERVIEW ─── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'New Enquiries', value: stats.newEnquiries, icon: 'InboxIcon', color: 'text-blue-600', bg: 'bg-blue-50', change: 'Awaiting action', onClick: () => setActiveTab('enquiries') },
                  { label: 'Active Bookings', value: stats.active, icon: 'CalendarDaysIcon', color: 'text-amber-600', bg: 'bg-amber-50', change: 'In progress', onClick: () => setActiveTab('bookings') },
                  { label: 'Completed Events', value: stats.completed, icon: 'CheckCircleIcon', color: 'text-emerald-600', bg: 'bg-emerald-50', change: 'All time', onClick: () => setActiveTab('history') },
                  { label: 'Revenue Collected', value: `£${stats.depositsCollected.toLocaleString()}`, icon: 'BanknotesIcon', color: 'text-yellow-700', bg: 'bg-yellow-50', change: `£${stats.outstanding.toLocaleString()} outstanding`, onClick: () => setActiveTab('payments') },
                ].map((stat) => (
                  <button key={stat.label} onClick={stat.onClick} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow text-left">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`${stat.bg} p-2 rounded-lg`}>
                        <Icon name={stat.icon as 'CalendarDaysIcon'} size={18} className={stat.color} />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-0.5">{stat.value}</div>
                    <div className="text-xs font-medium text-gray-500">{stat.label}</div>
                    <div className="text-xs text-gray-400 mt-1">{stat.change}</div>
                  </button>
                ))}
              </div>

              {/* Status pipeline */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 text-sm mb-4">Booking Status Pipeline</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {STATUS_FLOW.slice(0, 10).map((s) => {
                    const count = bookings.filter(b => b.status === s).length;
                    return (
                      <div key={s} className={`rounded-xl p-3 border text-center ${count > 0 ? STATUS_COLORS[s] : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                        <div className="text-xl font-bold">{count}</div>
                        <div className="text-xs font-medium mt-0.5 leading-tight">{STATUS_LABELS[s]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* New enquiries */}
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900 text-sm">New Enquiries</h2>
                    <button onClick={() => setActiveTab('enquiries')} className="text-xs font-medium hover:underline" style={{ color: '#C8860A' }}>View all</button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {enquiries.slice(0, 3).map((b) => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(200,134,10,0.1)' }}>
                          <span className="text-xs font-bold" style={{ color: '#C8860A' }}>{b.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{b.name}</div>
                          <div className="text-xs text-gray-400">{b.eventType} · {b.date} · {b.guests} guests</div>
                        </div>
                        <a href={buildWhatsAppLink(b.phone, `Hi ${b.name.split(' ')[0]}, thank you for your enquiry with Honeymoon! We'd love to help with your ${b.eventType}. Could you confirm your preferred date and guest count?`)} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={13} />
                          WhatsApp
                        </a>
                      </div>
                    ))}
                    {enquiries.length === 0 && <div className="px-5 py-8 text-center text-sm text-gray-400">No new enquiries</div>}
                  </div>
                </div>

                {/* Upcoming events */}
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900 text-sm">Upcoming Events</h2>
                    <button onClick={() => setActiveTab('calendar')} className="text-xs font-medium hover:underline" style={{ color: '#C8860A' }}>Calendar</button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {bookings.filter(b => b.status === 'event_scheduled').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4).map((b) => {
                      const d = new Date(b.date);
                      return (
                        <div key={b.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                          <div className="w-10 text-center flex-shrink-0 rounded-lg py-1" style={{ background: 'rgba(200,134,10,0.08)' }}>
                            <div className="text-xs font-medium uppercase" style={{ color: '#C8860A' }}>{MONTHS[d.getMonth()]}</div>
                            <div className="text-lg font-bold leading-tight" style={{ color: '#A06A05' }}>{d.getDate()}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{b.name}</div>
                            <div className="text-xs text-gray-400">{b.eventType} · {b.time} · {b.guests} guests</div>
                          </div>
                          <div className="text-sm font-semibold text-gray-700 flex-shrink-0">£{getTotalAmount(b).toLocaleString()}</div>
                        </div>
                      );
                    })}
                    {bookings.filter(b => b.status === 'event_scheduled').length === 0 && (
                      <div className="px-5 py-8 text-center text-sm text-gray-400">No scheduled events</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── ENQUIRIES ─── */}
          {activeTab === 'enquiries' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
                <p className="text-sm font-medium text-gray-700">{enquiries.length} new enquiries {enquiriesFilterMonth !== 'all' ? `in ${MONTHS[enquiriesFilterMonth]}` : 'awaiting your response'}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">Filter Month:</span>
                  <select
                    value={enquiriesFilterMonth}
                    onChange={(e) => setEnquiriesFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 font-medium focus:outline-none"
                  >
                    <option value="all">All Months</option>
                    {MONTHS.map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={enquiriesFilterYear}
                    onChange={(e) => setEnquiriesFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 font-medium focus:outline-none"
                  >
                    <option value="all">All Years</option>
                    {availableYears.map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                  {(enquiriesFilterMonth !== 'all' || enquiriesFilterYear !== 'all') && (
                    <button
                      onClick={() => { setEnquiriesFilterMonth('all'); setEnquiriesFilterYear('all'); }}
                      className="text-xs text-amber-700 hover:text-amber-900 font-semibold px-2 py-1 bg-amber-50 rounded-lg border border-amber-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {enquiries.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                  <Icon name="InboxIcon" size={36} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-400 text-sm">No new enquiries right now</p>
                </div>
              )}
              {enquiries.map((b) => (
                <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(200,134,10,0.1)' }}>
                        <span className="text-base font-bold" style={{ color: '#C8860A' }}>{b.name.charAt(0)}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{b.name}</div>
                        <div className="text-xs text-gray-400">{b.email} · {b.phone}</div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[b.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[b.status]}`} />
                      {STATUS_LABELS[b.status]}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Event Type', value: b.eventType },
                      { label: 'Date', value: b.date },
                      { label: 'Guests', value: `${b.guests} people` },
                      { label: 'Enquiry Date', value: b.enquiryDate },
                    ].map((f) => (
                      <div key={f.label} className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-xs text-gray-400 mb-0.5">{f.label}</div>
                        <div className="text-sm font-medium text-gray-800">{f.value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Package Selection Banner */}
                  <div className="mt-3">
                    {b.package && b.package !== 'Not Selected' ? (
                      <div className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 border" style={{ background: 'rgba(200,134,10,0.06)', borderColor: 'rgba(200,134,10,0.25)' }}>
                        <span className="text-lg">🎁</span>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#C8860A' }}>Preferred Package</div>
                          <div className="text-sm font-bold text-gray-900">{b.package}</div>
                        </div>
                        <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(200,134,10,0.15)', color: '#A06A05' }}>Customer Selected</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 border border-gray-100 bg-gray-50">
                        <span className="text-base">📋</span>
                        <div className="text-sm text-gray-400">No specific package selected — customer needs guidance</div>
                      </div>
                    )}
                  </div>

                  {b.notes && (
                    <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 text-sm text-amber-800">{b.notes}</div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={buildWhatsAppLink(b.phone, `Hi ${b.name.split(' ')[0]}, thank you for your enquiry with Honeymoon! We'd love to help with your ${b.eventType} on ${b.date}. Let me share our menu packages with you shortly.`)}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                      style={{ background: '#25D366', color: 'white' }}>
                      <Icon name="ChatBubbleLeftRightIcon" size={14} />
                      Reply on WhatsApp
                    </a>
                    <button onClick={() => { updateStatus(b.id, 'menu_sent'); setShowMenuPanel(true); setSelectedBooking(b); }}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors"
                      style={{ borderColor: '#C8860A', color: '#C8860A' }}>
                      <Icon name="ClipboardDocumentListIcon" size={14} />
                      Send Menu & Advance
                    </button>
                    <button onClick={() => setSelectedBooking(b)}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                      <Icon name="EyeIcon" size={14} />
                      Full Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── BOOKINGS ─── */}
          {activeTab === 'bookings' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-1.5 flex-wrap">
                    <Icon name="FunnelIcon" size={14} className="text-gray-400" />
                    <span className="text-xs text-gray-500 font-medium">Status:</span>
                    {['all', ...STATUS_FLOW.filter(s => s !== 'new_enquiry')].map((s) => (
                      <button key={s} onClick={() => setFilterStatus(s)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                        style={filterStatus === s ? { background: 'linear-gradient(135deg, #C8860A, #F0A830)' } : {}}>
                        {s === 'all' ? 'All' : STATUS_LABELS[s as BookingStatus]}
                      </button>
                    ))}
                  </div>
                  <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 focus:outline-none">
                    <option value="all">All Event Types</option>
                    {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select
                    value={bookingsFilterMonth}
                    onChange={(e) => setBookingsFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 font-medium focus:outline-none"
                  >
                    <option value="all">All Months</option>
                    {MONTHS.map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={bookingsFilterYear}
                    onChange={(e) => setBookingsFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 font-medium focus:outline-none"
                  >
                    <option value="all">All Years</option>
                    {availableYears.map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                  {(bookingsFilterMonth !== 'all' || bookingsFilterYear !== 'all') && (
                    <button
                      onClick={() => { setBookingsFilterMonth('all'); setBookingsFilterYear('all'); }}
                      className="text-xs text-amber-700 hover:text-amber-900 font-semibold px-2 py-1.5 bg-amber-50 rounded-lg border border-amber-200 transition-colors"
                    >
                      Clear Date Filter
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setActiveTab('manual_booking')}
                  className="flex items-center gap-1.5 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
                >
                  <Icon name="PlusIcon" size={14} />
                  <span>New Manual Booking</span>
                </button>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  {(() => {
                    const bookingsList = filtered.filter(b => b.status !== 'new_enquiry');
                    const totalBookingsCount = bookingsList.length;
                    const totalBookingPages = Math.max(1, Math.ceil(totalBookingsCount / bookingPageSize));
                    const currentBookingPage = Math.min(Math.max(1, bookingPage), totalBookingPages);
                    const startBookingIdx = (currentBookingPage - 1) * bookingPageSize;
                    const endBookingIdx = Math.min(startBookingIdx + bookingPageSize, totalBookingsCount);
                    const paginatedBookings = bookingsList.slice(startBookingIdx, endBookingIdx);

                    return (
                      <>
                        <table className="w-full text-sm min-w-[1050px]">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Event</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Amount</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Deposit Paid</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Balance Due</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Discount</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">WhatsApp</th>
                              <th className="px-4 py-3"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {paginatedBookings.map((booking) => {
                              const total = getTotalAmount(booking);
                              const extraChargesTotal = (booking.extraCharges || []).reduce((s, c) => s + c.amount, 0);
                              const isDepositPaid = booking.depositPaid || !['new_enquiry', 'menu_sent', 'menu_selected', 'deposit_pending'].includes(booking.status);
                              const isFinalPaid = booking.finalPaymentPaid || booking.status === 'completed';
                              const isExtraPaid = booking.status === 'completed' || !!booking.paymentProofExtra || booking.finalPaymentPaid;

                              const depositAmt = booking.deposit || (pricingDetails.depositPercentage || 500);
                              const finalPaymentAmt = Math.max(0, total - depositAmt - extraChargesTotal);
                              const totalPaid = (isDepositPaid ? depositAmt : 0) +
                                                (isFinalPaid ? finalPaymentAmt : 0) +
                                                (isExtraPaid ? extraChargesTotal : 0);
                              const balanceDue = isFinalPaid ? 0 : Math.max(0, total - totalPaid);

                              return (
                                <tr key={booking.id} className="hover:bg-gray-50/80 transition-colors">
                                  <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(200,134,10,0.1)' }}>
                                        <span className="text-xs font-bold" style={{ color: '#C8860A' }}>{booking.name.charAt(0)}</span>
                                      </div>
                                      <div>
                                        <div className="font-medium text-gray-900 text-sm">{booking.name}</div>
                                        <div className="text-xs text-gray-400">{booking.phone}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 max-w-[200px]">
                                    <div className="text-sm font-medium text-gray-900 break-words">{booking.eventType}</div>
                                    <div className="text-xs text-gray-400">{booking.package}</div>
                                  </td>
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <div className="text-sm text-gray-700">{booking.date}</div>
                                    <div className="text-xs text-gray-400">{booking.time}</div>
                                  </td>

                                  {/* Total Amount */}
                                  <td className="px-4 py-3.5">
                                    <div className="text-sm font-bold text-gray-900">£{total.toLocaleString()}</div>
                                    <div className="text-[10px] text-gray-400">{booking.guests} {booking.guests === 1 ? 'Guest' : 'Guests'}</div>
                                  </td>

                                  {/* Deposit Paid */}
                                  <td className="px-4 py-3.5">
                                    <div className={`text-sm font-bold ${isDepositPaid ? 'text-emerald-700' : 'text-gray-700'}`}>
                                      £{depositAmt.toLocaleString()}
                                    </div>
                                    <div className="mt-0.5">
                                      <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        isDepositPaid
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}>
                                        {isDepositPaid ? '✓ Paid' : 'Pending'}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Balance Due (Pending Amount) */}
                                  <td className="px-4 py-3.5">
                                    {isFinalPaid || balanceDue <= 0 ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                        <span>✓</span> Paid in Full
                                      </span>
                                    ) : (
                                      <div>
                                        <div className="text-sm font-bold text-amber-900">
                                          £{balanceDue.toLocaleString()}
                                        </div>
                                        <span className="text-[10px] text-amber-600 font-semibold">
                                          Balance Due
                                        </span>
                                      </div>
                                    )}
                                  </td>

                                  {/* Discount */}
                                  <td className="px-4 py-3.5">
                                    {booking.discount ? (
                                      <div className="text-sm font-semibold text-red-600">-£{getDiscountAmount(booking).toLocaleString()}</div>
                                    ) : (
                                      <div className="text-sm text-gray-400">—</div>
                                    )}
                                  </td>

                                  {/* Status */}
                                  <td className="px-4 py-3.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[booking.status]}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[booking.status]}`} />
                                      {STATUS_LABELS[booking.status]}
                                    </span>
                                  </td>

                                  {/* WhatsApp */}
                                  <td className="px-4 py-3.5">
                                    <a href={buildWhatsAppLink(booking.phone, `Hi ${booking.name.split(' ')[0]}, this is Honeymoon regarding your ${booking.eventType} booking on ${booking.date}.`)}
                                      target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                                      style={{ background: '#25D366', color: 'white' }}>
                                      <Icon name="ChatBubbleLeftRightIcon" size={12} />
                                      Chat
                                    </a>
                                  </td>

                                  {/* Actions */}
                                  <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          setEditingBookingForManual(booking);
                                          setActiveTab('manual_booking');
                                        }}
                                        className="text-xs font-semibold flex items-center gap-1 hover:text-amber-800 text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 shadow-2xs transition-colors"
                                        title="Amend Booking in Full Wizard"
                                      >
                                        <Icon name="PencilIcon" size={11} />
                                        <span>Amend</span>
                                      </button>
                                      <button onClick={() => setSelectedBooking(booking)} className="text-xs font-semibold flex items-center gap-1 hover:underline whitespace-nowrap" style={{ color: '#C8860A' }}>
                                        Manage <Icon name="ChevronRightIcon" size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenCancellationModal(booking);
                                        }}
                                        className="text-xs font-semibold flex items-center gap-1 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg shadow-2xs transition-colors whitespace-nowrap"
                                        title={booking.status === 'cancelled' ? 'View cancellation details' : 'Cancel booking order'}
                                      >
                                        <Icon name="XCircleIcon" size={11} />
                                        <span>{booking.status === 'cancelled' ? 'Cancelled' : 'Cancel'}</span>
                                      </button>
                                      <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); generateChefMenuPDF(booking); }}
                                          className="p-1 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-700 transition-colors"
                                          title="Download / Print Menu PDF (Chef Sheet)"
                                        >
                                          <Icon name="ClipboardDocumentListIcon" size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); downloadInvoicePDF(booking, true); }}
                                          className="p-1 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-700 transition-colors"
                                          title="Download Deposit Invoice PDF"
                                        >
                                          <Icon name="DocumentTextIcon" size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); downloadInvoicePDF(booking, false); }}
                                          className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-700 transition-colors"
                                          title="Download Final Invoice PDF"
                                        >
                                          <Icon name="DocumentCheckIcon" size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); handleOpenWhatsAppInvoiceModal(booking); }}
                                          className="p-1 rounded hover:bg-emerald-100 text-[#25D366] hover:text-[#128C7E] transition-all transform hover:scale-110"
                                          title="Deliver Invoice PDF to Customer via WhatsApp"
                                        >
                                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.859L.057 23.428a.75.75 0 0 0 .921.921l5.684-1.47A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.694 9.694 0 0 1-4.946-1.356l-.355-.211-3.676.95.974-3.578-.231-.368A9.693 9.693 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                                          </svg>
                                        </button>
                                      </div>
                                      {currentUser?.role === 'Super Admin' && (
                                        <button onClick={() => handleDeleteBooking(booking.id, booking.name)} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors" title="Delete Booking">
                                          <Icon name="TrashIcon" size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {totalBookingsCount === 0 && (
                          <div className="text-center py-12 text-gray-400 text-sm">
                            <Icon name="CalendarDaysIcon" size={32} className="mx-auto mb-2 text-gray-300" />
                            No bookings match your filters
                          </div>
                        )}
                        {totalBookingsCount > 0 && (
                          <div className="px-4 py-3 bg-gray-50/90 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
                            <div className="flex items-center gap-3">
                              <span>
                                Showing <span className="font-semibold text-gray-900">{startBookingIdx + 1}</span> to{' '}
                                <span className="font-semibold text-gray-900">{endBookingIdx}</span> of{' '}
                                <span className="font-semibold text-gray-900">{totalBookingsCount}</span> bookings
                              </span>
                              <div className="flex items-center gap-1.5 border-l border-gray-300 pl-3">
                                <span className="text-gray-500">Rows per page:</span>
                                <select
                                  value={bookingPageSize}
                                  onChange={(e) => {
                                    setBookingPageSize(Number(e.target.value));
                                    setBookingPage(1);
                                  }}
                                  className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                                >
                                  <option value={10}>10</option>
                                  <option value={20}>20</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                </select>
                              </div>
                            </div>

                            {totalBookingPages > 1 && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setBookingPage(1)}
                                  disabled={currentBookingPage === 1}
                                  className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                                  title="First Page"
                                >
                                  « First
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBookingPage(prev => Math.max(1, prev - 1))}
                                  disabled={currentBookingPage === 1}
                                  className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                                  title="Previous Page"
                                >
                                  ‹ Prev
                                </button>

                                {getPaginationRange(currentBookingPage, totalBookingPages).map((p, idx) => (
                                  p === '...' ? (
                                    <span key={`ellipsis-${idx}`} className="px-2 py-1 text-gray-400">...</span>
                                  ) : (
                                    <button
                                      type="button"
                                      key={p}
                                      onClick={() => setBookingPage(Number(p))}
                                      className={`min-w-[28px] h-7 px-2 rounded-lg font-semibold text-xs transition-all ${
                                        currentBookingPage === p
                                          ? 'text-white shadow-sm'
                                          : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'
                                      }`}
                                      style={currentBookingPage === p ? { background: 'linear-gradient(135deg, #C8860A, #F0A830)' } : {}}
                                    >
                                      {p}
                                    </button>
                                  )
                                ))}

                                <button
                                  type="button"
                                  onClick={() => setBookingPage(prev => Math.min(totalBookingPages, prev + 1))}
                                  disabled={currentBookingPage === totalBookingPages}
                                  className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                                  title="Next Page"
                                >
                                  Next ›
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBookingPage(totalBookingPages)}
                                  disabled={currentBookingPage === totalBookingPages}
                                  className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                                  title="Last Page"
                                >
                                  Last »
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ─── MANUAL BOOKING ─── */}
          {activeTab === 'manual_booking' && (
            <ManualBookingForm
              configuredExtraCharges={configuredExtraCharges}
              blockedDates={blockedDates}
              bankDetails={bankDetails}
              pricingDetails={pricingDetails}
              banquetPackages={editableBanquetPackages}
              indianMenu={{
                name: 'Indian Menu',
                starters: {
                  vegetarian: editableIndianMenu.vegStarters,
                  nonVegetarian: editableIndianMenu.nonVegStarters,
                },
                mains: {
                  vegetarian: editableIndianMenu.vegMains,
                  nonVegetarian: editableIndianMenu.nonVegMains,
                },
                sundries: editableIndianMenu.sundries,
                desserts: editableIndianMenu.desserts,
                allergyNotice: INDIAN_MENU.allergyNotice,
              }}
              sriLankanMenu={{
                name: 'Sri Lankan Menu',
                starters: {
                  vegetarian: editableSLMenu.vegStarters,
                  nonVegetarian: editableSLMenu.nonVegStarters,
                },
                mains: {
                  vegetarian: editableSLMenu.vegMains,
                  nonVegetarian: editableSLMenu.nonVegMains,
                },
                sundries: editableSLMenu.sundries,
                desserts: editableSLMenu.desserts,
                allergyNotice: SRI_LANKAN_MENU.allergyNotice,
              }}
              liveCounters={{
                name: 'Live Counter Package',
                ...editableLiveCounter,
              }}
              venueHallCharges={editableVenueCharges}
              dryHirePrices={editableDryHirePrices}
              kidsPricing={editableKidsPricing}
              editingBooking={editingBookingForManual}
              onBookingUpdated={(updated) => {
                setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
                setSelectedBooking(updated);
                setEditingBookingForManual(null);
                setCustomAlert({ message: `Booking #${updated.id} amended successfully!`, type: 'success' });
              }}
              onCancelEdit={() => {
                setEditingBookingForManual(null);
                setActiveTab('bookings');
              }}
              onBookingCreated={(newId) => {
                const found = bookings.find(b => b.id === newId);
                if (found) setSelectedBooking(found);
              }}
              onNavigateTab={(tab, date) => {
                if (tab === 'calendar' && date) {
                  const d = new Date(date);
                  setCalendarMonth(d.getMonth());
                }
                setActiveTab(tab as AdminTab);
              }}
              onGenerateInvoice={(b, isDepositOnly) => {
                downloadInvoicePDF(b as Booking, isDepositOnly);
              }}
            />
          )}

          {/* ─── CALENDAR ─── */}
          {activeTab === 'calendar' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setCalendarMonth(m => m === 0 ? 11 : m - 1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <Icon name="ChevronLeftIcon" size={18} className="text-gray-500" />
                  </button>
                  <h2 className="font-semibold text-gray-900">{MONTHS[calendarMonth]} {calendarYear}</h2>
                  <button onClick={() => setCalendarMonth(m => m === 11 ? 0 : m + 1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <Icon name="ChevronRightIcon" size={18} className="text-gray-500" />
                  </button>
                </div>
                <div className="grid grid-cols-7 mb-2">
                  {DAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} className="h-20 rounded-lg" />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dayBookings = getBookingsForDay(day);
                    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isBlocked = blockedDates.includes(dateStr);
                    return (
                      <div key={day} className={`h-20 rounded-lg border p-1.5 transition-colors ${isBlocked ? 'bg-red-50/40 border-red-100 hover:bg-red-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-500">{day}</span>
                          {isBlocked && <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-0.5">🚫 Block</span>}
                        </div>
                        <div className="space-y-0.5 overflow-hidden">
                          {dayBookings.slice(0, 2).map((b) => (
                            <button key={b.id} onClick={() => setSelectedBooking(b)}
                              className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium ${b.status === 'event_scheduled' ? 'bg-cyan-100 text-cyan-700' : b.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {b.name.split(' ')[0]}
                            </button>
                          ))}
                          {dayBookings.length > 2 && <div className="text-xs text-gray-400 px-1">+{dayBookings.length - 2}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900 text-sm">{MONTHS[calendarMonth]} Events ({calendarBookings.length})</h3>
                </div>
                {calendarBookings.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-gray-400">No events this month</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {calendarBookings.sort((a, b) => a.date.localeCompare(b.date)).map((b) => {
                      const d = new Date(b.date);
                      return (
                        <div key={b.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                          <div className="w-10 text-center flex-shrink-0">
                            <div className="text-xs text-gray-400 uppercase">{MONTHS[d.getMonth()]}</div>
                            <div className="text-xl font-bold text-gray-900 leading-tight">{d.getDate()}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm">{b.name} — {b.eventType}</div>
                            <div className="text-xs text-gray-400">{b.time} · {b.guests} guests · {b.package}</div>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${STATUS_COLORS[b.status]}`}>
                            {STATUS_LABELS[b.status]}
                          </span>
                          <a href={buildWhatsAppLink(b.phone, `Hi ${b.name.split(' ')[0]}, just a reminder about your ${b.eventType} at Honeymoon on ${b.date} at ${b.time}. We look forward to seeing you!`)}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0"
                            style={{ background: '#25D366', color: 'white' }}>
                            <Icon name="ChatBubbleLeftRightIcon" size={12} />
                            Remind
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── CUSTOMERS ─── */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search customers..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white" />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Bookings</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Spent</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Event</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {customers.filter(c => !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.email.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.toLowerCase().includes(customerSearch.toLowerCase())).map((customer) => (
                        <tr key={customer.id} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(200,134,10,0.1)' }}>
                                <span className="text-sm font-bold" style={{ color: '#C8860A' }}>{customer.name.charAt(0)}</span>
                              </div>
                              <div className="font-medium text-gray-900">{customer.name}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-sm text-gray-600">{customer.email}</div>
                            <div className="text-xs text-gray-400">{customer.phone}</div>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-700 font-medium">{customer.totalBookings}</td>
                          <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{customer.totalSpent > 0 ? `£${customer.totalSpent.toLocaleString()}` : '—'}</td>
                          <td className="px-4 py-3.5 text-xs text-gray-500">{customer.lastEvent}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <a href={buildWhatsAppLink(customer.phone, `Hi ${customer.name.split(' ')[0]}, this is Honeymoon. How can we help you today?`)}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                                style={{ background: '#25D366', color: 'white' }}>
                                <Icon name="ChatBubbleLeftRightIcon" size={12} />
                                WhatsApp
                              </a>
                              <button onClick={() => setSelectedCustomer(customer)} className="text-xs font-semibold hover:underline" style={{ color: '#C8860A' }}>View</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── PAYMENTS ─── */}
          {activeTab === 'payments' && (() => {
            const paymentBookings = bookings.filter((b) => {
              if (b.status === 'new_enquiry') return false;
              if (paymentFilterMonth === 'all' && paymentFilterYear === 'all') return true;
              const targetDate = b.date || b.dueDate || b.enquiryDate;
              if (!targetDate) return true;
              const d = new Date(targetDate);
              if (isNaN(d.getTime())) return true;
              const monthMatch = paymentFilterMonth === 'all' || d.getMonth() === paymentFilterMonth;
              const yearMatch = paymentFilterYear === 'all' || d.getFullYear() === paymentFilterYear;
              return monthMatch && yearMatch;
            });

            const paymentStats = (() => {
              let depositsCollected = 0;
              let outstanding = 0;
              let revenue = 0;

              paymentBookings.forEach((b) => {
                const total = getTotalAmount(b);
                const extraChargesTotal = (b.extraCharges || []).reduce((s, c) => s + c.amount, 0);
                const isDepositPaid = b.depositPaid || !['new_enquiry', 'menu_sent', 'menu_selected', 'deposit_pending'].includes(b.status);
                const isFinalPaid = b.finalPaymentPaid || b.status === 'completed';
                const isExtraPaid = b.status === 'completed' || !!b.paymentProofExtra || b.finalPaymentPaid;

                const depositAmt = b.deposit || (pricingDetails.depositPercentage || 500);
                const finalPaymentAmt = Math.max(0, total - depositAmt - extraChargesTotal);
                const totalPaid = (isDepositPaid ? depositAmt : 0) +
                                  (isFinalPaid ? finalPaymentAmt : 0) +
                                  (isExtraPaid ? extraChargesTotal : 0);
                const balanceDue = isFinalPaid ? 0 : Math.max(0, total - totalPaid);

                if (isDepositPaid) depositsCollected += depositAmt;
                outstanding += balanceDue;
                if (b.status === 'completed' || isFinalPaid) {
                  revenue += total;
                }
              });

              return { depositsCollected, outstanding, revenue };
            })();

            return (
              <div className="space-y-5">
                {/* Payment Month & Year Filter Toolbar */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mr-1">
                      <Icon name="CalendarDaysIcon" size={16} className="text-[#C8860A]" />
                      <span>Filter Payments:</span>
                    </div>
                    <select
                      value={paymentFilterMonth}
                      onChange={(e) => setPaymentFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="all">All Months</option>
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={idx}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={paymentFilterYear}
                      onChange={(e) => setPaymentFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="all">All Years</option>
                      {availableYears.map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1 ml-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          setPaymentFilterMonth(now.getMonth());
                          setPaymentFilterYear(now.getFullYear());
                        }}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        This Month
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (paymentFilterMonth === 'all') {
                            setPaymentFilterMonth(new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1);
                          } else {
                            setPaymentFilterMonth(m => (m as number) === 0 ? 11 : (m as number) - 1);
                          }
                        }}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        title="Previous Month"
                      >
                        ← Prev Month
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (paymentFilterMonth === 'all') {
                            setPaymentFilterMonth(new Date().getMonth() === 11 ? 0 : new Date().getMonth() + 1);
                          } else {
                            setPaymentFilterMonth(m => (m as number) === 11 ? 0 : (m as number) + 1);
                          }
                        }}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        title="Next Month"
                      >
                        Next Month →
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentFilterMonth('all');
                          setPaymentFilterYear('all');
                        }}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        All Time
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 font-medium">
                    Showing: <span className="font-bold text-gray-800">
                      {paymentFilterMonth !== 'all' ? MONTHS[paymentFilterMonth] : 'All Months'} {paymentFilterYear !== 'all' ? paymentFilterYear : ''}
                    </span> ({paymentBookings.length} records)
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Deposits Collected', value: `£${paymentStats.depositsCollected.toLocaleString()}`, icon: 'BanknotesIcon', color: 'text-emerald-600', bg: 'bg-emerald-50', sub: paymentFilterMonth !== 'all' ? `${MONTHS[paymentFilterMonth]} deposits` : 'Confirmed deposits' },
                    { label: 'Outstanding Balance', value: `£${paymentStats.outstanding.toLocaleString()}`, icon: 'ClockIcon', color: 'text-amber-600', bg: 'bg-amber-50', sub: paymentFilterMonth !== 'all' ? `${MONTHS[paymentFilterMonth]} pending balance` : 'Remaining to collect' },
                    { label: 'Total Revenue', value: `£${paymentStats.revenue.toLocaleString()}`, icon: 'CurrencyDollarIcon', color: 'text-yellow-700', bg: 'bg-yellow-50', sub: paymentFilterMonth !== 'all' ? `${MONTHS[paymentFilterMonth]} closed revenue` : 'Completed bookings' },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-2xs">
                      <div className={`${s.bg} w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>
                        <Icon name={s.icon as 'BanknotesIcon'} size={20} className={s.color} />
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                      <div className="text-xs font-medium text-gray-500 mt-0.5">{s.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-sm">Payment Tracker</h3>
                    <span className="text-xs text-gray-400 font-medium">{paymentBookings.length} booking payments listed</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Event</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Amount</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Discount</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Deposit Paid</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Balance Due</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Deposit Proof</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Final Proof</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {paymentBookings.map((b) => {
                          const total = getTotalAmount(b);
                          const extraChargesTotal = (b.extraCharges || []).reduce((s, c) => s + c.amount, 0);
                          const isDepositPaid = b.depositPaid || !['new_enquiry', 'menu_sent', 'menu_selected', 'deposit_pending'].includes(b.status);
                          const isFinalPaid = b.finalPaymentPaid || b.status === 'completed';
                          const isExtraPaid = b.status === 'completed' || !!b.paymentProofExtra || b.finalPaymentPaid;

                          const depositAmt = b.deposit || (pricingDetails.depositPercentage || 500);
                          const finalPaymentAmt = Math.max(0, total - depositAmt - extraChargesTotal);
                          const totalPaid = (isDepositPaid ? depositAmt : 0) +
                                            (isFinalPaid ? finalPaymentAmt : 0) +
                                            (isExtraPaid ? extraChargesTotal : 0);
                          const balanceDue = isFinalPaid ? 0 : Math.max(0, total - totalPaid);

                          return (
                            <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="px-4 py-3.5">
                                <div className="font-medium text-gray-900 text-sm">{b.name}</div>
                                <div className="text-xs text-gray-400">{b.id}</div>
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="text-sm text-gray-700">{b.eventType}</div>
                                <div className="text-xs text-gray-400">{b.date}</div>
                              </td>
                              <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">£{total.toLocaleString()}</td>
                              <td className="px-4 py-3.5">
                                {b.discount ? (
                                  <div className="text-sm font-semibold text-red-600">-£{getDiscountAmount(b).toLocaleString()}</div>
                                ) : (
                                  <div className="text-sm text-gray-400">—</div>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className={`text-sm font-medium ${isDepositPaid ? 'text-emerald-700' : 'text-amber-600'}`}>£{depositAmt.toLocaleString()}</div>
                                <div className="text-xs text-gray-400">{isDepositPaid ? '✓ Paid' : 'Pending'}</div>
                              </td>
                              <td className="px-4 py-3.5">
                                {isFinalPaid || balanceDue <= 0 ? (
                                  <span className="text-sm text-emerald-600 font-semibold">Paid in full</span>
                                ) : (
                                  <span className="text-sm font-semibold text-amber-700">£{balanceDue.toLocaleString()}</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                {b.paymentProofDeposit ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                                    <Icon name="CheckCircleIcon" size={12} /> Received
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">Awaiting</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                {b.paymentProofFinal ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                                    <Icon name="CheckCircleIcon" size={12} /> Received
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">Awaiting</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <button onClick={() => setSelectedBooking(b)} className="text-xs font-semibold hover:underline" style={{ color: '#C8860A' }}>Manage</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {paymentBookings.length === 0 && (
                      <div className="text-center py-12 text-gray-400 text-sm">
                        <Icon name="CreditCardIcon" size={32} className="mx-auto mb-2 text-gray-300" />
                        No payments found for the selected month/year.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─── MENUS ─── */}
          {activeTab === 'menus' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-gray-500">Edit menus, packages, and prices. Send directly to customers via WhatsApp.</p>
                <button onClick={saveAllMenusToDatabase} disabled={isSavingMenus} className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl text-white shadow-md transition-all hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed" style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                  <Icon name="CloudArrowUpIcon" size={16} />
                  {isSavingMenus ? 'Saving...' : 'Save Changes to Website'}
                </button>
              </div>

              {/* Menu Sub-tabs */}
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'banquet', label: '🎁 Banquet Packages' },
                  { id: 'indian', label: '🍛 Indian Menu' },
                  { id: 'srilankan', label: '🌴 Sri Lankan Menu' },
                  { id: 'live', label: '🎪 Live Counter' },
                ] as { id: AdminMenuTab; label: string }[]).map((tab) => (
                  <button key={tab.id} onClick={() => setAdminMenuTab(tab.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${adminMenuTab === tab.id ? 'text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:border-yellow-400'}`}
                    style={adminMenuTab === tab.id ? { background: 'linear-gradient(135deg, #C8860A, #F0A830)' } : {}}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ─── BANQUET PACKAGES ─── */}
              {adminMenuTab === 'banquet' && (
                <div className="space-y-4">
                  {editableBanquetPackages.map((pkg) => (
                    <div key={pkg.id} className="bg-white rounded-xl border border-gray-200 p-5">
                      {editingPackageId === pkg.id && editingPackageData ? (
                        /* Edit Mode */
                        <div className="space-y-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                            <div className="flex gap-2">
                              <button onClick={saveEditPackage} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>Save</button>
                              <button onClick={() => { setEditingPackageId(null); setEditingPackageData(null); }} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500">Cancel</button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Adult Price/Person (£)</label>
                              <input type="number" value={editingPackageData.pricePerPerson} onChange={(e) => setEditingPackageData({ ...editingPackageData, pricePerPerson: Number(e.target.value) })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Kids (4–10) Price (£)</label>
                              <input type="number" value={(editingPackageData as any).kidsPrice ?? getKidsPrice(editableKidsPricing, editingPackageData.name)} onChange={(e) => setEditingPackageData({ ...editingPackageData, kidsPrice: Number(e.target.value) } as any)} className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-amber-50/40 font-semibold" style={{ color: '#C8860A' }} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Veg Starters</label>
                              <input type="number" value={editingPackageData.starters.veg} onChange={(e) => setEditingPackageData({ ...editingPackageData, starters: { ...editingPackageData.starters, veg: Number(e.target.value) } })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Non-Veg Starters</label>
                              <input type="number" value={editingPackageData.starters.nonVeg} onChange={(e) => setEditingPackageData({ ...editingPackageData, starters: { ...editingPackageData.starters, nonVeg: Number(e.target.value) } })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Veg Mains</label>
                              <input type="number" value={editingPackageData.mains.veg} onChange={(e) => setEditingPackageData({ ...editingPackageData, mains: { ...editingPackageData.mains, veg: Number(e.target.value) } })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Non-Veg Mains</label>
                              <input type="number" value={editingPackageData.mains.nonVeg} onChange={(e) => setEditingPackageData({ ...editingPackageData, mains: { ...editingPackageData.mains, nonVeg: Number(e.target.value) } })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Min Guests</label>
                              {/* @ts-ignore */}
                              <input type="number" value={editingPackageData.minGuests ?? ''} onChange={(e) => setEditingPackageData({ ...editingPackageData, minGuests: e.target.value ? Number(e.target.value) : null })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="None" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Max Guests</label>
                              {/* @ts-ignore */}
                              <input type="number" value={editingPackageData.maxGuests ?? ''} onChange={(e) => setEditingPackageData({ ...editingPackageData, maxGuests: e.target.value ? Number(e.target.value) : null })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="None" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Desserts (one per line)</label>
                            <textarea rows={3} value={editingPackageData.desserts.join('\n')} onChange={(e) => setEditingPackageData({ ...editingPackageData, desserts: e.target.value.split('\n').filter(Boolean) })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Drinks (one per line)</label>
                            <textarea rows={3} value={editingPackageData.drinks.join('\n')} onChange={(e) => setEditingPackageData({ ...editingPackageData, drinks: e.target.value.split('\n').filter(Boolean) })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Tag / Badge</label>
                            <input type="text" value={editingPackageData.tag} onChange={(e) => setEditingPackageData({ ...editingPackageData, tag: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="e.g. Most Popular" />
                          </div>
                        </div>
                      ) : (
                        /* View Mode */
                        <div>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                                {pkg.tag && <span className="text-xs font-semibold px-2 py-0.5 rounded-full border" style={{ background: 'rgba(200,134,10,0.08)', color: '#C8860A', borderColor: 'rgba(200,134,10,0.3)' }}>{pkg.tag}</span>}
                              </div>
                              <div className="flex flex-wrap items-baseline gap-2.5">
                                <span className="text-lg font-bold" style={{ color: '#C8860A' }}>
                                  £{pkg.pricePerPerson}
                                  <span className="text-xs font-normal text-gray-500">/adult (Excl. VAT)</span>
                                </span>
                                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                                  Kids (4–10): £{(pkg as any).kidsPrice || getKidsPrice(editableKidsPricing, pkg.name)}
                                </span>
                              </div>
                              {pkg.guestLabel && <div className="text-xs text-gray-500 mt-0.5">{pkg.guestLabel}</div>}
                            </div>
                            <button onClick={() => startEditPackage(pkg)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-amber-50" style={{ borderColor: '#C8860A', color: '#C8860A' }}>
                              <Icon name="PencilSquareIcon" size={14} />
                              Edit
                            </button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                            {'canapes' in pkg && pkg.canapes && (
                              <div className="bg-gray-50 rounded-lg p-2.5">
                                <div className="text-xs text-gray-400 mb-0.5">Canapés</div>
                                <div className="text-xs font-medium text-gray-700">{pkg.canapes.veg}V · {pkg.canapes.nonVeg}NV</div>
                              </div>
                            )}
                            <div className="bg-gray-50 rounded-lg p-2.5">
                              <div className="text-xs text-gray-400 mb-0.5">Starters</div>
                              <div className="text-xs font-medium text-gray-700">{pkg.starters.veg}V · {pkg.starters.nonVeg}NV</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2.5">
                              <div className="text-xs text-gray-400 mb-0.5">Mains</div>
                              <div className="text-xs font-medium text-gray-700">{pkg.mains.veg}V · {pkg.mains.nonVeg}NV</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2.5">
                              <div className="text-xs text-gray-400 mb-0.5">Desserts</div>
                              <div className="text-xs font-medium text-gray-700">{pkg.desserts.length} item{pkg.desserts.length !== 1 ? 's' : ''}</div>
                            </div>
                            {pkg.drinks.length > 0 && (
                              <div className="bg-gray-50 rounded-lg p-2.5">
                                <div className="text-xs text-gray-400 mb-0.5">Drinks</div>
                                <div className="text-xs font-medium text-gray-700">{pkg.drinks.length} item{pkg.drinks.length !== 1 ? 's' : ''}</div>
                              </div>
                            )}
                          </div>
                          <div className="border-t border-gray-100 pt-3">
                            <p className="text-xs text-gray-500 mb-2 font-medium">📱 Send this package to a customer via WhatsApp:</p>
                            <div className="flex flex-wrap gap-2">
                              {enquiries.concat(activeBookings).slice(0, 4).map((b) => {
                                const packageKidsPrice = (pkg as any).kidsPrice || getKidsPrice(editableKidsPricing, pkg.name);
                                return (
                                  <a key={b.id}
                                    href={buildWhatsAppLink(b.phone, `Hi ${b.name.split(' ')[0]}, here is our *${pkg.name}* at *£${pkg.pricePerPerson}/person* (Excl. VAT):\n\n🥗 Starters: ${pkg.starters.veg} Veg + ${pkg.starters.nonVeg} Non-Veg\n🍛 Mains: ${pkg.mains.veg} Veg + ${pkg.mains.nonVeg} Non-Veg\n🍮 Desserts: ${pkg.desserts.join(', ')}\n${pkg.drinks.length > 0 ? `🥤 Drinks: ${pkg.drinks.join(', ')}\n` : ''}${pkg.guestLabel ? `\n👥 ${pkg.guestLabel}` : ''}\n\nFor ${b.guests} guests, estimated total: *£${(pkg.pricePerPerson * b.guests).toLocaleString()}* (Excl. VAT)\n\n🧒 *Kids Pricing* (Over 50 Adults):\n• Age 0-4 Yr: Free\n• Over 4-10 Yr: £${packageKidsPrice}/child\n• Over 10 Plus: Full Price (£${pkg.pricePerPerson}/person)\n\n🏢 *Venue Hire Charges:*\n${editableVenueCharges.map(vc => `• ${vc.day}: ${vc.charge}${vc.note ? ` (${vc.note})` : ''}`).join('\\n')}\n\nWould you like to go ahead with this package? Please reply to confirm! 🙏`)}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                                    style={{ background: '#25D366', color: 'white' }}>
                                    <Icon name="ChatBubbleLeftRightIcon" size={12} />
                                    Send to {b.name.split(' ')[0]}
                                  </a>
                                );
                              })}
                              {enquiries.concat(activeBookings).length === 0 && (
                                <span className="text-xs text-gray-400 italic">No active customers to send to</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Venue Hall Charges */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Icon name="BuildingOffice2Icon" size={16} style={{ color: '#C8860A' }} />
                      Venue Hall Charges
                    </h3>
                    <div className="space-y-2">
                      {editableVenueCharges.map((row, i) => (
                        <div key={i} className="flex items-center gap-3 flex-wrap">
                          <input type="text" value={row.day} onChange={(e) => setEditableVenueCharges(prev => prev.map((r, idx) => idx === i ? { ...r, day: e.target.value } : r))} className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                          <input type="text" value={row.charge} onChange={(e) => setEditableVenueCharges(prev => prev.map((r, idx) => idx === i ? { ...r, charge: e.target.value } : r))} className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none font-semibold" style={{ color: '#C8860A' }} />
                          <input type="text" value={row.note} onChange={(e) => setEditableVenueCharges(prev => prev.map((r, idx) => idx === i ? { ...r, note: e.target.value } : r))} className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none text-gray-500" placeholder="Note" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dry Hire Prices */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Icon name="BuildingOfficeIcon" size={16} style={{ color: '#C8860A' }} />
                      Dry Hire Prices
                    </h3>
                    <div className="space-y-2">
                      {editableDryHirePrices.map((row, i) => (
                        <div key={i} className="flex items-center gap-3 flex-wrap">
                          <input type="text" value={row.day} onChange={(e) => setEditableDryHirePrices(prev => prev.map((r, idx) => idx === i ? { ...r, day: e.target.value } : r))} className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Day" />
                          <input type="text" value={row.session} onChange={(e) => setEditableDryHirePrices(prev => prev.map((r, idx) => idx === i ? { ...r, session: e.target.value } : r))} className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Session" />
                          <input type="number" value={row.price} onChange={(e) => setEditableDryHirePrices(prev => prev.map((r, idx) => idx === i ? { ...r, price: Number(e.target.value) } : r))} className="flex-1 min-w-[120px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none font-semibold" style={{ color: '#C8860A' }} placeholder="Price (£)" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Table Service & Kids Pricing */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="font-semibold text-gray-900 mb-3">Table Service Charges</h3>
                      <div className="space-y-2">
                        {editableTableService.map((ts, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input type="text" value={ts.service} onChange={(e) => setEditableTableService(prev => prev.map((t, idx) => idx === i ? { ...t, service: e.target.value } : t))} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            <input type="text" value={ts.price} onChange={(e) => setEditableTableService(prev => prev.map((t, idx) => idx === i ? { ...t, price: e.target.value } : t))} className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none font-semibold" style={{ color: '#C8860A' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="mb-3">
                        <h3 className="font-semibold text-gray-900">Kids Pricing</h3>
                        <p className="text-[11px] text-gray-500">
                          Over 4–10 yr rates dynamically resolve based on the selected Banquet Package.
                        </p>
                      </div>
                      <div className="space-y-2.5">
                        {editableKidsPricing.map((kp, i) => {
                          const isOver4To10 = kp.ageRange.toLowerCase().includes('4-10') || kp.ageRange.toLowerCase().includes('3-10');
                          return (
                            <div key={i} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/60 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={kp.ageRange}
                                  onChange={(e) => setEditableKidsPricing(prev => prev.map((k, idx) => idx === i ? { ...k, ageRange: e.target.value } : k))}
                                  className="w-36 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none font-medium"
                                />
                                <input
                                  type="text"
                                  value={kp.price}
                                  onChange={(e) => setEditableKidsPricing(prev => prev.map((k, idx) => idx === i ? { ...k, price: e.target.value } : k))}
                                  className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none font-semibold"
                                  style={{ color: '#C8860A' }}
                                />
                              </div>
                              {isOver4To10 && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-1">
                                  <span className="text-[10px] uppercase font-bold text-gray-400">Dynamic Rates:</span>
                                  {editableBanquetPackages.map((bp) => {
                                    const bpKids = (bp as any).kidsPrice || getKidsPrice(editableKidsPricing, bp.name);
                                    return (
                                      <span key={bp.id} className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-950 font-medium shadow-2xs">
                                        {bp.name.replace(/package/i, '').trim()}: <strong className="text-[#C8860A]">£{bpKids}</strong>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── INDIAN MENU EDITOR ─── */}
              {adminMenuTab === 'indian' && (
                <div className="space-y-4">
                  {/* Send full Indian menu to customer */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-amber-700 mb-2">📱 Send Full Indian Menu to a Customer:</p>
                    <div className="flex flex-wrap gap-2">
                      {enquiries.concat(activeBookings).slice(0, 5).map((b) => (
                        <a key={b.id}
                          href={buildMenuWhatsAppText(b.name.split(' ')[0], b.phone, 'Indian Menu', b.guests)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Send to {b.name.split(' ')[0]}
                        </a>
                      ))}
                      {enquiries.concat(activeBookings).length === 0 && <span className="text-xs text-gray-400 italic">No active customers</span>}
                    </div>
                  </div>

                  {[
                    { label: 'Vegetarian Starters', key: 'vegStarters' as const },
                    { label: 'Non-Vegetarian Starters', key: 'nonVegStarters' as const },
                    { label: 'Vegetarian Mains', key: 'vegMains' as const },
                    { label: 'Non-Vegetarian Mains', key: 'nonVegMains' as const },
                    { label: 'Sundries', key: 'sundries' as const },
                    { label: 'Desserts', key: 'desserts' as const },
                  ].map((section) => (
                    <div key={section.key} className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="font-semibold text-gray-900 mb-3">{section.label}</h3>
                      <div className="space-y-2 mb-3">
                        {editableIndianMenu[section.key].map((item, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input type="text" value={item} onChange={(e) => setEditableIndianMenu(prev => ({ ...prev, [section.key]: prev[section.key].map((v, idx) => idx === i ? e.target.value : v) }))} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            {currentUser?.role === 'Super Admin' && (
                              <button onClick={() => setEditableIndianMenu(prev => ({ ...prev, [section.key]: prev[section.key].filter((_, idx) => idx !== i) }))} className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                <Icon name="TrashIcon" size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input type="text" placeholder={`Add new ${section.label.toLowerCase()} item...`} value={newMenuItemInput} onChange={(e) => setNewMenuItemInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && newMenuItemInput.trim()) { setEditableIndianMenu(prev => ({ ...prev, [section.key]: [...prev[section.key], newMenuItemInput.trim()] })); setNewMenuItemInput(''); } }}
                          className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-gray-50" />
                        <button onClick={() => { if (newMenuItemInput.trim()) { setEditableIndianMenu(prev => ({ ...prev, [section.key]: [...prev[section.key], newMenuItemInput.trim()] })); setNewMenuItemInput(''); } }}
                          className="text-white text-sm font-semibold px-3 py-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                          <Icon name="PlusIcon" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ─── SRI LANKAN MENU EDITOR ─── */}
              {adminMenuTab === 'srilankan' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-amber-700 mb-2">📱 Send Full Sri Lankan Menu to a Customer:</p>
                    <div className="flex flex-wrap gap-2">
                      {enquiries.concat(activeBookings).slice(0, 5).map((b) => (
                        <a key={b.id}
                          href={buildMenuWhatsAppText(b.name.split(' ')[0], b.phone, 'Sri Lankan Menu', b.guests)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Send to {b.name.split(' ')[0]}
                        </a>
                      ))}
                      {enquiries.concat(activeBookings).length === 0 && <span className="text-xs text-gray-400 italic">No active customers</span>}
                    </div>
                  </div>

                  {[
                    { label: 'Vegetarian Starters', key: 'vegStarters' as const },
                    { label: 'Non-Vegetarian Starters', key: 'nonVegStarters' as const },
                    { label: 'Vegetarian Mains', key: 'vegMains' as const },
                    { label: 'Non-Vegetarian Mains', key: 'nonVegMains' as const },
                    { label: 'Sundries', key: 'sundries' as const },
                    { label: 'Desserts', key: 'desserts' as const },
                  ].map((section) => (
                    <div key={section.key} className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="font-semibold text-gray-900 mb-3">{section.label}</h3>
                      <div className="space-y-2 mb-3">
                        {editableSLMenu[section.key].map((item, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input type="text" value={item} onChange={(e) => setEditableSLMenu(prev => ({ ...prev, [section.key]: prev[section.key].map((v, idx) => idx === i ? e.target.value : v) }))} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            {currentUser?.role === 'Super Admin' && (
                              <button onClick={() => setEditableSLMenu(prev => ({ ...prev, [section.key]: prev[section.key].filter((_, idx) => idx !== i) }))} className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                <Icon name="TrashIcon" size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input type="text" placeholder={`Add new ${section.label.toLowerCase()} item...`} value={newMenuItemInput} onChange={(e) => setNewMenuItemInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && newMenuItemInput.trim()) { setEditableSLMenu(prev => ({ ...prev, [section.key]: [...prev[section.key], newMenuItemInput.trim()] })); setNewMenuItemInput(''); } }}
                          className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-gray-50" />
                        <button onClick={() => { if (newMenuItemInput.trim()) { setEditableSLMenu(prev => ({ ...prev, [section.key]: [...prev[section.key], newMenuItemInput.trim()] })); setNewMenuItemInput(''); } }}
                          className="text-white text-sm font-semibold px-3 py-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                          <Icon name="PlusIcon" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ─── LIVE COUNTER EDITOR ─── */}
              {adminMenuTab === 'live' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-amber-700 mb-2">📱 Send Live Counter Package to a Customer:</p>
                    <div className="flex flex-wrap gap-2">
                      {enquiries.concat(activeBookings).slice(0, 5).map((b) => (
                        <a key={b.id}
                          href={buildWhatsAppLink(b.phone, `Hi ${b.name.split(' ')[0]}, here is our *Live Counter Package* from Honeymoon:\n\n🎪 *Sri Lankan & South Indian:*\n${editableLiveCounter.srilankanSouthIndian.map(i => `• ${i.name} — £${i.price.toFixed(2)}/person`).join('\n')}\n\n🎪 *North Indian:*\n${editableLiveCounter.northIndian.map(i => `• ${i.name} — £${i.price.toFixed(2)}/person`).join('\n')}\n\n✨ *Extras:*\n${editableLiveCounter.extras.map(i => `• ${i.name} — £${i.price.toFixed(2)}`).join('\n')}\n\nPlease let us know which items you'd like to add to your event! 🙏`)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Send to {b.name.split(' ')[0]}
                        </a>
                      ))}
                      {enquiries.concat(activeBookings).length === 0 && <span className="text-xs text-gray-400 italic">No active customers</span>}
                    </div>
                  </div>

                  {[
                    { label: 'Sri Lankan & South Indian', key: 'srilankanSouthIndian' as const },
                    { label: 'North Indian', key: 'northIndian' as const },
                    { label: 'Extras', key: 'extras' as const },
                  ].map((section) => (
                    <div key={section.key} className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="font-semibold text-gray-900 mb-3">{section.label}</h3>
                      <div className="space-y-2 mb-3">
                        {editableLiveCounter[section.key].map((item, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input type="text" value={item.name} onChange={(e) => setEditableLiveCounter(prev => ({ ...prev, [section.key]: prev[section.key].map((v, idx) => idx === i ? { ...v, name: e.target.value } : v) }))} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-gray-500">£</span>
                              <input type="number" step="0.01" value={item.price} onChange={(e) => setEditableLiveCounter(prev => ({ ...prev, [section.key]: prev[section.key].map((v, idx) => idx === i ? { ...v, price: parseFloat(e.target.value) || 0 } : v) }))} className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none text-right" />
                            </div>
                            {currentUser?.role === 'Super Admin' && (
                              <button onClick={() => setEditableLiveCounter(prev => ({ ...prev, [section.key]: prev[section.key].filter((_, idx) => idx !== i) }))} className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                <Icon name="TrashIcon" size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Item name..." value={newLiveItemName} onChange={(e) => setNewLiveItemName(e.target.value)} className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-gray-50" />
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-500">£</span>
                          <input type="number" step="0.01" placeholder="0.00" value={newLiveItemPrice} onChange={(e) => setNewLiveItemPrice(e.target.value)} className="w-20 border border-dashed border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none bg-gray-50" />
                        </div>
                        <button onClick={() => { if (newLiveItemName.trim()) { setEditableLiveCounter(prev => ({ ...prev, [section.key]: [...prev[section.key], { name: newLiveItemName.trim(), price: parseFloat(newLiveItemPrice) || 0 }] })); setNewLiveItemName(''); setNewLiveItemPrice(''); } }}
                          className="text-white text-sm font-semibold px-3 py-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                          <Icon name="PlusIcon" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── HISTORY ─── */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
                <div className="relative flex-1 min-w-[240px] max-w-sm">
                  <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search history..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 font-medium">Filter Month:</span>
                  <select
                    value={historyFilterMonth}
                    onChange={(e) => setHistoryFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 font-medium focus:outline-none"
                  >
                    <option value="all">All Months</option>
                    {MONTHS.map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={historyFilterYear}
                    onChange={(e) => setHistoryFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 font-medium focus:outline-none"
                  >
                    <option value="all">All Years</option>
                    {availableYears.map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                  {(historyFilterMonth !== 'all' || historyFilterYear !== 'all') && (
                    <button
                      onClick={() => { setHistoryFilterMonth('all'); setHistoryFilterYear('all'); }}
                      className="text-xs text-amber-700 hover:text-amber-900 font-semibold px-2 py-1 bg-amber-50 rounded-lg border border-amber-200"
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-xs text-gray-400 font-medium ml-1">
                    {historyBookings.length} {historyFilterMonth !== 'all' ? `in ${MONTHS[historyFilterMonth]}` : 'records'}
                  </span>
                </div>
              </div>
              {(() => {
                const filteredHistory = historyBookings.filter(b => !historySearch || b.name.toLowerCase().includes(historySearch.toLowerCase()) || b.email.toLowerCase().includes(historySearch.toLowerCase()) || b.phone.toLowerCase().includes(historySearch.toLowerCase()) || b.eventType.toLowerCase().includes(historySearch.toLowerCase()));
                const totalHistoryCount = filteredHistory.length;
                const totalHistoryPages = Math.max(1, Math.ceil(totalHistoryCount / historyPageSize));
                const currentHistoryPage = Math.min(Math.max(1, historyPage), totalHistoryPages);
                const startHistoryIdx = (currentHistoryPage - 1) * historyPageSize;
                const endHistoryIdx = Math.min(startHistoryIdx + historyPageSize, totalHistoryCount);
                const paginatedHistory = filteredHistory.slice(startHistoryIdx, endHistoryIdx);

                return (
                  <>
                    {paginatedHistory.map((b) => (
                      <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(200,134,10,0.1)' }}>
                              <span className="text-base font-bold" style={{ color: '#C8860A' }}>{b.name.charAt(0)}</span>
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{b.name}</div>
                              <div className="text-xs text-gray-400">{b.email} · {b.phone}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[b.status]}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[b.status]}`} />
                              {STATUS_LABELS[b.status]}
                            </span>
                            <div className="flex gap-1.5 flex-wrap">
                              {/* 0. Amend in Wizard */}
                              <button
                                onClick={() => { setEditingBookingForManual(b); setActiveTab('manual_booking'); }}
                                className="text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-amber-200 shadow-2xs"
                                title="Amend booking in 4-step wizard"
                              >
                                <Icon name="PencilSquareIcon" size={13} className="text-[#C8860A]" />
                                Amend
                              </button>
                              {/* Open Drawer */}
                              <button
                                onClick={() => setSelectedBooking(b)}
                                className="text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold shadow-2xs"
                                title="Open Details & Workflow Drawer"
                              >
                                <Icon name="EyeIcon" size={13} />
                                Details
                              </button>
                              {/* 1. Menu PDF for Chef */}
                              <button
                                onClick={() => { downloadChefMenuPDF(b); generateChefMenuPDF(b); }}
                                className="text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-amber-200 shadow-2xs"
                                title="Download / Print Chef Menu Sheet PDF"
                              >
                                <Icon name="ClipboardDocumentListIcon" size={13} className="text-[#C8860A]" />
                                Menu PDF
                              </button>
                              {/* 2. Deposit Invoice */}
                              <button
                                onClick={() => downloadInvoicePDF(b, true)}
                                className="text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-emerald-200 shadow-2xs"
                                title="Download Deposit Invoice PDF"
                              >
                                <Icon name="DocumentTextIcon" size={13} />
                                Deposit PDF
                              </button>
                              {/* 3. Final Invoice */}
                              <button
                                onClick={() => downloadInvoicePDF(b, false)}
                                className="text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-blue-200 shadow-2xs"
                                title="Download Final Invoice PDF"
                              >
                                <Icon name="DocumentCheckIcon" size={13} />
                                Final PDF
                              </button>
                              {/* 4. WhatsApp Invoice Delivery */}
                              <button
                                onClick={() => handleOpenWhatsAppInvoiceModal(b)}
                                className="text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-emerald-300 shadow-2xs"
                                title="Deliver Invoice PDF via WhatsApp"
                              >
                                <svg viewBox="0 0 24 24" fill="#25D366" className="w-3.5 h-3.5">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.859L.057 23.428a.75.75 0 0 0 .921.921l5.684-1.47A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.694 9.694 0 0 1-4.946-1.356l-.355-.211-3.676.95.974-3.578-.231-.368A9.693 9.693 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                                </svg>
                                WhatsApp PDF
                              </button>
                            </div>
                            {currentUser?.role === 'Super Admin' && (
                              <button onClick={() => handleDeleteBooking(b.id, b.name)} className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors" title="Delete History Record">
                                <Icon name="TrashIcon" size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          {[
                            { label: 'Event Type', value: b.eventType },
                            { label: 'Event Date', value: b.date },
                            { label: 'Guests', value: `${b.guests} people` },
                            { label: 'Package', value: b.selectedMenu || b.package },
                          ].map((f) => (
                            <div key={f.label} className="bg-gray-50 rounded-lg p-2.5">
                              <div className="text-xs text-gray-400 mb-0.5">{f.label}</div>
                              <div className="text-sm font-medium text-gray-800">{f.value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-100 pt-4">
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Financial Summary</div>
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div><span className="text-gray-500">Base: </span><span className="font-semibold text-gray-900">£{b.baseAmount.toLocaleString()}</span></div>
                            {b.extraCharges.length > 0 && (
                              <div><span className="text-gray-500">Extras: </span><span className="font-semibold text-amber-700">+£{b.extraCharges.reduce((s, c) => s + c.amount, 0).toLocaleString()}</span></div>
                            )}
                            {b.discount && (
                              <div><span className="text-gray-500">Discount: </span><span className="font-semibold text-red-600">-£{getDiscountAmount(b).toLocaleString()}</span></div>
                            )}
                            <div><span className="text-gray-500">Total: </span><span className="font-bold" style={{ color: '#C8860A' }}>£{getTotalAmount(b).toLocaleString()}</span></div>
                            <div className="flex items-center gap-1"><Icon name="CheckCircleIcon" size={14} className="text-emerald-500" /><span className="text-emerald-700 font-medium text-xs">Fully Paid</span></div>
                          </div>
                        </div>

                        {/* Payment proofs */}
                        {(b.paymentProofDeposit || b.paymentProofFinal || b.paymentProofExtra) && (
                          <div className="border-t border-gray-100 pt-4 mt-4">
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Payment Proofs</div>
                            <div className="flex gap-3">
                              {b.paymentProofDeposit && (
                                <div
                                  className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm group bg-gray-50 flex-shrink-0"
                                  onClick={() => {
                                    openImagePreview(b.paymentProofDeposit, "Deposit Payment Proof");
                                  }}
                                  title="View Deposit Proof"
                                >
                                  <img src={b.paymentProofDeposit} alt="Deposit" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Icon name="MagnifyingGlassPlusIcon" size={16} className="text-white" />
                                  </div>
                                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">Deposit</div>
                                </div>
                              )}
                              {b.paymentProofFinal && (
                                <div
                                  className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm group bg-gray-50 flex-shrink-0"
                                  onClick={() => {
                                    openImagePreview(b.paymentProofFinal, "Final Payment Proof");
                                  }}
                                  title="View Final Proof"
                                >
                                  <img src={b.paymentProofFinal} alt="Final" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Icon name="MagnifyingGlassPlusIcon" size={16} className="text-white" />
                                  </div>
                                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">Final</div>
                                </div>
                              )}
                              {b.paymentProofExtra && (
                                <div
                                  className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm group bg-gray-50 flex-shrink-0"
                                  onClick={() => {
                                    openImagePreview(b.paymentProofExtra, "Extra Charges Payment Proof");
                                  }}
                                  title="View Extra Proof"
                                >
                                  <img src={b.paymentProofExtra} alt="Extra" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Icon name="MagnifyingGlassPlusIcon" size={16} className="text-white" />
                                  </div>
                                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">Extra</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {b.notes && <div className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{b.notes}</div>}
                      </div>
                    ))}

                    {totalHistoryCount === 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                        <Icon name="ArchiveBoxIcon" size={36} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-gray-400 text-sm">No completed bookings match your filter</p>
                      </div>
                    )}

                    {totalHistoryCount > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
                        <div className="flex items-center gap-3">
                          <span>
                            Showing <span className="font-semibold text-gray-900">{startHistoryIdx + 1}</span> to{' '}
                            <span className="font-semibold text-gray-900">{endHistoryIdx}</span> of{' '}
                            <span className="font-semibold text-gray-900">{totalHistoryCount}</span> records
                          </span>
                          <div className="flex items-center gap-1.5 border-l border-gray-300 pl-3">
                            <span className="text-gray-500">Rows per page:</span>
                            <select
                              value={historyPageSize}
                              onChange={(e) => {
                                setHistoryPageSize(Number(e.target.value));
                                setHistoryPage(1);
                              }}
                              className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                            >
                              <option value={10}>10</option>
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                          </div>
                        </div>

                        {totalHistoryPages > 1 && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setHistoryPage(1)}
                              disabled={currentHistoryPage === 1}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                              title="First Page"
                            >
                              « First
                            </button>
                            <button
                              type="button"
                              onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                              disabled={currentHistoryPage === 1}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                              title="Previous Page"
                            >
                              ‹ Prev
                            </button>

                            {getPaginationRange(currentHistoryPage, totalHistoryPages).map((p, idx) => (
                              p === '...' ? (
                                <span key={`ellipsis-hist-${idx}`} className="px-2 py-1 text-gray-400">...</span>
                              ) : (
                                <button
                                  type="button"
                                  key={p}
                                  onClick={() => setHistoryPage(Number(p))}
                                  className={`min-w-[28px] h-7 px-2 rounded-lg font-semibold text-xs transition-all ${
                                    currentHistoryPage === p
                                      ? 'text-white shadow-sm'
                                      : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'
                                  }`}
                                  style={currentHistoryPage === p ? { background: 'linear-gradient(135deg, #C8860A, #F0A830)' } : {}}
                                >
                                  {p}
                                </button>
                              )
                            ))}

                            <button
                              type="button"
                              onClick={() => setHistoryPage(prev => Math.min(totalHistoryPages, prev + 1))}
                              disabled={currentHistoryPage === totalHistoryPages}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                              title="Next Page"
                            >
                              Next ›
                            </button>
                            <button
                              type="button"
                              onClick={() => setHistoryPage(totalHistoryPages)}
                              disabled={currentHistoryPage === totalHistoryPages}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                              title="Last Page"
                            >
                              Last »
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ─── SETTINGS ─── */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-5xl">
              {/* Extra Charges, Fees & Taxes */}
              <ExtraChargesSettings onChargesUpdated={setConfiguredExtraCharges} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Icon name="BuildingOfficeIcon" size={18} style={{ color: '#C8860A' }} />
                    Venue Details
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Venue Name</label>
                      <input type="text" value={venueDetails.venueName} onChange={(e) => setVenueDetails(prev => ({ ...prev, venueName: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Max Capacity</label>
                      <input type="number" value={venueDetails.maxCapacity} onChange={(e) => setVenueDetails(prev => ({ ...prev, maxCapacity: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Contact Email</label>
                      <input type="email" value={venueDetails.contactEmail} onChange={(e) => setVenueDetails(prev => ({ ...prev, contactEmail: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</label>
                      <input type="tel" value={venueDetails.phone} onChange={(e) => setVenueDetails(prev => ({ ...prev, phone: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">WhatsApp Business Number</label>
                      <input type="tel" value={venueDetails.whatsapp} onChange={(e) => setVenueDetails(prev => ({ ...prev, whatsapp: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Address</label>
                      <input type="text" value={venueDetails.address} onChange={(e) => setVenueDetails(prev => ({ ...prev, address: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                    <button
                      onClick={saveVenueDetails}
                      disabled={isSavingVenueDetails}
                      className="text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all mt-1 shadow-md active:scale-95 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
                    >
                      {isSavingVenueDetails ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Icon name="CalendarDaysIcon" size={18} style={{ color: '#C8860A' }} />
                    Pricing & Deposits
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-600">Deposit Amount</label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-sm">£</span>
                        <input type="number" value={pricingDetails.depositPercentage} onChange={e => {
                          const val = Number(e.target.value);
                          setPricingDetails(p => ({ ...p, depositPercentage: val, depositAmount: val }));
                        }} className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none bg-gray-50" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-600">Minimum Guests (Pax)</label>
                      <div className="flex items-center gap-1">
                        <input type="number" min={1} value={pricingDetails.minimumGuests} onChange={e => setPricingDetails(p => ({ ...p, minimumGuests: Number(e.target.value) || 1 }))} className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none bg-gray-50" />
                        <span className="text-gray-500 text-sm">pax</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-600">Minimum Booking Hours</label>
                      <input type="number" value={pricingDetails.minimumBookingHours} onChange={e => setPricingDetails(p => ({ ...p, minimumBookingHours: Number(e.target.value) }))} className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none bg-gray-50" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-600">Weekday Rate (per hour)</label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-sm">£</span>
                        <input type="number" value={pricingDetails.weekdayRate} onChange={e => setPricingDetails(p => ({ ...p, weekdayRate: Number(e.target.value) }))} className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none bg-gray-50" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-600">Weekend Rate (per hour)</label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-sm">£</span>
                        <input type="number" value={pricingDetails.weekendRate} onChange={e => setPricingDetails(p => ({ ...p, weekendRate: Number(e.target.value) }))} className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none bg-gray-50" />
                      </div>
                    </div>
                    <button
                      onClick={savePricingDetails}
                      disabled={isSavingPricingDetails}
                      className="text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all mt-4 shadow-md active:scale-95 disabled:opacity-50 w-full"
                      style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
                    >
                      {isSavingPricingDetails ? 'Saving...' : 'Save Pricing & Deposits'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Icon name="CreditCardIcon" size={18} style={{ color: '#C8860A' }} />
                    Bank Account Details
                  </h3>
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Account Name</label>
                      <input type="text" value={bankDetails.accountName} onChange={(e) => updateBankDetail('accountName', e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sort Code</label>
                      <input type="text" value={bankDetails.sortCode} onChange={(e) => updateBankDetail('sortCode', e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Account Number</label>
                      <input type="text" value={bankDetails.accountNumber} onChange={(e) => updateBankDetail('accountNumber', e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-gray-50" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Icon name="NoSymbolIcon" size={18} style={{ color: '#C8860A' }} />
                    Block Dates
                  </h3>
                  <div className="flex items-center gap-2">
                    <input type="date" value={blockDateInput} onChange={(e) => setBlockDateInput(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-gray-50" />
                    <button onClick={handleBlockDate} className="bg-gray-900 hover:bg-gray-700 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors">Block Date</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {blockedDates.map((d) => (
                      <div key={d} className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-3 py-1.5 rounded-lg">
                        {d}
                        <button onClick={() => handleUnblockDate(d)} className="hover:text-red-800"><Icon name="XMarkIcon" size={12} /></button>
                      </div>
                    ))}
                    {blockedDates.length === 0 && (
                      <span className="text-xs text-gray-400 italic">No blocked dates</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}
          {/* ─── DISCOUNT APPROVALS ─── */}
          {activeTab === 'discount_approvals' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Icon name="TagIcon" size={18} style={{ color: '#C8860A' }} />
                    Discount Approvals
                  </h3>
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setDiscountTab('pending')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${discountTab === 'pending' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Pending Requests</button>
                    <button onClick={() => setDiscountTab('history')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${discountTab === 'history' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>History</button>
                  </div>
                </div>
                
                {discountTab === 'pending' ? (
                  pendingDiscounts.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      <Icon name="CheckBadgeIcon" size={36} className="mx-auto mb-3 text-gray-300" />
                      No pending discount requests
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingDiscounts.map(b => {
                        const totalBeforeDiscount = b.baseAmount + (b.extraCharges || []).reduce((s, c) => s + c.amount, 0);
                        const discountReqVal = b.discountRequest?.type === 'percentage' 
                          ? (totalBeforeDiscount * (b.discountRequest.value / 100))
                          : (b.discountRequest?.value || 0);

                        return (
                          <div key={b.id} className="border border-gray-200 rounded-xl p-5 bg-white flex flex-col lg:flex-row gap-6 items-start shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex-1 space-y-4 w-full">
                              {/* Customer & Event Info */}
                              <div className="flex justify-between items-start flex-wrap gap-2">
                                <div>
                                  <h4 className="font-bold text-gray-900 text-base">{b.name}</h4>
                                  <div className="text-xs text-gray-500 mt-1">{b.email} • {b.phone}</div>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-right">
                                  <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Requested Discount</div>
                                  <div className="font-bold text-amber-900 mt-0.5">
                                    {b.discountRequest?.type === 'percentage' ? `${b.discountRequest.value}%` : `£${b.discountRequest?.value}`}
                                    <span className="text-sm font-medium ml-1">(-£{discountReqVal.toLocaleString()})</span>
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1 italic">"{b.discountRequest?.reason}"</div>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100 mb-2">
                                <div>
                                  <div className="text-xs text-gray-400 mb-0.5">Event Type</div>
                                  <div className="text-sm font-medium text-gray-800">{b.eventType}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-400 mb-0.5">Guests</div>
                                  <div className="text-sm font-medium text-gray-800">{b.guests}</div>
                                </div>
                              </div>
                              
                              <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-500 font-medium">Total (Base + Extras)</span>
                                  <span className="font-semibold text-gray-900">£{totalBeforeDiscount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-amber-600 font-medium">Requested Discount</span>
                                  <span className="font-bold text-amber-700">-£{discountReqVal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-emerald-600 font-medium">Deposit Paid</span>
                                  <span className="font-semibold text-emerald-700">-£{b.deposit.toLocaleString()}</span>
                                </div>
                                <div className="border-t border-gray-200 pt-2 flex justify-between items-center mt-1">
                                  <span className="font-bold text-gray-900 text-xs uppercase tracking-wide">Final Pending Amount <span className="text-[10px] text-gray-400 font-normal normal-case ml-1">(If Approved)</span></span>
                                  <span className="font-bold text-lg text-indigo-700">£{(totalBeforeDiscount - discountReqVal - b.deposit).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center gap-3 w-full lg:w-48 flex-shrink-0">
                              {/* Deposit Proof */}
                              {b.paymentProofDeposit ? (
                                <div className="w-full text-center">
                                  <div className="text-xs font-semibold text-gray-500 mb-1.5">Deposit Payment</div>
                                  <div 
                                    className="w-full h-24 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm group relative"
                                    onClick={() => {
                                      openImagePreview(b.paymentProofDeposit, "Deposit Payment Proof");
                                    }}
                                  >
                                    <img src={b.paymentProofDeposit} alt="Deposit Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <Icon name="MagnifyingGlassPlusIcon" size={20} className="text-white" />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="w-full h-24 bg-gray-50 border border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400">
                                  <Icon name="PhotoIcon" size={20} className="mb-1" />
                                  <span className="text-[10px] font-medium">No Deposit Photo</span>
                                </div>
                              )}
                              
                              <div className="flex gap-2 w-full mt-auto">
                                <button onClick={() => handleDiscountApproval(b.id, false)} className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 font-semibold py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1">
                                  <Icon name="XMarkIcon" size={14} /> Reject
                                </button>
                                <button onClick={() => handleDiscountApproval(b.id, true)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-xs transition-colors shadow-sm flex items-center justify-center gap-1">
                                  <Icon name="CheckIcon" size={14} /> Approve
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  bookings.filter(b => b.discountRequest && b.discountRequest.status !== 'pending').length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      <Icon name="ClockIcon" size={36} className="mx-auto mb-3 text-gray-300" />
                      No discount history
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {bookings.filter(b => b.discountRequest && b.discountRequest.status !== 'pending').map(b => {
                        const totalBeforeDiscount = b.baseAmount + (b.extraCharges || []).reduce((s, c) => s + c.amount, 0);
                        const discountReqVal = b.discountRequest?.type === 'percentage' 
                          ? (totalBeforeDiscount * (b.discountRequest.value / 100))
                          : (b.discountRequest?.value || 0);

                        return (
                          <div key={b.id} className={`border border-gray-200 rounded-xl p-5 bg-white flex flex-col gap-4 shadow-sm opacity-90 ${b.discountRequest?.status === 'rejected' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-emerald-500'}`}>
                            <div className="flex justify-between items-start flex-wrap gap-2">
                              <div>
                                <h4 className="font-bold text-gray-900 text-base">{b.name}</h4>
                                <div className="text-xs text-gray-500 mt-1">{b.email} • {b.phone}</div>
                              </div>
                              <div className={`border px-3 py-1.5 rounded-lg text-right ${b.discountRequest?.status === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                <div className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1 justify-end ${b.discountRequest?.status === 'approved' ? 'text-emerald-700' : 'text-red-700'}`}>
                                  <Icon name={b.discountRequest?.status === 'approved' ? 'CheckCircleIcon' : 'XCircleIcon'} size={14} />
                                  {b.discountRequest?.status === 'approved' ? 'Approved' : 'Rejected'} Discount
                                </div>
                                <div className={`font-bold mt-0.5 ${b.discountRequest?.status === 'approved' ? 'text-emerald-900' : 'text-red-900'}`}>
                                  {b.discountRequest?.type === 'percentage' ? `${b.discountRequest.value}%` : `£${b.discountRequest?.value}`}
                                  <span className="text-sm font-medium ml-1">(-£{discountReqVal.toLocaleString()})</span>
                                </div>
                                <div className="text-xs text-gray-600 mt-1 italic">"{b.discountRequest?.reason}"</div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-6 text-sm text-gray-600 border-t border-gray-100 pt-3">
                              <div><span className="text-gray-400 mr-1">Event Type:</span> {b.eventType}</div>
                              <div><span className="text-gray-400 mr-1">Guests:</span> {b.guests}</div>
                              <div><span className="text-gray-400 mr-1">Total Amount:</span> £{totalBeforeDiscount.toLocaleString()}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
          {activeTab === 'access' && (
            <AccessControl currentUserRole={currentUser?.role} />
          )}

          {/* ─── BOOKING TRACKER ─── */}
          {activeTab === 'tracker' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Icon name="MapIcon" size={24} style={{ color: '#C8860A' }} />
                    Booking Timeline Tracker
                  </h3>
                  {trackingBookingId && (
                    <button 
                      onClick={() => { setTrackingBookingId(''); setTrackerSearch(''); }}
                      className="text-sm font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Icon name="ArrowLeftIcon" size={16} /> Back to all orders
                    </button>
                  )}
                </div>
                
                {!trackingBookingId ? (
                  <div className="space-y-5 animate-in fade-in duration-300">
                    {/* Tracker Filter Bar */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                          <Icon name="FunnelIcon" size={14} className="text-[#C8860A]" />
                          <span>Filter Orders by Status, Event &amp; Date</span>
                        </div>
                        {(() => {
                          const filtered = bookings.filter(b => {
                            if (trackerStatusFilter !== 'all' && b.status !== trackerStatusFilter) return false;
                            if (trackerEventFilter !== 'all' && b.eventType.toLowerCase() !== trackerEventFilter.toLowerCase()) return false;
                            if (trackerDateFilter && !b.date.includes(trackerDateFilter)) return false;
                            if (trackerSearch) {
                              const q = trackerSearch.toLowerCase();
                              return (
                                (b.name || '').toLowerCase().includes(q) ||
                                (b.email || '').toLowerCase().includes(q) ||
                                (b.phone || '').toLowerCase().includes(q) ||
                                (b.eventType || '').toLowerCase().includes(q) ||
                                (b.id || '').toLowerCase().includes(q)
                              );
                            }
                            return true;
                          });

                          return (
                            <button
                              type="button"
                              onClick={() => handleDownloadFilteredTrackerPDF(filtered)}
                              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-all hover:brightness-110 active:scale-95"
                              style={{ background: 'linear-gradient(135deg, #C8860A, #E09812)' }}
                              title="Download comprehensive PDF report of current filtered bookings"
                            >
                              <Icon name="DocumentArrowDownIcon" size={14} />
                              <span>Download Filtered Tracker PDF ({filtered.length})</span>
                            </button>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        {/* Status Filter */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Status</label>
                          <select
                            value={trackerStatusFilter}
                            onChange={(e) => setTrackerStatusFilter(e.target.value)}
                            className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                          >
                            <option value="all">All Statuses ({bookings.length})</option>
                            {STATUS_FLOW.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]} ({bookings.filter(b => b.status === s).length})
                              </option>
                            ))}
                            <option value="cancelled">
                              Cancelled ({bookings.filter(b => b.status === 'cancelled').length})
                            </option>
                          </select>
                        </div>

                        {/* Event Type Filter */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Event Type</label>
                          <select
                            value={trackerEventFilter}
                            onChange={(e) => setTrackerEventFilter(e.target.value)}
                            className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                          >
                            <option value="all">All Event Types</option>
                            <option value="Wedding">Wedding</option>
                            <option value="Birthday">Birthday</option>
                            <option value="Corporate">Corporate</option>
                            <option value="Anniversary">Anniversary</option>
                            <option value="Reception">Reception</option>
                            <option value="Mehndi">Mehndi / Sangeet</option>
                            <option value="Dry Hire">Dry Hire</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        {/* Date Query Filter */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Event Date (YYYY-MM)</label>
                          <input
                            type="text"
                            placeholder="e.g. 2026-10"
                            value={trackerDateFilter}
                            onChange={(e) => setTrackerDateFilter(e.target.value)}
                            className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-2 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                          />
                        </div>
                      </div>

                      {/* Active filter tags & reset */}
                      {(trackerStatusFilter !== 'all' || trackerEventFilter !== 'all' || trackerDateFilter) && (
                        <div className="flex items-center gap-2 pt-1 border-t border-gray-200 flex-wrap text-[11px]">
                          <span className="text-gray-500 font-medium">Active filters:</span>
                          {trackerStatusFilter !== 'all' && (
                            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                              Status: {STATUS_LABELS[trackerStatusFilter as BookingStatus] || trackerStatusFilter}
                            </span>
                          )}
                          {trackerEventFilter !== 'all' && (
                            <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold border border-indigo-200">
                              Event: {trackerEventFilter}
                            </span>
                          )}
                          {trackerDateFilter && (
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                              Date: {trackerDateFilter}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setTrackerStatusFilter('all');
                              setTrackerEventFilter('all');
                              setTrackerDateFilter('');
                            }}
                            className="text-xs text-rose-600 hover:text-rose-800 font-bold underline ml-auto"
                          >
                            Reset Filters
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text"
                        placeholder="Search orders by customer name, email, phone, or order ID..."
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C8860A] transition-shadow shadow-sm"
                        value={trackerSearch}
                        onChange={(e) => setTrackerSearch(e.target.value)}
                      />
                      {trackerSearch && (
                        <button 
                          onClick={() => setTrackerSearch('')}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                        >
                          <Icon name="XMarkIcon" size={16} />
                        </button>
                      )}
                    </div>

                    <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden max-h-[600px] overflow-y-auto">
                      {(() => {
                        const filtered = bookings.filter(b => {
                          if (trackerStatusFilter !== 'all' && b.status !== trackerStatusFilter) return false;
                          if (trackerEventFilter !== 'all' && b.eventType.toLowerCase() !== trackerEventFilter.toLowerCase()) return false;
                          if (trackerDateFilter && !b.date.includes(trackerDateFilter)) return false;
                          if (trackerSearch) {
                            const q = trackerSearch.toLowerCase();
                            return (
                              (b.name || '').toLowerCase().includes(q) ||
                              (b.email || '').toLowerCase().includes(q) ||
                              (b.phone || '').toLowerCase().includes(q) ||
                              (b.eventType || '').toLowerCase().includes(q) ||
                              (b.id || '').toLowerCase().includes(q)
                            );
                          }
                          return true;
                        });

                        return filtered.length > 0 ? filtered.map(b => (
                          <div 
                            key={b.id}
                            onClick={() => {
                              setTrackingBookingId(b.id);
                              setTrackerSearch('');
                            }}
                            className="px-5 py-4 hover:bg-[#C8860A]/5 cursor-pointer border-b border-gray-50 last:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors group"
                          >
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-50 text-amber-700 font-bold text-lg border border-amber-100">
                                {b.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-900 text-sm group-hover:text-[#C8860A] transition-colors flex items-center gap-2">
                                  <span>{b.name}</span>
                                  <span className="text-[10px] text-gray-400 font-mono">#{b.id.slice(0, 8)}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="flex items-center gap-1"><Icon name="EnvelopeIcon" size={12} /> {b.email}</span>
                                  <span className="hidden sm:inline text-gray-300">•</span>
                                  <span className="flex items-center gap-1"><Icon name="PhoneIcon" size={12} /> {b.phone}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-[11px]">
                                  <span className="text-gray-600 font-medium">£{getTotalAmount(b).toLocaleString()}</span>
                                  {b.discount && (
                                    <span className="text-red-600 font-bold bg-red-50 px-1.5 py-0.2 rounded border border-red-100">
                                      -£{getDiscountAmount(b).toLocaleString()} off
                                    </span>
                                  )}
                                  {getBookingHallCharge(b) && (
                                    <span className="text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                      🏛️ Hall included
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-left sm:text-right flex flex-col sm:items-end ml-14 sm:ml-0">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border mb-1.5 shadow-sm ${STATUS_COLORS[b.status]}`}>
                                {STATUS_LABELS[b.status]}
                              </span>
                              <div className="text-xs font-medium text-gray-700">{b.eventType}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{b.date}</div>
                            </div>
                          </div>
                        )) : (
                          <div className="p-12 text-center text-gray-500">
                            <Icon name="InboxIcon" size={32} className="mx-auto mb-3 text-gray-300" />
                            <div className="text-sm font-medium text-gray-900 mb-1">No orders match your filters</div>
                            <div className="text-xs text-gray-500">Try adjusting your filters or search keywords</div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (() => {
                  const tb = bookings.find(x => x.id === trackingBookingId);
                  if (!tb) return <div className="text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center">Booking not found.</div>;
                  
                  const currentStepIdx = STATUS_FLOW.indexOf(tb.status);
                  const discountAmt = getDiscountAmount(tb);
                  const hallFee = getBookingHallCharge(tb);
                  const isDepositPaid = tb.depositPaid;
                  const isFinalPaid = tb.finalPaymentPaid;
                  const grandTotal = getTotalAmount(tb);
                  const balanceDue = isFinalPaid ? 0 : Math.max(0, grandTotal - (isDepositPaid ? tb.deposit : 0));
                  
                  return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      {/* Top Header Card */}
                      <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                        <div>
                          <div className="font-bold text-gray-900 text-lg flex items-center gap-2">
                            <span>{tb.name}</span>
                            <span className="text-xs font-mono text-gray-400 font-normal">#{tb.id}</span>
                          </div>
                          <div className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-2">
                            <Icon name="CalendarIcon" size={14} /> {tb.eventType} on {tb.date} ({tb.time})
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleBookingTrackerPDF(tb)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#C8860A] hover:bg-[#B37408] text-white flex items-center gap-1.5 shadow-2xs transition-colors"
                            title="Download complete chronological history & audit trail as PDF"
                          >
                            <Icon name="DocumentArrowDownIcon" size={13} />
                            <span>Download PDF</span>
                          </button>
                          <button
                            onClick={() => handleGoBackStatus(tb.id)}
                            disabled={currentStepIdx === 0}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1 transition-all ${currentStepIdx === 0 ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed' : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'}`}
                            title="Move back to previous status"
                          >
                            <Icon name="ArrowLeftIcon" size={13} />
                            Previous
                          </button>
                          <select
                            value={tb.status}
                            onChange={(e) => updateStatus(tb.id, e.target.value as BookingStatus)}
                            className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                          >
                            {STATUS_FLOW.map((s, i) => (
                              <option key={s} value={s}>
                                {i + 1}. {STATUS_LABELS[s]}
                              </option>
                            ))}
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <button
                            onClick={() => handleGoForwardStatus(tb.id)}
                            disabled={currentStepIdx === STATUS_FLOW.length - 1}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1 transition-all ${currentStepIdx === STATUS_FLOW.length - 1 ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed' : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'}`}
                            title="Move forward to next status"
                          >
                            Next
                            <Icon name="ArrowRightIcon" size={13} />
                          </button>
                          <button
                            onClick={() => { setEditingBookingForManual(tb); setActiveTab('manual_booking'); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 shadow-2xs transition-colors"
                            title="Amend in 4-step wizard"
                          >
                            <Icon name="PencilSquareIcon" size={13} />
                            Amend in Wizard
                          </button>
                          <button
                            onClick={() => setSelectedBooking(tb)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-200 hover:bg-gray-300 text-gray-800 flex items-center gap-1 transition-colors"
                            title="Open drawer details"
                          >
                            <Icon name="EyeIcon" size={13} />
                            Details
                          </button>
                        </div>
                      </div>

                      {/* ─── DISCOUNT DETAILS CARD ─── */}
                      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Icon name="TagIcon" size={16} className="text-red-500" />
                            <span className="font-bold text-gray-900 text-xs uppercase tracking-wide">Discount Information</span>
                          </div>
                          {tb.discount ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-200">
                              Discount Granted
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                              No Discount
                            </span>
                          )}
                        </div>

                        {tb.discount ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div className="bg-red-50/60 p-3 rounded-xl border border-red-100">
                              <span className="text-gray-500 block text-[10px] uppercase font-semibold">Discount Applied</span>
                              <span className="font-extrabold text-red-700 text-base">
                                {tb.discount.type === 'percentage' ? `${tb.discount.value}% Off` : `£${tb.discount.value} Off`}
                              </span>
                              <span className="block text-[11px] text-red-600 font-bold mt-0.5">
                                Total Saved: -£{discountAmt.toLocaleString()}
                              </span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 sm:col-span-2 flex flex-col justify-between">
                              <div>
                                <span className="text-gray-500 block text-[10px] uppercase font-semibold">Reason for Concession</span>
                                <span className="font-medium text-gray-800 italic block mt-1">
                                  "{tb.discount.reason}"
                                </span>
                              </div>
                              <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-200 flex justify-between">
                                <span>Total Before Discount: £{(grandTotal + discountAmt).toLocaleString()}</span>
                                <span className="font-bold text-gray-900">Final Total: £{grandTotal.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 italic bg-gray-50 p-3 rounded-lg border border-gray-100">
                            Standard pricing applied with no special discounts or concessions granted.
                          </div>
                        )}
                      </div>

                      {/* ─── COMPLETE CHRONOLOGICAL LIFECYCLE & AUDIT TRAIL ─── */}
                      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <div className="flex items-center gap-2">
                            <Icon name="ClockIcon" size={18} className="text-[#C8860A]" />
                            <span className="font-bold text-gray-900 text-sm">Complete Chronological Audit History</span>
                          </div>
                          <span className="text-[10px] text-gray-400">Lifecycle milestones</span>
                        </div>

                        <div className="space-y-3 text-xs">
                          {/* 1. Enquiry */}
                          <div className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">1</div>
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">Enquiry Received</div>
                              <div className="text-gray-600 mt-0.5">
                                Logged on <strong>{tb.enquiryDate || 'system entry'}</strong> for <strong>{tb.eventType}</strong> with <strong>{tb.guests}</strong> guests ({tb.adults ?? tb.guests} adults{tb.kids4to10 ? `, ${tb.kids4to10} kids` : ''}).
                              </div>
                            </div>
                          </div>

                          {/* 2. Menu & Dish Selection */}
                          <div className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">2</div>
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">Menu &amp; Catering Selection</div>
                              <div className="text-gray-600 mt-0.5">
                                Assigned package: <strong>{tb.selectedMenu || tb.package}</strong>. Base catering rate: <strong>£{tb.baseAmount.toLocaleString()}</strong>.
                              </div>
                            </div>
                          </div>

                          {/* 3. Venue Hall Status */}
                          <div className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">3</div>
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">Venue Hall Hire Allocation</div>
                              <div className="text-gray-600 mt-0.5">
                                {hallFee ? (
                                  <span>Explicitly added: <strong>{hallFee.label} (+£{hallFee.amount.toLocaleString()})</strong>.</span>
                                ) : (
                                  <span>No venue hall fee applied (£0 / offsite catering). Default dry hire was unselected.</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 4. Advance Deposit */}
                          <div className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">4</div>
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">Advance Deposit Status</div>
                              <div className="text-gray-600 mt-0.5">
                                {isDepositPaid ? (
                                  <span className="text-emerald-800 font-semibold">
                                    ✓ Advance deposit of £{tb.deposit.toLocaleString()} confirmed received via {tb.paymentMethodDeposit || 'Bank Transfer'}.
                                  </span>
                                ) : (
                                  <span className="text-amber-800 font-semibold">
                                    Advance deposit of £{tb.deposit.toLocaleString()} pending payment.
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 5. Cancellation record if cancelled */}
                          {tb.status === 'cancelled' && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200">
                              <div className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">✕</div>
                              <div className="flex-1 text-rose-950">
                                <div className="font-bold text-rose-900">Order Cancelled</div>
                                <div className="mt-1">
                                  • Reason: <strong>{tb.cancellationDetails?.reason || 'Client request'}</strong><br/>
                                  • Advance Paid: <strong>£{(tb.cancellationDetails?.advancePaid ?? tb.deposit).toLocaleString()}</strong><br/>
                                  {tb.cancellationDetails?.cancelledAt && (
                                    <span>• Cancelled On: {new Date(tb.cancellationDetails.cancelledAt).toLocaleString('en-GB')}<br/></span>
                                  )}
                                  {tb.cancellationDetails?.notes && (
                                    <span>• Notes: <em>"{tb.cancellationDetails.notes}"</em></span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 6. Settlement */}
                          <div className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">5</div>
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">Final Settlement &amp; Balance</div>
                              <div className="text-gray-600 mt-0.5">
                                Total order value: <strong>£{grandTotal.toLocaleString()}</strong>. Balance outstanding: <strong className={balanceDue === 0 ? 'text-emerald-700' : 'text-amber-700'}>{balanceDue === 0 ? '£0 (Cleared in full)' : `£${balanceDue.toLocaleString()}`}</strong>.
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="relative border-l-2 border-gray-200 ml-5 pl-8 space-y-8 mt-8 pb-4">
                        {STATUS_FLOW.map((step, idx) => {
                          const isCompleted = idx < currentStepIdx;
                          const isCurrent = idx === currentStepIdx;
                          const isPastOrCurrent = idx <= currentStepIdx;
                          
                          return (
                            <div key={step} className="relative">
                              {/* Timeline dot */}
                              <div
                                onClick={() => updateStatus(tb.id, step)}
                                className={`absolute -left-[41px] top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 cursor-pointer ${isCompleted ? 'bg-emerald-500 border-emerald-500 shadow-md scale-110 hover:ring-2 hover:ring-emerald-200' : isCurrent ? 'bg-amber-500 border-amber-500 shadow-md ring-4 ring-amber-100 scale-125' : 'bg-white border-gray-300 hover:border-amber-400'}`}
                                title={`Click to set stage to ${STATUS_LABELS[step]}`}
                              >
                                {isCompleted && <Icon name="CheckIcon" size={12} className="text-white" />}
                                {isCurrent && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                              </div>
                              
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className={`font-bold text-sm ${isPastOrCurrent ? 'text-gray-900' : 'text-gray-400'}`}>
                                  Step {idx + 1}: {STATUS_LABELS[step]}
                                </div>
                                {!isCurrent && (
                                  <button
                                    onClick={() => updateStatus(tb.id, step)}
                                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-gray-200 hover:border-amber-400 bg-white hover:bg-amber-50 text-gray-600 hover:text-amber-800 transition-colors shadow-2xs"
                                    title={`Move status directly to ${STATUS_LABELS[step]}`}
                                  >
                                    Jump to this Stage
                                  </button>
                                )}
                              </div>
                              
                              {/* Details if reached this step */}
                              {isPastOrCurrent && (
                                <div className="mt-2.5 text-sm text-gray-600 bg-white border border-gray-100 shadow-sm rounded-xl p-4">
                                  {step === 'new_enquiry' && <div className="flex items-center gap-2"><Icon name="InboxIcon" size={16} className="text-gray-400" /> Enquiry received on <span className="font-semibold text-gray-800">{tb.enquiryDate || 'N/A'}</span>.</div>}
                                  
                                  {step === 'menu_sent' && <div className="flex items-center gap-2"><Icon name="DocumentTextIcon" size={16} className="text-blue-500" /> Menu options sent to customer.</div>}
                                  
                                  {step === 'menu_selected' && <div className="flex items-center gap-2"><Icon name="ListBulletIcon" size={16} className="text-amber-500" /> Selected Menu: <span className="font-semibold text-gray-800">{tb.selectedMenu || tb.package}</span></div>}
                                  
                                  {step === 'deposit_pending' && <div className="flex items-center gap-2"><Icon name="ClockIcon" size={16} className="text-amber-600" /> Deposit requested: <span className="font-semibold text-gray-800">£{tb.deposit.toLocaleString()}</span></div>}
                                  
                                  {step === 'deposit_confirmed' && (
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2 text-emerald-600 font-semibold"><Icon name="CheckCircleIcon" size={18} /> Deposit fully received.</div>
                                      {tb.paymentProofDeposit && (
                                        <div className="group relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm" onClick={() => {
                                          openImagePreview(tb.paymentProofDeposit, "Deposit Payment Proof");
                                        }}>
                                          <img src={tb.paymentProofDeposit} alt="Deposit Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><Icon name="MagnifyingGlassPlusIcon" size={20} /></div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {step === 'final_invoice_sent' && <div className="flex items-center gap-2"><Icon name="DocumentArrowUpIcon" size={16} className="text-blue-500" /> Final invoice sent. Balance Due: <span className="font-bold text-gray-900">£{(getTotalAmount(tb) - tb.deposit).toLocaleString()}</span></div>}
                                  
                                  {step === 'final_payment_received' && (
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2 text-emerald-600 font-semibold"><Icon name="CheckCircleIcon" size={18} /> Final Payment fully received.</div>
                                      {tb.paymentProofFinal && (
                                        <div className="group relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm" onClick={() => {
                                          openImagePreview(tb.paymentProofFinal, "Final Payment Proof");
                                        }}>
                                          <img src={tb.paymentProofFinal} alt="Final Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><Icon name="MagnifyingGlassPlusIcon" size={20} /></div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {step === 'event_scheduled' && <div className="flex items-center gap-2"><Icon name="CalendarDaysIcon" size={16} className="text-indigo-500" /> Event scheduled for <span className="font-semibold text-gray-800">{tb.date} at {tb.time}</span>.</div>}
                                  
                                  {step === 'event_completed' && (
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2"><Icon name="FlagIcon" size={16} className="text-amber-500" /> Event has concluded.</div>
                                      {tb.paymentProofExtra && (
                                        <div className="pt-2 mt-2 border-t border-gray-100">
                                          <div className="mb-2 text-emerald-600 font-semibold flex items-center gap-1.5"><Icon name="BanknotesIcon" size={16} /> Extra Charges Paid</div>
                                          <div className="group relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm" onClick={() => {
                                            openImagePreview(tb.paymentProofExtra, "Extra Charges Payment Proof");
                                          }}>
                                            <img src={tb.paymentProofExtra} alt="Extra Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><Icon name="MagnifyingGlassPlusIcon" size={20} /></div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {step === 'completed' && (
                                    <div className="flex items-center gap-2 text-emerald-700 font-bold bg-emerald-50 px-4 py-2.5 rounded-lg border border-emerald-100">
                                      <Icon name="CheckBadgeIcon" size={20} /> Booking Successfully Closed
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ─── BOOKING DETAIL / WORKFLOW DRAWER ─── */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => { setSelectedBooking(null); setShowMenuPanel(false); setIsEditingBookingDate(false); setIsEditingEventType(false); setIsEditingPackage(false); setIsEditingTime(false); setIsEditingGuests(false); }} />
          <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0 bg-white">
              <div className="flex items-center gap-2">
                {/* Back Arrow button to go one step back in workflow status */}
                <button
                  onClick={() => handleGoBackStatus(selectedBooking.id)}
                  disabled={STATUS_FLOW.indexOf(selectedBooking.status) === 0}
                  className={`p-1.5 rounded-lg transition-colors ${STATUS_FLOW.indexOf(selectedBooking.status) === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                  title="Move back to previous status"
                >
                  <Icon name="ArrowLeftIcon" size={18} />
                </button>
                {/* Forward Arrow button to go one step forward in workflow status */}
                <button
                  onClick={() => handleGoForwardStatus(selectedBooking.id)}
                  disabled={STATUS_FLOW.indexOf(selectedBooking.status) === STATUS_FLOW.length - 1}
                  className={`p-1.5 rounded-lg transition-colors ${STATUS_FLOW.indexOf(selectedBooking.status) === STATUS_FLOW.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                  title="Move forward to next status"
                >
                  <Icon name="ArrowRightIcon" size={18} />
                </button>
                <div>
                  <h2 className="font-semibold text-gray-900 text-sm sm:text-base">Booking #{selectedBooking.id}</h2>
                  <p className="text-xs text-gray-400">{selectedBooking.eventType} · {selectedBooking.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingBookingForManual(selectedBooking);
                    setSelectedBooking(null);
                    setActiveTab('manual_booking');
                  }}
                  className="text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 shadow-2xs transition-colors"
                  title="Amend in 4-step wizard"
                >
                  <Icon name="PencilSquareIcon" size={13} className="text-[#C8860A]" />
                  <span>Amend in Wizard</span>
                </button>
                <button onClick={() => { setSelectedBooking(null); setShowMenuPanel(false); resetAllEditStates(); }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                  <Icon name="XMarkIcon" size={20} />
                </button>
              </div>
            </div>

            {/* Status badge + progress + quick stage jump */}
            <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-gray-50/70">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[selectedBooking.status]}`}>
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[selectedBooking.status]}`} />
                    {STATUS_LABELS[selectedBooking.status]}
                  </span>
                  <select
                    value={selectedBooking.status}
                    onChange={(e) => updateStatus(selectedBooking.id, e.target.value as BookingStatus)}
                    className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                    title="Jump directly to any workflow stage"
                  >
                    {STATUS_FLOW.map((s, idx) => (
                      <option key={s} value={s}>
                        {idx + 1}. {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-xs text-gray-400 font-medium">Step {STATUS_FLOW.indexOf(selectedBooking.status) + 1} of {STATUS_FLOW.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${((STATUS_FLOW.indexOf(selectedBooking.status) + 1) / STATUS_FLOW.length) * 100}%`, background: 'linear-gradient(90deg, #C8860A, #F0A830)' }} />
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-5">
              {/* Cancellation Status Banner (When order is cancelled) */}
              {selectedBooking.status === 'cancelled' && (
                <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                      <Icon name="XCircleIcon" size={20} className="text-rose-600" />
                      <span>This Order is Cancelled</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestoreBooking(selectedBooking.id)}
                      className="text-[11px] font-bold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-300 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      title="Reopen and restore this booking"
                    >
                      <Icon name="ArrowPathIcon" size={12} />
                      <span>Restore Order</span>
                    </button>
                  </div>

                  <div className="bg-white rounded-xl p-3 border border-rose-100 space-y-1.5 text-xs text-rose-950">
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">Reason for Cancellation:</span>
                      <span className="font-bold text-rose-900">{selectedBooking.cancellationDetails?.reason || 'Cancelled by client request'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">Advance Amount Paid:</span>
                      <span className="font-bold text-gray-800">
                        {selectedBooking.cancellationDetails?.advancePaid || selectedBooking.deposit > 0
                          ? `£${(selectedBooking.cancellationDetails?.advancePaid ?? selectedBooking.deposit).toLocaleString()} (${selectedBooking.cancellationDetails?.depositMethod || selectedBooking.paymentMethodDeposit || 'Paid'})`
                          : '£0 / No advance received'}
                      </span>
                    </div>
                    {selectedBooking.cancellationDetails?.cancelledAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Cancelled On:</span>
                        <span className="text-gray-700">{new Date(selectedBooking.cancellationDetails.cancelledAt).toLocaleString('en-GB')}</span>
                      </div>
                    )}
                    {selectedBooking.cancellationDetails?.notes && (
                      <div className="border-t border-rose-50 pt-1 mt-1 text-[11px] text-gray-600 italic">
                        "{selectedBooking.cancellationDetails.notes}"
                      </div>
                    )}
                  </div>

                  <a
                    href={buildWhatsAppLink(selectedBooking.phone, buildCancellationWhatsAppText(selectedBooking))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl text-white shadow-2xs transition-colors hover:bg-emerald-600"
                    style={{ background: '#25D366' }}
                  >
                    <Icon name="ChatBubbleLeftRightIcon" size={14} />
                    <span>Send Cancellation Notice via WhatsApp</span>
                  </a>
                </div>
              )}

              {/* 3 PDFs System Card */}
              <div className="bg-gradient-to-br from-amber-50/70 via-white to-gray-50 rounded-2xl p-4 border border-amber-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Icon name="DocumentDuplicateIcon" size={15} className="text-[#C8860A]" />
                    Booking Documents (3 PDFs)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    PDF &amp; Print
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* 1. Menu PDF */}
                  <button
                    type="button"
                    onClick={() => { downloadChefMenuPDF(selectedBooking); generateChefMenuPDF(selectedBooking); }}
                    className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-amber-200 bg-white hover:bg-amber-50 transition-all font-bold text-amber-950 text-center shadow-2xs group"
                    title="Download / Print Chef Menu Sheet PDF"
                  >
                    <Icon name="ClipboardDocumentListIcon" size={18} className="text-[#C8860A] group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] leading-tight font-extrabold">1. Menu PDF</span>
                    <span className="text-[9px] text-gray-500 font-normal">Chef Sheet</span>
                  </button>

                  {/* 2. Deposit Invoice PDF */}
                  <button
                    type="button"
                    onClick={() => downloadInvoicePDF(selectedBooking, true)}
                    className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 transition-all font-bold text-emerald-950 text-center shadow-2xs group"
                    title="Download Deposit Invoice PDF"
                  >
                    <Icon name="DocumentTextIcon" size={18} className="text-emerald-600 group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] leading-tight font-extrabold">2. Deposit PDF</span>
                    <span className="text-[9px] text-gray-500 font-normal">Deposit Bill</span>
                  </button>

                  {/* 3. Final Invoice PDF */}
                  <button
                    type="button"
                    onClick={() => downloadInvoicePDF(selectedBooking, false)}
                    className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 transition-all font-bold text-blue-950 text-center shadow-2xs group"
                    title="Download Final Invoice PDF"
                  >
                    <Icon name="DocumentCheckIcon" size={18} className="text-blue-600 group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] leading-tight font-extrabold">3. Final PDF</span>
                    <span className="text-[9px] text-gray-500 font-normal">Total Bill</span>
                  </button>
                </div>

                {/* Quick WhatsApp Deliver Invoice PDF to Customer */}
                <button
                  type="button"
                  onClick={() => handleOpenWhatsAppInvoiceModal(selectedBooking)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold text-white shadow-2xs hover:shadow-xs transition-all"
                  style={{ background: '#25D366' }}
                  title="Deliver Invoice PDF to Customer via WhatsApp"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.859L.057 23.428a.75.75 0 0 0 .921.921l5.684-1.47A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.694 9.694 0 0 1-4.946-1.356l-.355-.211-3.676.95.974-3.578-.231-.368A9.693 9.693 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                  </svg>
                  <span>Deliver Invoice PDF via WhatsApp</span>
                </button>

                {/* Quick WhatsApp Menu to Chef */}
                <button
                  type="button"
                  onClick={() => openChefWhatsApp(selectedBooking)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold text-white shadow-2xs hover:shadow-xs transition-all"
                  style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}
                  title="Send menu details to Chef via WhatsApp"
                >
                  <Icon name="ChatBubbleLeftRightIcon" size={14} />
                  <span>Send Menu to Chef via WhatsApp</span>
                </button>
              </div>

              {/* Customer info */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer Details</span>
                  <div className="flex items-center gap-2">
                    {!(isEditingCustomerName || isEditingCustomerEmail || isEditingCustomerPhone) ? (
                      <button
                        onClick={() => {
                          setIsEditingCustomerName(true);
                          setIsEditingCustomerEmail(true);
                          setIsEditingCustomerPhone(true);
                        }}
                        className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="PencilIcon" size={10} />
                        Edit
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setIsEditingCustomerName(false);
                          setIsEditingCustomerEmail(false);
                          setIsEditingCustomerPhone(false);
                        }}
                        className="text-[10px] text-gray-400 hover:text-gray-600 font-medium"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(200,134,10,0.1)' }}>
                    <span className="text-base font-bold" style={{ color: '#C8860A' }}>{selectedBooking.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {!isEditingCustomerName ? (
                      <div className="font-semibold text-gray-900">{selectedBooking.name}</div>
                    ) : (
                      <input
                        type="text"
                        defaultValue={selectedBooking.name}
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          if (!val || val === selectedBooking.name) return;
                          const updated = { ...selectedBooking, name: val };
                          setSelectedBooking(updated);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, name: val } : b));
                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { name: val }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { name: val }, { merge: true });
                        }}
                        className="w-full border border-amber-300 rounded px-2 py-1 text-xs font-semibold bg-white text-gray-900 focus:outline-none"
                        placeholder="Full Name"
                      />
                    )}
                    {!isEditingCustomerEmail ? (
                      <div className="text-sm text-gray-500">{selectedBooking.email}</div>
                    ) : (
                      <input
                        type="email"
                        defaultValue={selectedBooking.email}
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          if (!val || val === selectedBooking.email) return;
                          const updated = { ...selectedBooking, email: val };
                          setSelectedBooking(updated);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, email: val } : b));
                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { email: val }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { email: val }, { merge: true });
                        }}
                        className="w-full border border-amber-300 rounded px-2 py-1 text-xs bg-white text-gray-700 focus:outline-none"
                        placeholder="Email Address"
                      />
                    )}
                    {!isEditingCustomerPhone ? (
                      <div className="text-sm text-gray-500">{selectedBooking.phone}</div>
                    ) : (
                      <input
                        type="tel"
                        defaultValue={selectedBooking.phone}
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          if (!val || val === selectedBooking.phone) return;
                          const updated = { ...selectedBooking, phone: val };
                          setSelectedBooking(updated);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, phone: val } : b));
                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { phone: val }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { phone: val }, { merge: true });
                        }}
                        className="w-full border border-amber-300 rounded px-2 py-1 text-xs bg-white text-gray-700 focus:outline-none"
                        placeholder="Phone Number"
                      />
                    )}
                  </div>
                  <a href={buildWhatsAppLink(selectedBooking.phone, `Hi ${selectedBooking.name.split(' ')[0]}, this is Honeymoon regarding your ${selectedBooking.eventType} booking.`)}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0"
                    style={{ background: '#25D366', color: 'white' }}>
                    <Icon name="ChatBubbleLeftRightIcon" size={14} />
                    WhatsApp
                  </a>
                </div>
              </div>

              {/* Event details */}
              <div className="grid grid-cols-2 gap-3">
                {!isEditingEventType ? (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Event Type</span>
                      <button
                        onClick={() => setIsEditingEventType(true)}
                        className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="PencilIcon" size={10} />
                        Edit
                      </button>
                    </div>
                    <div className="text-sm font-medium text-gray-900">{selectedBooking.eventType}</div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between border border-amber-300">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Event Type</span>
                      <button
                        onClick={() => setIsEditingEventType(false)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <select
                      value={selectedBooking.eventType}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!val) return;
                        try {
                          const updated = { ...selectedBooking, eventType: val };
                          setSelectedBooking(updated);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, eventType: val } : b));
                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { eventType: val }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { eventType: val }, { merge: true });
                          setIsEditingEventType(false);
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-medium text-gray-900"
                    >
                      <option value="Wedding">Wedding</option>
                      <option value="Birthday">Birthday</option>
                      <option value="Corporate">Corporate</option>
                      <option value="Anniversary">Anniversary</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                )}

                {!isEditingPackage ? (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Package</span>
                      <button
                        onClick={() => setIsEditingPackage(true)}
                        className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="PencilIcon" size={10} />
                        Edit
                      </button>
                    </div>
                    <div className="text-sm font-medium text-gray-900 truncate" title={selectedBooking.selectedMenu || selectedBooking.package}>
                      {selectedBooking.selectedMenu || selectedBooking.package}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between border border-amber-300">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Package</span>
                      <button
                        onClick={() => setIsEditingPackage(false)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <select
                      value={selectedBooking.selectedMenu || selectedBooking.package || ''}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!val) return;
                        try {
                          const updated = { ...selectedBooking, selectedMenu: val, package: val };
                          setSelectedBooking(updated);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, selectedMenu: val, package: val } : b));
                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { selectedMenu: val, package: val }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { selectedMenu: val, package: val }, { merge: true });
                          setIsEditingPackage(false);
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-medium text-gray-900"
                    >
                      <option value="Classic Buffet">Classic Buffet</option>
                      <option value="Premium Plated">Premium Plated</option>
                      <option value="Cocktail Reception">Cocktail Reception</option>
                      <option value="Continental Breakfast">Continental Breakfast</option>
                      <option value="Indian Menu">Indian Menu</option>
                      <option value="Sri Lankan Menu">Sri Lankan Menu</option>
                    </select>
                  </div>
                )}

                {!isEditingBookingDate ? (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Date</span>
                      <button
                        onClick={() => setIsEditingBookingDate(true)}
                        className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="PencilIcon" size={10} />
                        Edit
                      </button>
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {selectedBooking.date ? selectedBooking.date.split('T')[0] : 'N/A'}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between border border-amber-300">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Date</span>
                      <button
                        onClick={() => setIsEditingBookingDate(false)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <input
                      type="date"
                      defaultValue={selectedBooking.date ? selectedBooking.date.split('T')[0] : ''}
                      onChange={async (e) => {
                        const newDate = e.target.value;
                        if (!newDate) return;
                        try {
                          const updatedBooking = { ...selectedBooking, date: newDate };
                          setSelectedBooking(updatedBooking);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, date: newDate } : b));

                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { date: newDate }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { date: newDate }, { merge: true });
                          setIsEditingBookingDate(false);
                        } catch (error) {
                          console.error('Error updating booking date:', error);
                        }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-medium text-gray-900"
                    />
                  </div>
                )}

                {!isEditingTime ? (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Time / Shift</span>
                      <button
                        onClick={() => setIsEditingTime(true)}
                        className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="PencilIcon" size={10} />
                        Edit
                      </button>
                    </div>
                    <div className="text-sm font-medium text-gray-900">{selectedBooking.time}</div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between border border-amber-300">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Time / Shift</span>
                      <button
                        onClick={() => setIsEditingTime(false)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <select
                      value={selectedBooking.time}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!val) return;
                        try {
                          const updated = { ...selectedBooking, time: val };
                          setSelectedBooking(updated);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, time: val, timeOfDay: val } : b));
                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { timeOfDay: val }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { timeOfDay: val, time: val }, { merge: true });
                          setIsEditingTime(false);
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-medium text-gray-900"
                    >
                      <option value="Morning">Morning</option>
                      <option value="Afternoon">Afternoon</option>
                      <option value="Evening">Evening</option>
                    </select>
                  </div>
                )}

                {!isEditingGuests ? (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Guests</span>
                      <button
                        onClick={() => setIsEditingGuests(true)}
                        className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="PencilIcon" size={10} />
                        Edit
                      </button>
                    </div>
                    <div className="text-sm font-medium text-gray-900">{selectedBooking.guests} people</div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between border border-amber-300">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Guests</span>
                      <button
                        onClick={() => setIsEditingGuests(false)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      defaultValue={selectedBooking.guests}
                      onChange={async (e) => {
                        const val = Number(e.target.value);
                        if (!val || val <= 0) return;
                        try {
                          let baseAmount = selectedBooking.baseAmount || 0;
                          let deposit = selectedBooking.deposit || 0;

                          const currentPkg = selectedBooking.selectedMenu || selectedBooking.package;
                          if (currentPkg && currentPkg !== 'custom') {
                            const found = editableBanquetPackages.find(p => p.name === currentPkg);
                            if (found) {
                              baseAmount = found.pricePerPerson * val;
                              deposit = pricingDetails.depositPercentage;
                            }
                          }

                          const updated = { ...selectedBooking, guests: val, baseAmount, deposit };
                          setSelectedBooking(updated);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, guests: val, baseAmount, deposit } : b));

                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { guests: val, baseAmount, deposit }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { guests: val, baseAmount, deposit }, { merge: true });
                          setIsEditingGuests(false);
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-medium text-gray-900"
                    />
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Enquiry Date</div>
                  <div className="text-sm font-medium text-gray-900">{selectedBooking.enquiryDate}</div>
                </div>

                {!isEditingDueDate ? (
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-between border border-amber-100">
                    <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Payment Due Date</span>
                      <button
                        onClick={() => setIsEditingDueDate(true)}
                        className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="PencilIcon" size={10} />
                        Edit
                      </button>
                    </div>
                    <div className="text-sm font-bold text-amber-900">
                      {selectedBooking.dueDate ? selectedBooking.dueDate : 'Not Set'}
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 rounded-xl p-3 flex flex-col justify-between border border-amber-400">
                    <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1 flex items-center justify-between">
                      <span>Payment Due Date</span>
                      <button
                        onClick={() => setIsEditingDueDate(false)}
                        className="text-[10px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <input
                      type="date"
                      defaultValue={selectedBooking.dueDate || ''}
                      onChange={async (e) => {
                        const newDate = e.target.value;
                        if (!newDate) return;
                        try {
                          const updatedBooking = { ...selectedBooking, dueDate: newDate };
                          setSelectedBooking(updatedBooking);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, dueDate: newDate } : b));

                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { dueDate: newDate }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { dueDate: newDate }, { merge: true });
                          setIsEditingDueDate(false);
                        } catch (error) {
                          console.error('Error updating due date:', error);
                        }
                      }}
                      className="w-full border border-amber-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-amber-900 mt-1"
                    />
                  </div>
                )}
              </div>

              {/* ── STEP-SPECIFIC PANELS ── */}

              {/* Select Package Block - Always enabled for admins to amend */}
              <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/50">
                <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Icon name="ClipboardDocumentListIcon" size={14} style={{ color: '#C8860A' }} />
                    Package, Extras &amp; Guest Count Selection
                  </span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold border border-amber-200">
                    Editable Anytime
                  </span>
                </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Select Banquet Package</label>
                      <select
                        value={selectedBooking.selectedMenu || selectedBooking.package || ''}
                        onChange={async (e) => {
                          const val = e.target.value;
                          if (!val) return;

                          let pricePerPerson = 0;
                          let selectedPkgName = '';
                          let baseAmount = 0;

                          const foundExtra = (editableLiveCounter?.extras || []).find(ex => ex.name === val);

                          if (val === 'custom') {
                            selectedPkgName = 'Custom Package';
                          } else if (foundExtra) {
                            selectedPkgName = foundExtra.name;
                            baseAmount = foundExtra.price;
                          } else {
                            const found = editableBanquetPackages.find(p => p.name === val);
                            if (found) {
                              pricePerPerson = found.pricePerPerson;
                              selectedPkgName = found.name;
                            } else {
                              selectedPkgName = val;
                              pricePerPerson = 0; // Manual pricing for Venue Hire, etc.
                            }
                          }

                          const adults = selectedBooking.adults ?? selectedBooking.guests;
                          const kids4to10 = selectedBooking.kids4to10 || 0;
                          
                          const pkgObj = editableBanquetPackages.find(p => p.name === selectedPkgName);
                          const kidsPrice = (pkgObj as any)?.kidsPrice || getKidsPrice(editableKidsPricing, selectedPkgName);

                          if (!foundExtra && val !== 'custom') {
                            baseAmount = (adults * pricePerPerson) + (kids4to10 * kidsPrice);
                          }
                          const deposit = pricingDetails.depositPercentage;

                          // Update locally
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? {
                            ...b,
                            selectedMenu: selectedPkgName,
                            package: selectedPkgName,
                            baseAmount,
                            deposit
                          } : b));
                          setSelectedBooking(prev => prev?.id === selectedBooking.id ? {
                            ...prev,
                            selectedMenu: selectedPkgName,
                            package: selectedPkgName,
                            baseAmount,
                            deposit
                          } : prev);

                          // Save to Firestore
                          try {
                            const updates = {
                              selectedMenu: selectedPkgName,
                              package: selectedPkgName,
                              baseAmount,
                              deposit
                            };
                            await setDoc(doc(db, 'booking_requests', selectedBooking.id), updates, { merge: true });
                            await setDoc(doc(db, 'bookings', selectedBooking.id), {
                              ...selectedBooking,
                              ...updates,
                              updatedAt: new Date().toISOString()
                            }, { merge: true });
                          } catch (err) {
                            console.error('Error saving package selection:', err);
                          }
                        }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                      >
                        <option value="">-- Choose a Package --</option>
                        {editableBanquetPackages.map(pkg => (
                          <option key={pkg.id} value={pkg.name}>
                            {pkg.name} (£{pkg.pricePerPerson}/adult · Kids: £{(pkg as any).kidsPrice || getKidsPrice(editableKidsPricing, pkg.name)})
                          </option>
                        ))}
                        <option value="Kids Pricing">Kids Pricing</option>
                        <option value="Venue Hire Charges">Venue Hire Charges</option>
                        <option value="Table Service Charges">Table Service Charges</option>
                        <option value="Dry Hire Prices">Dry Hire Prices</option>
                        <option value="Indian Menu">Indian Menu (Custom)</option>
                        <option value="Sri Lankan & South Indian">Sri Lankan &amp; South Indian (Custom)</option>
                        <option value="custom">Custom Package (Enter Price Manually)</option>
                      </select>
                    </div>

                    {/* Select Extras Checkbox List */}
                    <div className="mt-3 border-t border-amber-200/50 pt-3">
                      <label className="block text-xs font-semibold text-gray-500 mb-2">Select Extras (Optional)</label>
                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2.5 bg-white shadow-inner">
                        {(editableLiveCounter?.extras || []).map((extra) => {
                          const isChecked = (selectedBooking.extraCharges || []).some(c => c.label === extra.name);
                          return (
                            <label key={extra.name} className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer select-none hover:bg-gray-50 p-1.5 rounded transition-colors">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={async (e) => {
                                  const checked = e.target.checked;
                                  let newExtraCharges = [...(selectedBooking.extraCharges || [])];
                                  if (checked) {
                                    if (!newExtraCharges.some(c => c.label === extra.name)) {
                                      newExtraCharges.push({ label: extra.name, amount: extra.price, isPreset: true });
                                    }
                                  } else {
                                    newExtraCharges = newExtraCharges.filter(c => c.label !== extra.name);
                                  }

                                  // Update locally
                                  setBookings(prev => prev.map(b => b.id === selectedBooking.id ? {
                                    ...b,
                                    extraCharges: newExtraCharges
                                  } : b));
                                  setSelectedBooking(prev => prev?.id === selectedBooking.id ? {
                                    ...prev,
                                    extraCharges: newExtraCharges
                                  } : prev);

                                  // Save to Firestore
                                  try {
                                    await setDoc(doc(db, 'booking_requests', selectedBooking.id), { extraCharges: newExtraCharges }, { merge: true });
                                    await setDoc(doc(db, 'bookings', selectedBooking.id), {
                                      ...selectedBooking,
                                      extraCharges: newExtraCharges,
                                      updatedAt: new Date().toISOString()
                                    }, { merge: true });
                                  } catch (err) {
                                    console.error('Error saving extra charges:', err);
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                              />
                              <span className="flex-1 text-gray-800">{extra.name}</span>
                              <span className="font-semibold text-amber-700">£{extra.price}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Guest Breakdown for Pricing Calculation */}
                    {(selectedBooking.selectedMenu || selectedBooking.package) && (
                      <div className="grid grid-cols-3 gap-3 pt-2 pb-1 border-t border-amber-200/50 mt-2">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Adults (Full Price)</label>
                          <input
                            type="number"
                            min="0"
                            value={(selectedBooking.adults ?? selectedBooking.guests) || ''}
                            placeholder="0"
                            onChange={async (e) => {
                              const adults = Number(e.target.value) || 0;
                              const kids4to10 = selectedBooking.kids4to10 || 0;
                              const kidsUnder4 = selectedBooking.kidsUnder4 || 0;
                              const guests = adults + kids4to10 + kidsUnder4;
                              
                              let pricePerPerson = 0;
                              const currentPkgName = selectedBooking.selectedMenu || selectedBooking.package;
                              const found = editableBanquetPackages.find(p => p.name === currentPkgName);
                              if (found) pricePerPerson = found.pricePerPerson;

                              const kidsPrice = (found as any)?.kidsPrice || getKidsPrice(editableKidsPricing, currentPkgName);

                              const baseAmount = (adults * pricePerPerson) + (kids4to10 * kidsPrice);
                              const deposit = Math.max(selectedBooking.deposit || 0, pricingDetails.depositPercentage);

                              setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, guests, adults, baseAmount, deposit } : b));
                              setSelectedBooking(prev => prev?.id === selectedBooking.id ? { ...prev, guests, adults, baseAmount, deposit } : prev);
                              
                              const updates = { guests, adults, baseAmount, deposit };
                              await setDoc(doc(db, 'booking_requests', selectedBooking.id), updates, { merge: true });
                              await setDoc(doc(db, 'bookings', selectedBooking.id), updates, { merge: true });
                            }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Kids (4-10 yrs)</label>
                          <input
                            type="number"
                            min="0"
                            value={selectedBooking.kids4to10 || ''}
                            placeholder="0"
                            onChange={async (e) => {
                              const kids4to10 = Number(e.target.value) || 0;
                              const adults = selectedBooking.adults ?? selectedBooking.guests;
                              const kidsUnder4 = selectedBooking.kidsUnder4 || 0;
                              const guests = adults + kids4to10 + kidsUnder4;
                              
                              let pricePerPerson = 0;
                              const currentPkgName = selectedBooking.selectedMenu || selectedBooking.package;
                              const found = editableBanquetPackages.find(p => p.name === currentPkgName);
                              if (found) pricePerPerson = found.pricePerPerson;

                              const kidsPrice = (found as any)?.kidsPrice || getKidsPrice(editableKidsPricing, currentPkgName);

                              const baseAmount = (adults * pricePerPerson) + (kids4to10 * kidsPrice);
                              const deposit = Math.max(selectedBooking.deposit || 0, pricingDetails.depositPercentage);

                              setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, guests, adults, kids4to10, baseAmount, deposit } : b));
                              setSelectedBooking(prev => prev?.id === selectedBooking.id ? { ...prev, guests, adults, kids4to10, baseAmount, deposit } : prev);
                              
                              const updates = { guests, adults, kids4to10, baseAmount, deposit };
                              await setDoc(doc(db, 'booking_requests', selectedBooking.id), updates, { merge: true });
                              await setDoc(doc(db, 'bookings', selectedBooking.id), updates, { merge: true });
                            }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Kids (0-4 yrs) Free</label>
                          <input
                            type="number"
                            min="0"
                            value={selectedBooking.kidsUnder4 || ''}
                            placeholder="0"
                            onChange={async (e) => {
                              const kidsUnder4 = Number(e.target.value) || 0;
                              const adults = selectedBooking.adults ?? selectedBooking.guests;
                              const kids4to10 = selectedBooking.kids4to10 || 0;
                              const guests = adults + kids4to10 + kidsUnder4;
                              
                              let pricePerPerson = 0;
                              const currentPkgName = selectedBooking.selectedMenu || selectedBooking.package;
                              const found = editableBanquetPackages.find(p => p.name === currentPkgName);
                              if (found) pricePerPerson = found.pricePerPerson;

                              const kidsPrice = (found as any)?.kidsPrice || getKidsPrice(editableKidsPricing, currentPkgName);

                              const baseAmount = (adults * pricePerPerson) + (kids4to10 * kidsPrice);
                              const deposit = Math.max(selectedBooking.deposit || 0, pricingDetails.depositPercentage);

                              setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, guests, adults, kidsUnder4, baseAmount, deposit } : b));
                              setSelectedBooking(prev => prev?.id === selectedBooking.id ? { ...prev, guests, adults, kidsUnder4, baseAmount, deposit } : prev);
                              
                              const updates = { guests, adults, kidsUnder4, baseAmount, deposit };
                              await setDoc(doc(db, 'booking_requests', selectedBooking.id), updates, { merge: true });
                              await setDoc(doc(db, 'bookings', selectedBooking.id), updates, { merge: true });
                            }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* Show Custom Inputs if Custom or any package is selected */}
                    {(selectedBooking.selectedMenu || selectedBooking.package) && (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Base Price (£)</label>
                          <input
                            type="number"
                            value={selectedBooking.baseAmount || ''}
                            onChange={async (e) => {
                              const baseAmount = Number(e.target.value) || 0;
                              const deposit = Math.max(selectedBooking.deposit || 0, pricingDetails.depositPercentage);

                              setBookings(prev => prev.map(b => b.id === selectedBooking.id ? {
                                ...b,
                                baseAmount,
                                deposit
                              } : b));
                              setSelectedBooking(prev => prev?.id === selectedBooking.id ? {
                                ...prev,
                                baseAmount,
                                deposit
                              } : prev);

                              try {
                                await setDoc(doc(db, 'booking_requests', selectedBooking.id), { baseAmount, deposit }, { merge: true });
                                await setDoc(doc(db, 'bookings', selectedBooking.id), { baseAmount, deposit, updatedAt: new Date().toISOString() }, { merge: true });
                              } catch (err) {
                                console.error('Error saving base amount:', err);
                              }
                            }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Deposit Required (£)</label>
                          <input
                            type="number"
                            min={pricingDetails.depositPercentage}
                            value={Math.max(selectedBooking.deposit || 0, pricingDetails.depositPercentage) || ''}
                            onChange={async (e) => {
                              const deposit = Math.max(Number(e.target.value) || 0, pricingDetails.depositPercentage);

                              setBookings(prev => prev.map(b => b.id === selectedBooking.id ? {
                                ...b,
                                deposit
                              } : b));
                              setSelectedBooking(prev => prev?.id === selectedBooking.id ? {
                                ...prev,
                                deposit
                              } : prev);

                              try {
                                await setDoc(doc(db, 'booking_requests', selectedBooking.id), { deposit }, { merge: true });
                                await setDoc(doc(db, 'bookings', selectedBooking.id), { deposit, updatedAt: new Date().toISOString() }, { merge: true });
                              } catch (err) {
                                console.error('Error saving deposit amount:', err);
                              }
                            }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              {/* Step: Menu Sent — show real menu packages */}
              {(selectedBooking.status === 'menu_sent' || showMenuPanel) && selectedBooking.status !== 'menu_selected' && selectedBooking.status !== 'deposit_pending' && selectedBooking.status !== 'deposit_confirmed' && selectedBooking.status !== 'event_scheduled' && selectedBooking.status !== 'event_completed' && selectedBooking.status !== 'final_invoice_sent' && selectedBooking.status !== 'final_payment_received' && selectedBooking.status !== 'completed' && (
                <div className="border border-purple-200 rounded-xl p-4 bg-purple-50">
                  <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3">Send Menu Packages via WhatsApp</div>
                  <div className="space-y-2">
                    {editableBanquetPackages.map((pkg) => {
                      const adults = selectedBooking.adults ?? selectedBooking.guests;
                      const kids4to10 = selectedBooking.kids4to10 || 0;
                      const kidsUnder4 = selectedBooking.kidsUnder4 || 0;
                      const kidsPrice = getKidsPrice(editableKidsPricing, pkg.name);
                      const estTotal = (pkg.pricePerPerson * adults) + (kids4to10 * kidsPrice);
                      const totalGuests = adults + kids4to10 + kidsUnder4;
                      
                      return (
                        <div key={pkg.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-purple-100">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{pkg.name}</div>
                            <div className="text-xs text-gray-500">£{pkg.pricePerPerson}/person · Est. £{estTotal.toLocaleString()} for {totalGuests} guests</div>
                          </div>
                          <a href={buildWhatsAppLink(selectedBooking.phone, `Hi ${selectedBooking.name.split(' ')[0]}, here is our *${pkg.name}* at *£${pkg.pricePerPerson}/person* (Excl. VAT):\n\n🥗 Starters: ${pkg.starters.veg} Veg + ${pkg.starters.nonVeg} Non-Veg\n🍛 Mains: ${pkg.mains.veg} Veg + ${pkg.mains.nonVeg} Non-Veg\n🍮 Desserts: ${pkg.desserts.join(', ')}\n${pkg.drinks.length > 0 ? `🥤 Drinks: ${pkg.drinks.join(', ')}\n` : ''}${pkg.guestLabel ? `\n👥 ${pkg.guestLabel}` : ''}\n\nFor ${adults} Adults and ${kids4to10} Kids, estimated total: *£${estTotal.toLocaleString()}* (Excl. VAT)\n\n🧒 *Kids Pricing* (Over 50 Adults):\n• Age 0-4 Yr: Free\n• Over 4-10 Yr: £${kidsPrice}/child\n• Over 10 Plus: Full Price (£${pkg.pricePerPerson}/person)\n\n🏢 *Venue Hire Charges:*\n${editableVenueCharges.map(vc => `• ${vc.day}: ${vc.charge}${vc.note ? ` (${vc.note})` : ''}`).join('\\n')}\n\n🎪 *Extras Available:*\n${(editableLiveCounter?.extras || []).map(e => `• ${e.name}: £${e.price}`).join('\\n')}\n\nPlease reply with your selection! 🙏`)}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0 ml-2"
                            style={{ background: '#25D366', color: 'white' }}>
                            <Icon name="ChatBubbleLeftRightIcon" size={12} />
                            Send
                          </a>
                        </div>
                      );
                    })}
                    {/* Also offer Indian & Sri Lankan menus */}
                    <div className="mt-2 pt-2 border-t border-purple-100">
                      <div className="text-xs text-purple-600 font-medium mb-2">Or send full menu list:</div>
                      <div className="flex gap-2 flex-wrap">
                        <a href={buildMenuWhatsAppText(selectedBooking.name.split(' ')[0], selectedBooking.phone, 'Indian Menu', selectedBooking.guests)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Indian Menu
                        </a>
                        <a href={buildMenuWhatsAppText(selectedBooking.name.split(' ')[0], selectedBooking.phone, 'Sri Lankan Menu', selectedBooking.guests)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Sri Lankan Menu
                        </a>
                        <a href={buildMenuWhatsAppText(selectedBooking.name.split(' ')[0], selectedBooking.phone, 'Extras', selectedBooking.guests)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Extras
                        </a>
                        <a href={buildMenuWhatsAppText(selectedBooking.name.split(' ')[0], selectedBooking.phone, 'Venue Hall Charges', selectedBooking.guests)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Venue Hall Charges
                        </a>
                        <a href={buildMenuWhatsAppText(selectedBooking.name.split(' ')[0], selectedBooking.phone, 'Dry Hire', selectedBooking.guests)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Dry Hire
                        </a>
                        <a href={buildMenuWhatsAppText(selectedBooking.name.split(' ')[0], selectedBooking.phone, 'Kids Pricing', selectedBooking.guests)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          Kids Pricing
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Deposit Pending — send bank details */}
              {selectedBooking.status === 'deposit_pending' && (
                <div className="border border-amber-200 rounded-xl p-4 bg-amber-50">
                  <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Send Deposit Request via WhatsApp</div>
                  <div className="bg-white rounded-lg p-3 border border-amber-100 text-sm text-gray-700 mb-3 leading-relaxed">
                    <p className="font-medium text-gray-900 mb-1">Bank Transfer Details:</p>
                    <p>Account Name: {bankDetails.accountName}</p>
                    <p>Sort Code: {bankDetails.sortCode}</p>
                    <p>Account No: {bankDetails.accountNumber}</p>
                    <p className="mt-1 font-semibold text-amber-700">Deposit Amount: £{selectedBooking.deposit.toLocaleString()}</p>
                  </div>
                  <a href={buildWhatsAppLink(selectedBooking.phone, `Hi ${selectedBooking.name.split(' ')[0]}, to confirm your ${selectedBooking.eventType} booking on ${selectedBooking.date}, please transfer the deposit of *£${selectedBooking.deposit.toLocaleString()}* to:\n\n🏦 Account Name: ${bankDetails.accountName}\n📋 Sort Code: ${bankDetails.sortCode}\n🔢 Account No: ${bankDetails.accountNumber}\n📌 Reference: ${selectedBooking.id}\n\nOnce paid, please send a screenshot of the transfer confirmation. Thank you!`)}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl w-full justify-center"
                    style={{ background: '#25D366', color: 'white' }}>
                    <Icon name="ChatBubbleLeftRightIcon" size={16} />
                    Send Bank Details via WhatsApp
                  </a>
                </div>
              )}

              {/* Step: Deposit Confirmation */}
              {selectedBooking.status === 'deposit_pending' && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Deposit Payment Proof</div>
                  {selectedBooking.paymentProofDeposit ? (
                    <div className="flex items-start gap-4">
                      {(selectedBooking.paymentProofDeposit.startsWith('http') || selectedBooking.paymentProofDeposit.startsWith('data:image')) && (
                        <div
                          className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm group flex-shrink-0 bg-gray-50"
                          onClick={() => {
                            openImagePreview(selectedBooking.paymentProofDeposit, "Deposit Payment Proof");
                          }}
                          title="Click to view full image"
                        >
                          <img
                            src={selectedBooking.paymentProofDeposit}
                            alt="Payment Proof"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Icon name="MagnifyingGlassPlusIcon" size={20} className="text-white" />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                          <Icon name="CheckCircleIcon" size={16} />
                          Payment proof received
                        </div>

                        {/* Styled payment method selection */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 my-1">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Select Payment Method:</div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {[
                              { label: 'Paid by Cash', value: 'Paid by Cash' },
                              { label: 'Paid by Card', value: 'Paid by Card' },
                              { label: 'Paid by Bank Transfer', value: 'Paid by Bank Transfer' }
                            ].map((opt) => {
                              const isSelected = depositPaymentMethod === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setDepositPaymentMethod(opt.value)}
                                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs font-semibold transition-all ${
                                    isSelected
                                      ? 'border-amber-500 bg-amber-50 text-amber-800 shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {isSelected && (
                                    <span className="text-amber-600">
                                      <Icon name="CheckIcon" size={14} />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center">
                          <input
                            type="file"
                            accept="image/*"
                            id="proof-reupload"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleUploadProof(selectedBooking.id, e.target.files[0]);
                              }
                            }}
                          />
                          <label
                            htmlFor="proof-reupload"
                            className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 font-medium"
                          >
                            <Icon name="ArrowPathIcon" size={14} />
                            {isUploadingProof ? 'Uploading...' : 'Upload different image'}
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">Awaiting payment screenshot from customer via WhatsApp</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          id="proof-upload"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleUploadProof(selectedBooking.id, e.target.files[0]);
                            }
                          }}
                        />
                        <label
                          htmlFor="proof-upload"
                          className="cursor-pointer bg-white border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm"
                        >
                          <Icon name="ArrowUpTrayIcon" size={16} />
                          {isUploadingProof ? 'Uploading...' : 'Upload Screenshot'}
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP: Set Final Payment Due Date (mandatory after calendar) ── */}
              {['deposit_confirmed', 'final_invoice_sent'].includes(selectedBooking.status) && (
                <div className={`rounded-xl p-4 border-2 ${selectedBooking.dueDate ? 'border-amber-200 bg-amber-50' : 'border-red-400 bg-red-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 ${selectedBooking.dueDate ? 'text-amber-700' : 'text-red-700'}`}>
                      <Icon name="CalendarDaysIcon" size={14} />
                      {selectedBooking.dueDate ? '✅ Final Payment Due Date' : '⚠️ Set Final Payment Due Date (Required)'}
                    </div>
                    {selectedBooking.dueDate && !['final_payment_received', 'event_completed', 'completed'].includes(selectedBooking.status) && (
                      <button onClick={() => setIsEditingDueDate(v => !v)} className="text-[10px] text-amber-600 hover:text-amber-900 font-semibold flex items-center gap-0.5">
                        <Icon name="PencilIcon" size={10} /> Edit
                      </button>
                    )}
                  </div>
                  {!selectedBooking.dueDate ? (
                    <div className="space-y-2">
                      <p className="text-xs text-red-700 font-medium">You must set a payment due date before sending the final invoice. Default is 14 days before the event.</p>
                      <input
                        type="date"
                        defaultValue={(() => {
                          if (selectedBooking.date && selectedBooking.date !== 'N/A') {
                            const d = new Date(selectedBooking.date);
                            d.setDate(d.getDate() - 14);
                            const today = new Date();
                            return (d < today ? today : d).toISOString().split('T')[0];
                          }
                          return '';
                        })()}
                        onChange={async (e) => {
                          const newDate = e.target.value;
                          if (!newDate) return;
                          const updatedBooking = { ...selectedBooking, dueDate: newDate };
                          setSelectedBooking(updatedBooking);
                          setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, dueDate: newDate } : b));
                          await setDoc(doc(db, 'booking_requests', selectedBooking.id), { dueDate: newDate }, { merge: true });
                          await setDoc(doc(db, 'bookings', selectedBooking.id), { dueDate: newDate }, { merge: true });
                        }}
                        className="w-full border-2 border-red-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400 font-bold text-gray-800"
                      />
                      <p className="text-[10px] text-red-500 text-center italic">⛔ Final Invoice is locked until you set this date</p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xl font-bold text-amber-900 mb-1">📅 {selectedBooking.dueDate}</div>
                      <p className="text-xs text-amber-700">Full balance must be received by this date before the event.</p>
                      {(isEditingDueDate && !['final_payment_received', 'event_completed', 'completed'].includes(selectedBooking.status)) && (
                        <input
                          type="date"
                          defaultValue={selectedBooking.dueDate || ''}
                          onChange={async (e) => {
                            const newDate = e.target.value;
                            if (!newDate) return;
                            const updatedBooking = { ...selectedBooking, dueDate: newDate };
                            setSelectedBooking(updatedBooking);
                            setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, dueDate: newDate } : b));
                            await setDoc(doc(db, 'booking_requests', selectedBooking.id), { dueDate: newDate }, { merge: true });
                            await setDoc(doc(db, 'bookings', selectedBooking.id), { dueDate: newDate }, { merge: true });
                            setIsEditingDueDate(false);
                          }}
                          className="mt-2 w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-amber-900"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step: Extra Charges — only show after event is scheduled */}
              {['event_scheduled', 'event_completed'].includes(selectedBooking.status) && (
                <div className="border border-teal-200 rounded-xl p-4 bg-teal-50">
                  <div className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-3">Adjustments / Extra Charges</div>
                  {selectedBooking.extraCharges.some(c => !c.isPreset && !(editableLiveCounter?.extras || []).some(preset => preset.name === c.label)) && (
                    <div className="space-y-2 mb-3">
                      {selectedBooking.extraCharges
                        .map((charge, idx) => ({ charge, idx }))
                        .filter(({ charge }) => !charge.isPreset && !(editableLiveCounter?.extras || []).some(preset => preset.name === charge.label))
                        .map(({ charge, idx }) => (
                          <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-teal-100">
                            <span className="text-sm text-gray-700">{charge.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">+£{charge.amount.toLocaleString()}</span>
                              <button onClick={() => removeExtraCharge(selectedBooking.id, idx)} className="text-red-400 hover:text-red-600">
                                <Icon name="XMarkIcon" size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  {configuredExtraCharges.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Quick Add Preset Charges:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {configuredExtraCharges.map(charge => {
                          const calculatedAmt = charge.type === 'percentage'
                            ? Math.round(((selectedBooking.baseAmount + (selectedBooking.extraCharges || []).reduce((s, ec) => s + ec.amount, 0)) * charge.amount) / 100)
                            : charge.amount;
                          return (
                            <button
                              key={charge.id}
                              type="button"
                              onClick={() => {
                                setExtraLabel(charge.label);
                                setExtraAmount(calculatedAmt.toString());
                              }}
                              className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100 transition-colors"
                            >
                              + {charge.label} (£{calculatedAmt})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="text" placeholder="e.g. Extra 10 guests" value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} className="flex-1 border border-teal-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white" />
                    <input type="number" placeholder="£ amount" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} className="w-24 border border-teal-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white" />
                    <button onClick={() => addExtraCharge(selectedBooking.id)} className="text-white text-sm font-semibold px-3 py-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                      <Icon name="PlusIcon" size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Apply Discount */}
              {!['completed', 'final_payment_received'].includes(selectedBooking.status) && (
                <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50 mt-4">
                  <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">Apply Discount</div>
                  {selectedBooking.discount ? (
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-indigo-100">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-indigo-900">
                          {selectedBooking.discount.type === 'percentage' ? `${selectedBooking.discount.value}%` : `£${selectedBooking.discount.value}`} Discount
                        </span>
                        <span className="text-xs text-gray-500">{selectedBooking.discount.reason}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-red-600">-£{getDiscountAmount(selectedBooking).toLocaleString()}</span>
                        <button onClick={() => removeDiscount(selectedBooking.id)} className="text-red-400 hover:text-red-600">
                          <Icon name="XMarkIcon" size={14} />
                        </button>
                      </div>
                    </div>
                  ) : selectedBooking.discountRequest?.status === 'pending' ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-200">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-amber-700">
                            {selectedBooking.discountRequest.type === 'percentage' ? `${selectedBooking.discountRequest.value}%` : `£${selectedBooking.discountRequest.value}`} Discount Requested
                          </span>
                          <span className="text-xs text-gray-500">{selectedBooking.discountRequest.reason}</span>
                        </div>
                        <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">Pending Approval</span>
                      </div>
                      <p className="text-[10px] text-gray-500 text-center italic mt-1">Waiting for Management confirmation. You cannot proceed to Final Invoice until approved or rejected.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedBooking.discountRequest?.status === 'rejected' && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg mb-2">
                          Discount not approved by Management. You can submit a new request if needed.
                        </div>
                      )}
                      <div className="flex gap-2">
                        <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'fixed' | 'percentage')} className="border border-indigo-200 rounded-lg px-2 py-2 text-sm focus:outline-none bg-white flex-shrink-0">
                          <option value="fixed">£ Fixed</option>
                          <option value="percentage">% Percent</option>
                        </select>
                        <input type="number" placeholder="Value" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="flex-1 min-w-0 border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Reason (e.g. Loyalty)"
                            value={discountReason}
                            onChange={(e) => { setDiscountReason(e.target.value); if (e.target.value.trim()) setDiscountError(''); }}
                            className={`flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm focus:outline-none bg-white ${discountError ? 'border-red-400 focus:border-red-500' : 'border-indigo-200'}`}
                          />
                          <button
                            onClick={() => {
                              if (!discountReason.trim()) {
                                setDiscountError('Please enter a reason for the discount.');
                                return;
                              }
                              if (!discountValue) {
                                setDiscountError('Please enter a discount value.');
                                return;
                              }
                              setDiscountError('');
                              requestDiscount(selectedBooking.id);
                            }}
                            className="text-white text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors flex-shrink-0 shadow-sm flex items-center gap-1"
                          >
                            <Icon name="CheckIcon" size={16} />
                            Apply
                          </button>
                        </div>
                        {discountError && (
                          <p className="text-xs text-red-500 flex items-center gap-1">
                            <Icon name="ExclamationCircleIcon" size={13} />
                            {discountError}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Final Invoice — only show after due date is set */}
              {selectedBooking.status === 'final_invoice_sent' && selectedBooking.discountRequest?.status !== 'pending' && selectedBooking.dueDate && (
                <div className="border border-yellow-200 rounded-xl p-4 bg-yellow-50">
                  <div className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-3">Final Invoice</div>
                  <div className="bg-white rounded-lg p-4 border border-yellow-100 space-y-2 mb-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Base Amount</span>
                      <span className="font-medium text-gray-900">£{selectedBooking.baseAmount.toLocaleString()}</span>
                    </div>
                    {selectedBooking.extraCharges.map((c, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-600">{c.label}</span>
                        <span className="font-medium text-amber-700">+£{c.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    {selectedBooking.discount && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Discount ({selectedBooking.discount.reason})</span>
                        <span className="font-medium text-red-600">-£{getDiscountAmount(selectedBooking).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                      <span className="text-gray-600">Deposit Paid</span>
                      <span className="font-medium text-emerald-700">-£{selectedBooking.deposit.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between">
                      <span className="font-bold text-gray-900">Balance Due</span>
                      <span className="font-bold text-lg" style={{ color: '#C8860A' }}>£{(getTotalAmount(selectedBooking) - selectedBooking.deposit).toLocaleString()}</span>
                    </div>
                  </div>
                  <a href={buildWhatsAppLink(selectedBooking.phone, buildFinalInvoiceWhatsAppText(selectedBooking, bankDetails))}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl w-full justify-center"
                    style={{ background: '#25D366', color: 'white' }}>
                    <Icon name="ChatBubbleLeftRightIcon" size={16} />
                    Send Final Invoice via WhatsApp
                  </a>
                </div>
              )}

              {/* Step: Final Payment — Bank Details & Method */}
              {selectedBooking.status === 'final_invoice_sent' && (
                <div className="space-y-3">
                  {/* Bank Details Card with WhatsApp Sharing */}
                  <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/70 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                        <Icon name="BuildingLibraryIcon" size={15} />
                        Bank Account Details for Final Balance
                      </span>
                      <span className="text-xs font-extrabold text-[#C8860A] bg-white px-2.5 py-0.5 rounded-md border border-amber-200 shadow-2xs">
                        Due: £{(getTotalAmount(selectedBooking) - selectedBooking.deposit).toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-white rounded-xl p-3 border border-amber-100 text-xs text-gray-700 space-y-1.5 font-mono shadow-2xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-sans">Account Name:</span>
                        <span className="font-semibold text-gray-900">{bankDetails.accountName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-sans">Sort Code:</span>
                        <span className="font-semibold text-gray-900">{bankDetails.sortCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-sans">Account No:</span>
                        <span className="font-semibold text-gray-900">{bankDetails.accountNumber}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-100 pt-1">
                        <span className="text-gray-500 font-sans">Reference:</span>
                        <span className="font-bold text-amber-800">{selectedBooking.id}</span>
                      </div>
                    </div>

                    <a
                      href={buildWhatsAppLink(selectedBooking.phone, buildFinalPaymentBankWhatsAppText(selectedBooking, bankDetails))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl w-full justify-center shadow-xs hover:shadow-md transition-all text-white active:scale-95"
                      style={{ background: '#25D366' }}
                    >
                      <Icon name="ChatBubbleLeftRightIcon" size={15} />
                      Share Bank Details via WhatsApp
                    </a>
                  </div>

                  {/* Final Payment Method & Proof Section */}
                  <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white shadow-xs">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Final Payment Method &amp; Confirmation
                    </div>

                    {/* Styled payment method selection */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <div className="text-xs font-semibold text-gray-700 mb-2">Select Payment Method:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        {[
                          { label: 'Bank Transfer', value: 'Paid by Bank Transfer' },
                          { label: 'Cash Payment', value: 'Paid by Cash' },
                          { label: 'Card Payment', value: 'Paid by Card' }
                        ].map((opt) => {
                          const isSelected = finalPaymentMethod === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setFinalPaymentMethod(opt.value)}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'border-amber-500 bg-amber-50 text-amber-800 shadow-xs'
                                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {isSelected && (
                                <span className="text-amber-600">
                                  <Icon name="CheckIcon" size={14} />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {finalPaymentMethod === 'Paid by Bank Transfer' && (
                        <p className="text-[11px] text-amber-800 mt-2.5 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/60 leading-relaxed">
                          Bank details are displayed above. Click "Share Bank Details via WhatsApp" to send payment instructions. Once customer sends transfer confirmation, upload it below.
                        </p>
                      )}
                      {finalPaymentMethod === 'Paid by Cash' && (
                        <p className="text-[11px] text-emerald-800 mt-2.5 bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-200/60 leading-relaxed">
                          Cash payment selected. Receipt image upload is optional for cash payments. Click confirm below to close the order.
                        </p>
                      )}
                      {finalPaymentMethod === 'Paid by Card' && (
                        <p className="text-[11px] text-blue-800 mt-2.5 bg-blue-50/80 p-2.5 rounded-lg border border-blue-200/60 leading-relaxed">
                          Card payment selected. Upload card machine receipt screenshot or transaction confirmation below.
                        </p>
                      )}
                    </div>

                    {/* Screenshot Upload / Preview */}
                    {selectedBooking.paymentProofFinal ? (
                      <div className="flex items-start gap-4 pt-1">
                        {(selectedBooking.paymentProofFinal.startsWith('http') || selectedBooking.paymentProofFinal.startsWith('data:image')) && (
                          <div
                            className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm group flex-shrink-0 bg-gray-50"
                            onClick={() => {
                              openImagePreview(selectedBooking.paymentProofFinal, "Final Payment Proof");
                            }}
                            title="Click to view full image"
                          >
                            <img
                              src={selectedBooking.paymentProofFinal}
                              alt="Final Payment Proof"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Icon name="MagnifyingGlassPlusIcon" size={20} className="text-white" />
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col gap-2 flex-1">
                          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                            <Icon name="CheckCircleIcon" size={15} />
                            Payment proof received — ready to confirm and close order
                          </div>
                          <div className="flex items-center">
                            <input
                              type="file"
                              accept="image/*"
                              id="final-proof-reupload"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleUploadFinalProof(selectedBooking.id, e.target.files[0]);
                                }
                              }}
                            />
                            <label
                              htmlFor="final-proof-reupload"
                              className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 font-medium"
                            >
                              <Icon name="ArrowPathIcon" size={14} />
                              {isUploadingFinalProof ? 'Uploading...' : 'Upload different image'}
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          {finalPaymentMethod === 'Paid by Cash'
                            ? 'Optional: Upload cash receipt screenshot or photo'
                            : 'Upload payment screenshot received from customer via WhatsApp'}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            id="final-proof-upload"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleUploadFinalProof(selectedBooking.id, e.target.files[0]);
                              }
                            }}
                          />
                          <label
                            htmlFor="final-proof-upload"
                            className="cursor-pointer bg-white border border-gray-300 text-gray-700 text-xs font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-xs"
                          >
                            <Icon name="ArrowUpTrayIcon" size={15} />
                            {isUploadingFinalProof ? 'Uploading...' : 'Upload Screenshot'}
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Payment summary */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment Summary</div>
                <div className="space-y-2">
                  {/* Guest breakdown */}
                  {(() => {
                    const adults = selectedBooking.adults ?? selectedBooking.guests;
                    const kids4to10 = selectedBooking.kids4to10 || 0;
                    const kidsUnder4 = selectedBooking.kidsUnder4 || 0;
                    const currentPkgName = selectedBooking.selectedMenu || selectedBooking.package;
                    const pkgObj = editableBanquetPackages.find(p => p.name === currentPkgName);
                    const kidsPrice = selectedBooking.kidsPricePerPerson ?? ((pkgObj as any)?.kidsPrice || getKidsPrice(editableKidsPricing, currentPkgName));
                    const pricePerPerson = selectedBooking.pricePerPerson ?? (pkgObj?.pricePerPerson || 0);
                    const hasKids = kids4to10 > 0 || kidsUnder4 > 0;
                    return (
                      <div className="bg-white rounded-lg p-2.5 border border-gray-100 space-y-1 mb-1">
                        <div className="text-xs font-semibold text-gray-500 mb-1.5">Guest Breakdown</div>
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Adults ({adults}) × £{pricePerPerson}/person</span>
                          <span className="font-medium">£{(adults * pricePerPerson).toLocaleString()}</span>
                        </div>
                        {kids4to10 > 0 && (
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Kids 4-10 yrs ({kids4to10}) × £{kidsPrice}/person</span>
                            <span className="font-medium">£{(kids4to10 * kidsPrice).toLocaleString()}</span>
                          </div>
                        )}
                        {kidsUnder4 > 0 && (
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Kids 0-4 yrs ({kidsUnder4}) × Free</span>
                            <span className="font-medium text-emerald-600">£0</span>
                          </div>
                        )}
                        <div className="border-t border-gray-100 pt-1 flex justify-between text-xs font-semibold text-gray-700">
                          <span>Total Guests</span>
                          <span>{adults + kids4to10 + kidsUnder4}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Venue Hall Hire (Not added by default - Select Add / Remove Option) */}
                  {(() => {
                    const hallFee = getBookingHallCharge(selectedBooking);
                    return (
                      <div className="bg-white rounded-lg p-3 border border-indigo-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                            <span>🏛️ Venue Hall Hire</span>
                            <span className="text-[10px] font-normal text-gray-500">(Optional add-on)</span>
                          </div>
                          {hallFee ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveHallChargeFromBooking(selectedBooking)}
                              className="text-[11px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded transition-colors"
                              title="Remove hall charge from this booking"
                            >
                              ✕ Remove Hall Fee
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowAddHallModal(true)}
                              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded transition-colors"
                              title="Add standard or custom venue hall fee"
                            >
                              + Add Hall Fee
                            </button>
                          )}
                        </div>
                        {hallFee ? (
                          <div className="flex justify-between items-center text-xs text-gray-700 pt-1 border-t border-indigo-50">
                            <div>
                              <span className="font-semibold text-indigo-950">{hallFee.label}</span>
                              {hallFee.reason && <div className="text-[10px] text-gray-500 italic">{hallFee.reason}</div>}
                            </div>
                            <span className="font-bold text-indigo-700">£{hallFee.amount.toLocaleString()}</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-gray-500 italic">
                            No hall charge applied (£0). Not automatically added for all bookings.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {selectedBooking.extraCharges && selectedBooking.extraCharges.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-gray-500 mt-2 mb-1">Extras</div>
                      {selectedBooking.extraCharges.map((c, i) => (
                        <div key={i} className="flex justify-between text-xs text-gray-600">
                          <span>• {c.label}</span>
                          <span className="font-medium text-amber-700">+£{c.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-600">Food Package Total</span>
                    <span className="font-semibold text-gray-900">£{getFoodPackageTotal(selectedBooking).toLocaleString()}</span>
                  </div>

                  {(() => {
                    const grandTotal = getTotalAmount(selectedBooking);
                    const extraChargesTotal = (selectedBooking.extraCharges || []).reduce((s, c) => s + c.amount, 0);
                    const finalPaymentPaidAmt = grandTotal - selectedBooking.deposit - extraChargesTotal;
                    
                    const isDepositPaid = selectedBooking.depositPaid || !['new_enquiry', 'menu_sent', 'menu_selected', 'deposit_pending'].includes(selectedBooking.status);
                    const isFinalPaid = selectedBooking.finalPaymentPaid;
                    const isExtraPaid = selectedBooking.status === 'completed' || !!selectedBooking.paymentProofExtra || selectedBooking.finalPaymentPaid;
                    
                    const totalPaid = (isDepositPaid ? selectedBooking.deposit : 0) +
                                      (isFinalPaid ? finalPaymentPaidAmt : 0) +
                                      (isExtraPaid ? extraChargesTotal : 0);
                                      
                    const remainingBalance = grandTotal - totalPaid;

                    return (
                      <div className="space-y-2 border-t border-gray-200 pt-3">
                        <div className="flex justify-between text-sm font-bold">
                          <span className="text-gray-800">Grand Total (incl. Hall)</span>
                          <span className="text-gray-900">£{grandTotal.toLocaleString()}</span>
                        </div>

                        {selectedBooking.discount && (
                          <div className="flex justify-between text-xs text-red-650">
                            <span>Discount ({selectedBooking.discount.reason})</span>
                            <span>-£{getDiscountAmount(selectedBooking).toLocaleString()}</span>
                          </div>
                        )}

                        <div className="border-t border-dashed border-gray-200 mt-2 pt-2 space-y-1">
                          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Payment Breakdown</div>
                          
                          {/* Deposit */}
                          <div className="flex justify-between items-start text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-500">Deposit</span>
                              {!isEditingDeposit ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditDepositValue(selectedBooking.deposit !== undefined ? String(selectedBooking.deposit) : '0');
                                    setIsEditingDeposit(true);
                                  }}
                                  className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                                  title="Edit Deposit Amount"
                                >
                                  <Icon name="PencilIcon" size={10} />
                                  <span>Edit</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setIsEditingDeposit(false)}
                                  className="text-[10px] text-gray-400 hover:text-gray-600 font-medium"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                            <div className="text-right">
                              {!isEditingDeposit ? (
                                <>
                                  <span className={`font-semibold ${isDepositPaid ? 'text-emerald-700' : 'text-amber-600'}`}>
                                    £{selectedBooking.deposit.toLocaleString()} {isDepositPaid ? '✓ Paid' : '(pending)'}
                                  </span>
                                  {isDepositPaid && selectedBooking.paymentMethodDeposit && (
                                    <span className="block text-[10px] text-gray-400 font-normal">
                                      via {selectedBooking.paymentMethodDeposit.replace('Paid by ', '')}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="text-xs text-gray-400">£</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={grandTotal}
                                    value={editDepositValue}
                                    onChange={(e) => setEditDepositValue(e.target.value)}
                                    className="w-20 border border-amber-300 rounded px-1.5 py-0.5 text-xs text-right font-bold text-gray-900 bg-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const newDep = Math.max(0, Math.min(grandTotal, parseFloat(editDepositValue) || 0));
                                      const isStillPaidInFull = newDep >= grandTotal;
                                      const updateData: any = {
                                        deposit: newDep,
                                        finalPaymentPaid: isStillPaidInFull ? selectedBooking.finalPaymentPaid : false,
                                        updatedAt: new Date().toISOString()
                                      };
                                      setSelectedBooking((prev: any) => prev ? ({ ...prev, ...updateData }) : null);
                                      setBookings((prev: any[]) => prev.map(b => b.id === selectedBooking.id ? ({ ...b, ...updateData }) : b));
                                      try {
                                        await setDoc(doc(db, 'booking_requests', selectedBooking.id), updateData, { merge: true });
                                        await setDoc(doc(db, 'bookings', selectedBooking.id), updateData, { merge: true });
                                        setCustomAlert({ message: `Deposit updated to £${newDep.toLocaleString()}`, type: 'success' });
                                      } catch (err) {
                                        console.error('Error updating deposit:', err);
                                        setCustomAlert({ message: 'Failed to update deposit', type: 'error' });
                                      }
                                      setIsEditingDeposit(false);
                                    }}
                                    className="text-[10px] bg-amber-600 hover:bg-amber-700 text-white font-bold px-2 py-0.5 rounded shadow-2xs transition-colors"
                                  >
                                    Save
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Final Payment (Main Balance) */}
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Final Payment (Main Balance)</span>
                            <div className="text-right">
                              <span className={`font-semibold ${isFinalPaid ? 'text-emerald-700' : 'text-amber-600'}`}>
                                £{finalPaymentPaidAmt.toLocaleString()} {isFinalPaid ? '✓ Paid' : '(pending)'}
                              </span>
                              {isFinalPaid && selectedBooking.paymentMethodFinal && (
                                <span className="block text-[10px] text-gray-400 font-normal">
                                  via {selectedBooking.paymentMethodFinal.replace('Paid by ', '')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Extras */}
                          {extraChargesTotal > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Extras / Adjustments</span>
                              <div className="text-right">
                                <span className={`font-semibold ${isExtraPaid ? 'text-emerald-700' : 'text-amber-600'}`}>
                                  £{extraChargesTotal.toLocaleString()} {isExtraPaid ? '✓ Paid' : '(pending)'}
                                </span>
                                {isExtraPaid && selectedBooking.paymentMethodFinal && (
                                  <span className="block text-[10px] text-gray-400 font-normal">
                                    via {selectedBooking.paymentMethodFinal.replace('Paid by ', '')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Total Paid */}
                          <div className="flex justify-between text-xs border-t border-gray-100 pt-1.5 font-semibold text-gray-700">
                            <span>Total Paid</span>
                            <span className="text-emerald-700 font-bold">£{totalPaid.toLocaleString()}</span>
                          </div>

                          {/* Remaining Balance Due */}
                          <div className="flex justify-between text-sm border-t border-gray-200 pt-1.5 font-bold">
                            <span className="text-gray-700">Remaining Balance Due</span>
                            <span className={remainingBalance <= 0 ? 'text-emerald-700' : 'text-amber-600'}>
                              {remainingBalance <= 0 ? 'PAID IN FULL ✓' : `£${remainingBalance.toLocaleString()}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Special Requests / Notes */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Special Requests &amp; Notes</span>
                  {!isEditingNotes ? (
                    <button
                      onClick={() => setIsEditingNotes(true)}
                      className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors flex items-center gap-0.5"
                    >
                      <Icon name="PencilIcon" size={10} />
                      Edit Notes
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditingNotes(false)}
                      className="text-[10px] text-gray-400 hover:text-gray-600 font-medium"
                    >
                      Done
                    </button>
                  )}
                </div>
                {!isEditingNotes ? (
                  <div className="text-sm text-gray-700 leading-relaxed italic bg-white p-3 rounded-lg border border-gray-100">
                    {selectedBooking.notes ? selectedBooking.notes : 'No special requests or notes added yet.'}
                  </div>
                ) : (
                  <textarea
                    defaultValue={selectedBooking.notes || ''}
                    rows={3}
                    onBlur={async (e) => {
                      const val = e.target.value.trim();
                      const updated = { ...selectedBooking, notes: val };
                      setSelectedBooking(updated);
                      setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, notes: val } : b));
                      await setDoc(doc(db, 'booking_requests', selectedBooking.id), { notes: val }, { merge: true });
                      await setDoc(doc(db, 'bookings', selectedBooking.id), { notes: val }, { merge: true });
                    }}
                    className="w-full border border-amber-300 rounded-lg p-2.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-inner"
                    placeholder="Enter special requests, notes, dietary requirements..."
                  />
                )}
              </div>
            </div>

            {/* Action footer */}
            <div className="p-5 border-t border-gray-200 flex-shrink-0 space-y-3 bg-gray-50/50">
              {/* Quick Stage Controls */}
              <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-gray-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleGoBackStatus(selectedBooking.id)}
                  disabled={STATUS_FLOW.indexOf(selectedBooking.status) === 0}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1 transition-all ${
                    STATUS_FLOW.indexOf(selectedBooking.status) === 0
                      ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                      : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                  }`}
                  title="Move booking back to previous stage"
                >
                  <Icon name="ArrowLeftIcon" size={13} />
                  <span>Prev Stage</span>
                </button>

                <select
                  value={selectedBooking.status}
                  onChange={(e) => updateStatus(selectedBooking.id, e.target.value as BookingStatus)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  title="Jump directly to any workflow stage"
                >
                  {STATUS_FLOW.map((s, idx) => (
                    <option key={s} value={s}>
                      {idx + 1}. {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => handleGoForwardStatus(selectedBooking.id)}
                  disabled={STATUS_FLOW.indexOf(selectedBooking.status) === STATUS_FLOW.length - 1}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1 transition-all ${
                    STATUS_FLOW.indexOf(selectedBooking.status) === STATUS_FLOW.length - 1
                      ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                      : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                  }`}
                  title="Move booking forward to next stage"
                >
                  <span>Next Stage</span>
                  <Icon name="ArrowRightIcon" size={13} />
                </button>
              </div>
              {selectedBooking.status === 'new_enquiry' && (
                <div className="flex gap-2">
                  <button onClick={() => { updateStatus(selectedBooking.id, 'menu_sent'); setShowMenuPanel(true); }}
                    className="flex-1 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                    <Icon name="ClipboardDocumentListIcon" size={16} />
                    Send Menu Options
                  </button>
                </div>
              )}
              {selectedBooking.status === 'menu_sent' && (
                <button onClick={() => updateStatus(selectedBooking.id, 'menu_selected')}
                  className="w-full text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                  <Icon name="CheckIcon" size={16} />
                  Mark Menu as Selected by Customer
                </button>
              )}
              {selectedBooking.status === 'menu_selected' && (
                <button onClick={() => updateStatus(selectedBooking.id, 'deposit_pending')}
                  className="w-full text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                  <Icon name="BanknotesIcon" size={16} />
                  Request Deposit Payment
                </button>
              )}
              {selectedBooking.status === 'deposit_pending' && (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      const method = depositPaymentMethod || 'Paid by Bank Transfer';
                      confirmDepositPaid(selectedBooking.id, method);
                    }}
                    className="w-full font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-95"
                  >
                    <Icon name="CheckCircleIcon" size={16} />
                    Confirm Deposit Received ({depositPaymentMethod ? depositPaymentMethod.replace('Paid by ', '') : 'Bank Transfer'})
                  </button>
                </div>
              )}
              {selectedBooking.status === 'deposit_confirmed' && (
                <div className="space-y-2">
                  <button
                    onClick={() => downloadInvoicePDF(selectedBooking)}
                    className="w-full font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 shadow-sm"
                  >
                    <Icon name="ArrowDownTrayIcon" size={16} />
                    Download Deposit Invoice
                  </button>
                  <button onClick={() => updateStatus(selectedBooking.id, 'final_invoice_sent')}
                    disabled={selectedBooking.discountRequest?.status === 'pending'}
                    className={`w-full text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 ${selectedBooking.discountRequest?.status === 'pending' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                    <Icon name="DocumentTextIcon" size={16} />
                    {selectedBooking.discountRequest?.status === 'pending' ? 'Awaiting Discount Approval' : 'Send Final Invoice'}
                  </button>
                </div>
              )}
              {selectedBooking.status === 'final_invoice_sent' && (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      const method = finalPaymentMethod || 'Paid by Bank Transfer';
                      confirmFinalPayment(selectedBooking.id, method);
                    }}
                    className="w-full font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95"
                  >
                    <Icon name="CheckBadgeIcon" size={16} />
                    Confirm Final Payment &amp; Close Order ({finalPaymentMethod ? finalPaymentMethod.replace('Paid by ', '') : 'Bank Transfer'})
                  </button>
                </div>
              )}
              {selectedBooking.status === 'final_payment_received' && (
                <div className="space-y-2">
                  <button onClick={() => updateStatus(selectedBooking.id, 'completed')}
                    className="w-full text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-md hover:bg-emerald-700 transition-colors"
                    style={{ background: '#059669' }}>
                    <Icon name="CheckBadgeIcon" size={16} />
                    Close Order &amp; Mark as Completed
                  </button>
                  <button onClick={() => updateStatus(selectedBooking.id, 'event_scheduled')}
                    className="w-full text-white font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-2 opacity-80 hover:opacity-100"
                    style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}>
                    <Icon name="CalendarIcon" size={15} />
                    Schedule Event &amp; Add to Calendar
                  </button>
                </div>
              )}
              {selectedBooking.status === 'event_scheduled' && (
                <div className="space-y-2">
                  <a href={buildWhatsAppLink(selectedBooking.phone, `Hi ${selectedBooking.name.split(' ')[0]}, just a reminder — your ${selectedBooking.eventType} at Honeymoon is coming up on *${selectedBooking.date}* at ${selectedBooking.time}. We look forward to seeing you! 🎉`)}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl"
                    style={{ background: '#25D366', color: 'white' }}>
                    <Icon name="ChatBubbleLeftRightIcon" size={16} />
                    Send Event Reminder
                  </a>
                  <button onClick={() => updateStatus(selectedBooking.id, 'event_completed')}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                    <Icon name="CheckCircleIcon" size={16} />
                    Mark Event as Completed
                  </button>
                </div>
              )}
              {selectedBooking.status === 'event_completed' && (() => {
                const nonPreset = (selectedBooking.extraCharges || []).filter(c => !c.isPreset && !(editableLiveCounter?.extras || []).some(preset => preset.name === c.label));
                const extraChargesTotal = nonPreset.reduce((sum, c) => sum + c.amount, 0);
                const isExtraPaymentNeeded = extraChargesTotal > 0 && selectedBooking.finalPaymentPaid;
                
                return (
                  <div className="space-y-3">
                    {isExtraPaymentNeeded && (
                      <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm">
                        <div className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-1.5">
                          <Icon name="ExclamationCircleIcon" size={16} />
                          Extra Payment Required (£{extraChargesTotal.toLocaleString()})
                        </div>
                        <p className="text-xs text-red-700 mb-3 leading-relaxed">
                          Extra charges were added to this event. You must upload the payment screenshot for the remaining balance before closing the event.
                        </p>
                        
                        <a href={buildWhatsAppLink(selectedBooking.phone, buildExtraInvoiceWhatsAppText(selectedBooking, bankDetails))}
                          target="_blank" rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl mb-3 transition-colors hover:bg-green-600"
                          style={{ background: '#25D366', color: 'white' }}>
                          <Icon name="ChatBubbleLeftRightIcon" size={16} />
                          Send Extra Invoice via WhatsApp
                        </a>

                        {selectedBooking.paymentProofExtra ? (
                          <div className="flex items-start gap-4">
                            {(selectedBooking.paymentProofExtra.startsWith('http') || selectedBooking.paymentProofExtra.startsWith('data:image')) && (
                              <div
                                className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm group flex-shrink-0 bg-gray-50"
                                onClick={() => {
                                  openImagePreview(selectedBooking.paymentProofExtra, "Extra Charges Payment Proof");
                                }}
                                title="Click to view full image"
                              >
                                <img
                                  src={selectedBooking.paymentProofExtra}
                                  alt="Extra Payment Proof"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Icon name="MagnifyingGlassPlusIcon" size={20} className="text-white" />
                                </div>
                              </div>
                            )}
                            <div className="flex flex-col gap-2 flex-1">
                              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                                <Icon name="CheckCircleIcon" size={16} />
                                Extra payment proof received — confirm below
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  id="extra-proof-reupload"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadExtraProof(selectedBooking.id, file);
                                  }}
                                />
                                <label
                                  htmlFor="extra-proof-reupload"
                                  className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 font-medium"
                                >
                                  <Icon name="ArrowPathIcon" size={14} />
                                  {isUploadingExtraProof ? 'Uploading...' : 'Re-upload screenshot'}
                                </label>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id="extra-proof-upload"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadExtraProof(selectedBooking.id, file);
                              }}
                            />
                            <label htmlFor="extra-proof-upload" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 cursor-pointer shadow-sm">
                              <Icon name="ArrowUpTrayIcon" size={16} />
                              {isUploadingExtraProof ? 'Uploading...' : 'Upload Extra Payment Screenshot'}
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    <button 
                      onClick={() => updateStatus(selectedBooking.id, 'completed')}
                      disabled={isExtraPaymentNeeded && !selectedBooking.paymentProofExtra}
                      title={isExtraPaymentNeeded && !selectedBooking.paymentProofExtra ? "Please upload the extra payment screenshot first" : ""}
                      className={`w-full text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md ${isExtraPaymentNeeded && !selectedBooking.paymentProofExtra ? 'bg-gray-400 cursor-not-allowed border-none' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                      {isExtraPaymentNeeded && !selectedBooking.paymentProofExtra ? (
                        <>
                          <Icon name="LockClosedIcon" size={16} />
                          Upload Payment to Close Event
                        </>
                      ) : (
                        <>
                          <Icon name="CheckBadgeIcon" size={16} />
                          Mark as Completed & Close Event
                        </>
                      )}
                    </button>
                  </div>
                );
              })()}
              {selectedBooking.status === 'completed' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-center gap-2 py-2.5 text-emerald-700 font-bold text-sm bg-emerald-50 rounded-xl border border-emerald-200 shadow-2xs">
                    <Icon name="CheckBadgeIcon" size={18} />
                    Order Closed &amp; Booking Completed
                  </div>
                  <a href={buildWhatsAppLink(selectedBooking.phone, buildCompletedWhatsAppText(selectedBooking))}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl w-full justify-center shadow-xs hover:shadow-md transition-all text-white active:scale-95"
                    style={{ background: '#25D366' }}>
                    <Icon name="ChatBubbleLeftRightIcon" size={16} />
                    Send Final Receipt &amp; Closing Confirmation via WhatsApp
                  </a>
                  <button
                    onClick={() => downloadInvoicePDF(selectedBooking)}
                    className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl w-full justify-center border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors shadow-2xs"
                  >
                    <Icon name="ArrowDownTrayIcon" size={16} />
                    Download Invoice PDF
                  </button>
                </div>
              )}

              {/* Cancellation button in Drawer Action Footer */}
              {selectedBooking.status !== 'cancelled' && (
                <div className="pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => handleOpenCancellationModal(selectedBooking)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                    title="Cancel this booking or order"
                  >
                    <Icon name="XCircleIcon" size={15} />
                    <span>Cancel This Order</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CUSTOMER DETAIL DRAWER ─── */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedCustomer(null)} />
          <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Customer Profile</h2>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <Icon name="XMarkIcon" size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(200,134,10,0.1)' }}>
                  <span className="text-2xl font-bold" style={{ color: '#C8860A' }}>{selectedCustomer.name.charAt(0)}</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-lg">{selectedCustomer.name}</div>
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">{selectedCustomer.status}</span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Icon name="EnvelopeIcon" size={15} className="text-gray-400" />
                  {selectedCustomer.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Icon name="PhoneIcon" size={15} className="text-gray-400" />
                  {selectedCustomer.phone}
                </div>
              </div>
              <a href={buildWhatsAppLink(selectedCustomer.phone, `Hi ${selectedCustomer.name.split(' ')[0]}, this is Honeymoon. How can we help you today?`)}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl w-full"
                style={{ background: '#25D366', color: 'white' }}>
                <Icon name="ChatBubbleLeftRightIcon" size={16} />
                Open WhatsApp Chat
              </a>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{selectedCustomer.totalBookings}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Total Bookings</div>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(200,134,10,0.08)' }}>
                  <div className="text-2xl font-bold" style={{ color: '#C8860A' }}>{selectedCustomer.totalSpent > 0 ? `£${selectedCustomer.totalSpent.toLocaleString()}` : '—'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Total Spent</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Booking History</div>
                <div className="space-y-2">
                  {bookings.filter(b => {
                    const nameKey = (b.name || 'Unknown').trim().toLowerCase();
                    const contactKey = (b.email || b.phone || '').trim().toLowerCase();
                    return `${nameKey}_${contactKey}` === selectedCustomer.id;
                  }).map((b) => (
                    <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{b.eventType}</div>
                        <div className="text-xs text-gray-400">{b.date}</div>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[b.status]}`}>
                        {STATUS_LABELS[b.status]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── DELETE CONFIRMATION MODAL ─── */}
      {bookingToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-100 flex flex-col items-center text-center animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-rose-50 text-rose-500">
              <Icon name="TrashIcon" size={24} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">Delete Booking</h3>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to permanently delete the booking for <span className="font-semibold text-gray-900">{bookingToDelete.name}</span>? This action cannot be undone.</p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setBookingToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteBooking}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CUSTOM ALERT MODAL ─── */}
      {customAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-100 flex flex-col items-center text-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${customAlert.type === 'success' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
              <Icon name={customAlert.type === 'success' ? 'CheckIcon' : 'ExclamationTriangleIcon'} size={24} />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">{customAlert.type === 'success' ? 'Success' : 'Error'}</h3>
            <p className="text-sm text-gray-500 mb-5">{customAlert.message}</p>
            <button
              onClick={() => setCustomAlert(null)}
              className="px-6 py-2 rounded-xl text-sm font-semibold text-white transition-all shadow-md active:scale-95 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ─── ORDER CANCELLATION MODAL (MANUAL & WEBSITE BOOKING ORDERS) ─── */}
      {cancellationModalBooking && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden flex flex-col my-auto max-h-[90vh]">
            {cancellationModalBooking.status === 'cancelled' ? (
              /* Already Cancelled: View Audit & Options */
              <>
                <div className="bg-gradient-to-r from-rose-900 via-rose-800 to-rose-900 text-white p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-rose-200">
                      <Icon name="XCircleIcon" size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-base leading-tight">Cancelled Booking Record</h3>
                      <p className="text-xs text-rose-200 mt-0.5">Order #{cancellationModalBooking.id.slice(0, 10)} · {cancellationModalBooking.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCancellationModalBooking(null)}
                    className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <Icon name="XMarkIcon" size={20} />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-4 text-xs">
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2.5">
                    <div className="font-bold text-rose-900 text-sm flex items-center gap-2">
                      <Icon name="ExclamationTriangleIcon" size={16} className="text-rose-600" />
                      This booking was cancelled
                    </div>
                    <div className="space-y-1.5 text-gray-700">
                      {cancellationModalBooking.cancellationDetails?.cancelledAt && (
                        <div><strong className="text-gray-900">Cancelled On:</strong> {new Date(cancellationModalBooking.cancellationDetails.cancelledAt).toLocaleString('en-GB')}</div>
                      )}
                      <div><strong className="text-gray-900">Cancelled By:</strong> {cancellationModalBooking.cancellationDetails?.cancelledBy || 'Administrator'}</div>
                      <div><strong className="text-gray-900">Reason:</strong> {cancellationModalBooking.cancellationDetails?.reason || 'Client requested cancellation'}</div>
                      <div>
                        <strong className="text-gray-900">Advance Amount Paid:</strong>{' '}
                        {cancellationModalBooking.cancellationDetails?.advancePaid && cancellationModalBooking.cancellationDetails.advancePaid > 0
                          ? `£${cancellationModalBooking.cancellationDetails.advancePaid.toLocaleString()} (${cancellationModalBooking.cancellationDetails.depositMethod || 'Received'})`
                          : '£0 (No advance paid)'}
                      </div>
                      {cancellationModalBooking.cancellationDetails?.notes && (
                        <div><strong className="text-gray-900">Remarks:</strong> {cancellationModalBooking.cancellationDetails.notes}</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 grid grid-cols-2 gap-2 text-gray-700">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold">Event & Date</span>
                      <span className="font-bold text-gray-900 text-xs">{cancellationModalBooking.eventType}</span>
                      <span className="block text-[11px] text-gray-500">{cancellationModalBooking.date} ({cancellationModalBooking.time})</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold">Guests & Package</span>
                      <span className="font-bold text-gray-900 text-xs">{cancellationModalBooking.adults ?? cancellationModalBooking.guests} Guests</span>
                      <span className="block text-[11px] text-gray-500">{cancellationModalBooking.selectedMenu || cancellationModalBooking.package}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
                  <a
                    href={buildWhatsAppLink(cancellationModalBooking.phone, buildCancellationWhatsAppText(cancellationModalBooking))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white shadow-2xs hover:brightness-105"
                    style={{ background: '#25D366' }}
                  >
                    <Icon name="ChatBubbleLeftRightIcon" size={14} />
                    <span>Send Cancellation WhatsApp</span>
                  </a>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const bId = cancellationModalBooking.id;
                        setCancellationModalBooking(null);
                        handleRestoreBooking(bId);
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
                    >
                      Restore Booking
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancellationModalBooking(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Active Booking: Professional Centered Confirmation Dialog */
              <>
                {/* Header */}
                <div className="p-6 pb-4 border-b border-gray-100 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 flex-shrink-0">
                    <Icon name="ExclamationTriangleIcon" size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base text-gray-900 leading-tight">Confirm Booking Cancellation</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Are you sure you want to cancel the booking for <strong className="text-gray-900">{cancellationModalBooking.name}</strong>?
                    </p>
                  </div>
                  <button
                    onClick={() => setCancellationModalBooking(null)}
                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Icon name="XMarkIcon" size={18} />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 py-4 overflow-y-auto space-y-4 text-xs">
                  {/* Order summary card */}
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 grid grid-cols-2 gap-2 text-gray-700">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold">Event & Date</span>
                      <span className="font-bold text-gray-900 text-xs">{cancellationModalBooking.eventType}</span>
                      <span className="block text-[11px] text-gray-500">{cancellationModalBooking.date} ({cancellationModalBooking.time})</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold">Guests & Package</span>
                      <span className="font-bold text-gray-900 text-xs">{cancellationModalBooking.adults ?? cancellationModalBooking.guests} Guests</span>
                      <span className="block text-[11px] text-gray-500">{cancellationModalBooking.selectedMenu || cancellationModalBooking.package}</span>
                    </div>
                  </div>

                  {/* Advance Paid Information Section */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-950 flex items-center gap-1.5 text-xs">
                        <Icon name="BanknotesIcon" size={15} className="text-amber-700" />
                        Advance / Deposit Amount Details
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        cancellationModalBooking.depositPaid && cancellationModalBooking.deposit > 0
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}>
                        {cancellationModalBooking.depositPaid && cancellationModalBooking.deposit > 0 ? '✓ Advance Received' : 'No Advance Paid'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-amber-200/60 text-xs">
                      <span className="text-amber-900 font-medium">Advance Amount Paid:</span>
                      <span className="text-base font-extrabold text-amber-950">
                        {cancellationModalBooking.depositPaid && cancellationModalBooking.deposit > 0
                          ? `£${cancellationModalBooking.deposit.toLocaleString()}`
                          : '£0'}
                      </span>
                    </div>

                    {cancellationModalBooking.depositPaid && (
                      <div className="text-[11px] text-amber-800 space-y-0.5">
                        <div>• Payment Method: <strong>{cancellationModalBooking.paymentMethodDeposit || 'Bank Transfer'}</strong></div>
                        {cancellationModalBooking.paymentProofDeposit && (
                          <div className="pt-0.5">
                            <button
                              type="button"
                              onClick={() => openImagePreview(cancellationModalBooking.paymentProofDeposit, 'Advance Payment Proof')}
                              className="text-[#C8860A] underline font-bold hover:text-amber-800 inline-flex items-center gap-1"
                            >
                              <Icon name="PhotoIcon" size={12} /> View advance payment screenshot
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cancellation Reason Selection */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-gray-800 text-xs">
                      Reason for Cancellation <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={cancellationReason}
                      onChange={(e) => setCancellationReason(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl p-2.5 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                    >
                      <option value="Client requested cancellation">Client requested cancellation</option>
                      <option value="Change of event plans / personal reasons">Change of event plans / personal reasons</option>
                      <option value="Event postponed indefinitely">Event postponed indefinitely</option>
                      <option value="Budget / Financial constraints">Budget / Financial constraints</option>
                      <option value="Scheduling / Venue capacity conflict">Scheduling / Venue capacity conflict</option>
                      <option value="Medical / Emergency circumstances">Medical / Emergency circumstances</option>
                      <option value="Other">Other (Specify custom reason)</option>
                    </select>

                    {cancellationReason === 'Other' && (
                      <input
                        type="text"
                        value={cancellationCustomReason}
                        onChange={(e) => setCancellationCustomReason(e.target.value)}
                        placeholder="Enter specific cancellation reason..."
                        className="w-full mt-2 border border-rose-300 rounded-xl p-2.5 text-xs text-gray-900 bg-rose-50/30 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    )}
                  </div>

                  {/* Cancellation Remarks / Notes */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-gray-800 text-xs">
                      Remarks / Internal Cancellation Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={cancellationNotes}
                      onChange={(e) => setCancellationNotes(e.target.value)}
                      placeholder="Add any context, communication notes, or confirmation details..."
                      className="w-full border border-gray-300 rounded-xl p-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="p-4 px-6 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCancellationModalBooking(null)}
                    disabled={isSubmittingCancellation}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 transition-colors"
                  >
                    Keep Booking
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCancellation}
                    disabled={isSubmittingCancellation}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 active:scale-95"
                  >
                    {isSubmittingCancellation ? (
                      <>
                        <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                        <span>Cancelling...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="XCircleIcon" size={14} />
                        <span>Yes, Confirm Cancellation</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── ADD VENUE HALL CHARGE MODAL (DRAWER OPTIONAL ADD-ON) ─── */}
      {showAddHallModal && selectedBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="BuildingOffice2Icon" size={20} className="text-indigo-200" />
                <h3 className="font-bold text-sm">Add Venue Hall Hire Fee</h3>
              </div>
              <button
                onClick={() => setShowAddHallModal(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <p className="text-gray-500 leading-relaxed">
                Choose a standard hall rate or specify a custom bespoke hall hire charge for Booking #{selectedBooking.id}.
              </p>

              {/* Standard Hall Charge */}
              {(() => {
                const std = getVenueHallCharge(selectedBooking.date, selectedBooking.time);
                return (
                  <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-indigo-950 block">{std ? std.label : 'Standard Banquet Hall Hire'}</span>
                      <span className="text-[11px] text-gray-500">Based on event date: {selectedBooking.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-700 text-sm">£{std ? std.amount : 250}</span>
                      <button
                        type="button"
                        onClick={() => handleApplyHallChargeToBooking(selectedBooking, std || { label: 'Standard Banquet Hall Hire', amount: 250 })}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Custom Hall Charge */}
              <div className="border border-gray-200 rounded-xl p-3.5 space-y-3 bg-gray-50/50">
                <div className="font-bold text-gray-800">Or Apply Custom / Bespoke Hall Fee</div>
                <div>
                  <label className="text-gray-500 font-semibold block mb-1">Hall Label / Description</label>
                  <input
                    type="text"
                    value={customHallLabel}
                    onChange={(e) => setCustomHallLabel(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-white"
                    placeholder="e.g. Bespoke Hall Hire Fee"
                  />
                </div>
                <div>
                  <label className="text-gray-500 font-semibold block mb-1">Fee Amount (£)</label>
                  <input
                    type="number"
                    min="0"
                    value={customHallAmount}
                    onChange={(e) => setCustomHallAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-white font-bold"
                    placeholder="300"
                  />
                </div>
                <div>
                  <label className="text-gray-500 font-semibold block mb-1">Reason / Notes (Optional)</label>
                  <input
                    type="text"
                    value={customHallReason}
                    onChange={(e) => setCustomHallReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-white"
                    placeholder="e.g. Agreed weekend discount"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(customHallAmount) || 0;
                    handleApplyHallChargeToBooking(selectedBooking, {
                      label: customHallLabel.trim() || 'Custom Venue Hall Hire',
                      amount: parsed,
                      isCustom: true,
                      reason: customHallReason.trim(),
                    });
                  }}
                  className="w-full py-2 bg-gray-900 hover:bg-black text-white font-bold rounded-xl transition-colors"
                >
                  Apply Bespoke Hall Fee
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── DELIVER INVOICE VIA WHATSAPP MODAL ─── */}
      {whatsAppInvoiceBooking && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 px-6 text-white flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #128C7E, #25D366)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                  <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.859L.057 23.428a.75.75 0 0 0 .921.921l5.684-1.47A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.694 9.694 0 0 1-4.946-1.356l-.355-.211-3.676.95.974-3.578-.231-.368A9.693 9.693 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm leading-tight">Deliver Invoice via WhatsApp</h3>
                  <p className="text-[11px] text-white/80">Booking #{whatsAppInvoiceBooking.id} • {whatsAppInvoiceBooking.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppInvoiceBooking(null)}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Recipient Phone */}
              <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200 space-y-2">
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                  Customer WhatsApp Phone
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={whatsAppCustomPhone}
                      onChange={(e) => setWhatsAppCustomPhone(e.target.value)}
                      placeholder="+44 7700 900000"
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 font-medium">({whatsAppInvoiceBooking.name})</span>
                </div>
              </div>

              {/* Invoice Type Selector */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Select Invoice Document Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWhatsAppInvoiceType('final');
                      setWhatsAppCustomMessage(getInitialWhatsAppMsg(whatsAppInvoiceBooking, 'final', whatsAppCustomPhone));
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      whatsAppInvoiceType === 'final'
                        ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-300 text-blue-950 font-bold shadow-xs'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 font-medium'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900">Final / Full Invoice</span>
                      <Icon name="DocumentCheckIcon" size={16} className="text-blue-600" />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      Grand Total &amp; Remaining Balance
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWhatsAppInvoiceType('deposit');
                      setWhatsAppCustomMessage(getInitialWhatsAppMsg(whatsAppInvoiceBooking, 'deposit', whatsAppCustomPhone));
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      whatsAppInvoiceType === 'deposit'
                        ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-300 text-emerald-950 font-bold shadow-xs'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 font-medium'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900">Deposit Invoice</span>
                      <Icon name="DocumentTextIcon" size={16} className="text-emerald-600" />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      Deposit £{whatsAppInvoiceBooking.deposit.toLocaleString()}
                    </div>
                  </button>
                </div>
              </div>

              {/* Message Box */}
              <div className="bg-[#EFEAE2] rounded-2xl p-3.5 border border-[#DAD3C8] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#54656F]">
                    WhatsApp Message (Editable)
                  </span>
                  <button
                    type="button"
                    onClick={() => setWhatsAppCustomMessage(getInitialWhatsAppMsg(whatsAppInvoiceBooking, whatsAppInvoiceType, whatsAppCustomPhone))}
                    className="text-[10px] text-emerald-800 font-bold bg-white/80 hover:bg-white px-2 py-0.5 rounded-full border border-[#DAD3C8] transition-colors"
                  >
                    Reset Text
                  </button>
                </div>
                <textarea
                  value={whatsAppCustomMessage}
                  onChange={(e) => setWhatsAppCustomMessage(e.target.value)}
                  rows={6}
                  className="w-full bg-white rounded-xl p-3 text-[12px] text-[#111B21] leading-relaxed shadow-2xs font-sans border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#25D366] resize-none"
                  placeholder="Official WhatsApp invoice message..."
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleSendWhatsAppInvoice('share_file')}
                disabled={isSharingWhatsApp}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white shadow-md active:scale-98 transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.859L.057 23.428a.75.75 0 0 0 .921.921l5.684-1.47A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.694 9.694 0 0 1-4.946-1.356l-.355-.211-3.676.95.974-3.578-.231-.368A9.693 9.693 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                </svg>
                <span>{isSharingWhatsApp ? 'Preparing PDF & Opening WhatsApp...' : '💬 Send via WhatsApp & Download PDF'}</span>
              </button>
              <p className="text-[10px] text-center text-gray-500 -mt-0.5 mb-1">
                Downloads official PDF to your device &amp; opens WhatsApp with the verified invoice link
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSendWhatsAppInvoice('open_chat')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-gray-800 bg-white hover:bg-gray-100 border border-gray-300 transition-colors shadow-2xs"
                >
                  <Icon name="ChatBubbleLeftRightIcon" size={14} className="text-[#25D366]" />
                  <span>Open Chat with Link</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendWhatsAppInvoice('download_pdf')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-gray-800 bg-white hover:bg-gray-100 border border-gray-300 transition-colors shadow-2xs"
                >
                  <Icon name="ArrowDownTrayIcon" size={14} className="text-amber-600" />
                  <span>Download PDF Only</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
