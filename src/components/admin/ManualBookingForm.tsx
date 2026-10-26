'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { db } from '@/lib/firebase';
import { collection, addDoc, setDoc, doc } from 'firebase/firestore';
import {
  INDIAN_MENU as DEFAULT_INDIAN_MENU,
  SRI_LANKAN_MENU as DEFAULT_SRI_LANKAN_MENU,
  LIVE_COUNTER_PACKAGE as DEFAULT_LIVE_COUNTER_PACKAGE,
  BANQUET_PACKAGES as DEFAULT_BANQUET_PACKAGES,
  VENUE_HALL_CHARGES as DEFAULT_VENUE_HALL_CHARGES,
  KIDS_PRICING as DEFAULT_KIDS_PRICING,
  DRY_HIRE_PRICES as DEFAULT_DRY_HIRE_PRICES,
} from '@/app/data/menuData';
import { ConfiguredExtraCharge } from './ExtraChargesSettings';
import { generateChefMenuPDF, openChefWhatsApp } from '@/utils/chefMenuPDF';
import { getKidsPriceFromList } from '@/utils/kidsPricing';

const EVENT_TYPES = [
  'Wedding',
  'Birthday',
  'Corporate',
  'Anniversary',
  'Graduation',
  'Reception',
  'Engagement',
  'Baby Shower',
  'Other',
];

const TIME_SESSIONS = [
  { label: 'Lunch (12:00 PM – 5:00 PM)', value: '12:00 PM' },
  { label: 'Dinner (6:00 PM – 11:30 PM)', value: '6:00 PM' },
  { label: 'All Day (10:00 AM – 11:00 PM)', value: '10:00 AM' },
  { label: 'Custom Time', value: 'custom' },
];

export type BanquetPackageItem = typeof DEFAULT_BANQUET_PACKAGES[0];
export type IndianMenuType = typeof DEFAULT_INDIAN_MENU;
export type SriLankanMenuType = typeof DEFAULT_SRI_LANKAN_MENU;
export type LiveCounterPackageType = typeof DEFAULT_LIVE_COUNTER_PACKAGE;
export type VenueHallChargeItem = typeof DEFAULT_VENUE_HALL_CHARGES[0];
export type KidsPricingItem = typeof DEFAULT_KIDS_PRICING[0];
export type DryHirePriceItem = typeof DEFAULT_DRY_HIRE_PRICES[0];

export interface ManualBookingFormProps {
  configuredExtraCharges?: ConfiguredExtraCharge[];
  blockedDates?: string[];
  bankDetails?: {
    accountName: string;
    sortCode: string;
    accountNumber: string;
  };
  pricingDetails?: {
    depositPercentage?: number;
    depositAmount?: number;
    minimumBookingHours?: number;
    weekdayRate?: number;
    weekendRate?: number;
  };
  banquetPackages?: BanquetPackageItem[];
  indianMenu?: IndianMenuType;
  sriLankanMenu?: SriLankanMenuType;
  liveCounters?: LiveCounterPackageType;
  venueHallCharges?: VenueHallChargeItem[];
  dryHirePrices?: DryHirePriceItem[];
  kidsPricing?: KidsPricingItem[];
  editingBooking?: any;
  onBookingUpdated?: (booking: any) => void;
  onCancelEdit?: () => void;
  onBookingCreated?: (bookingId: string) => void;
  onNavigateTab?: (tab: string, date?: string) => void;
  onGenerateInvoice?: (booking: any, isDepositOnly?: boolean) => void;
}

function formatWhatsAppPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '44' + cleaned.slice(1);
  }
  return cleaned;
}

export default function ManualBookingForm({
  configuredExtraCharges = [],
  blockedDates = [],
  bankDetails = {
    accountName: 'Honeymoon Events Ltd',
    sortCode: '20-00-00',
    accountNumber: '12345678',
  },
  pricingDetails = { depositPercentage: 500 },
  banquetPackages = DEFAULT_BANQUET_PACKAGES,
  indianMenu = DEFAULT_INDIAN_MENU,
  sriLankanMenu = DEFAULT_SRI_LANKAN_MENU,
  liveCounters = DEFAULT_LIVE_COUNTER_PACKAGE,
  venueHallCharges = DEFAULT_VENUE_HALL_CHARGES,
  dryHirePrices = DEFAULT_DRY_HIRE_PRICES,
  kidsPricing = DEFAULT_KIDS_PRICING,
  editingBooking,
  onBookingUpdated,
  onCancelEdit,
  onBookingCreated,
  onNavigateTab,
  onGenerateInvoice,
}: ManualBookingFormProps) {
  // ── Step State (1: Customer, 2: Menu, 3: Pricing & Payment, 4: Confirmed) ──
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // ── Step 1: Customer & Event Details (NO AUTO-SELECTION BY DEFAULT) ──
  const [customerDetails, setCustomerDetails] = useState<{
    name: string;
    phone: string;
    email: string;
    eventType: string;
    customEventType: string;
    date: string;
    timeSession: string;
    customTime: string;
    adults: number | string;
    kids4to10: number | string;
    kidsUnder4: number | string;
    notes: string;
  }>({
    name: '',
    phone: '',
    email: '',
    eventType: '',
    customEventType: '',
    date: '',
    timeSession: '',
    customTime: '',
    adults: '',
    kids4to10: 0,
    kidsUnder4: 0,
    notes: '',
  });
  const [phoneError, setPhoneError] = useState('');
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});

  // ── All Banquet Packages State (Allows adding custom packages & inline editing) ──
  const [allBanquetPackages, setAllBanquetPackages] = useState<BanquetPackageItem[]>(banquetPackages);

  useEffect(() => {
    setAllBanquetPackages(banquetPackages);
  }, [banquetPackages]);

  // Modal / Form state for Adding & Editing Packages
  const [showAddPackageModal, setShowAddPackageModal] = useState(false);
  const [editingPackageModal, setEditingPackageModal] = useState<BanquetPackageItem | null>(null);
  const [packageForm, setPackageForm] = useState({
    name: '',
    pricePerPerson: '',
    kidsPrice: '',
    tag: '',
    guestLabel: '',
    vegStarters: 2,
    nonVegStarters: 2,
    vegMains: 2,
    nonVegMains: 2,
    desserts: '1 Indian Sweet Dish',
    drinks: 'Soft Drinks & Bottled Water',
  });

  // ── Custom Dishes added directly in Indian & Sri Lankan Menus ──
  const [customDishes, setCustomDishes] = useState<{
    vegStarters: string[];
    nonVegStarters: string[];
    vegMains: string[];
    nonVegMains: string[];
    sundries: string[];
    desserts: string[];
  }>({
    vegStarters: [],
    nonVegStarters: [],
    vegMains: [],
    nonVegMains: [],
    sundries: [],
    desserts: [],
  });
  const [newCustomDishInputs, setNewCustomDishInputs] = useState<Record<string, string>>({});

  const handleAddCustomDish = (category: keyof typeof customDishes, dishName: string) => {
    const trimmed = (dishName || '').trim();
    if (!trimmed) return;
    setCustomDishes((prev) => ({
      ...prev,
      [category]: [...prev[category], trimmed],
    }));
    // Automatically select the added custom dish
    if (category === 'vegStarters') setSelectedVegStarters((prev) => [...prev, trimmed]);
    else if (category === 'nonVegStarters') setSelectedNonVegStarters((prev) => [...prev, trimmed]);
    else if (category === 'vegMains') setSelectedVegMains((prev) => [...prev, trimmed]);
    else if (category === 'nonVegMains') setSelectedNonVegMains((prev) => [...prev, trimmed]);
    else if (category === 'sundries') setSelectedSundries((prev) => [...prev, trimmed]);
    else if (category === 'desserts') setSelectedDesserts((prev) => [...prev, trimmed]);
  };

  // ── Custom Venue Hall Charges state ──
  const [customHallCharges, setCustomHallCharges] = useState<{
    label: string;
    amount: number;
    note?: string;
  }[]>([]);
  const [newHallChargeLabel, setNewHallChargeLabel] = useState('');
  const [newHallChargeAmount, setNewHallChargeAmount] = useState('');
  const [newHallChargeNote, setNewHallChargeNote] = useState('');
  const [showAddHallCharge, setShowAddHallCharge] = useState(false);

  // ── Step 2: Menu & Package Selection (NO AUTO-SELECTION BY DEFAULT) ──
  const [menuTab, setMenuTab] = useState<'packages' | 'indian' | 'srilankan' | 'live' | 'hall' | 'extra_menu'>('packages');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedPackageCustomPrice, setSelectedPackageCustomPrice] = useState<number | string>('');

  // ── Price Overrides & Flexibility (Local to Manual Booking Flow Only) ──
  // Adult / Package rate override
  const [packagePriceOverride, setPackagePriceOverride] = useState<number | string | null>(null);
  const [packagePriceOverrideReason, setPackagePriceOverrideReason] = useState<string>('');
  const [showPackagePriceEditor, setShowPackagePriceEditor] = useState<boolean>(false);

  // Kids (4–10 yrs) rate override
  const [kidsPriceOverride, setKidsPriceOverride] = useState<number | string | null>(null);
  const [kidsPriceOverrideReason, setKidsPriceOverrideReason] = useState<string>('');
  const [showKidsPriceEditor, setShowKidsPriceEditor] = useState<boolean>(false);

  // Kids under 4 yrs rate override (Default 0/Free)
  const [kidsUnder4PriceOverride, setKidsUnder4PriceOverride] = useState<number | string | null>(null);
  const [kidsUnder4PriceOverrideReason, setKidsUnder4PriceOverrideReason] = useState<string>('');
  const [showKidsUnder4PriceEditor, setShowKidsUnder4PriceEditor] = useState<boolean>(false);

  // Selected dishes
  const [selectedVegStarters, setSelectedVegStarters] = useState<string[]>([]);
  const [selectedNonVegStarters, setSelectedNonVegStarters] = useState<string[]>([]);
  const [selectedVegMains, setSelectedVegMains] = useState<string[]>([]);
  const [selectedNonVegMains, setSelectedNonVegMains] = useState<string[]>([]);
  const [selectedSundries, setSelectedSundries] = useState<string[]>([]);
  const [selectedDesserts, setSelectedDesserts] = useState<string[]>([]);

  // Selected Live Counters & Extras (with price overrides)
  const [selectedLiveCounters, setSelectedLiveCounters] = useState<{
    name: string;
    price: number;
    defaultPrice: number;
    isCustomPrice?: boolean;
    reason?: string;
  }[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<{
    name: string;
    price: number;
    defaultPrice: number;
    isCustomPrice?: boolean;
    reason?: string;
  }[]>([]);

  // ── Extra Menu Items (custom food add-ons with cost) ──
  const [extraMenuItems, setExtraMenuItems] = useState<{
    id: string;
    name: string;
    description: string;
    cost: number;
  }[]>([]);
  const [newExtraItemName, setNewExtraItemName] = useState('');
  const [newExtraItemDescription, setNewExtraItemDescription] = useState('');
  const [newExtraItemCost, setNewExtraItemCost] = useState('');

  // Selected Hall Hire (with price override)
  const [selectedHallOption, setSelectedHallOption] = useState<{
    label: string;
    amount: number;
    defaultAmount: number;
    isCustomAmount?: boolean;
    reason?: string;
  } | null>(null);
  const [showHallPriceEditor, setShowHallPriceEditor] = useState<boolean>(false);

  // ── Step 3: Extra Charges, Discount & Payment ──
  // Active extra charges applied to this booking (with custom amount & reason)
  const [bookingExtraCharges, setBookingExtraCharges] = useState<{
    label: string;
    amount: number;
    isPreset?: boolean;
    defaultAmount?: number;
    isCustomAmount?: boolean;
    reason?: string;
  }[]>([]);
  const [customChargeLabel, setCustomChargeLabel] = useState('');
  const [customChargeAmount, setCustomChargeAmount] = useState('');
  const [customChargeReason, setCustomChargeReason] = useState('');

  // Discount
  const [discountType, setDiscountType] = useState<'none' | 'fixed' | 'percentage'>('none');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState<string>('');

  // Payment Options
  const [paymentChoice, setPaymentChoice] = useState<'advance' | 'full' | 'pending'>('advance');
  const [customDepositAmount, setCustomDepositAmount] = useState<string>('500');
  const [paymentMethod, setPaymentMethod] = useState<'Paid by Cash' | 'Paid by Card' | 'Paid by Bank Transfer'>('Paid by Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');

  // Order submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<any | null>(null);

  // Center popup modal state
  const [centerModal, setCenterModal] = useState<{
    title: string;
    message: string;
    type: 'error' | 'success' | 'info';
  } | null>(null);

  // Initialize configured default charges on first mount or step 3
  const [chargesInitialized, setChargesInitialized] = useState(false);

  // ── Pre-fill when amending an existing booking ──
  useEffect(() => {
    if (!editingBooking) return;

    setCustomerDetails({
      name: editingBooking.name || '',
      phone: editingBooking.phone || '',
      email: editingBooking.email || '',
      eventType: editingBooking.eventType || 'Wedding',
      customEventType: '',
      date: editingBooking.date ? editingBooking.date.split('T')[0] : '',
      timeSession: editingBooking.timeSession || editingBooking.time || '6:00 PM',
      customTime: editingBooking.customTime || '',
      adults: editingBooking.adults ?? editingBooking.guests ?? 100,
      kids4to10: editingBooking.kids4to10 ?? 0,
      kidsUnder4: editingBooking.kidsUnder4 ?? 0,
      notes: editingBooking.notes || '',
    });

    const pkgName = editingBooking.selectedMenu || editingBooking.package;
    const foundPkg = banquetPackages.find(
      (p) => p.name.toLowerCase() === (pkgName || '').toLowerCase()
    );
    const hasFoodCharge = (Number(editingBooking.pricePerPerson) > 0) || (Number(editingBooking.baseAmount) > 0);
    const isExplicitNoFoodPkg = ['hall hire only', 'venue hire only', 'no package', 'no food package', 'dry hire'].includes((pkgName || '').toLowerCase());

    if (foundPkg) {
      setSelectedPackageId(foundPkg.id);
    } else if (pkgName && !isExplicitNoFoodPkg && (hasFoodCharge || (pkgName.toLowerCase().includes('custom') && hasFoodCharge))) {
      setSelectedPackageId('custom');
      setSelectedPackageCustomPrice(
        editingBooking.pricePerPerson !== undefined && editingBooking.pricePerPerson !== null
          ? Number(editingBooking.pricePerPerson)
          : (hasFoodCharge ? 35 : 0)
      );
    } else {
      setSelectedPackageId('');
      setSelectedPackageCustomPrice('');
    }

    if (editingBooking.priceOverrides) {
      if (editingBooking.priceOverrides.package?.custom !== undefined) {
        setPackagePriceOverride(editingBooking.priceOverrides.package.custom);
        setPackagePriceOverrideReason(editingBooking.priceOverrides.package.reason || '');
        setShowPackagePriceEditor(true);
      } else if (editingBooking.priceOverrides.packagePrice !== undefined) {
        setPackagePriceOverride(editingBooking.priceOverrides.packagePrice);
        setShowPackagePriceEditor(true);
      }

      if (editingBooking.priceOverrides.kids4to10?.custom !== undefined) {
        setKidsPriceOverride(editingBooking.priceOverrides.kids4to10.custom);
        setKidsPriceOverrideReason(editingBooking.priceOverrides.kids4to10.reason || '');
        setShowKidsPriceEditor(true);
      } else if (editingBooking.priceOverrides.kidsPrice !== undefined) {
        setKidsPriceOverride(editingBooking.priceOverrides.kidsPrice);
        setShowKidsPriceEditor(true);
      }

      if (editingBooking.priceOverrides.kidsUnder4?.custom !== undefined) {
        setKidsUnder4PriceOverride(editingBooking.priceOverrides.kidsUnder4.custom);
        setKidsUnder4PriceOverrideReason(editingBooking.priceOverrides.kidsUnder4.reason || '');
        setShowKidsUnder4PriceEditor(true);
      } else if (editingBooking.priceOverrides.kidsUnder4Price !== undefined) {
        setKidsUnder4PriceOverride(editingBooking.priceOverrides.kidsUnder4Price);
        setShowKidsUnder4PriceEditor(true);
      }
    }

    if (editingBooking.selectedDishes) {
      setSelectedVegStarters(editingBooking.selectedDishes.vegStarters || []);
      setSelectedNonVegStarters(editingBooking.selectedDishes.nonVegStarters || []);
      setSelectedVegMains(editingBooking.selectedDishes.vegMains || []);
      setSelectedNonVegMains(editingBooking.selectedDishes.nonVegMains || []);
      setSelectedSundries(editingBooking.selectedDishes.sundries || []);
      setSelectedDesserts(editingBooking.selectedDishes.desserts || []);
      if (Array.isArray(editingBooking.selectedDishes.extraMenuItems)) {
        setExtraMenuItems(
          editingBooking.selectedDishes.extraMenuItems.map((item: any, idx: number) => ({
            id: `extra-edit-${idx}`,
            name: item.name,
            description: item.description || '',
            cost: Number(item.cost) || 0,
          }))
        );
      }
    }

    if (editingBooking.deposit !== undefined) {
      setCustomDepositAmount(String(editingBooking.deposit));
    }
    if (editingBooking.dueDate) {
      setPaymentDueDate(editingBooking.dueDate);
    }
    if (editingBooking.paymentMethodDeposit || editingBooking.paymentMethodFinal) {
      setPaymentMethod(editingBooking.paymentMethodDeposit || editingBooking.paymentMethodFinal);
    }
    if (editingBooking.finalPaymentPaid || editingBooking.status === 'completed') {
      setPaymentChoice('full');
    } else if (editingBooking.depositPaid) {
      setPaymentChoice('advance');
    } else {
      setPaymentChoice('pending');
    }

    if (editingBooking.discount) {
      setDiscountType(editingBooking.discount.type || 'fixed');
      setDiscountValue(String(editingBooking.discount.value || ''));
      setDiscountReason(editingBooking.discount.reason || '');
    }

    if (Array.isArray(editingBooking.extraCharges)) {
      const nonPreset = editingBooking.extraCharges.filter(
        (c: any) =>
          !c.label?.startsWith('Hall Hire:') &&
          !c.label?.startsWith('Live Counter:') &&
          !c.label?.startsWith('Extra:') &&
          !c.label?.startsWith('Extra Menu:')
      );
      if (nonPreset.length > 0) {
        setBookingExtraCharges(
          nonPreset.map((c: any) => ({
            label: c.label,
            amount: c.amount,
            isPreset: c.isPreset ?? false,
          }))
        );
      }
    }

    if (editingBooking.venueHallCharge) {
      const vhc = editingBooking.venueHallCharge;
      setSelectedHallOption({
        label: vhc.label || 'Venue Hall Hire',
        amount: Number(vhc.amount) || 0,
        defaultAmount: Number(vhc.defaultAmount || vhc.amount) || 0,
        isCustomAmount: !!vhc.isCustom,
        reason: vhc.reason || '',
      });
      if (vhc.isCustom) {
        setShowHallPriceEditor(true);
      }
    } else if (Array.isArray(editingBooking.extraCharges)) {
      const hallExtra = editingBooking.extraCharges.find((e: any) =>
        e.label?.toLowerCase().includes('hall hire') ||
        e.label?.toLowerCase().includes('dry hire') ||
        e.label?.toLowerCase().includes('venue hire')
      );
      if (hallExtra) {
        setSelectedHallOption({
          label: hallExtra.label,
          amount: Number(hallExtra.amount) || 0,
          defaultAmount: Number(hallExtra.amount) || 0,
          isCustomAmount: false,
          reason: '',
        });
      }
    }
  }, [editingBooking, banquetPackages]);

  // Current package object (null if no package selected)
  const currentPackage = useMemo(() => {
    if (!selectedPackageId || selectedPackageId === 'custom') return null;
    return allBanquetPackages.find((p) => p.id === selectedPackageId) || null;
  }, [allBanquetPackages, selectedPackageId]);

  // UK Phone formatting & validation
  const validatePhone = (val: string) => {
    const cleaned = val.replace(/\s/g, '');
    return /^(07\d{9}|7\d{9}|\+447\d{9})$/.test(cleaned) || cleaned === '';
  };

  const handlePhoneChange = (val: string) => {
    setCustomerDetails((prev) => ({ ...prev, phone: val }));
    if (val && !validatePhone(val)) {
      setPhoneError('Enter a valid UK phone (e.g. 07700 900101 or +447700900101)');
    } else {
      setPhoneError('');
    }
  };

  // ── Venue Hire Dropdown Key Resolution & Handlers (Step 1) ──
  const venueHireSelectValue = useMemo(() => {
    if (!selectedHallOption) return '';
    if (
      selectedHallOption.label === 'Custom Venue Hire' ||
      (selectedHallOption.isCustomAmount && selectedHallOption.defaultAmount === 0)
    ) {
      return 'custom';
    }
    const hallIdx = venueHallCharges.findIndex(
      (h) =>
        selectedHallOption.label === h.day ||
        selectedHallOption.label === `${h.day} (${h.note})` ||
        selectedHallOption.label.startsWith(h.day)
    );
    if (hallIdx !== -1) return `hall_${hallIdx}`;

    const dryIdx = dryHirePrices.findIndex(
      (dh) =>
        selectedHallOption.label.includes(dh.day) && selectedHallOption.label.includes(dh.session)
    );
    if (dryIdx !== -1) return `dry_${dryIdx}`;

    return 'custom';
  }, [selectedHallOption, venueHallCharges, dryHirePrices]);

  const handleVenueHireSelectChange = (val: string) => {
    if (!val) {
      setSelectedHallOption(null);
      setShowHallPriceEditor(false);
      return;
    }
    if (val === 'custom') {
      setSelectedHallOption({
        label:
          selectedHallOption?.isCustomAmount && selectedHallOption.label && selectedHallOption.label !== 'Custom Venue Hire'
            ? selectedHallOption.label
            : 'Custom Venue Hire',
        amount: selectedHallOption?.isCustomAmount ? Number(selectedHallOption.amount || 0) : 0,
        defaultAmount: 0,
        isCustomAmount: true,
        reason: selectedHallOption?.reason || '',
      });
      setShowHallPriceEditor(true);
      return;
    }
    if (val.startsWith('hall_')) {
      const idx = parseInt(val.replace('hall_', ''), 10);
      const hall = venueHallCharges[idx];
      if (hall) {
        const priceMatch = hall.charge.match(/£(\d+)/);
        const defaultAmount = priceMatch ? parseInt(priceMatch[1]) : 250;
        const label = hall.note ? `${hall.day} (${hall.note})` : hall.day;
        setSelectedHallOption({
          label,
          amount: defaultAmount,
          defaultAmount,
          isCustomAmount: false,
          reason: '',
        });
        setShowHallPriceEditor(false);
      }
      return;
    }
    if (val.startsWith('dry_')) {
      const idx = parseInt(val.replace('dry_', ''), 10);
      const dh = dryHirePrices[idx];
      if (dh) {
        const label = `Dry Hire: ${dh.day} (${dh.session})`;
        setSelectedHallOption({
          label,
          amount: dh.price,
          defaultAmount: dh.price,
          isCustomAmount: false,
          reason: '',
        });
        setShowHallPriceEditor(false);
      }
      return;
    }
  };

  // Recommended venue hall rate based on selected date & session
  const recommendedHallIdx = useMemo(() => {
    if (!customerDetails.date) return null;
    const d = new Date(customerDetails.date);
    if (isNaN(d.getTime())) return null;
    const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const sessionLower = (customerDetails.timeSession || '').toLowerCase();
    const customTimeLower = (customerDetails.customTime || '').toLowerCase();
    const isDinner =
      sessionLower.includes('dinner') ||
      sessionLower.includes('6:00') ||
      sessionLower.includes('evening') ||
      customTimeLower.includes('dinner') ||
      customTimeLower.includes('evening');

    if (day >= 1 && day <= 4) {
      return 0; // Mon–Thu (£100)
    } else if (day === 5 || day === 0) {
      return 1; // Fri & Sun (£250)
    } else if (day === 6) {
      return isDinner ? 3 : 2; // Sat Dinner (£500) or Sat Lunch (£250)
    }
    return null;
  }, [customerDetails.date, customerDetails.timeSession, customerDetails.customTime]);

  // Total guests
  const totalGuests = Number(customerDetails.adults || 0) + Number(customerDetails.kids4to10 || 0) + Number(customerDetails.kidsUnder4 || 0);

  // Kids default price per head from settings (dynamically resolved for the selected package)
  const defaultKidsPrice = useMemo(() => {
    if (!currentPackage) return 0;
    const directKidsPrice = currentPackage && (currentPackage as any).kidsPrice ? Number((currentPackage as any).kidsPrice) : undefined;
    const pkgName = selectedPackageId === 'custom' ? 'Custom' : currentPackage?.name;
    return getKidsPriceFromList(kidsPricing, pkgName, directKidsPrice);
  }, [kidsPricing, currentPackage, selectedPackageId]);

  // Base Package rate per head
  const defaultPackagePricePerPerson = selectedPackageId === 'custom'
    ? Number(selectedPackageCustomPrice || 0)
    : (currentPackage?.pricePerPerson || 0);

  // ── Effective Prices (with custom overrides if set) ──
  const effectivePackagePrice = (packagePriceOverride !== null && packagePriceOverride !== '') ? Number(packagePriceOverride) : defaultPackagePricePerPerson;
  const effectiveKidsPrice = (kidsPriceOverride !== null && kidsPriceOverride !== '') ? Number(kidsPriceOverride) : defaultKidsPrice;
  const effectiveKidsUnder4Price = (kidsUnder4PriceOverride !== null && kidsUnder4PriceOverride !== '') ? Number(kidsUnder4PriceOverride) : 0;

  // Food calculations (zero by default if no package is chosen)
  const adultFoodTotal = selectedPackageId ? (Number(customerDetails.adults || 0) * effectivePackagePrice) : 0;
  const kidsFoodTotal = selectedPackageId ? (Number(customerDetails.kids4to10 || 0) * effectiveKidsPrice) : 0;
  const kidsUnder4FoodTotal = selectedPackageId ? (Number(customerDetails.kidsUnder4 || 0) * effectiveKidsUnder4Price) : 0;
  const foodBaseAmount = adultFoodTotal + kidsFoodTotal + kidsUnder4FoodTotal;

  // Live counters, extras, hall, and extra menu items totals
  const liveCountersTotal = selectedLiveCounters.reduce((acc, item) => acc + Number(item.price || 0), 0);
  const extrasTotal = selectedExtras.reduce((acc, item) => acc + Number(item.price || 0), 0);
  const hallTotal = selectedHallOption ? Number(selectedHallOption.amount || 0) : 0;
  const extraMenuItemsTotal = extraMenuItems.reduce((acc, item) => acc + Number(item.cost || 0), 0);
  const subtotalBeforeExtras = foodBaseAmount + hallTotal + liveCountersTotal + extrasTotal + extraMenuItemsTotal;

  // Extra charges total
  const extraChargesTotal = bookingExtraCharges.reduce((acc, item) => acc + Number(item.amount || 0), 0);

  // Discount Amount
  const discountAmount = useMemo(() => {
    if (discountType === 'none') return 0;
    const val = parseFloat(discountValue) || 0;
    if (discountType === 'percentage') {
      return Math.round(((subtotalBeforeExtras + extraChargesTotal) * val) / 100);
    }
    return val;
  }, [discountType, discountValue, subtotalBeforeExtras, extraChargesTotal]);

  // Grand Total
  const grandTotal = Math.max(0, subtotalBeforeExtras + extraChargesTotal - discountAmount);

  // Suggested Deposit
  const standardDeposit = useMemo(() => {
    if (!grandTotal || grandTotal <= 0) return 0;
    const rawVal = pricingDetails?.depositAmount ?? pricingDetails?.depositPercentage;
    let baseDeposit = 500;
    if (typeof rawVal === 'number' && rawVal > 0) {
      if (rawVal > 100) {
        baseDeposit = rawVal;
      } else {
        const pctAmt = Math.round((grandTotal * rawVal) / 100);
        baseDeposit = Math.max(500, pctAmt);
      }
    }
    return Math.min(grandTotal, Math.max(1, baseDeposit));
  }, [grandTotal, pricingDetails]);

  // ── Active Price Overrides List for Audit & Transparency ──
  const activePriceOverridesList = useMemo(() => {
    const list: { title: string; original: number; custom: number; reason: string; category: string }[] = [];
    if (packagePriceOverride !== null && packagePriceOverride !== '' && Number(packagePriceOverride) !== defaultPackagePricePerPerson) {
      list.push({
        title: `Package Rate (${currentPackage?.name || 'Package'})`,
        original: defaultPackagePricePerPerson,
        custom: Number(packagePriceOverride),
        reason: packagePriceOverrideReason.trim() || 'Custom rate override',
        category: 'Package / Adult',
      });
    }
    if (kidsPriceOverride !== null && kidsPriceOverride !== '' && Number(kidsPriceOverride) !== defaultKidsPrice) {
      list.push({
        title: 'Kids Rate (4–10 yrs)',
        original: defaultKidsPrice,
        custom: Number(kidsPriceOverride),
        reason: kidsPriceOverrideReason.trim() || 'Custom kids rate',
        category: 'Kids Rate',
      });
    }
    if (kidsUnder4PriceOverride !== null && kidsUnder4PriceOverride !== '' && Number(kidsUnder4PriceOverride) !== 0) {
      list.push({
        title: 'Infants Rate (Under 4 yrs)',
        original: 0,
        custom: Number(kidsUnder4PriceOverride),
        reason: kidsUnder4PriceOverrideReason.trim() || 'Custom infant fee',
        category: 'Infants Rate',
      });
    }
    if (selectedHallOption && (selectedHallOption.isCustomAmount || selectedHallOption.reason)) {
      list.push({
        title: `Hall Hire (${selectedHallOption.label})`,
        original: selectedHallOption.defaultAmount,
        custom: Number(selectedHallOption.amount || 0),
        reason: selectedHallOption.reason || 'Custom hall hire fee',
        category: 'Venue Hall Hire',
      });
    }
    selectedLiveCounters.forEach((lc) => {
      if (lc.isCustomPrice) {
        list.push({
          title: `Live Counter: ${lc.name}`,
          original: lc.defaultPrice,
          custom: Number(lc.price || 0),
          reason: lc.reason || 'Custom live counter price',
          category: 'Live Counters',
        });
      }
    });
    selectedExtras.forEach((ex) => {
      if (ex.isCustomPrice) {
        list.push({
          title: `Event Extra: ${ex.name}`,
          original: ex.defaultPrice,
          custom: Number(ex.price || 0),
          reason: ex.reason || 'Custom extra charge',
          category: 'Event Extras',
        });
      }
    });
    bookingExtraCharges.forEach((ec) => {
      if (ec.isCustomAmount || (ec.isPreset && ec.reason)) {
        list.push({
          title: ec.label,
          original: ec.defaultAmount ?? Number(ec.amount || 0),
          custom: Number(ec.amount || 0),
          reason: ec.reason || 'Custom surcharge / fee',
          category: 'Extra Charges / Delivery',
        });
      }
    });
    return list;
  }, [
    packagePriceOverride,
    defaultPackagePricePerPerson,
    packagePriceOverrideReason,
    currentPackage,
    kidsPriceOverride,
    defaultKidsPrice,
    kidsPriceOverrideReason,
    kidsUnder4PriceOverride,
    kidsUnder4PriceOverrideReason,
    selectedHallOption,
    selectedLiveCounters,
    selectedExtras,
    bookingExtraCharges,
  ]);

  // Sync default deposit when entering step 3 (Do NOT auto-select extra charges)
  const handleEnterStep3 = () => {
    if (!chargesInitialized) {
      setChargesInitialized(true);
    }

    const currentCustom = parseFloat(customDepositAmount) || 0;
    if (!customDepositAmount || customDepositAmount === '500' || currentCustom <= 0 || currentCustom >= grandTotal) {
      setCustomDepositAmount(standardDeposit.toString());
    }

    // Default due date: 14 days before event date
    if (customerDetails.date && !paymentDueDate) {
      try {
        const evDate = new Date(customerDetails.date);
        evDate.setDate(evDate.getDate() - 14);
        const today = new Date();
        const finalDue = evDate < today ? today : evDate;
        setPaymentDueDate(finalDue.toISOString().split('T')[0]);
      } catch (e) {}
    }
  };

  // Amount Paid based on Choice
  const amountPaid = useMemo(() => {
    if (paymentChoice === 'full') return grandTotal;
    if (paymentChoice === 'pending') return 0;
    const parsed = parseFloat(customDepositAmount) || 0;
    return Math.max(0, Math.min(grandTotal, parsed));
  }, [paymentChoice, grandTotal, customDepositAmount]);

  const remainingBalance = Math.max(0, grandTotal - amountPaid);

  // Validation flags for advance deposit
  const customDepositNum = parseFloat(customDepositAmount) || 0;
  const isDepositOverLimit = paymentChoice === 'advance' && grandTotal > 0 && customDepositNum >= grandTotal;
  const isDepositUnderLimit = paymentChoice === 'advance' && customDepositNum <= 0;
  const isAdvanceDepositInvalid = isDepositOverLimit || isDepositUnderLimit;

  // ── Helper to render dish checklist with custom dishes & inline addition ──
  const renderDishChecklist = (
    prefix: string,
    categoryKey: keyof typeof customDishes,
    stockDishes: string[],
    selectedDishes: string[],
    setSelectedDishes: React.Dispatch<React.SetStateAction<string[]>>,
    theme: 'emerald' | 'red' | 'gray' = 'emerald'
  ) => {
    const allItems = [...stockDishes, ...customDishes[categoryKey]];
    const themeBg = theme === 'emerald' ? 'hover:bg-emerald-50' : theme === 'red' ? 'hover:bg-red-50' : 'hover:bg-gray-50';
    const textChecked = theme === 'emerald' ? 'text-emerald-950 font-semibold' : theme === 'red' ? 'text-red-950 font-semibold' : 'text-gray-900 font-semibold';
    const inputKey = `${prefix}_${categoryKey}`;

    return (
      <div className="space-y-2">
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {allItems.map((dish) => {
            const checked = selectedDishes.includes(dish);
            const isCustom = customDishes[categoryKey].includes(dish);
            return (
              <label key={dish} className={`flex items-center justify-between text-xs text-gray-700 cursor-pointer p-1 rounded ${themeBg}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(selectedDishes, setSelectedDishes, dish)}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className={checked ? textChecked : ''}>{dish}</span>
                </div>
                {isCustom && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    Custom
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div className="pt-2 border-t border-gray-100 flex gap-1.5">
          <input
            type="text"
            placeholder="+ Custom dish name..."
            value={newCustomDishInputs[inputKey] || ''}
            onChange={(e) => setNewCustomDishInputs((prev) => ({ ...prev, [inputKey]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const val = (newCustomDishInputs[inputKey] || '').trim();
                if (val) {
                  handleAddCustomDish(categoryKey, val);
                  setNewCustomDishInputs((prev) => ({ ...prev, [inputKey]: '' }));
                }
              }
            }}
            className="flex-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <button
            type="button"
            onClick={() => {
              const val = (newCustomDishInputs[inputKey] || '').trim();
              if (val) {
                handleAddCustomDish(categoryKey, val);
                setNewCustomDishInputs((prev) => ({ ...prev, [inputKey]: '' }));
              }
            }}
            className="px-2.5 py-1 text-xs font-bold text-white rounded-lg shadow-2xs transition-colors whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
          >
            Add
          </button>
        </div>
      </div>
    );
  };

  // ── Validation for Step 1 ──
  const validateStep1 = () => {
    const errors: Record<string, string> = {};
    if (!customerDetails.name.trim()) errors.name = 'Customer full name is required.';
    if (!customerDetails.phone.trim()) errors.phone = 'Phone number is required.';
    if (phoneError) errors.phone = phoneError;
    if (!customerDetails.eventType) errors.eventType = 'Event type is required.';
    if (!customerDetails.date) errors.date = 'Event date is required.';
    if (customerDetails.adults === '' || Number(customerDetails.adults) < 1) errors.adults = 'At least 1 adult guest required.';

    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextFromStep1 = () => {
    if (validateStep1()) {
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextFromStep2 = () => {
    handleEnterStep3();
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Dish toggle helper
  const toggleItem = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    setList((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  };

  // ── Chef & Invoices PDF Helpers ──
  const buildCurrentDraftBooking = (isDepositOnly = false) => {
    const auditNotes = activePriceOverridesList.map(
      (item) => `${item.title}: £${item.original} → £${item.custom} (Reason: ${item.reason})`
    );

    return {
      id: 'DRAFT-' + (customerDetails.date ? customerDetails.date.replace(/-/g, '') : 'EST'),
      name: customerDetails.name.trim() || 'Valued Customer',
      phone: customerDetails.phone.trim() || 'N/A',
      email: customerDetails.email.trim() || 'N/A',
      eventType: customerDetails.eventType === 'Other' ? customerDetails.customEventType : customerDetails.eventType,
      date: customerDetails.date,
      time: customerDetails.timeSession === 'custom' ? customerDetails.customTime : customerDetails.timeSession,
      guests: totalGuests,
      adults: Number(customerDetails.adults),
      kids4to10: Number(customerDetails.kids4to10),
      kidsUnder4: Number(customerDetails.kidsUnder4),
      package: currentPackage?.name || (selectedPackageId === 'custom' ? 'Custom Package' : (selectedHallOption ? 'Venue Hire Only' : 'No Food Package')),
      selectedMenu: currentPackage?.name || (selectedPackageId === 'custom' ? 'Custom Package' : (selectedHallOption ? 'Venue Hire Only' : 'No Food Package')),
      pricePerPerson: selectedPackageId ? effectivePackagePrice : 0,
      kidsPricePerPerson: selectedPackageId ? effectiveKidsPrice : 0,
      kidsUnder4PricePerPerson: selectedPackageId ? effectiveKidsUnder4Price : 0,
      baseAmount: foodBaseAmount,
      deposit: amountPaid,
      depositPaid: isDepositOnly || paymentChoice !== 'pending',
      finalPaymentPaid: !isDepositOnly && paymentChoice === 'full',
      status: paymentChoice === 'full' ? 'completed' : isDepositOnly ? 'deposit_confirmed' : 'new_enquiry',
      notes: customerDetails.notes.trim() + (auditNotes.length > 0 ? (customerDetails.notes.trim() ? '\n\n' : '') + '🏷️ Price Adjustments:\n' + auditNotes.join('\n') : ''),
      priceOverrides: {
        package: packagePriceOverride !== null ? {
          original: defaultPackagePricePerPerson,
          custom: effectivePackagePrice,
          reason: packagePriceOverrideReason.trim() || 'Custom rate override',
        } : null,
        kids4to10: kidsPriceOverride !== null ? {
          original: defaultKidsPrice,
          custom: effectiveKidsPrice,
          reason: kidsPriceOverrideReason.trim() || 'Custom kids rate',
        } : null,
        kidsUnder4: kidsUnder4PriceOverride !== null ? {
          original: 0,
          custom: effectiveKidsUnder4Price,
          reason: kidsUnder4PriceOverrideReason.trim() || 'Custom infant rate',
        } : null,
        hallHire: selectedHallOption && (selectedHallOption.isCustomAmount || selectedHallOption.reason) ? {
          label: selectedHallOption.label,
          original: selectedHallOption.defaultAmount,
          custom: selectedHallOption.amount,
          reason: selectedHallOption.reason || 'Custom hall fee',
        } : null,
        liveCounters: selectedLiveCounters.filter((l) => l.isCustomPrice),
        extras: selectedExtras.filter((e) => e.isCustomPrice),
        extraCharges: bookingExtraCharges.filter((c) => c.isCustomAmount || c.reason),
      },
      customPriceReasons: auditNotes,
      includeVenueHall: !!selectedHallOption,
      venueHallCharge: selectedHallOption ? {
        label: selectedHallOption.label,
        amount: selectedHallOption.amount,
        isCustom: selectedHallOption.isCustomAmount,
        reason: selectedHallOption.reason,
      } : null,
      extraCharges: [
        ...(selectedHallOption ? [{
          label: `Hall Hire: ${selectedHallOption.label}${selectedHallOption.reason ? ` (${selectedHallOption.reason})` : ''}`,
          amount: selectedHallOption.amount,
          isPreset: true,
        }] : []),
        ...selectedLiveCounters.map((l) => ({
          label: `Live Counter: ${l.name}${l.reason ? ` (${l.reason})` : ''}`,
          amount: l.price,
          isPreset: true,
        })),
        ...selectedExtras.map((e) => ({
          label: `Extra: ${e.name}${e.reason ? ` (${e.reason})` : ''}`,
          amount: e.price,
          isPreset: true,
        })),
        ...extraMenuItems.map((item) => ({
          label: `Extra Menu: ${item.name}${item.description ? ` (${item.description})` : ''}`,
          amount: item.cost,
          isPreset: false,
        })),
        ...bookingExtraCharges.map((c) => ({
          label: `${c.label}${c.reason ? ` (${c.reason})` : ''}`,
          amount: c.amount,
          isPreset: c.isPreset ?? false,
        })),
      ],
      selectedDishes: {
        vegStarters: selectedVegStarters,
        nonVegStarters: selectedNonVegStarters,
        vegMains: selectedVegMains,
        nonVegMains: selectedNonVegMains,
        sundries: selectedSundries,
        desserts: selectedDesserts,
        extraMenuItems: extraMenuItems.map((item) => ({
          name: item.name,
          description: item.description,
          cost: item.cost,
        })),
      },
      enquiryDate: new Date().toISOString().split('T')[0],
      paymentMethodDeposit: paymentMethod,
      paymentMethodFinal: paymentMethod,
    };
  };

  const handleGenerateCurrentChefPDF = () => {
    generateChefMenuPDF(buildCurrentDraftBooking(false));
  };

  const handleOpenCurrentChefWhatsApp = () => {
    openChefWhatsApp(buildCurrentDraftBooking(false));
  };

  const handleGenerateCurrentInvoice = (isDepositOnly = false) => {
    if (onGenerateInvoice) {
      onGenerateInvoice(buildCurrentDraftBooking(isDepositOnly), isDepositOnly);
    }
  };

  // Extra Charges toggle
  const toggleConfiguredCharge = (charge: ConfiguredExtraCharge) => {
    const exists = bookingExtraCharges.some((c) => c.label === charge.label);
    if (exists) {
      setBookingExtraCharges((prev) => prev.filter((c) => c.label !== charge.label));
    } else {
      const amt = charge.type === 'percentage'
        ? Math.round((subtotalBeforeExtras * charge.amount) / 100)
        : charge.amount;
      setBookingExtraCharges((prev) => [
        ...prev,
        { label: charge.label, amount: amt, defaultAmount: amt, isPreset: true },
      ]);
    }
  };

  const handleAddCustomCharge = () => {
    if (!customChargeLabel.trim()) return;
    const amt = parseFloat(customChargeAmount);
    if (isNaN(amt) || amt <= 0) return;

    setBookingExtraCharges((prev) => [
      ...prev,
      {
        label: customChargeLabel.trim(),
        amount: amt,
        defaultAmount: amt,
        isPreset: false,
        isCustomAmount: true,
        reason: customChargeReason.trim() || 'Custom charge added by admin',
      },
    ]);
    setCustomChargeLabel('');
    setCustomChargeAmount('');
    setCustomChargeReason('');
  };

  const handleRemoveExtraCharge = (index: number) => {
    setBookingExtraCharges((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Place & Confirm Order ──
  const handlePlaceOrder = async () => {
    if (paymentChoice === 'advance') {
      const parsedDeposit = parseFloat(customDepositAmount) || 0;
      if (parsedDeposit <= 0) {
        setCenterModal({
          title: 'Invalid Advance Amount',
          message: 'Please enter a valid advance deposit amount greater than £0.',
          type: 'error',
        });
        return;
      }
      if (grandTotal > 0 && parsedDeposit >= grandTotal) {
        setCenterModal({
          title: 'Advance Exceeds Total',
          message: `Advance deposit (£${parsedDeposit.toLocaleString()}) cannot equal or exceed the total booking amount (£${grandTotal.toLocaleString()}). If the customer has paid in full, please select the "Pay Full Amount" option.`,
          type: 'error',
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const isEditing = Boolean(editingBooking?.id);
      const bookingRefId = isEditing ? editingBooking.id : `BK-${Date.now().toString().slice(-6)}`;
      const fullPhone = customerDetails.phone.startsWith('+')
        ? customerDetails.phone
        : `+44${customerDetails.phone.replace(/^0/, '').replace(/\s/g, '')}`;

      const finalTime = customerDetails.timeSession === 'custom'
        ? customerDetails.customTime || '12:00 PM'
        : customerDetails.timeSession;

      const finalEventType = customerDetails.eventType === 'Other'
        ? customerDetails.customEventType || 'Other Event'
        : customerDetails.eventType;

      const isDepositPaid = paymentChoice === 'advance' || paymentChoice === 'full';
      const isFinalPaid = paymentChoice === 'full';

      const finalStatus = isEditing
        ? (editingBooking.status || (isFinalPaid ? 'completed' : isDepositPaid ? 'deposit_confirmed' : 'deposit_pending'))
        : (isFinalPaid ? 'completed' : isDepositPaid ? 'deposit_confirmed' : 'deposit_pending');

      const auditNotes = activePriceOverridesList.map(
        (item) => `${item.title}: £${item.original} → £${item.custom} (Reason: ${item.reason})`
      );

      const bookingRecord: Record<string, any> = {
        id: bookingRefId,
        name: customerDetails.name.trim(),
        phone: fullPhone,
        email: customerDetails.email.trim() || 'N/A',
        eventType: finalEventType,
        date: customerDetails.date,
        time: finalTime,
        timeOfDay: finalTime,
        guests: totalGuests,
        adults: Number(customerDetails.adults) || 0,
        kids4to10: Number(customerDetails.kids4to10) || 0,
        kidsUnder4: Number(customerDetails.kidsUnder4) || 0,
        package: currentPackage?.name || (selectedPackageId === 'custom' ? 'Custom Package' : (selectedHallOption ? 'Venue Hire Only' : 'No Food Package')),
        selectedMenu: currentPackage?.name || (selectedPackageId === 'custom' ? 'Custom Package' : (selectedHallOption ? 'Venue Hire Only' : 'No Food Package')),
        pricePerPerson: selectedPackageId ? effectivePackagePrice : 0,
        kidsPricePerPerson: selectedPackageId ? effectiveKidsPrice : 0,
        kidsUnder4PricePerPerson: selectedPackageId ? effectiveKidsUnder4Price : 0,
        baseAmount: foodBaseAmount,
        deposit: amountPaid,
        depositPaid: isDepositPaid,
        finalPaymentPaid: isFinalPaid,
        status: finalStatus,
        dueDate: paymentDueDate || customerDetails.date,
        ...(isFinalPaid ? { orderClosedAt: new Date().toISOString() } : {}),
        notes: customerDetails.notes.trim() + (auditNotes.length > 0 ? (customerDetails.notes.trim() ? '\n\n' : '') + '🏷️ Price Adjustments:\n' + auditNotes.join('\n') : (paymentReference ? `\nPayment Ref: ${paymentReference}` : '')),
        priceOverrides: {
          package: packagePriceOverride !== null ? {
            original: defaultPackagePricePerPerson,
            custom: effectivePackagePrice,
            reason: packagePriceOverrideReason.trim() || 'Custom rate override',
          } : null,
          kids4to10: kidsPriceOverride !== null ? {
            original: defaultKidsPrice,
            custom: effectiveKidsPrice,
            reason: kidsPriceOverrideReason.trim() || 'Custom kids rate',
          } : null,
          kidsUnder4: kidsUnder4PriceOverride !== null ? {
            original: 0,
            custom: effectiveKidsUnder4Price,
            reason: kidsUnder4PriceOverrideReason.trim() || 'Custom infant rate',
          } : null,
          hallHire: selectedHallOption && (selectedHallOption.isCustomAmount || selectedHallOption.reason) ? {
            label: selectedHallOption.label,
            original: selectedHallOption.defaultAmount,
            custom: selectedHallOption.amount,
            reason: selectedHallOption.reason || 'Custom hall fee',
          } : null,
          liveCounters: selectedLiveCounters.filter((l) => l.isCustomPrice),
          extras: selectedExtras.filter((e) => e.isCustomPrice),
          extraCharges: bookingExtraCharges.filter((c) => c.isCustomAmount || c.reason),
        },
        customPriceReasons: auditNotes,
        includeVenueHall: !!selectedHallOption,
        venueHallCharge: selectedHallOption ? {
          label: selectedHallOption.label,
          amount: selectedHallOption.amount,
          isCustom: selectedHallOption.isCustomAmount,
          reason: selectedHallOption.reason,
        } : null,
        extraCharges: [
          ...(selectedHallOption ? [{
            label: `Hall Hire: ${selectedHallOption.label}${selectedHallOption.reason ? ` (${selectedHallOption.reason})` : ''}`,
            amount: selectedHallOption.amount,
            isPreset: true,
          }] : []),
          ...selectedLiveCounters.map((l) => ({
            label: `Live Counter: ${l.name}${l.reason ? ` (${l.reason})` : ''}`,
            amount: l.price,
            isPreset: true,
          })),
          ...selectedExtras.map((e) => ({
            label: `Extra: ${e.name}${e.reason ? ` (${e.reason})` : ''}`,
            amount: e.price,
            isPreset: true,
          })),
          ...extraMenuItems.map((item) => ({
            label: `Extra Menu: ${item.name}${item.description ? ` (${item.description})` : ''}`,
            amount: item.cost,
            isPreset: false,
          })),
          ...bookingExtraCharges.map((c) => ({
            label: `${c.label}${c.reason ? ` (${c.reason})` : ''}`,
            amount: c.amount,
            isPreset: c.isPreset ?? false,
          })),
        ],
        selectedDishes: {
          vegStarters: selectedVegStarters,
          nonVegStarters: selectedNonVegStarters,
          vegMains: selectedVegMains,
          nonVegMains: selectedNonVegMains,
          sundries: selectedSundries,
          desserts: selectedDesserts,
          extraMenuItems: extraMenuItems.map((item) => ({
            name: item.name,
            description: item.description,
            cost: item.cost,
          })),
        },
        createdAt: isEditing && editingBooking.createdAt ? editingBooking.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        enquiryDate: isEditing && editingBooking.enquiryDate ? editingBooking.enquiryDate : new Date().toISOString().split('T')[0],
      };

      if (isDepositPaid && paymentMethod) {
        bookingRecord.paymentMethodDeposit = paymentMethod;
      }
      if (isFinalPaid && paymentMethod) {
        bookingRecord.paymentMethodFinal = paymentMethod;
      }
      if (discountType !== 'none' && discountAmount > 0) {
        bookingRecord.discount = {
          type: discountType,
          value: parseFloat(discountValue) || 0,
          reason: discountReason.trim() || 'Special promotion',
        };
      }

      // Deep clean to ensure absolutely no undefined values reach Firestore
      const cleanRecord = JSON.parse(JSON.stringify(bookingRecord));

      // 1. Write to booking_requests (the primary collection consumed across the dashboard)
      await setDoc(doc(db, 'booking_requests', bookingRefId), cleanRecord, { merge: true });

      // 2. Mirror to bookings collection if permitted
      try {
        await setDoc(doc(db, 'bookings', bookingRefId), cleanRecord, { merge: true });
      } catch (mirrorErr) {
        console.warn('Mirror to bookings skipped:', mirrorErr);
      }

      setCreatedBooking(cleanRecord);
      setCurrentStep(4);
      if (isEditing && onBookingUpdated) {
        onBookingUpdated(cleanRecord);
      } else if (onBookingCreated) {
        onBookingCreated(bookingRefId);
      }
    } catch (error: any) {
      console.error('Error placing manual booking:', error);
      setCenterModal({
        title: 'Booking Notice',
        message: error?.message || 'Failed to place booking. Please check connection and try again.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setCustomerDetails({
      name: '',
      phone: '',
      email: '',
      eventType: '',
      customEventType: '',
      date: '',
      timeSession: '',
      customTime: '',
      adults: '',
      kids4to10: 0,
      kidsUnder4: 0,
      notes: '',
    });
    setSelectedPackageId('');
    setSelectedPackageCustomPrice('');
    setPackagePriceOverride(null);
    setPackagePriceOverrideReason('');
    setShowPackagePriceEditor(false);
    setKidsPriceOverride(null);
    setKidsPriceOverrideReason('');
    setShowKidsPriceEditor(false);
    setKidsUnder4PriceOverride(null);
    setKidsUnder4PriceOverrideReason('');
    setShowKidsUnder4PriceEditor(false);
    setSelectedVegStarters([]);
    setSelectedNonVegStarters([]);
    setSelectedVegMains([]);
    setSelectedNonVegMains([]);
    setSelectedLiveCounters([]);
    setSelectedExtras([]);
    setSelectedSundries([]);
    setSelectedDesserts([]);
    setSelectedHallOption(null);
    setExtraMenuItems([]);
    setNewExtraItemName('');
    setNewExtraItemDescription('');
    setNewExtraItemCost('');
    setShowHallPriceEditor(false);
    setBookingExtraCharges([]);
    setDiscountType('none');
    setDiscountValue('');
    setDiscountReason('');
    setPaymentChoice('advance');
    setCreatedBooking(null);
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isDateBlocked = customerDetails.date && blockedDates.includes(customerDetails.date);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ── Header & Stepper ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow"
                style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
              >
                <Icon name={editingBooking ? "PencilSquareIcon" : "PlusCircleIcon"} size={20} />
              </span>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingBooking ? `Amend Booking #${editingBooking.id}` : 'Manual Booking Creation'}
                  </h2>
                  {editingBooking && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      Edit Mode
                    </span>
                  )}
                  {editingBooking && onCancelEdit && (
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      ← Back to Bookings
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {editingBooking
                    ? `Amending details for ${customerDetails.name || editingBooking.name}. All fields are enabled and changes can be saved or adjusted at any time.`
                    : 'Create and confirm bespoke bookings with custom price overrides, reasons, menu selections, advance payments, and automatic calendar sync.'}
                </p>
              </div>
            </div>
          </div>

          {currentStep !== 4 && (
            <div className="flex items-center gap-2">
              {activePriceOverridesList.length > 0 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                  <Icon name="TagIcon" size={13} className="text-amber-700" />
                  {activePriceOverridesList.length} Custom {activePriceOverridesList.length === 1 ? 'Price' : 'Prices'} Active
                </span>
              )}
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                Step {currentStep} of 3
              </span>
            </div>
          )}
        </div>

        {/* Progress Bar / Stepper Tabs */}
        <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-5">
          {[
            { step: 1, title: '1. Customer Details', desc: 'Contact & Guest Pricing' },
            { step: 2, title: '2. Menu & Packages', desc: 'Dishes, Package Rate & Hall' },
            { step: 3, title: '3. Pricing & Payment', desc: 'Extra Charges & Confirm' },
          ].map((s) => {
            const isCurrent = currentStep === s.step;
            const isCompleted = currentStep > s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => {
                  if (s.step === 1) setCurrentStep(1);
                  if (s.step === 2) setCurrentStep(2);
                  if (s.step === 3) {
                    handleEnterStep3();
                    setCurrentStep(3);
                  }
                }}
                className={`text-left p-3 rounded-xl border transition-all ${
                  isCurrent
                    ? 'border-amber-400 bg-amber-50/60 shadow-sm ring-1 ring-amber-300'
                    : isCompleted
                    ? 'border-emerald-200 bg-emerald-50/30 text-gray-700 hover:border-emerald-300'
                    : 'border-gray-200 bg-gray-50/60 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      isCurrent
                        ? 'bg-[#C8860A] text-white'
                        : isCompleted
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {isCompleted ? '✓' : s.step}
                  </span>
                  <span className={`text-xs font-bold ${isCurrent ? 'text-amber-900' : isCompleted ? 'text-gray-900' : 'text-gray-500'}`}>
                    {s.title}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-1 pl-7 hidden sm:block truncate">{s.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── STEP 1: Customer & Event Details ── */}
      {currentStep === 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6 animate-fade-in">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Icon name="UserIcon" size={18} style={{ color: '#C8860A' }} />
              Step 1: Customer &amp; Event Details
            </h3>
            <span className="text-xs text-gray-400">* Required fields</span>
          </div>

          {/* Customer Details Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Customer Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sarah Jenkins"
                value={customerDetails.name}
                onChange={(e) => setCustomerDetails({ ...customerDetails, name: e.target.value })}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  step1Errors.name ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200'
                }`}
              />
              {step1Errors.name && <p className="text-xs text-red-500 mt-1">{step1Errors.name}</p>}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                placeholder="e.g. 07700 900101 or +447700900101"
                value={customerDetails.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  phoneError || step1Errors.phone ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200'
                }`}
              />
              {(phoneError || step1Errors.phone) && (
                <p className="text-xs text-red-500 mt-1">{phoneError || step1Errors.phone}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                placeholder="e.g. sarah@example.com"
                value={customerDetails.email}
                onChange={(e) => setCustomerDetails({ ...customerDetails, email: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Event Details Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Event Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Event Type *
              </label>
              <select
                value={customerDetails.eventType}
                onChange={(e) => setCustomerDetails({ ...customerDetails, eventType: e.target.value })}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium ${step1Errors.eventType ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200'}`}
              >
                <option value="">-- Select Event Type --</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {step1Errors.eventType && <p className="text-xs text-red-500 mt-1">{step1Errors.eventType}</p>}
              {customerDetails.eventType === 'Other' && (
                <input
                  type="text"
                  placeholder="Specify event type"
                  value={customerDetails.customEventType}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, customEventType: e.target.value })}
                  className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-gray-50"
                />
              )}
            </div>

            {/* Event Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Event Date *
              </label>
              <input
                type="date"
                required
                value={customerDetails.date}
                onChange={(e) => setCustomerDetails({ ...customerDetails, date: e.target.value })}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  isDateBlocked ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200'
                }`}
              />
              {isDateBlocked && (
                <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
                  <Icon name="ExclamationTriangleIcon" size={13} />
                  Warning: This date is marked as blocked in Settings!
                </p>
              )}
              {step1Errors.date && <p className="text-xs text-red-500 mt-1">{step1Errors.date}</p>}
            </div>

            {/* Time / Session */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Session / Timing
              </label>
              <select
                value={customerDetails.timeSession}
                onChange={(e) => setCustomerDetails({ ...customerDetails, timeSession: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
              >
                <option value="">-- Select Time / Session --</option>
                {TIME_SESSIONS.map((ts) => (
                  <option key={ts.value} value={ts.value}>
                    {ts.label}
                  </option>
                ))}
              </select>
              {customerDetails.timeSession === 'custom' && (
                <input
                  type="text"
                  placeholder="e.g. 2:00 PM – 8:00 PM"
                  value={customerDetails.customTime}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, customTime: e.target.value })}
                  className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-gray-50"
                />
              )}
            </div>
          </div>

          {/* ── Package Selection & Venue Hire (in Step 1) ── */}
          <div className="bg-amber-50/40 border border-amber-200/60 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/50 pb-3">
              <div>
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Icon name="SparklesIcon" size={16} />
                  Select Banquet Package (Optional / None by Default)
                </span>
                <p className="text-[11px] text-amber-800/80 mt-0.5">
                  Click a package to select or click again to remove. You can also create a custom package.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${selectedPackageId ? 'bg-amber-200/70 text-amber-950 border-amber-300' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {selectedPackageId ? `Selected: ${currentPackage?.name || 'Custom'} · £${effectivePackagePrice}/pp` : 'No Package Selected'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddPackageModal(true)}
                  className="text-xs font-bold text-[#C8860A] bg-white hover:bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs"
                >
                  <Icon name="PlusIcon" size={12} />
                  <span>Custom Package</span>
                </button>
              </div>
            </div>

            {/* Package Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {allBanquetPackages.map((pkg) => {
                const isSelected = selectedPackageId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    onClick={() => {
                      if (selectedPackageId === pkg.id) {
                        setSelectedPackageId('');
                        setPackagePriceOverride(null);
                        setPackagePriceOverrideReason('');
                      } else {
                        setSelectedPackageId(pkg.id);
                        setPackagePriceOverride(null);
                        setPackagePriceOverrideReason('');
                      }
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-400 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-amber-300 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-bold text-gray-900 text-xs leading-tight">{pkg.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPackageModal(pkg);
                              setPackageForm({
                                name: pkg.name,
                                pricePerPerson: String(pkg.pricePerPerson),
                                kidsPrice: String((pkg as any).kidsPrice || getKidsPriceFromList(kidsPricing, pkg.name)),
                                tag: pkg.tag || '',
                                guestLabel: pkg.guestLabel || '',
                                vegStarters: pkg.starters?.veg || 2,
                                nonVegStarters: pkg.starters?.nonVeg || 2,
                                vegMains: pkg.mains?.veg || 2,
                                nonVegMains: pkg.mains?.nonVeg || 2,
                                desserts: (pkg.desserts || []).join(', '),
                                drinks: (pkg.drinks || []).join(', '),
                              });
                            }}
                            className="p-0.5 text-gray-400 hover:text-amber-700 rounded"
                            title="Edit this package"
                          >
                            <Icon name="PencilSquareIcon" size={11} />
                          </button>
                          <div
                            className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${
                              isSelected ? 'border-amber-600 bg-amber-600 text-white' : 'border-gray-300'
                            }`}
                          >
                            {isSelected && <Icon name="CheckIcon" size={10} />}
                          </div>
                        </div>
                      </div>
                      {pkg.tag && (
                        <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                          {pkg.tag}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-baseline justify-between text-xs">
                      <div>
                        <span className="text-sm font-extrabold text-[#C8860A]">
                          £{pkg.pricePerPerson}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-0.5">/adult</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100/70 text-amber-900 border border-amber-200">
                        Kids: £{(pkg as any).kidsPrice || getKidsPriceFromList(kidsPricing, pkg.name)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Venue Hire & Hall Charges inside Packages Place ── */}
            <div className="pt-3 border-t border-amber-200/60 bg-white p-4 rounded-xl border border-amber-200/90 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-[#C8860A] flex items-center justify-center font-bold flex-shrink-0">
                    <Icon name="BuildingOfficeIcon" size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                        Venue Hall Hire &amp; Dry Hire
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        Optional / £0 by Default
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Select a standard banquet hall rate, dry hire session, or add a bespoke fee.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {selectedHallOption && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-950 border border-amber-300 flex items-center gap-1">
                      <span>Applied: £{Number(selectedHallOption.amount || 0).toLocaleString()}</span>
                      {selectedHallOption.isCustomAmount && selectedHallOption.defaultAmount > 0 && selectedHallOption.amount !== selectedHallOption.defaultAmount && (
                        <span className="line-through text-gray-400 font-normal ml-1">
                          £{selectedHallOption.defaultAmount.toLocaleString()}
                        </span>
                      )}
                    </span>
                  )}

                  {selectedHallOption && (
                    <button
                      type="button"
                      onClick={() => setShowHallPriceEditor(!showHallPriceEditor)}
                      className="text-xs font-bold text-[#C8860A] bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      <Icon name="PencilSquareIcon" size={12} />
                      <span>{showHallPriceEditor ? 'Close' : (selectedHallOption.isCustomAmount ? 'Custom Fee' : 'Edit Fee')}</span>
                    </button>
                  )}

                  {selectedHallOption && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedHallOption(null);
                        setShowHallPriceEditor(false);
                      }}
                      className="text-xs text-rose-600 hover:text-rose-700 hover:underline font-semibold px-1"
                    >
                      Remove (£0)
                    </button>
                  )}
                </div>
              </div>

              {/* Dropdown & Quick Status Display */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Venue Hire Option:
                  </label>
                  <select
                    value={venueHireSelectValue}
                    onChange={(e) => handleVenueHireSelectChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                  >
                    <option value="">-- No Venue Hire (£0 / Offsite Catering / Included in Package) --</option>
                    <optgroup label="🏛️ Standard Banquet Hall Hire">
                      {venueHallCharges.map((hall, idx) => {
                        const priceMatch = hall.charge.match(/£(\d+)/);
                        const defaultAmount = priceMatch ? parseInt(priceMatch[1]) : 250;
                        const isRecommended = recommendedHallIdx === idx;
                        return (
                          <option key={`hall_${idx}`} value={`hall_${idx}`}>
                            {hall.day}{hall.note ? ` (${hall.note})` : ''} — £{defaultAmount}{isRecommended ? ' ⭐ (Matches Date)' : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="🔑 Dry Hire Sessions (Hall-Only Hire)">
                      {dryHirePrices.map((dh, idx) => (
                        <option key={`dry_${idx}`} value={`dry_${idx}`}>
                          Dry Hire: {dh.day} ({dh.session}) — £{dh.price.toLocaleString()}
                        </option>
                      ))}
                    </optgroup>
                    <option value="custom">✏️ Custom Venue Hire Fee...</option>
                  </select>
                </div>

                <div className="pt-0 lg:pt-6">
                  {selectedHallOption ? (
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-300 text-xs text-amber-950 font-medium flex items-center justify-between">
                      <div className="truncate mr-2">
                        <span className="font-bold">{selectedHallOption.label}</span>
                        {selectedHallOption.reason && (
                          <div className="text-[10px] text-amber-800/80 truncate">
                            Note: {selectedHallOption.reason}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-extrabold text-[#C8860A] whitespace-nowrap">
                        +£{Number(selectedHallOption.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500 flex items-center gap-2">
                      <Icon name="CheckCircleIcon" size={16} className="text-emerald-600 flex-shrink-0" />
                      <span>No hall fee applied (£0). Catering-only or included in package.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Inline Custom Rate / Override Drawer */}
              {(venueHireSelectValue === 'custom' || (showHallPriceEditor && selectedHallOption)) && selectedHallOption && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2.5 text-xs shadow-xs animate-fade-in">
                  <div className="flex items-center justify-between border-b border-amber-200/60 pb-1.5">
                    <span className="font-bold text-amber-950 flex items-center gap-1.5">
                      <Icon name="PencilSquareIcon" size={13} className="text-[#C8860A]" />
                      {venueHireSelectValue === 'custom' ? 'Custom Venue Hire Details' : `Override Fee: ${selectedHallOption.label}`}
                    </span>
                    {selectedHallOption.isCustomAmount && selectedHallOption.defaultAmount > 0 && venueHireSelectValue !== 'custom' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHallOption({
                            ...selectedHallOption,
                            amount: selectedHallOption.defaultAmount,
                            isCustomAmount: false,
                            reason: '',
                          });
                        }}
                        className="text-[10px] text-red-600 hover:underline font-semibold"
                      >
                        Reset to £{selectedHallOption.defaultAmount}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {venueHireSelectValue === 'custom' && (
                      <div>
                        <label className="block text-[10px] font-semibold text-amber-900 mb-1">
                          Venue Hire Description *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Bespoke Evening Hall Hire"
                          value={selectedHallOption.label === 'Custom Venue Hire' ? '' : selectedHallOption.label}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedHallOption({
                              ...selectedHallOption,
                              label: val.trim() ? val : 'Custom Venue Hire',
                            });
                          }}
                          className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-900 font-medium focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-semibold text-amber-900 mb-1">
                        Agreed Fee Amount (£) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">£</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={selectedHallOption.amount === 0 ? '' : selectedHallOption.amount}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
                            setSelectedHallOption({
                              ...selectedHallOption,
                              amount: val,
                              isCustomAmount: true,
                            });
                          }}
                          className="w-full pl-6 pr-2.5 py-1.5 border border-amber-300 rounded-lg text-xs font-bold text-gray-900 bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className={venueHireSelectValue === 'custom' ? 'sm:col-span-2' : ''}>
                      <label className="block text-[10px] font-semibold text-amber-900 mb-1">
                        Reason / Notes (Optional):
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Special negotiated rate or client discount"
                        value={selectedHallOption.reason || ''}
                        onChange={(e) => {
                          setSelectedHallOption({
                            ...selectedHallOption,
                            reason: e.target.value,
                          });
                        }}
                        className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Guest Breakdown & Head Rates ── */}
          <div className="bg-amber-50/40 border border-amber-200/60 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/50 pb-3">
              <div>
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Icon name="UsersIcon" size={16} />
                  Guest Count &amp; Head Rates
                </span>
                <p className="text-[11px] text-amber-800/80 mt-0.5">
                  Adult and Kids rates automatically update based on the selected package above. Click &quot;Edit Rate&quot; to override any per-head price.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-200/70 text-amber-950 border border-amber-300">
                Total Guests: {totalGuests}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Adult Guests */}
              <div className="bg-white p-3.5 rounded-xl border border-gray-200 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800">
                    Adult Guests (Full Price) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPackagePriceEditor(!showPackagePriceEditor)}
                    className="text-[11px] font-semibold text-[#C8860A] hover:underline flex items-center gap-1"
                  >
                    <Icon name="PencilSquareIcon" size={12} />
                    {packagePriceOverride !== null ? 'Custom Rate' : 'Edit Rate'}
                  </button>
                </div>
                <input
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 100"
                  value={customerDetails.adults}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, adults: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                  className={`w-full border rounded-xl px-3 py-2 text-sm bg-gray-50 font-bold text-gray-900 ${step1Errors.adults ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200'}`}
                />
                {step1Errors.adults && <p className="text-xs text-red-500 mt-0.5">{step1Errors.adults}</p>}
                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                  <span>Rate:</span>
                  <span className="font-bold text-amber-800">
                    £{effectivePackagePrice}/adult
                    {packagePriceOverride !== null && (
                      <span className="line-through text-gray-400 font-normal ml-1.5">£{defaultPackagePricePerPerson}</span>
                    )}
                  </span>
                </div>

                {/* Inline Adult Price Override Drawer */}
                {showPackagePriceEditor && (
                  <div className="mt-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900">Custom Adult Rate ({currentPackage?.name}):</span>
                      {packagePriceOverride !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            setPackagePriceOverride(null);
                            setPackagePriceOverrideReason('');
                          }}
                          className="text-[10px] text-red-600 hover:underline font-semibold"
                        >
                          Reset to £{defaultPackagePricePerPerson}
                        </button>
                      )}
                    </div>
                    <div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">£</span>
                        <input
                          type="number"
                          min={0}
                          value={packagePriceOverride !== null ? packagePriceOverride : defaultPackagePricePerPerson}
                          onChange={(e) => setPackagePriceOverride(e.target.value === '' ? '' : (parseFloat(e.target.value) >= 0 ? parseFloat(e.target.value) : 0))}
                          placeholder="Rate per adult"
                          className="w-full pl-6 pr-2 py-1.5 border border-amber-300 rounded-lg text-xs font-bold text-gray-900 bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-amber-800 mb-0.5">Reason for Edit:</label>
                      <input
                        type="text"
                        placeholder="e.g. Special negotiated rate for 100+ guests"
                        value={packagePriceOverrideReason}
                        onChange={(e) => setPackagePriceOverrideReason(e.target.value)}
                        className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Kids 4–10 Yrs */}
              <div className="bg-white p-3.5 rounded-xl border border-gray-200 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800">
                    Kids 4–10 Yrs
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKidsPriceEditor(!showKidsPriceEditor)}
                    className="text-[11px] font-semibold text-[#C8860A] hover:underline flex items-center gap-1"
                  >
                    <Icon name="PencilSquareIcon" size={12} />
                    {kidsPriceOverride !== null ? 'Custom Rate' : 'Edit Rate'}
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  value={customerDetails.kids4to10}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, kids4to10: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 font-bold text-gray-900"
                />
                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                  <span>Rate:</span>
                  <span className="font-bold text-amber-800">
                    £{effectiveKidsPrice}/kid
                    {kidsPriceOverride !== null && (
                      <span className="line-through text-gray-400 font-normal ml-1.5">£{defaultKidsPrice}</span>
                    )}
                  </span>
                </div>

                {/* Inline Kids Price Override Drawer */}
                {showKidsPriceEditor && (
                  <div className="mt-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900">Custom Kids Rate:</span>
                      {kidsPriceOverride !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            setKidsPriceOverride(null);
                            setKidsPriceOverrideReason('');
                          }}
                          className="text-[10px] text-red-600 hover:underline font-semibold"
                        >
                          Reset to £{defaultKidsPrice}
                        </button>
                      )}
                    </div>
                    <div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">£</span>
                        <input
                          type="number"
                          min={0}
                          value={kidsPriceOverride !== null ? kidsPriceOverride : defaultKidsPrice}
                          onChange={(e) => setKidsPriceOverride(e.target.value === '' ? '' : (parseFloat(e.target.value) >= 0 ? parseFloat(e.target.value) : 0))}
                          placeholder="Rate per kid"
                          className="w-full pl-6 pr-2 py-1.5 border border-amber-300 rounded-lg text-xs font-bold text-gray-900 bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-amber-800 mb-0.5">Reason for Edit:</label>
                      <input
                        type="text"
                        placeholder="e.g. Child meal portion discount"
                        value={kidsPriceOverrideReason}
                        onChange={(e) => setKidsPriceOverrideReason(e.target.value)}
                        className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Kids Under 4 Yrs */}
              <div className="bg-white p-3.5 rounded-xl border border-gray-200 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800">
                    Kids Under 4 Yrs
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKidsUnder4PriceEditor(!showKidsUnder4PriceEditor)}
                    className="text-[11px] font-semibold text-[#C8860A] hover:underline flex items-center gap-1"
                  >
                    <Icon name="PencilSquareIcon" size={12} />
                    {kidsUnder4PriceOverride !== null ? 'Custom Rate' : 'Edit Rate'}
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  value={customerDetails.kidsUnder4}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, kidsUnder4: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 font-bold text-gray-900"
                />
                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                  <span>Rate:</span>
                  <span className="font-bold text-emerald-700">
                    {effectiveKidsUnder4Price > 0 ? `£${effectiveKidsUnder4Price}/infant` : 'Free (£0)'}
                  </span>
                </div>

                {/* Inline Kids Under 4 Price Override Drawer */}
                {showKidsUnder4PriceEditor && (
                  <div className="mt-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900">Custom Infant Rate:</span>
                      {kidsUnder4PriceOverride !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            setKidsUnder4PriceOverride(null);
                            setKidsUnder4PriceOverrideReason('');
                          }}
                          className="text-[10px] text-red-600 hover:underline font-semibold"
                        >
                          Reset to Free (£0)
                        </button>
                      )}
                    </div>
                    <div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">£</span>
                        <input
                          type="number"
                          min={0}
                          value={kidsUnder4PriceOverride !== null ? kidsUnder4PriceOverride : 0}
                          onChange={(e) => setKidsUnder4PriceOverride(e.target.value === '' ? '' : (parseFloat(e.target.value) >= 0 ? parseFloat(e.target.value) : 0))}
                          placeholder="0"
                          className="w-full pl-6 pr-2 py-1.5 border border-amber-300 rounded-lg text-xs font-bold text-gray-900 bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-amber-800 mb-0.5">Reason for Edit:</label>
                      <input
                        type="text"
                        placeholder="e.g. Special infant high-chair setup"
                        value={kidsUnder4PriceOverrideReason}
                        onChange={(e) => setKidsUnder4PriceOverrideReason(e.target.value)}
                        className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Special Notes & Dietary Requirements */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Special Event Notes, Setup or Dietary Requests
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Bride prefers white floral backdrop. Halal meat guaranteed. 15 guests require pure vegetarian/Jain meal."
              value={customerDetails.notes}
              onChange={(e) => setCustomerDetails({ ...customerDetails, notes: e.target.value })}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Action to Step 2 */}
          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleNextFromStep1}
              className="flex items-center gap-2 text-white font-semibold px-6 py-3 rounded-xl text-sm shadow-md hover:shadow-lg transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
            >
              <span>Next: Select Menus &amp; Packages</span>
              <Icon name="ArrowRightIcon" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Menu & Package Selection ── */}
      {currentStep === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Main selection area (2 cols) */}
          <div className="lg:col-span-2 space-y-5">
            {/* Category Navigation Bar */}
            <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
              {[
                { id: 'packages', label: '1. Banquet Packages', icon: 'SparklesIcon' },
                { id: 'indian', label: '2. Indian Menu', icon: 'FireIcon' },
                { id: 'srilankan', label: '3. Sri Lankan Menu', icon: 'GlobeAltIcon' },
                { id: 'live', label: '4. Live Counters & Extras', icon: 'MusicalNoteIcon' },
                { id: 'hall', label: '5. Venue Hall Hire', icon: 'BuildingOfficeIcon' },
                { id: 'extra_menu', label: '6. Extra Menu Items', icon: 'PlusCircleIcon' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMenuTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    menuTab === tab.id
                      ? 'text-white shadow-md'
                      : tab.id === 'extra_menu'
                      ? 'text-teal-700 hover:bg-teal-50 border border-teal-200 bg-teal-50/40'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={
                    menuTab === tab.id
                      ? { background: 'linear-gradient(135deg, #C8860A, #F0A830)' }
                      : {}
                  }
                >
                  <Icon name={tab.icon} size={15} />
                  {tab.label}
                  {tab.id === 'extra_menu' && extraMenuItems.length > 0 && menuTab !== 'extra_menu' && (
                    <span className="ml-1 text-[10px] font-bold bg-teal-600 text-white rounded-full px-1.5 py-0.5">
                      {extraMenuItems.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* TAB: BANQUET PACKAGES */}
            {menuTab === 'packages' && (
              <div className="space-y-4">
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">Select a Banquet Catering Package (Optional / None by Default)</p>
                    <p className="text-gray-600 mt-0.5">
                      Click a package to select or click again to remove. You can override head rates or create a bespoke package.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddPackageModal(true)}
                    className="text-xs font-bold text-[#C8860A] bg-white hover:bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-xl shadow-2xs flex items-center gap-1 self-start sm:self-auto"
                  >
                    <Icon name="PlusIcon" size={13} />
                    <span>Add Custom Package</span>
                  </button>
                </div>

                {/* Selected Package & Pricing Overrides Banner */}
                {selectedPackageId ? (
                  <div className="p-4 bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50 border border-amber-300 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-[#C8860A] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                          £
                        </span>
                        <div>
                          <span className="text-xs font-extrabold text-amber-950 uppercase tracking-wide">
                            Package &amp; Head Rates ({selectedPackageId === 'custom' ? 'Custom Package' : currentPackage?.name})
                          </span>
                          <div className="text-[11px] text-amber-800">
                            Adult Catalog Price: <strong>£{defaultPackagePricePerPerson} / person</strong>
                            {Number(customerDetails.kids4to10) > 0 && <span> · Kids (4–10): <strong>£{defaultKidsPrice} / kid</strong></span>}
                            {Number(customerDetails.kidsUnder4) > 0 && <span> · Under 4: <strong>Free (£0)</strong></span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPackageId('');
                            setPackagePriceOverride(null);
                            setPackagePriceOverrideReason('');
                          }}
                          className="text-xs text-rose-600 hover:text-rose-800 font-bold bg-white px-2.5 py-1 rounded-lg border border-rose-200 shadow-2xs flex items-center gap-1"
                        >
                          <Icon name="XMarkIcon" size={12} />
                          Deselect Package
                        </button>
                        {(packagePriceOverride !== null || kidsPriceOverride !== null || kidsUnder4PriceOverride !== null) && (
                          <button
                            type="button"
                            onClick={() => {
                              setPackagePriceOverride(null);
                              setPackagePriceOverrideReason('');
                              setKidsPriceOverride(null);
                              setKidsPriceOverrideReason('');
                              setKidsUnder4PriceOverride(null);
                              setKidsUnder4PriceOverrideReason('');
                            }}
                            className="text-xs text-red-600 hover:text-red-800 font-bold bg-white px-2.5 py-1 rounded-lg border border-red-200 shadow-2xs"
                          >
                            Reset All to Default
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Adult Rate Override */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-amber-200/60">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          Adult Agreed Rate (£ / adult person):
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">£</span>
                          <input
                            type="number"
                            min={0}
                            value={packagePriceOverride !== null ? packagePriceOverride : defaultPackagePricePerPerson}
                            onChange={(e) => setPackagePriceOverride(e.target.value === '' ? '' : (parseFloat(e.target.value) >= 0 ? parseFloat(e.target.value) : 0))}
                            placeholder="e.g. 20"
                            className="w-full pl-8 pr-3 py-2 border border-amber-300 rounded-xl text-sm font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-2xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          Reason for Adult Rate Change:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Discount negotiated for 150+ wedding guests"
                          value={packagePriceOverrideReason}
                          onChange={(e) => setPackagePriceOverrideReason(e.target.value)}
                          className="w-full px-3 py-2 border border-amber-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Kids (4–10 yrs) Rate Override */}
                    {Number(customerDetails.kids4to10) > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200/40">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-gray-700">
                              Kids (4–10 yrs) Agreed Rate (£ / kid):
                            </label>
                            <span className="text-[10px] text-amber-800">
                              {customerDetails.kids4to10} kids attending · Standard: £{defaultKidsPrice}
                            </span>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">£</span>
                            <input
                              type="number"
                              min={0}
                              value={kidsPriceOverride !== null ? kidsPriceOverride : defaultKidsPrice}
                              onChange={(e) => setKidsPriceOverride(e.target.value === '' ? '' : (parseFloat(e.target.value) >= 0 ? parseFloat(e.target.value) : 0))}
                              placeholder="e.g. 15"
                              className="w-full pl-8 pr-3 py-2 border border-amber-300 rounded-xl text-sm font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-2xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1">
                            Reason for Kids Rate Change:
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Child meal portion discount"
                            value={kidsPriceOverrideReason}
                            onChange={(e) => setKidsPriceOverrideReason(e.target.value)}
                            className="w-full px-3 py-2 border border-amber-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-2xs"
                          />
                        </div>
                      </div>
                    )}

                    {/* Kids Under 4 Rate Override */}
                    {Number(customerDetails.kidsUnder4) > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200/40">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-gray-700">
                              Kids Under 4 Rate (£ / infant):
                            </label>
                            <span className="text-[10px] text-amber-800">
                              {customerDetails.kidsUnder4} infants · Standard: Free (£0)
                            </span>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">£</span>
                            <input
                              type="number"
                              min={0}
                              value={kidsUnder4PriceOverride !== null ? kidsUnder4PriceOverride : 0}
                              onChange={(e) => setKidsUnder4PriceOverride(e.target.value === '' ? '' : (parseFloat(e.target.value) >= 0 ? parseFloat(e.target.value) : 0))}
                              placeholder="0"
                              className="w-full pl-8 pr-3 py-2 border border-amber-300 rounded-xl text-sm font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-2xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1">
                            Reason for Infant Rate Change:
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Special infant high-chair setup"
                            value={kidsUnder4PriceOverrideReason}
                            onChange={(e) => setKidsUnder4PriceOverrideReason(e.target.value)}
                            className="w-full px-3 py-2 border border-amber-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-2xs"
                          />
                        </div>
                      </div>
                    )}

                    {/* Active Custom Rates Summary */}
                    {((packagePriceOverride !== null && packagePriceOverride !== defaultPackagePricePerPerson) ||
                      (kidsPriceOverride !== null && kidsPriceOverride !== defaultKidsPrice) ||
                      (kidsUnder4PriceOverride !== null && Number(kidsUnder4PriceOverride) !== 0)) && (
                      <div className="text-[11px] text-amber-900 font-medium bg-white/80 p-2.5 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span>
                          🏷️ <strong>Custom Price Active:</strong>
                          {packagePriceOverride !== null && packagePriceOverride !== defaultPackagePricePerPerson && (
                            <span> Adult: £{packagePriceOverride}/person</span>
                          )}
                          {kidsPriceOverride !== null && kidsPriceOverride !== defaultKidsPrice && (
                            <span> · Kids (4–10): £{kidsPriceOverride}/kid</span>
                          )}
                          {kidsUnder4PriceOverride !== null && Number(kidsUnder4PriceOverride) !== 0 && (
                            <span> · Under 4: £{kidsUnder4PriceOverride}/infant</span>
                          )}
                        </span>
                        <span className="italic text-gray-500 truncate max-w-xs">
                          {packagePriceOverrideReason || kidsPriceOverrideReason || kidsUnder4PriceOverrideReason || 'Custom rate agreed'}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <Icon name="InformationCircleIcon" size={20} className="text-gray-400 flex-shrink-0" />
                      <span>No catering package is selected by default. Click any package below to select it, or click <strong>&quot;Add Custom Package&quot;</strong> to create a bespoke package.</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {allBanquetPackages.map((pkg) => {
                    const isSelected = selectedPackageId === pkg.id;
                    return (
                      <div
                        key={pkg.id}
                        onClick={() => {
                          if (selectedPackageId === pkg.id) {
                            setSelectedPackageId('');
                            setPackagePriceOverride(null);
                            setPackagePriceOverrideReason('');
                          } else {
                            setSelectedPackageId(pkg.id);
                            setPackagePriceOverride(null);
                            setPackagePriceOverrideReason('');
                          }
                        }}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-400 shadow-md'
                            : 'border-gray-200 bg-white hover:border-amber-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-bold text-gray-900 text-sm">{pkg.name}</span>
                            {pkg.tag && (
                              <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                {pkg.tag}
                              </span>
                            )}
                            <div className="text-xl font-bold text-[#C8860A] mt-1">
                              {isSelected && packagePriceOverride !== null ? (
                                <>
                                  £{packagePriceOverride}
                                  <span className="text-xs text-gray-400 font-normal line-through ml-1.5">£{pkg.pricePerPerson}</span>
                                </>
                              ) : (
                                `£${pkg.pricePerPerson}`
                              )}
                              <span className="text-xs text-gray-400 font-normal"> / person</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPackageModal(pkg);
                                setPackageForm({
                                  name: pkg.name,
                                  pricePerPerson: String(pkg.pricePerPerson),
                                  kidsPrice: String((pkg as any).kidsPrice || getKidsPriceFromList(kidsPricing, pkg.name)),
                                  tag: pkg.tag || '',
                                  guestLabel: pkg.guestLabel || '',
                                  vegStarters: pkg.starters?.veg || 2,
                                  nonVegStarters: pkg.starters?.nonVeg || 2,
                                  vegMains: pkg.mains?.veg || 2,
                                  nonVegMains: pkg.mains?.nonVeg || 2,
                                  desserts: (pkg.desserts || []).join(', '),
                                  drinks: (pkg.drinks || []).join(', '),
                                });
                              }}
                              className="text-xs text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded font-semibold"
                              title="Edit Package"
                            >
                              Edit
                            </button>
                            <div
                              className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                isSelected ? 'border-amber-600 bg-amber-600 text-white' : 'border-gray-300'
                              }`}
                            >
                              {isSelected && <Icon name="CheckIcon" size={12} />}
                            </div>
                          </div>
                        </div>

                        {/* Quotas */}
                        <div className="mt-3 pt-2.5 border-t border-gray-100 grid grid-cols-2 gap-1.5 text-[11px] text-gray-600">
                          <div>
                            🥗 Starters: {pkg.starters.veg} Veg / {pkg.starters.nonVeg} Non-Veg
                          </div>
                          <div>
                            🍛 Mains: {pkg.mains.veg} Veg / {pkg.mains.nonVeg} Non-Veg
                          </div>
                          {pkg.desserts.length > 0 && (
                            <div className="col-span-2 truncate">
                              🍮 Desserts: {pkg.desserts.join(', ')}
                            </div>
                          )}
                          {pkg.drinks.length > 0 && (
                            <div className="col-span-2 truncate text-purple-700">
                              🥤 Drinks: {pkg.drinks.join(', ')}
                            </div>
                          )}
                        </div>

                        {pkg.guestLabel && (
                          <div className="mt-2 text-[10px] font-semibold text-gray-400">
                            👥 {pkg.guestLabel}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Custom package card */}
                  <div
                    onClick={() => {
                      if (selectedPackageId === 'custom') {
                        setSelectedPackageId('');
                      } else {
                        setSelectedPackageId('custom');
                      }
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedPackageId === 'custom'
                        ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-400 shadow-md'
                        : 'border-gray-200 bg-white hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-bold text-gray-900 text-sm">Custom Package Rate</span>
                        <div className="text-xs text-gray-500 mt-0.5">Specify bespoke per-person rate</div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          selectedPackageId === 'custom' ? 'border-amber-600 bg-amber-600 text-white' : 'border-gray-300'
                        }`}
                      >
                        {selectedPackageId === 'custom' && <Icon name="CheckIcon" size={12} />}
                      </div>
                    </div>

                    <div className="mt-3 pt-2">
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Custom Rate (£ / person):</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 35"
                        value={selectedPackageCustomPrice}
                        onChange={(e) => setSelectedPackageCustomPrice(e.target.value === '' ? '' : (parseFloat(e.target.value) >= 0 ? parseFloat(e.target.value) : 0))}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-900 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: INDIAN MENU DISHES */}
            {menuTab === 'indian' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
                <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                      <Icon name="FireIcon" size={16} className="text-red-600" />
                      Indian Menu Dish Selection
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Check off dishes agreed with the customer for this event.
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    {currentPackage?.name}
                  </span>
                </div>

                {/* Starters: Veg & Non-Veg */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Veg Starters */}
                  <div className="border border-emerald-100 bg-emerald-50/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                        Vegetarian Starters ({selectedVegStarters.length}/{currentPackage?.starters?.veg || '∞'})
                      </span>
                    </div>
                    {renderDishChecklist('indian', 'vegStarters', indianMenu.starters.vegetarian, selectedVegStarters, setSelectedVegStarters, 'emerald')}
                  </div>

                  {/* Non-Veg Starters */}
                  <div className="border border-red-100 bg-red-50/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-red-800 uppercase tracking-wide">
                        Non-Veg Starters ({selectedNonVegStarters.length}/{currentPackage?.starters?.nonVeg || '∞'})
                      </span>
                    </div>
                    {renderDishChecklist('indian', 'nonVegStarters', indianMenu.starters.nonVegetarian, selectedNonVegStarters, setSelectedNonVegStarters, 'red')}
                  </div>
                </div>

                {/* Mains: Veg & Non-Veg */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Veg Mains */}
                  <div className="border border-emerald-100 bg-emerald-50/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                        Vegetarian Mains ({selectedVegMains.length}/{currentPackage?.mains?.veg || '∞'})
                      </span>
                    </div>
                    {renderDishChecklist('indian', 'vegMains', indianMenu.mains.vegetarian, selectedVegMains, setSelectedVegMains, 'emerald')}
                  </div>

                  {/* Non-Veg Mains */}
                  <div className="border border-red-100 bg-red-50/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-red-800 uppercase tracking-wide">
                        Non-Veg Mains ({selectedNonVegMains.length}/{currentPackage?.mains?.nonVeg || '∞'})
                      </span>
                    </div>
                    {renderDishChecklist('indian', 'nonVegMains', indianMenu.mains.nonVegetarian, selectedNonVegMains, setSelectedNonVegMains, 'red')}
                  </div>
                </div>

                {/* Sundries & Desserts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                        Sundries ({selectedSundries.length})
                      </span>
                    </div>
                    {renderDishChecklist('indian', 'sundries', indianMenu.sundries, selectedSundries, setSelectedSundries, 'gray')}
                  </div>

                  <div className="border border-gray-200 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                        Desserts ({selectedDesserts.length})
                      </span>
                    </div>
                    {renderDishChecklist('indian', 'desserts', indianMenu.desserts, selectedDesserts, setSelectedDesserts, 'gray')}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SRI LANKAN MENU DISHES */}
            {menuTab === 'srilankan' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
                <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                      <Icon name="GlobeAltIcon" size={16} className="text-amber-600" />
                      Sri Lankan Menu Dish Selection
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Check off dishes agreed with the customer for this event.
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    {currentPackage?.name}
                  </span>
                </div>

                {/* Starters: Veg & Non-Veg */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Veg Starters */}
                  <div className="border border-emerald-100 bg-emerald-50/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                        Vegetarian Starters ({selectedVegStarters.length}/{currentPackage?.starters?.veg || '∞'})
                      </span>
                    </div>
                    {renderDishChecklist('sl', 'vegStarters', sriLankanMenu.starters.vegetarian, selectedVegStarters, setSelectedVegStarters, 'emerald')}
                  </div>

                  {/* Non-Veg Starters */}
                  <div className="border border-red-100 bg-red-50/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-red-800 uppercase tracking-wide">
                        Non-Veg Starters ({selectedNonVegStarters.length}/{currentPackage?.starters?.nonVeg || '∞'})
                      </span>
                    </div>
                    {renderDishChecklist('sl', 'nonVegStarters', sriLankanMenu.starters.nonVegetarian, selectedNonVegStarters, setSelectedNonVegStarters, 'red')}
                  </div>
                </div>

                {/* Mains: Veg & Non-Veg */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Veg Mains */}
                  <div className="border border-emerald-100 bg-emerald-50/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                        Vegetarian Mains ({selectedVegMains.length}/{currentPackage?.mains?.veg || '∞'})
                      </span>
                    </div>
                    {renderDishChecklist('sl', 'vegMains', sriLankanMenu.mains.vegetarian, selectedVegMains, setSelectedVegMains, 'emerald')}
                  </div>

                  {/* Non-Veg Mains */}
                  <div className="border border-red-100 bg-red-50/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-red-800 uppercase tracking-wide">
                        Non-Veg Mains ({selectedNonVegMains.length}/{currentPackage?.mains?.nonVeg || '∞'})
                      </span>
                    </div>
                    {renderDishChecklist('sl', 'nonVegMains', sriLankanMenu.mains.nonVegetarian, selectedNonVegMains, setSelectedNonVegMains, 'red')}
                  </div>
                </div>

                {/* Sundries & Desserts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                        Sundries ({selectedSundries.length})
                      </span>
                    </div>
                    {renderDishChecklist('sl', 'sundries', sriLankanMenu.sundries, selectedSundries, setSelectedSundries, 'gray')}
                  </div>

                  <div className="border border-gray-200 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                        Desserts ({selectedDesserts.length})
                      </span>
                    </div>
                    {renderDishChecklist('sl', 'desserts', sriLankanMenu.desserts, selectedDesserts, setSelectedDesserts, 'gray')}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: LIVE COUNTERS & EXTRAS */}
            {menuTab === 'live' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-6">
                <div>
                  <h4 className="font-bold text-gray-900 text-sm mb-1 flex items-center gap-1.5">
                    <Icon name="MusicalNoteIcon" size={16} className="text-amber-600" />
                    Live Counters &amp; Event Extras
                  </h4>
                  <p className="text-xs text-gray-500">
                    Select live stations and event equipment. You can customize the price and add a reason for any selected item.
                  </p>
                </div>

                {/* Sri Lankan & South Indian Live Counters */}
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/40 space-y-3">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wide block">
                    Sri Lankan &amp; South Indian Live Counters
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {liveCounters.srilankanSouthIndian.map((item) => {
                      const found = selectedLiveCounters.find((l) => l.name === item.name);
                      const isChecked = !!found;
                      return (
                        <div
                          key={item.name}
                          className={`p-3 rounded-xl border text-xs transition-colors space-y-2 ${
                            isChecked ? 'bg-amber-50/80 border-amber-300 text-amber-950 font-medium' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedLiveCounters((prev) =>
                                    isChecked
                                      ? prev.filter((l) => l.name !== item.name)
                                      : [...prev, { name: item.name, price: item.price, defaultPrice: item.price }]
                                  );
                                }}
                                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                              />
                              <span>{item.name}</span>
                            </div>
                            <span className="font-bold text-[#C8860A]">£{found ? found.price : item.price}</span>
                          </label>

                          {/* Inline Custom Price Editor if checked */}
                          {isChecked && (
                            <div className="pt-2 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block">Agreed Price (£):</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={found.price}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const newP = val === '' ? '' : (parseFloat(val) >= 0 ? parseFloat(val) : 0);
                                    setSelectedLiveCounters((prev) =>
                                      prev.map((l) => (l.name === item.name ? { ...l, price: newP as any, isCustomPrice: true } : l))
                                    );
                                  }}
                                  className="w-full px-2 py-1 border border-amber-300 rounded-lg bg-white font-bold text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block">Reason / Note:</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Bundle deal"
                                  value={found.reason || ''}
                                  onChange={(e) => {
                                    const r = e.target.value;
                                    setSelectedLiveCounters((prev) =>
                                      prev.map((l) => (l.name === item.name ? { ...l, reason: r, isCustomPrice: true } : l))
                                    );
                                  }}
                                  className="w-full px-2 py-1 border border-amber-300 rounded-lg bg-white text-[11px]"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* North Indian Live Counters */}
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/40 space-y-3">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wide block">
                    North Indian Live Counters
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {liveCounters.northIndian.map((item) => {
                      const found = selectedLiveCounters.find((l) => l.name === item.name);
                      const isChecked = !!found;
                      return (
                        <div
                          key={item.name}
                          className={`p-3 rounded-xl border text-xs transition-colors space-y-2 ${
                            isChecked ? 'bg-amber-50/80 border-amber-300 text-amber-950 font-medium' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedLiveCounters((prev) =>
                                    isChecked
                                      ? prev.filter((l) => l.name !== item.name)
                                      : [...prev, { name: item.name, price: item.price, defaultPrice: item.price }]
                                  );
                                }}
                                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                              />
                              <span>{item.name}</span>
                            </div>
                            <span className="font-bold text-[#C8860A]">£{found ? found.price : item.price}</span>
                          </label>

                          {/* Inline Custom Price Editor if checked */}
                          {isChecked && (
                            <div className="pt-2 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block">Agreed Price (£):</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={found.price}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const newP = val === '' ? '' : (parseFloat(val) >= 0 ? parseFloat(val) : 0);
                                    setSelectedLiveCounters((prev) =>
                                      prev.map((l) => (l.name === item.name ? { ...l, price: newP as any, isCustomPrice: true } : l))
                                    );
                                  }}
                                  className="w-full px-2 py-1 border border-amber-300 rounded-lg bg-white font-bold text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block">Reason / Note:</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Discount negotiated"
                                  value={found.reason || ''}
                                  onChange={(e) => {
                                    const r = e.target.value;
                                    setSelectedLiveCounters((prev) =>
                                      prev.map((l) => (l.name === item.name ? { ...l, reason: r, isCustomPrice: true } : l))
                                    );
                                  }}
                                  className="w-full px-2 py-1 border border-amber-300 rounded-lg bg-white text-[11px]"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Event Extras Setup */}
                <div className="border border-purple-100 rounded-xl p-4 bg-purple-50/20 space-y-3">
                  <span className="text-xs font-bold text-purple-900 uppercase tracking-wide block">
                    Event Extras (Music, Lighting &amp; Decor)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {liveCounters.extras.map((item) => {
                      const found = selectedExtras.find((e) => e.name === item.name);
                      const isChecked = !!found;
                      return (
                        <div
                          key={item.name}
                          className={`p-3 rounded-xl border text-xs transition-colors space-y-2 ${
                            isChecked ? 'bg-purple-50 border-purple-300 text-purple-950 font-medium' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedExtras((prev) =>
                                    isChecked
                                      ? prev.filter((e) => e.name !== item.name)
                                      : [...prev, { name: item.name, price: item.price, defaultPrice: item.price }]
                                  );
                                }}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                              />
                              <div>
                                <span>{item.name}</span>
                                {item.note && <div className="text-[10px] text-gray-400 font-normal">{item.note}</div>}
                              </div>
                            </div>
                            <span className="font-bold text-purple-700">£{found ? found.price : item.price}</span>
                          </label>

                          {/* Inline Custom Price Editor if checked */}
                          {isChecked && (
                            <div className="pt-2 border-t border-purple-200 grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block">Agreed Price (£):</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={found.price}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const newP = val === '' ? '' : (parseFloat(val) >= 0 ? parseFloat(val) : 0);
                                    setSelectedExtras((prev) =>
                                      prev.map((ex) => (ex.name === item.name ? { ...ex, price: newP as any, isCustomPrice: true } : ex))
                                    );
                                  }}
                                  className="w-full px-2 py-1 border border-purple-300 rounded-lg bg-white font-bold text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block">Reason / Note:</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Package concession"
                                  value={found.reason || ''}
                                  onChange={(e) => {
                                    const r = e.target.value;
                                    setSelectedExtras((prev) =>
                                      prev.map((ex) => (ex.name === item.name ? { ...ex, reason: r, isCustomPrice: true } : ex))
                                    );
                                  }}
                                  className="w-full px-2 py-1 border border-purple-300 rounded-lg bg-white text-[11px]"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: VENUE HALL HIRE & DRY HIRE */}
            {menuTab === 'hall' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-6">
                <div className="border-b border-gray-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                      <Icon name="BuildingOfficeIcon" size={16} className="text-amber-600" />
                      Venue Hall Hire &amp; Dry Hire
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Venue hall hire and dry hire are <strong>not added by default</strong>. Select an option below or add a custom fee if applicable.
                    </p>
                  </div>
                  {selectedHallOption && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedHallOption(null);
                        setShowHallPriceEditor(false);
                      }}
                      className="text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 shadow-2xs self-start sm:self-auto"
                    >
                      <Icon name="XMarkIcon" size={13} />
                      <span>Remove Hall / Dry Hire (£0)</span>
                    </button>
                  )}
                </div>

                {/* Active Status Banner */}
                <div className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                  selectedHallOption === null
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50/80 border-amber-300 text-amber-950 font-medium'
                }`}>
                  <div className="flex items-center gap-2">
                    <Icon name={selectedHallOption === null ? 'CheckCircleIcon' : 'BuildingOfficeIcon'} size={18} className={selectedHallOption === null ? 'text-emerald-600' : 'text-[#C8860A]'} />
                    <span>
                      {selectedHallOption === null ? (
                        <><strong>No Venue Hall Fee Applied:</strong> Booking does not include hall hire charges (£0).</>
                      ) : (
                        <><strong>Active Hall Charge:</strong> {selectedHallOption.label} — <strong className="text-amber-900">£{selectedHallOption.amount}</strong>{selectedHallOption.reason ? ` (${selectedHallOption.reason})` : ''}</>
                      )}
                    </span>
                  </div>
                  {selectedHallOption && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
                      Applied to Invoice
                    </span>
                  )}
                </div>

                {/* Default Choice: None / Offsite Catering */}
                <div className="space-y-2.5">
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      selectedHallOption === null ? 'bg-amber-50/70 border-amber-400 text-amber-900 font-bold ring-1 ring-amber-300' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="hallOption"
                        checked={selectedHallOption === null}
                        onChange={() => {
                          setSelectedHallOption(null);
                          setShowHallPriceEditor(false);
                        }}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <span>No Hall Hire Fee (Offsite Catering or Included in Package / Removed by Default)</span>
                    </div>
                    <span className="text-gray-400 font-semibold">£0</span>
                  </label>
                </div>

                {/* Section 1: Honeymoon Banquet Hall Standard Rates */}
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wide block">
                    🏛️ Honeymoon Banquet Hall Charges
                  </span>
                  <div className="space-y-2">
                    {venueHallCharges.map((hall) => {
                      const priceMatch = hall.charge.match(/£(\d+)/);
                      const defaultAmount = priceMatch ? parseInt(priceMatch[1]) : 250;
                      const isSelected = selectedHallOption?.label === hall.day;
                      return (
                        <div
                          key={`${hall.day}-${hall.note}`}
                          className={`rounded-xl border text-xs transition-colors ${
                            isSelected ? 'bg-amber-50/60 border-amber-400 shadow-xs ring-1 ring-amber-300' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <label className="flex items-center justify-between p-3.5 cursor-pointer">
                            <div className="flex items-center gap-2.5">
                              <input
                                type="radio"
                                name="hallOption"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedHallOption({
                                    label: hall.day,
                                    amount: defaultAmount,
                                    defaultAmount,
                                  });
                                  setShowHallPriceEditor(false);
                                }}
                                className="text-amber-600 focus:ring-amber-500"
                              />
                              <div>
                                <span className="font-semibold text-gray-900">{hall.day}</span>
                                {hall.note && <span className="ml-2 text-gray-400 font-normal">({hall.note})</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#C8860A]">
                                £{isSelected && selectedHallOption ? selectedHallOption.amount : defaultAmount}
                              </span>
                              {isSelected ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowHallPriceEditor(!showHallPriceEditor);
                                    }}
                                    className="text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded shadow-2xs"
                                  >
                                    Edit Fee
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedHallOption(null);
                                      setShowHallPriceEditor(false);
                                    }}
                                    className="text-[11px] font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200"
                                    title="Remove this charge"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedHallOption({
                                      label: hall.day,
                                      amount: defaultAmount,
                                      defaultAmount,
                                    });
                                  }}
                                  className="text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200"
                                >
                                  Select
                                </button>
                              )}
                            </div>
                          </label>

                          {/* Inline Hall Price Editor */}
                          {isSelected && showHallPriceEditor && selectedHallOption && (
                            <div className="px-4 pb-3.5 pt-2 border-t border-amber-200 bg-white/70 rounded-b-xl grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 mb-1">
                                  Agreed Hall Fee (£):
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">£</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={selectedHallOption.amount}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const newAmt = val === '' ? '' : (parseFloat(val) >= 0 ? parseFloat(val) : 0);
                                      setSelectedHallOption({
                                        ...selectedHallOption,
                                        amount: newAmt as any,
                                        isCustomAmount: true,
                                      });
                                    }}
                                    className="w-full pl-6 pr-2 py-1.5 border border-amber-300 rounded-lg text-xs font-bold text-gray-900 bg-white"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 mb-1">
                                  Reason for Fee Edit:
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Off-peak discount / weekday rate"
                                  value={selectedHallOption.reason || ''}
                                  onChange={(e) => {
                                    const r = e.target.value;
                                    setSelectedHallOption({
                                      ...selectedHallOption,
                                      reason: r,
                                      isCustomAmount: true,
                                    });
                                  }}
                                  className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Dry Hire Sessions (Default: Removed / None) */}
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-900 uppercase tracking-wide block">
                        📦 Dry Hire Sessions (Hall-Only Hire — Removed by Default)
                      </span>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Dry hire is not selected by default. Select a session below if the customer is booking hall-only hire without catering.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {dryHirePrices.map((dh) => {
                      const defaultAmount = typeof dh.price === 'number' ? dh.price : (parseInt(String(dh.price).replace(/[^\d]/g, '')) || 2000);
                      const dhLabel = `Dry Hire: ${dh.day} (${dh.session})`;
                      const isSelected = selectedHallOption?.label === dhLabel;

                      return (
                        <div
                          key={`${dh.day}-${dh.session}`}
                          className={`p-3.5 rounded-xl border text-xs transition-colors space-y-2 ${
                            isSelected ? 'bg-amber-50/70 border-amber-400 ring-1 ring-amber-300' : 'bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-gray-900">{dh.day} — {dh.session}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">Hall-only dry hire</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-[#C8860A]">
                                £{isSelected && selectedHallOption ? selectedHallOption.amount.toLocaleString() : defaultAmount.toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                            {isSelected ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setShowHallPriceEditor(!showHallPriceEditor)}
                                  className="text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg"
                                >
                                  Edit Dry Hire Fee
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedHallOption(null);
                                    setShowHallPriceEditor(false);
                                  }}
                                  className="text-[11px] font-bold text-red-600 hover:text-red-800 bg-red-50 px-2 py-1 rounded-lg border border-red-200"
                                >
                                  Remove
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedHallOption({
                                    label: dhLabel,
                                    amount: defaultAmount,
                                    defaultAmount,
                                  });
                                  setShowHallPriceEditor(false);
                                }}
                                className="w-full py-1.5 px-3 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-center transition-colors"
                              >
                                + Add Dry Hire ({dh.session})
                              </button>
                            )}
                          </div>

                          {/* Inline Dry Hire Price Editor */}
                          {isSelected && showHallPriceEditor && selectedHallOption && (
                            <div className="pt-2 border-t border-amber-200 space-y-2">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                                  Agreed Dry Hire Rate (£):
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">£</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={selectedHallOption.amount}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const newAmt = val === '' ? '' : (parseFloat(val) >= 0 ? parseFloat(val) : 0);
                                      setSelectedHallOption({
                                        ...selectedHallOption,
                                        amount: newAmt as any,
                                        isCustomAmount: true,
                                      });
                                    }}
                                    className="w-full pl-6 pr-2 py-1.5 border border-amber-300 rounded-lg text-xs font-bold bg-white"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                                  Reason for Rate Edit:
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Bespoke hours discount"
                                  value={selectedHallOption.reason || ''}
                                  onChange={(e) => {
                                    const r = e.target.value;
                                    setSelectedHallOption({
                                      ...selectedHallOption,
                                      reason: r,
                                      isCustomAmount: true,
                                    });
                                  }}
                                  className="w-full border border-amber-300 rounded-lg px-2.5 py-1 text-xs bg-white"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section 3: Custom Venue / Hall Hire Charge */}
                <div className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wide block">
                    ✚ Add Custom Venue / Hall Hire Charge
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Charge Label *</label>
                      <input
                        type="text"
                        placeholder="e.g. Bespoke Evening Hall Hire"
                        value={newHallChargeLabel}
                        onChange={(e) => setNewHallChargeLabel(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Amount (£) *</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">£</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="e.g. 750"
                          value={newHallChargeAmount}
                          onChange={(e) => setNewHallChargeAmount(e.target.value)}
                          className="w-full pl-6 pr-2 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Reason / Note</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Extended midnight hours"
                          value={newHallChargeNote}
                          onChange={(e) => setNewHallChargeNote(e.target.value)}
                          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const lbl = newHallChargeLabel.trim();
                            if (!lbl) return;
                            const amt = parseFloat(newHallChargeAmount) || 0;
                            setSelectedHallOption({
                              label: lbl,
                              amount: amt,
                              defaultAmount: amt,
                              isCustomAmount: true,
                              reason: newHallChargeNote.trim(),
                            });
                            setNewHallChargeLabel('');
                            setNewHallChargeAmount('');
                            setNewHallChargeNote('');
                          }}
                          disabled={!newHallChargeLabel.trim()}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-2xs disabled:opacity-40 whitespace-nowrap"
                          style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: EXTRA MENU ITEMS */}
            {menuTab === 'extra_menu' && (
              <div className="bg-white rounded-2xl border border-teal-200 p-5 shadow-sm space-y-5">
                {/* Header */}
                <div className="border-b border-teal-100 pb-3">
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                    <Icon name="PlusCircleIcon" size={16} className="text-teal-600" />
                    Extra Menu Items
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Add any additional food items, special dishes, or custom menu extras not covered by the main packages. Each item can have a name, description, and cost.
                  </p>
                </div>

                {/* Add New Item Form */}
                <div className="bg-teal-50/50 border border-teal-200 rounded-xl p-4 space-y-3">
                  <span className="text-[11px] font-bold text-teal-900 uppercase tracking-wide block">
                    ✚ Add New Extra Menu Item
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Item Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Prawn Cocktail, Extra Biryani"
                        value={newExtraItemName}
                        onChange={(e) => setNewExtraItemName(e.target.value)}
                        className="w-full border border-teal-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Description / Note</label>
                      <input
                        type="text"
                        placeholder="e.g. Served at table, halal, gluten-free"
                        value={newExtraItemDescription}
                        onChange={(e) => setNewExtraItemDescription(e.target.value)}
                        className="w-full border border-teal-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Cost (£)</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">£</span>
                          <input
                            type="number"
                            min={0}
                            placeholder="0.00"
                            value={newExtraItemCost}
                            onChange={(e) => setNewExtraItemCost(e.target.value)}
                            className="w-full pl-6 pr-2 py-2 border border-teal-300 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const name = newExtraItemName.trim();
                            if (!name) return;
                            const cost = parseFloat(newExtraItemCost) || 0;
                            setExtraMenuItems((prev) => [
                              ...prev,
                              {
                                id: Date.now().toString(),
                                name,
                                description: newExtraItemDescription.trim(),
                                cost,
                              },
                            ]);
                            setNewExtraItemName('');
                            setNewExtraItemDescription('');
                            setNewExtraItemCost('');
                          }}
                          disabled={!newExtraItemName.trim()}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap flex items-center gap-1"
                        >
                          <Icon name="PlusIcon" size={13} />
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Added Items List */}
                {extraMenuItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Icon name="ClipboardDocumentListIcon" size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-medium">No extra menu items added yet</p>
                    <p className="text-[11px] mt-0.5">Use the form above to add custom food items</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                        Added Items ({extraMenuItems.length})
                      </span>
                      <span className="text-xs font-bold text-teal-700">
                        Total: £{extraMenuItemsTotal.toLocaleString()}
                      </span>
                    </div>
                    {extraMenuItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between bg-teal-50/60 border border-teal-200 rounded-xl px-4 py-3 gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                            <span className="text-teal-500">🍽️</span>
                            {item.name}
                          </div>
                          {item.description && (
                            <div className="text-[10px] text-gray-500 mt-0.5 truncate">{item.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-teal-700 whitespace-nowrap">+£{item.cost.toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => setExtraMenuItems((prev) => prev.filter((i) => i.id !== item.id))}
                            className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center text-xs font-bold transition-colors"
                            title="Remove item"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Total Banner */}
                    <div className="flex justify-between items-center bg-gradient-to-r from-teal-100/80 to-teal-50 border border-teal-300 rounded-xl px-4 py-2.5 mt-1">
                      <span className="text-xs font-bold text-teal-900">Extra Menu Items Subtotal:</span>
                      <span className="text-base font-extrabold text-teal-700">£{extraMenuItemsTotal.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Rail: Running Selection Summary */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm sticky top-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">Live Order Summary</span>
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                  {customerDetails.eventType}
                </span>
              </div>

              {/* Customer summary */}
              <div className="text-xs space-y-1 text-gray-600 bg-gray-50/70 p-3 rounded-xl border border-gray-100">
                <div className="font-bold text-gray-900">{customerDetails.name || 'Customer Name'}</div>
                <div>📅 {customerDetails.date || 'Date not set'} · ⏰ {customerDetails.timeSession}</div>
                <div>👥 {customerDetails.adults} {Number(customerDetails.adults) === 1 ? 'Adult' : 'Adults'} · {customerDetails.kids4to10} Kids · {customerDetails.kidsUnder4} Infants</div>
              </div>

              {/* Package Details */}
              <div className="text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">Package:</span>
                  <span className="font-bold text-gray-900">
                    {selectedPackageId === 'custom'
                      ? 'Custom Package'
                      : (currentPackage?.name || (selectedHallOption ? 'Venue Hire Only' : 'No Package Selected'))}
                  </span>
                </div>
                {selectedPackageId ? (
                  <div className="flex justify-between items-center text-gray-500">
                    <span>Adult Rate:</span>
                    <span className="font-bold text-amber-900">
                      £{effectivePackagePrice} / adult
                      {packagePriceOverride !== null && (
                        <span className="text-[10px] text-amber-700 font-semibold bg-amber-100 px-1.5 py-0.2 rounded ml-1">Custom</span>
                      )}
                    </span>
                  </div>
                ) : null}
                {Number(customerDetails.kids4to10) > 0 && selectedPackageId && (
                  <div className="flex justify-between items-center text-gray-500">
                    <span>Kids (4–10) Rate:</span>
                    <span className="font-semibold text-gray-800">£{effectiveKidsPrice} / kid</span>
                  </div>
                )}
                {Number(customerDetails.kidsUnder4) > 0 && selectedPackageId && (
                  <div className="flex justify-between items-center text-gray-500">
                    <span>Infants (Under 4):</span>
                    <span className="font-semibold text-emerald-700">{effectiveKidsUnder4Price > 0 ? `£${effectiveKidsUnder4Price} / infant` : 'Free'}</span>
                  </div>
                )}
                {selectedPackageId ? (
                  <div className="flex justify-between items-center text-gray-500 pt-1 border-t border-gray-100">
                    <span>Catering Subtotal:</span>
                    <span className="font-semibold text-gray-900">£{foodBaseAmount.toLocaleString()}</span>
                  </div>
                ) : null}

                {selectedHallOption && (
                  <div className="flex justify-between items-center text-amber-700 pt-1 border-t border-gray-100">
                    <span>🏛️ Hall Hire ({selectedHallOption.label}):</span>
                    <span className="font-semibold">+£{selectedHallOption.amount}</span>
                  </div>
                )}

                {selectedLiveCounters.length > 0 && (
                  <div className="flex justify-between items-center text-blue-700 pt-1 border-t border-gray-100">
                    <span>🍳 Live Counters ({selectedLiveCounters.length}):</span>
                    <span className="font-semibold">+£{liveCountersTotal}</span>
                  </div>
                )}

                {selectedExtras.length > 0 && (
                  <div className="flex justify-between items-center text-purple-700 pt-1 border-t border-gray-100">
                    <span>✨ Event Extras ({selectedExtras.length}):</span>
                    <span className="font-semibold">+£{extrasTotal}</span>
                  </div>
                )}

                {extraMenuItems.length > 0 && (
                  <div className="flex justify-between items-center text-teal-700 pt-1 border-t border-gray-100">
                    <span>🍽️ Extra Menu Items ({extraMenuItems.length}):</span>
                    <span className="font-semibold">+£{extraMenuItemsTotal.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Active price override pills in sidebar */}
              {activePriceOverridesList.length > 0 && (
                <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1 text-[11px]">
                  <span className="font-bold text-amber-950 uppercase tracking-wider text-[10px] block mb-1">
                    🏷️ Active Price Overrides:
                  </span>
                  {activePriceOverridesList.map((item, i) => (
                    <div key={i} className="flex justify-between items-start text-amber-900">
                      <span className="truncate max-w-[140px]">{item.title}:</span>
                      <span className="font-bold">£{item.custom} {item.original !== item.custom && <span className="line-through text-gray-400 font-normal text-[10px]">£{item.original}</span>}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected Dishes Badges */}
              {(selectedVegStarters.length > 0 ||
                selectedNonVegStarters.length > 0 ||
                selectedVegMains.length > 0 ||
                selectedNonVegMains.length > 0 ||
                selectedSundries.length > 0 ||
                selectedDesserts.length > 0 ||
                selectedLiveCounters.length > 0) && (
                <div className="pt-2.5 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                      Selected Dishes ({selectedVegStarters.length + selectedNonVegStarters.length + selectedVegMains.length + selectedNonVegMains.length + selectedSundries.length + selectedDesserts.length})
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium">Click × to remove</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-0.5">
                    {selectedVegStarters.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                        <span>🥗 {d}</span>
                        <button
                          type="button"
                          onClick={() => toggleItem(selectedVegStarters, setSelectedVegStarters, d)}
                          className="text-emerald-500 hover:text-emerald-900 font-bold ml-0.5"
                          title="Remove item"
                        >×</button>
                      </span>
                    ))}
                    {selectedNonVegStarters.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-800 border border-red-200 px-1.5 py-0.5 rounded font-medium">
                        <span>🍗 {d}</span>
                        <button
                          type="button"
                          onClick={() => toggleItem(selectedNonVegStarters, setSelectedNonVegStarters, d)}
                          className="text-red-500 hover:text-red-900 font-bold ml-0.5"
                          title="Remove item"
                        >×</button>
                      </span>
                    ))}
                    {selectedVegMains.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                        <span>🍛 {d}</span>
                        <button
                          type="button"
                          onClick={() => toggleItem(selectedVegMains, setSelectedVegMains, d)}
                          className="text-emerald-500 hover:text-emerald-900 font-bold ml-0.5"
                          title="Remove item"
                        >×</button>
                      </span>
                    ))}
                    {selectedNonVegMains.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-800 border border-red-200 px-1.5 py-0.5 rounded font-medium">
                        <span>🍖 {d}</span>
                        <button
                          type="button"
                          onClick={() => toggleItem(selectedNonVegMains, setSelectedNonVegMains, d)}
                          className="text-red-500 hover:text-red-900 font-bold ml-0.5"
                          title="Remove item"
                        >×</button>
                      </span>
                    ))}
                    {selectedSundries.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        <span>🍞 {d}</span>
                        <button
                          type="button"
                          onClick={() => toggleItem(selectedSundries, setSelectedSundries, d)}
                          className="text-amber-500 hover:text-amber-900 font-bold ml-0.5"
                          title="Remove item"
                        >×</button>
                      </span>
                    ))}
                    {selectedDesserts.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 text-[10px] bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200 px-1.5 py-0.5 rounded font-medium">
                        <span>🍮 {d}</span>
                        <button
                          type="button"
                          onClick={() => toggleItem(selectedDesserts, setSelectedDesserts, d)}
                          className="text-fuchsia-600 hover:text-fuchsia-950 font-bold ml-0.5"
                          title="Remove item"
                        >×</button>
                      </span>
                    ))}
                    {selectedLiveCounters.map((lc) => (
                      <span key={lc.name} className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-900 border border-blue-200 px-1.5 py-0.5 rounded font-medium">
                        <span>🎪 {lc.name} (£{lc.price})</span>
                        <button
                          type="button"
                          onClick={() => setSelectedLiveCounters((prev) => prev.filter((l) => l.name !== lc.name))}
                          className="text-blue-500 hover:text-blue-900 font-bold ml-0.5"
                          title="Remove item"
                        >×</button>
                      </span>
                    ))}
                  </div>

                  {/* Immediate Chef Menu Actions right under Selected Dishes */}
                  <div className="pt-2 border-t border-gray-100 flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleGenerateCurrentChefPDF}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-bold text-gray-800 bg-amber-50 hover:bg-amber-100/80 border border-amber-200 transition-colors shadow-2xs"
                      title="Generate professional Chef Menu PDF sheet with alignment and checklist"
                    >
                      <Icon name="PrinterIcon" size={13} className="text-[#C8860A]" />
                      <span>Print / PDF for Chef</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCurrentChefWhatsApp}
                      className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-2xs"
                      title="Send complete menu checklist to Chef via WhatsApp"
                    >
                      <Icon name="ChatBubbleLeftRightIcon" size={13} />
                      <span>WhatsApp Chef</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Running Subtotal */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-semibold text-gray-500">Current Subtotal:</span>
                  <span className="text-lg font-bold text-[#C8860A]">£{subtotalBeforeExtras.toLocaleString()}</span>
                </div>
                <div className="text-[10px] text-gray-400 text-right">Excl. extra delivery/taxes &amp; discounts</div>
              </div>

              {/* Step Navigation Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleNextFromStep2}
                  className="w-full text-white font-semibold py-3 rounded-xl text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
                >
                  <span>Proceed to Pricing &amp; Payment</span>
                  <Icon name="ArrowRightIcon" size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="w-full text-gray-600 font-semibold py-2.5 rounded-xl text-xs border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  ← Back to Customer Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: Pricing, Extra Charges & Payment ── */}
      {currentStep === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Main payment options (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Applied Price Overrides & Audit Log Overview */}
            {activePriceOverridesList.length > 0 && (
              <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-50/90 rounded-2xl border border-amber-300 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-amber-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-[#C8860A] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                      <Icon name="TagIcon" size={14} />
                    </span>
                    <h4 className="font-extrabold text-amber-950 text-sm">
                      Applied Custom Pricing &amp; Reasons ({activePriceOverridesList.length})
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-100/90 px-2.5 py-0.5 rounded-md border border-amber-300">
                    Manual Booking Only
                  </span>
                </div>

                <div className="space-y-2">
                  {activePriceOverridesList.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white/90 p-3 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs"
                    >
                      <div>
                        <span className="font-bold text-gray-900">{item.title}</span>
                        <div className="text-[11px] text-amber-800 mt-0.5 flex items-center gap-1.5">
                          <span>Reason:</span>
                          <strong className="font-semibold text-gray-800">"{item.reason}"</strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {item.original !== item.custom && <span className="text-gray-400 line-through text-[11px]">£{item.original.toLocaleString()}</span>}
                        <span className="font-extrabold text-[#C8860A] text-sm">£{item.custom.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Extra Charges, Delivery & Surcharges with Amount Editing & Reasons */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <Icon name="ReceiptPercentIcon" size={17} style={{ color: '#C8860A' }} />
                    Extra Charges, Delivery &amp; Surcharges
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Toggle preset fees (Delivery, Cleaning, VAT) or add custom charges. You can edit any amount and mention a reason.
                  </p>
                </div>
                <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  Settings Configured
                </span>
              </div>

              {/* Preset charges toggle checkboxes */}
              {configuredExtraCharges.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block">
                    Available Configured Charges:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {configuredExtraCharges.map((charge) => {
                      const found = bookingExtraCharges.find((c) => c.label === charge.label);
                      const isApplied = !!found;
                      const estimatedAmt = charge.type === 'percentage'
                        ? Math.round((subtotalBeforeExtras * charge.amount) / 100)
                        : charge.amount;

                      return (
                        <div
                          key={charge.id}
                          className={`p-3 rounded-xl border text-xs transition-colors space-y-2 ${
                            isApplied
                              ? 'bg-amber-50/70 border-amber-400 text-amber-950 font-medium shadow-xs'
                              : 'bg-gray-50/60 border-gray-200 text-gray-700 hover:bg-gray-100/60'
                          }`}
                        >
                          <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isApplied}
                                onChange={() => toggleConfiguredCharge(charge)}
                                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                              />
                              <div>
                                <span className="font-semibold">{charge.label}</span>
                                {charge.description && (
                                  <div className="text-[10px] text-gray-400 font-normal">{charge.description}</div>
                                )}
                              </div>
                            </div>
                            <span className="font-bold text-[#C8860A]">
                              +£{found ? found.amount.toLocaleString() : estimatedAmt.toLocaleString()}
                            </span>
                          </label>

                          {/* Inline Edit for Applied Preset Charge */}
                          {isApplied && (
                            <div className="pt-2 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block">Custom Amount (£):</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={found.amount}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const newA = val === '' ? '' : (parseFloat(val) >= 0 ? parseFloat(val) : 0);
                                    setBookingExtraCharges((prev) =>
                                      prev.map((c) => (c.label === charge.label ? { ...c, amount: newA as any, isCustomAmount: true } : c))
                                    );
                                  }}
                                  className="w-full px-2 py-1 border border-amber-300 rounded-lg bg-white font-bold text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block">Reason for Edit:</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Local discount / waived"
                                  value={found.reason || ''}
                                  onChange={(e) => {
                                    const r = e.target.value;
                                    setBookingExtraCharges((prev) =>
                                      prev.map((c) => (c.label === charge.label ? { ...c, reason: r, isCustomAmount: true } : c))
                                    );
                                  }}
                                  className="w-full px-2 py-1 border border-amber-300 rounded-lg bg-white text-[11px]"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl">
                  No preset extra charges configured in Settings yet. You can add custom ones below.
                </div>
              )}

              {/* Currently Applied Charges List */}
              {bookingExtraCharges.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-2">
                    Charges Applied to Invoice:
                  </span>
                  <div className="space-y-1.5">
                    {bookingExtraCharges.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs gap-2"
                      >
                        <div>
                          <span className="font-semibold text-gray-900">{item.label}</span>
                          {item.reason && (
                            <span className="text-[11px] text-amber-800 ml-2 italic">({item.reason})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <span className="font-bold text-amber-700">+£{item.amount.toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveExtraCharge(idx)}
                            className="text-gray-400 hover:text-red-600 p-0.5 rounded"
                            title="Remove charge"
                          >
                            <Icon name="TrashIcon" size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Custom One-Off Charge with Reason */}
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block">
                  + Add Custom Charge / Fee:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Charge label (e.g. Mileage, Extra Waiter)"
                    value={customChargeLabel}
                    onChange={(e) => setCustomChargeLabel(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">£</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Amount"
                      value={customChargeAmount}
                      onChange={(e) => setCustomChargeAmount(e.target.value)}
                      className="w-full pl-6 pr-2 py-2 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:bg-white font-bold"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Reason for charge"
                      value={customChargeReason}
                      onChange={(e) => setCustomChargeReason(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomCharge}
                      className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Discounts with Reason */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Icon name="TagIcon" size={16} className="text-amber-600" />
                  Discount (Optional)
                </h4>
                {discountAmount > 0 && (
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                    -£{discountAmount.toLocaleString()} Applied
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 font-medium"
                  >
                    <option value="none">No Discount</option>
                    <option value="fixed">Fixed Amount (£)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>

                {discountType !== 'none' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">
                        Discount Value ({discountType === 'fixed' ? '£' : '%'})
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder={discountType === 'fixed' ? 'e.g. 150' : 'e.g. 10'}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 font-bold text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Reason for Discount *</label>
                      <input
                        type="text"
                        placeholder="e.g. Early bird booking / family rate"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 4. Payment Mode: Advance vs Full vs Pending */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-5">
              <div className="border-b border-gray-100 pb-2.5">
                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Icon name="CreditCardIcon" size={17} style={{ color: '#C8860A' }} />
                  Payment Collection &amp; Order Status
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Choose whether the customer has paid an advance deposit, paid the full amount, or deposit is pending.
                </p>
              </div>

              {/* Payment choice selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: 'advance',
                    title: 'Pay Advance / Deposit',
                    subtitle: `Suggested: £${standardDeposit.toLocaleString()}`,
                    badge: 'Confirmed on Calendar',
                    badgeColor: 'bg-amber-100 text-amber-800',
                  },
                  {
                    id: 'full',
                    title: 'Pay Full Amount',
                    subtitle: `Full: £${grandTotal.toLocaleString()}`,
                    badge: 'Fully Paid & Scheduled',
                    badgeColor: 'bg-emerald-100 text-emerald-800',
                  },
                  {
                    id: 'pending',
                    title: 'Deposit Pending',
                    subtitle: '£0 collected now',
                    badge: 'Pay Later',
                    badgeColor: 'bg-gray-100 text-gray-700',
                  },
                ].map((opt) => {
                  const isSelected = paymentChoice === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => {
                        setPaymentChoice(opt.id as any);
                        if (opt.id === 'advance') {
                          const parsed = parseFloat(customDepositAmount) || 0;
                          if (!customDepositAmount || parsed <= 0 || parsed >= grandTotal) {
                            setCustomDepositAmount(standardDeposit.toString());
                          }
                        }
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-400 shadow-sm'
                          : 'border-gray-200 bg-gray-50/40 hover:bg-gray-100/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-gray-900">{opt.title}</span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-amber-600 bg-amber-600 text-white' : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <Icon name="CheckIcon" size={10} />}
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-[#C8860A]">{opt.subtitle}</div>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-2 ${opt.badgeColor}`}>
                        {opt.badge}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Advance Amount Customization (if choice is advance) */}
              {paymentChoice === 'advance' && (
                <div className={`border rounded-xl p-4 space-y-3 transition-colors ${
                  isDepositOverLimit
                    ? 'bg-red-50/60 border-red-300 ring-1 ring-red-300'
                    : isDepositUnderLimit
                    ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-300'
                    : 'bg-amber-50/50 border-amber-200/80'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <Icon name="BanknotesIcon" size={15} className="text-[#C8860A]" />
                      Advance Deposit Amount Collected (£):
                    </label>
                    <span className="text-xs text-amber-700 font-semibold bg-amber-100/80 px-2.5 py-0.5 rounded-md border border-amber-200/60">
                      Standard policy: £500 deposit
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">£</span>
                      <input
                        type="number"
                        min="1"
                        max={grandTotal > 1 ? grandTotal - 1 : grandTotal}
                        value={customDepositAmount}
                        onChange={(e) => setCustomDepositAmount(e.target.value)}
                        placeholder="e.g. 500"
                        className={`w-full pl-8 pr-3 py-2 border rounded-xl text-sm font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 ${
                          isDepositOverLimit
                            ? 'border-red-400 focus:ring-red-200 text-red-900'
                            : 'border-amber-300 focus:ring-amber-200'
                        }`}
                      />
                    </div>
                    <div className="text-xs text-gray-700 bg-white/90 px-3.5 py-2 rounded-xl border border-amber-200/70 shadow-2xs">
                      Balance Remaining Due:{' '}
                      <strong className={remainingBalance > 0 ? 'text-amber-800 text-sm font-extrabold' : 'text-emerald-700 text-sm font-extrabold'}>
                        £{remainingBalance.toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="text-[11px] text-gray-500 font-medium">Quick set:</span>
                    <button
                      type="button"
                      onClick={() => setCustomDepositAmount(standardDeposit.toString())}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-800 transition-colors shadow-2xs"
                    >
                      £{standardDeposit.toLocaleString()} (Standard Policy)
                    </button>
                    {grandTotal > 1000 && Math.round(grandTotal * 0.25) < grandTotal && (
                      <button
                        type="button"
                        onClick={() => setCustomDepositAmount(Math.round(grandTotal * 0.25).toString())}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 transition-colors shadow-2xs"
                      >
                        25% (£{Math.round(grandTotal * 0.25).toLocaleString()})
                      </button>
                    )}
                    {grandTotal > 500 && Math.round(grandTotal * 0.5) < grandTotal && (
                      <button
                        type="button"
                        onClick={() => setCustomDepositAmount(Math.round(grandTotal * 0.5).toString())}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 transition-colors shadow-2xs"
                      >
                        50% (£{Math.round(grandTotal * 0.5).toLocaleString()})
                      </button>
                    )}
                  </div>

                  {isDepositOverLimit && (
                    <div className="text-xs text-red-700 bg-red-100/80 border border-red-200 rounded-xl p-3 font-medium flex items-start gap-2">
                      <Icon name="ExclamationTriangleIcon" size={17} className="text-red-600 flex-shrink-0 mt-0.5" />
                      <span>
                        Advance deposit (£{customDepositNum.toLocaleString()}) cannot equal or exceed total order (£{grandTotal.toLocaleString()}). Select <strong>Pay Full Amount</strong> above instead.
                      </span>
                    </div>
                  )}

                  {isDepositUnderLimit && (
                    <div className="text-xs text-amber-800 bg-amber-100/80 border border-amber-200 rounded-xl p-3 font-medium flex items-center gap-2">
                      <Icon name="ExclamationTriangleIcon" size={17} className="text-amber-600 flex-shrink-0" />
                      <span>Please enter an advance deposit amount greater than £0.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Method Selection */}
              {paymentChoice !== 'pending' && (
                <div className="space-y-3 pt-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Payment Method Received:
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { value: 'Paid by Cash', label: 'Cash Payment', icon: 'BanknotesIcon' },
                      { value: 'Paid by Card', label: 'Card Payment', icon: 'CreditCardIcon' },
                      { value: 'Paid by Bank Transfer', label: 'Bank Transfer', icon: 'BuildingLibraryIcon' },
                    ].map((pm) => {
                      const isSelected = paymentMethod === pm.value;
                      return (
                        <button
                          key={pm.value}
                          type="button"
                          onClick={() => setPaymentMethod(pm.value as any)}
                          className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-xs'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <Icon name={pm.icon} size={15} />
                          <span>{pm.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {paymentMethod === 'Paid by Bank Transfer' && (
                    <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 space-y-2.5 animate-scale-up">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <Icon name="BuildingLibraryIcon" size={15} />
                          Bank Account Details for Transfer:
                        </span>
                        <span className="text-[11px] font-bold text-[#C8860A] bg-white px-2.5 py-0.5 rounded-md border border-amber-200 shadow-2xs">
                          Amount: £{amountPaid.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-700 font-mono bg-white p-3 rounded-lg border border-amber-100 space-y-1 shadow-2xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-sans">Account Name:</span>
                          <span className="font-semibold text-gray-900">{bankDetails?.accountName || 'Honeymoon Events Ltd'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-sans">Sort Code:</span>
                          <span className="font-semibold text-gray-900">{bankDetails?.sortCode || '00-00-00'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-sans">Account No:</span>
                          <span className="font-semibold text-gray-900">{bankDetails?.accountNumber || '12345678'}</span>
                        </div>
                        <div className="flex justify-between border-t border-gray-100 pt-1">
                          <span className="text-gray-500 font-sans">Reference:</span>
                          <span className="font-bold text-amber-800">{customerDetails.name ? customerDetails.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) : 'HONEYMOON'}</span>
                        </div>
                      </div>
                      {customerDetails.phone ? (
                        <a
                          href={`https://wa.me/${formatWhatsAppPhone(customerDetails.phone)}?text=${encodeURIComponent(
                            `Hi ${customerDetails.name.split(' ')[0] || 'there'}, here are our bank transfer details for your ${customerDetails.eventType || 'event'} booking on ${customerDetails.date || 'upcoming date'} with Honeymoon Events 🎉:\n\n*💰 Amount to Transfer: £${amountPaid.toLocaleString()}*\n\n🏦 *Account Name:* ${bankDetails?.accountName || 'Honeymoon Events Ltd'}\n📋 *Sort Code:* ${bankDetails?.sortCode || '00-00-00'}\n🔢 *Account No:* ${bankDetails?.accountNumber || '12345678'}\n📌 *Payment Reference:* ${customerDetails.name ? customerDetails.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) : 'HONEYMOON'}\n\nOnce transferred, please share your confirmation screenshot here. Thank you!`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs hover:shadow-md transition-all active:scale-95"
                          style={{ background: '#25D366' }}
                        >
                          <Icon name="ChatBubbleLeftRightIcon" size={15} />
                          <span>Share Bank Details via WhatsApp</span>
                        </a>
                      ) : (
                        <p className="text-[11px] text-gray-500 italic text-center">
                          Enter customer phone number in Step 1 to share bank details via WhatsApp with 1 click.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Payment Reference */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">
                        Payment Reference / Note (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Bank ref #1234 or receipt number"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">
                        Final Balance Due Date
                      </label>
                      <input
                        type="date"
                        value={paymentDueDate}
                        onChange={(e) => setPaymentDueDate(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 font-medium"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Rail: Complete Invoice / Order Preview */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm sticky top-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">Final Bill Preview</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                  Ready to Book
                </span>
              </div>

              {/* Order breakdown */}
              <div className="text-xs space-y-2 text-gray-700">
                {selectedPackageId && adultFoodTotal > 0 && (
                  <div className="flex justify-between">
                    <span>
                      Adult Catering ({customerDetails.adults} × £{effectivePackagePrice}):
                    </span>
                    <span className="font-semibold">£{adultFoodTotal.toLocaleString()}</span>
                  </div>
                )}

                {Number(customerDetails.kids4to10) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Kids 4–10 ({customerDetails.kids4to10} × £{effectiveKidsPrice}):</span>
                    <span className="font-semibold">+£{kidsFoodTotal.toLocaleString()}</span>
                  </div>
                )}

                {Number(customerDetails.kidsUnder4) > 0 && effectiveKidsUnder4Price > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Infants ({customerDetails.kidsUnder4} × £{effectiveKidsUnder4Price}):</span>
                    <span className="font-semibold">+£{kidsUnder4FoodTotal.toLocaleString()}</span>
                  </div>
                )}

                {selectedHallOption && (
                  <div className="flex justify-between text-amber-800">
                    <span>Hall Hire ({selectedHallOption.label}):</span>
                    <span className="font-semibold">+£{selectedHallOption.amount.toLocaleString()}</span>
                  </div>
                )}

                {liveCountersTotal > 0 && (
                  <div className="flex justify-between text-blue-800">
                    <span>Live Counters ({selectedLiveCounters.length}):</span>
                    <span className="font-semibold">+£{liveCountersTotal.toLocaleString()}</span>
                  </div>
                )}

                {extrasTotal > 0 && (
                  <div className="flex justify-between text-purple-800">
                    <span>Event Extras ({selectedExtras.length}):</span>
                    <span className="font-semibold">+£{extrasTotal.toLocaleString()}</span>
                  </div>
                )}

                {extraMenuItemsTotal > 0 && (
                  <div className="flex justify-between text-teal-800">
                    <span>Extra Menu Items ({extraMenuItems.length}):</span>
                    <span className="font-semibold">+£{extraMenuItemsTotal.toLocaleString()}</span>
                  </div>
                )}

                {/* Extra charges line items */}
                {bookingExtraCharges.map((extra, idx) => (
                  <div key={idx} className="flex justify-between text-amber-700">
                    <span>+ {extra.label}:</span>
                    <span className="font-semibold">£{extra.amount.toLocaleString()}</span>
                  </div>
                ))}

                {/* Subtotal */}
                <div className="pt-2 border-t border-gray-100 flex justify-between font-semibold text-gray-600">
                  <span>Subtotal:</span>
                  <span>£{(subtotalBeforeExtras + extraChargesTotal).toLocaleString()}</span>
                </div>

                {/* Discount */}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-red-600 font-semibold">
                    <span>Discount ({discountReason || 'Discount'}):</span>
                    <span>-£{discountAmount.toLocaleString()}</span>
                  </div>
                )}

                {/* Grand Total */}
                <div className="pt-2.5 border-t-2 border-gray-200 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-gray-900">Grand Total:</span>
                  <span className="text-xl font-extrabold text-[#C8860A]">
                    £{grandTotal.toLocaleString()}
                  </span>
                </div>

                {/* Payment Breakdown Box */}
                <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Amount Paid Now:</span>
                    <span>£{amountPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-amber-800 font-bold">
                    <span>Remaining Balance:</span>
                    <span>£{remainingBalance.toLocaleString()}</span>
                  </div>
                  {paymentDueDate && (
                    <div className="flex justify-between text-gray-500 pt-1 border-t border-gray-200">
                      <span>Due Date:</span>
                      <span>{paymentDueDate}</span>
                    </div>
                  )}
                  {paymentChoice !== 'pending' && (
                    <div className="flex justify-between text-gray-500">
                      <span>Payment Method:</span>
                      <span>{paymentMethod.replace('Paid by ', '')}</span>
                    </div>
                  )}
                </div>

                {/* 3 PDFs Toolbar in Step 3 Preview */}
                <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-gray-600 uppercase tracking-wide">
                    <span>Event Documents &amp; Invoices</span>
                    <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      3 PDFs Available
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={handleGenerateCurrentChefPDF}
                      className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100 font-bold text-amber-900 transition-all shadow-2xs text-center"
                      title="Generate Menu / Chef Production Sheet PDF"
                    >
                      <Icon name="ClipboardDocumentListIcon" size={16} className="text-[#C8860A]" />
                      <span className="text-[10px] leading-tight">1. Menu PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerateCurrentInvoice(true)}
                      className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 font-bold text-emerald-900 transition-all shadow-2xs text-center"
                      title="Generate Deposit Invoice PDF"
                    >
                      <Icon name="DocumentTextIcon" size={16} className="text-emerald-600" />
                      <span className="text-[10px] leading-tight">2. Deposit PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerateCurrentInvoice(false)}
                      className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 font-bold text-blue-900 transition-all shadow-2xs text-center"
                      title="Generate Final Invoice PDF"
                    >
                      <Icon name="DocumentCheckIcon" size={16} className="text-blue-600" />
                      <span className="text-[10px] leading-tight">3. Final PDF</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Order Placement Action */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || isAdvanceDepositInvalid}
                  onClick={handlePlaceOrder}
                  className={`w-full text-white font-bold py-3.5 rounded-xl text-sm shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    isAdvanceDepositInvalid ? 'opacity-50 cursor-not-allowed' : 'disabled:opacity-50'
                  }`}
                  style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
                >
                  <Icon name="CheckCircleIcon" size={18} />
                  <span>
                    {isSubmitting
                      ? 'Placing Order...'
                      : isDepositOverLimit
                      ? 'Advance Exceeds Total'
                      : 'Place & Confirm Booking'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="w-full text-gray-600 font-semibold py-2 rounded-xl text-xs border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  ← Back to Menu Selection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Order Completed Success State ── */}
      {currentStep === 4 && createdBooking && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center max-w-3xl mx-auto space-y-6 animate-scale-up">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-white shadow-lg"
            style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
          >
            <Icon name="CheckIcon" size={32} />
          </div>

          <div>
            <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${
              createdBooking.status === 'completed' || createdBooking.finalPaymentPaid
                ? 'text-emerald-800 bg-emerald-100/70 border-emerald-300'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200'
            }`}>
              {createdBooking.status === 'completed' || createdBooking.finalPaymentPaid
                ? 'Order Closed & Completed in Full ✅'
                : 'Booking Confirmed & Added to Calendar'}
            </span>
            <h3 className="text-2xl font-extrabold text-gray-900 mt-3">
              {createdBooking.status === 'completed' || createdBooking.finalPaymentPaid
                ? 'Order Placed & Completed!'
                : 'Order Placed Successfully!'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Booking Reference:{' '}
              <strong className="text-amber-800 font-mono text-base">{createdBooking.id}</strong>
            </p>
          </div>

          {/* Quick Summary Card */}
          <div className="bg-amber-50/40 border border-amber-200/80 rounded-2xl p-5 text-left grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-500 block">Customer</span>
              <strong className="text-gray-900 font-semibold text-sm">{createdBooking.name}</strong>
              <div className="text-gray-500 text-[11px]">{createdBooking.phone}</div>
            </div>
            <div>
              <span className="text-gray-500 block">Event Date</span>
              <strong className="text-gray-900 font-semibold text-sm">{createdBooking.date}</strong>
              <div className="text-gray-500 text-[11px]">{createdBooking.time}</div>
            </div>
            <div>
              <span className="text-gray-500 block">Package &amp; Guests</span>
              <strong className="text-gray-900 font-semibold text-sm">{createdBooking.package}</strong>
              <div className="text-gray-500 text-[11px]">
                {createdBooking.guests} Guests (£{effectivePackagePrice}/pp)
              </div>
            </div>
            <div>
              <span className="text-gray-500 block">Payment Status</span>
              <strong className="text-emerald-700 font-semibold text-sm">
                {createdBooking.finalPaymentPaid ? 'Paid in Full — Order Closed' : createdBooking.depositPaid ? `Deposit Paid (£${createdBooking.deposit})` : 'Pending'}
              </strong>
              <div className="text-amber-700 text-[11px]">
                {createdBooking.finalPaymentPaid ? 'No balance due' : `Balance: £${(grandTotal - amountPaid).toLocaleString()}`}
              </div>
            </div>
          </div>

          {/* Price Adjustments Audit Card in Confirmation */}
          {activePriceOverridesList.length > 0 && (
            <div className="bg-white p-4 rounded-xl border border-amber-200 text-left space-y-2 text-xs">
              <span className="font-bold text-amber-950 uppercase tracking-wide text-[11px] block">
                🏷️ Recorded Custom Price Overrides:
              </span>
              <div className="space-y-1 text-gray-700">
                {activePriceOverridesList.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px] py-1 border-b border-gray-100 last:border-0">
                    <span>
                      <strong>{item.title}:</strong> £{item.custom} {item.original !== item.custom && <span className="line-through text-gray-400">£{item.original}</span>}
                      <span className="italic text-gray-500 ml-1.5 font-normal">("{item.reason}")</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 Documents & Invoices Row */}
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide text-left">
              Official Booking Documents (3 PDFs)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 1. Menu PDF for Chef */}
              <button
                type="button"
                onClick={() => generateChefMenuPDF(createdBooking)}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100/80 text-xs font-bold text-amber-950 transition-all shadow-xs"
                title="Download complete Menu & Chef Production Order Sheet PDF"
              >
                <Icon name="ClipboardDocumentListIcon" size={16} className="text-[#C8860A]" />
                <span>1. Menu PDF (Chef Sheet)</span>
              </button>

              {/* 2. Deposit Invoice PDF */}
              <button
                type="button"
                onClick={() => {
                  if (onGenerateInvoice) {
                    onGenerateInvoice(createdBooking, true);
                  }
                }}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100/80 text-xs font-bold text-emerald-950 transition-all shadow-xs"
                title="Download official Deposit Invoice PDF"
              >
                <Icon name="DocumentTextIcon" size={16} className="text-emerald-700" />
                <span>2. Deposit Invoice PDF</span>
              </button>

              {/* 3. Final Invoice PDF */}
              <button
                type="button"
                onClick={() => {
                  if (onGenerateInvoice) {
                    onGenerateInvoice(createdBooking, false);
                  }
                }}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100/80 text-xs font-bold text-blue-950 transition-all shadow-xs"
                title="Download complete Final Invoice & Receipt PDF"
              >
                <Icon name="DocumentCheckIcon" size={16} className="text-blue-700" />
                <span>3. Final Invoice PDF</span>
              </button>
            </div>
          </div>

          {/* WhatsApp & Navigation Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* View on Calendar */}
            <button
              type="button"
              onClick={() => {
                if (onNavigateTab) onNavigateTab('calendar', createdBooking.date);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-xs"
            >
              <Icon name="CalendarIcon" size={16} className="text-amber-600" />
              <span>View on Calendar</span>
            </button>

            {/* View in Bookings */}
            <button
              type="button"
              onClick={() => {
                if (onNavigateTab) onNavigateTab('bookings');
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-xs"
            >
              <Icon name="CalendarDaysIcon" size={16} className="text-blue-600" />
              <span>View in Bookings List</span>
            </button>

            {/* WhatsApp to Chef */}
            <button
              type="button"
              onClick={() => openChefWhatsApp(createdBooking)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white shadow-md hover:shadow-lg transition-all"
              style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}
            >
              <Icon name="ChatBubbleLeftRightIcon" size={16} />
              <span>Send Menu to Chef via WhatsApp</span>
            </button>

            {/* WhatsApp Confirmation to Customer */}
            <a
              href={`https://wa.me/${formatWhatsAppPhone(createdBooking.phone)}?text=${encodeURIComponent(
                createdBooking.finalPaymentPaid || createdBooking.status === 'completed'
                  ? `Hi ${createdBooking.name.split(' ')[0]}, thank you for confirming your booking with Honeymoon Events! 🎉\n\n*Booking Ref:* ${createdBooking.id}\n*Event:* ${createdBooking.eventType} on ${createdBooking.date} (${createdBooking.time})\n*Package:* ${createdBooking.package} for ${createdBooking.guests} guests\n*Grand Total:* £${grandTotal.toLocaleString()}\n*Payment Status:* Paid in Full via ${paymentMethod} ✅\n*Order Status:* Closed & Confirmed\n\nWe look forward to hosting your memorable event! Please contact us if you need any assistance.`
                  : `Hi ${createdBooking.name.split(' ')[0]}, thank you for confirming your booking with Honeymoon Events! 🎉\n\nBooking Ref: ${createdBooking.id}\nEvent: ${createdBooking.eventType} on ${createdBooking.date} (${createdBooking.time})\nPackage: ${createdBooking.package} for ${createdBooking.guests} guests\nTotal: £${grandTotal.toLocaleString()}\nAmount Paid: £${amountPaid.toLocaleString()} (${paymentMethod})\nRemaining Balance: £${(grandTotal - amountPaid).toLocaleString()}\n\nWe look forward to hosting your memorable event!`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white shadow-md hover:shadow-lg transition-all"
              style={{ background: '#25D366' }}
            >
              <Icon name="ChatBubbleLeftRightIcon" size={16} />
              <span>{createdBooking.finalPaymentPaid || createdBooking.status === 'completed' ? 'WhatsApp Receipt to Customer (Full Paid)' : 'WhatsApp Deposit Confirmation to Customer'}</span>
            </a>
          </div>

          {/* Reset / Create Another Booking / Amend Booking */}
          <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors shadow-2xs"
              >
                <Icon name="PencilIcon" size={13} />
                <span>Amend Customer &amp; Pricing (Step 1)</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors shadow-2xs"
              >
                <Icon name="PencilIcon" size={13} />
                <span>Amend Menu &amp; Extras (Step 2)</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors shadow-2xs"
              >
                <Icon name="PencilIcon" size={13} />
                <span>Amend Payment (Step 3)</span>
              </button>
            </div>
            {editingBooking && onCancelEdit ? (
              <button
                type="button"
                onClick={onCancelEdit}
                className="text-xs font-semibold px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white transition-colors shadow-sm"
              >
                ← Return to Bookings
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResetForm}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900 underline"
              >
                + Create Another Booking
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── ADD / EDIT PACKAGE MODAL ─── */}
      {(showAddPackageModal || editingPackageModal !== null) && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg border border-gray-100 space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {editingPackageModal ? `Edit Package: ${editingPackageModal.name}` : 'Create Custom Banquet Package'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure package head rates, quotas, and included dishes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddPackageModal(false);
                  setEditingPackageModal(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Package Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Diamond Banquet"
                    value={packageForm.name}
                    onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Tag / Badge</label>
                  <input
                    type="text"
                    placeholder="e.g. VIP Choice, Most Popular"
                    value={packageForm.tag}
                    onChange={(e) => setPackageForm({ ...packageForm, tag: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Adult Rate (£ / person) *</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 35"
                    value={packageForm.pricePerPerson}
                    onChange={(e) => setPackageForm({ ...packageForm, pricePerPerson: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Kids Rate (4–10 yrs) (£ / kid)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 18"
                    value={packageForm.kidsPrice}
                    onChange={(e) => setPackageForm({ ...packageForm, kidsPrice: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Guest Requirements Label</label>
                <input
                  type="text"
                  placeholder="e.g. Minimum 75 guests"
                  value={packageForm.guestLabel}
                  onChange={(e) => setPackageForm({ ...packageForm, guestLabel: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white"
                />
              </div>

              {/* Quotas */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                <span className="font-bold text-amber-900 block text-[11px] uppercase tracking-wide">
                  Dish Quotas
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-0.5">Veg Starters</label>
                    <input
                      type="number"
                      min={0}
                      value={packageForm.vegStarters}
                      onChange={(e) => setPackageForm({ ...packageForm, vegStarters: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-0.5">Non-Veg Starters</label>
                    <input
                      type="number"
                      min={0}
                      value={packageForm.nonVegStarters}
                      onChange={(e) => setPackageForm({ ...packageForm, nonVegStarters: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-0.5">Veg Mains</label>
                    <input
                      type="number"
                      min={0}
                      value={packageForm.vegMains}
                      onChange={(e) => setPackageForm({ ...packageForm, vegMains: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-0.5">Non-Veg Mains</label>
                    <input
                      type="number"
                      min={0}
                      value={packageForm.nonVegMains}
                      onChange={(e) => setPackageForm({ ...packageForm, nonVegMains: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Desserts Included</label>
                  <input
                    type="text"
                    placeholder="e.g. 1 Sweet Dish, Ice Cream"
                    value={packageForm.desserts}
                    onChange={(e) => setPackageForm({ ...packageForm, desserts: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Drinks Included</label>
                  <input
                    type="text"
                    placeholder="e.g. Soft Drinks, Bottled Water"
                    value={packageForm.drinks}
                    onChange={(e) => setPackageForm({ ...packageForm, drinks: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowAddPackageModal(false);
                  setEditingPackageModal(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const name = packageForm.name.trim();
                  if (!name) return;
                  const price = parseFloat(packageForm.pricePerPerson) || 0;
                  const kidsPrice = parseFloat(packageForm.kidsPrice) || 0;

                  if (editingPackageModal) {
                    setAllBanquetPackages((prev) =>
                      prev.map((p) =>
                        p.id === editingPackageModal.id
                          ? {
                              ...p,
                              name,
                              pricePerPerson: price,
                              kidsPrice: kidsPrice || (p as any).kidsPrice,
                              tag: packageForm.tag.trim(),
                              guestLabel: packageForm.guestLabel.trim(),
                              starters: { veg: packageForm.vegStarters, nonVeg: packageForm.nonVegStarters },
                              mains: { veg: packageForm.vegMains, nonVeg: packageForm.nonVegMains },
                              desserts: packageForm.desserts.split(',').map((s) => s.trim()).filter(Boolean),
                              drinks: packageForm.drinks.split(',').map((s) => s.trim()).filter(Boolean),
                            }
                          : p
                      )
                    );
                    setEditingPackageModal(null);
                  } else {
                    const newPkgId = 'pkg_custom_' + Date.now();
                    const newPkg: BanquetPackageItem = {
                      id: newPkgId,
                      name,
                      pricePerPerson: price,
                      tag: packageForm.tag.trim(),
                      guestLabel: packageForm.guestLabel.trim(),
                      starters: { veg: packageForm.vegStarters, nonVeg: packageForm.nonVegStarters },
                      mains: { veg: packageForm.vegMains, nonVeg: packageForm.nonVegMains },
                      desserts: packageForm.desserts.split(',').map((s) => s.trim()).filter(Boolean),
                      drinks: packageForm.drinks.split(',').map((s) => s.trim()).filter(Boolean),
                    } as any;
                    (newPkg as any).kidsPrice = kidsPrice;
                    setAllBanquetPackages((prev) => [...prev, newPkg]);
                    setSelectedPackageId(newPkgId);
                    setShowAddPackageModal(false);
                  }
                }}
                disabled={!packageForm.name.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
              >
                {editingPackageModal ? 'Save Changes' : 'Create Package'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CENTERED POPUP MODAL ─── */}
      {centerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-100 flex flex-col items-center text-center animate-scale-up">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
                centerModal.type === 'success'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              <Icon
                name={centerModal.type === 'success' ? 'CheckIcon' : 'ExclamationTriangleIcon'}
                size={28}
              />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">{centerModal.title}</h3>
            <p className="text-xs text-gray-600 mb-5 leading-relaxed">{centerModal.message}</p>
            <button
              type="button"
              onClick={() => setCenterModal(null)}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
