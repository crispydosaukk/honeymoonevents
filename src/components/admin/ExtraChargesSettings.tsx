'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export interface ConfiguredExtraCharge {
  id: string;
  label: string;
  type: 'fixed' | 'percentage';
  amount: number;
  isDefault?: boolean;
  description?: string;
  category?: 'delivery' | 'tax' | 'service' | 'other';
}

export const DEFAULT_CONFIGURED_CHARGES: ConfiguredExtraCharge[] = [
  {
    id: 'charge_vat_20',
    label: 'VAT / Tax (20%)',
    type: 'percentage',
    amount: 20,
    isDefault: false,
    description: 'Standard UK VAT charged on subtotal (card / bank transfers)',
    category: 'tax',
  },
  {
    id: 'charge_delivery',
    label: 'Delivery & Transport Charge',
    type: 'fixed',
    amount: 50,
    isDefault: false,
    description: 'Standard delivery & logistics charge for offsite / venue delivery',
    category: 'delivery',
  },
  {
    id: 'charge_cleaning',
    label: 'Post-Event Cleaning Surcharge',
    type: 'fixed',
    amount: 100,
    isDefault: false,
    description: 'Venue cleanup and waste management fee',
    category: 'service',
  },
];

interface ExtraChargesSettingsProps {
  onChargesUpdated?: (charges: ConfiguredExtraCharge[]) => void;
}

export default function ExtraChargesSettings({ onChargesUpdated }: ExtraChargesSettingsProps) {
  const [charges, setCharges] = useState<ConfiguredExtraCharge[]>(DEFAULT_CONFIGURED_CHARGES);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Center popup modal & delete confirmation
  const [centerModal, setCenterModal] = useState<{ title: string; message: string; type: 'error' | 'success' } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formType, setFormType] = useState<'fixed' | 'percentage'>('fixed');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formCategory, setFormCategory] = useState<'delivery' | 'tax' | 'service' | 'other'>('other');
  const [formDescription, setFormDescription] = useState('');

  // Listen to Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'site_data', 'extra_charges_config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.charges) && data.charges.length > 0) {
          setCharges(data.charges);
          if (onChargesUpdated) onChargesUpdated(data.charges);
        }
      }
    }, (err) => {
      console.error('Error loading extra charges config:', err);
    });

    return () => unsub();
  }, [onChargesUpdated]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormLabel('');
    setFormType('fixed');
    setFormAmount('');
    setFormIsDefault(false);
    setFormCategory('other');
    setFormDescription('');
    setErrorMessage('');
    setShowModal(true);
  };

  const handleOpenEdit = (charge: ConfiguredExtraCharge) => {
    setEditingId(charge.id);
    setFormLabel(charge.label);
    setFormType(charge.type);
    setFormAmount(charge.amount.toString());
    setFormIsDefault(charge.isDefault || false);
    setFormCategory(charge.category || 'other');
    setFormDescription(charge.description || '');
    setErrorMessage('');
    setShowModal(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim()) {
      setErrorMessage('Please enter a charge or fee label.');
      return;
    }
    const parsedAmount = parseFloat(formAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setErrorMessage('Please enter a valid amount or percentage (0 or higher).');
      return;
    }

    let updatedList: ConfiguredExtraCharge[] = [];

    if (editingId) {
      updatedList = charges.map((c) =>
        c.id === editingId
          ? {
              ...c,
              label: formLabel.trim(),
              type: formType,
              amount: parsedAmount,
              isDefault: formIsDefault,
              category: formCategory,
              description: formDescription.trim(),
            }
          : c
      );
    } else {
      const newCharge: ConfiguredExtraCharge = {
        id: `charge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        label: formLabel.trim(),
        type: formType,
        amount: parsedAmount,
        isDefault: formIsDefault,
        category: formCategory,
        description: formDescription.trim(),
      };
      updatedList = [...charges, newCharge];
    }

    setCharges(updatedList);
    setShowModal(false);

    // Persist to Firestore
    await persistCharges(updatedList);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const updatedList = charges.filter((c) => c.id !== deleteConfirmId);
    setCharges(updatedList);
    setDeleteConfirmId(null);
    await persistCharges(updatedList);
  };

  const handleToggleDefault = async (id: string) => {
    const updatedList = charges.map((c) =>
      c.id === id ? { ...c, isDefault: !c.isDefault } : c
    );
    setCharges(updatedList);
    await persistCharges(updatedList);
  };

  const persistCharges = async (listToSave: ConfiguredExtraCharge[]) => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      await setDoc(
        doc(db, 'site_data', 'extra_charges_config'),
        {
          charges: listToSave,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setSavedSuccess(true);
      if (onChargesUpdated) onChargesUpdated(listToSave);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      console.error('Failed to save extra charges:', err);
      setCenterModal({
        title: 'Settings Notice',
        message: err?.message || 'Failed to save extra charges to database. Please check your connection.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-base">
            <Icon name="ReceiptPercentIcon" size={20} style={{ color: '#C8860A' }} />
            Extra Charges, Fees &amp; Taxes
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure preset delivery charges, tax/VAT rates, and service fees to add into bookings and invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 animate-fade-in">
              <Icon name="CheckCircleIcon" size={14} />
              Saved!
            </span>
          )}
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
          >
            <Icon name="PlusIcon" size={14} />
            Add Charge Field
          </button>
        </div>
      </div>

      {/* Charges List */}
      {charges.length === 0 ? (
        <div className="text-center py-8 px-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
          <Icon name="ReceiptPercentIcon" size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">No extra charges configured</p>
          <p className="text-xs text-gray-400 mt-0.5 mb-3">
            Add delivery fees, tax percentages, or cleaning charges that reflect in bookings and invoices.
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="text-xs font-semibold text-[#C8860A] hover:underline"
          >
            + Add First Charge
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {charges.map((charge) => (
            <div
              key={charge.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50/20 transition-all bg-gray-50/60"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background:
                      charge.category === 'tax'
                        ? 'rgba(124, 58, 237, 0.1)'
                        : charge.category === 'delivery'
                        ? 'rgba(14, 165, 233, 0.1)'
                        : 'rgba(200, 134, 10, 0.1)',
                    color:
                      charge.category === 'tax'
                        ? '#7C3AED'
                        : charge.category === 'delivery'
                        ? '#0284C7'
                        : '#C8860A',
                  }}
                >
                  <Icon
                    name={
                      charge.category === 'tax'
                        ? 'ReceiptPercentIcon'
                        : charge.category === 'delivery'
                        ? 'TruckIcon'
                        : 'CurrencyPoundIcon'
                    }
                    size={16}
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{charge.label}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        charge.type === 'percentage'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {charge.type === 'percentage' ? `${charge.amount}% Rate` : `+£${charge.amount.toLocaleString()} Fixed`}
                    </span>
                    {charge.isDefault && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        Default Applied
                      </span>
                    )}
                  </div>
                  {charge.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{charge.description}</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleDefault(charge.id)}
                  title={charge.isDefault ? 'Default enabled for new bookings' : 'Make default for new bookings'}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                    charge.isDefault
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {charge.isDefault ? '✓ Default On' : 'Default Off'}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEdit(charge)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                  title="Edit charge"
                >
                  <Icon name="PencilSquareIcon" size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(charge.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete charge"
                >
                  <Icon name="TrashIcon" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick note on invoice reflection */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Icon name="InformationCircleIcon" size={14} className="text-[#C8860A]" />
          Configured charges reflect automatically in Manual Booking, Booking Details &amp; Invoices.
        </span>
        {isSaving && <span className="text-amber-600 font-medium animate-pulse">Saving to cloud...</span>}
      </div>

      {/* Modal: Add / Edit Charge */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 animate-scale-up">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-50/50 to-white">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2 text-base">
                <Icon name="ReceiptPercentIcon" size={18} style={{ color: '#C8860A' }} />
                {editingId ? 'Edit Charge Field' : 'Add Extra Charge / Tax Field'}
              </h4>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 space-y-4">
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
                  {errorMessage}
                </div>
              )}

              {/* Charge Label */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Charge Name / Field Label *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Delivery Charge, VAT / Tax (20%), Cleaning Fee"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Charge Type: Fixed vs Percentage */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                    Charge Type *
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as 'fixed' | 'percentage')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                  >
                    <option value="fixed">Fixed Amount (£)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                    Amount / Rate ({formType === 'fixed' ? '£' : '%'}) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-xs">
                      {formType === 'fixed' ? '£' : '%'}
                    </span>
                    <input
                      type="number"
                      step={formType === 'percentage' ? '0.1' : '1'}
                      min="0"
                      required
                      placeholder={formType === 'fixed' ? '50' : '20'}
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-gray-900"
                    />
                  </div>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as any)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="delivery">Delivery &amp; Logistics</option>
                  <option value="tax">Tax / VAT</option>
                  <option value="service">Service &amp; Cleaning</option>
                  <option value="other">Other Surcharge</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Description / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Applied to event total for delivery outside radius"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Default Active Checkbox */}
              <div className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-3">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-gray-800">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Automatically apply as default charge on new manual bookings</span>
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg, #C8860A, #F0A830)' }}
                >
                  {editingId ? 'Update Charge' : 'Add Charge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ─── CENTERED DELETE CONFIRMATION MODAL ─── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-100 flex flex-col items-center text-center animate-scale-up">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-red-50 text-red-600">
              <Icon name="TrashIcon" size={26} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">Delete Charge Field?</h3>
            <p className="text-xs text-gray-600 mb-5 leading-relaxed">
              Are you sure you want to remove this charge configuration? Existing bookings will not be affected.
            </p>
            <div className="grid grid-cols-2 gap-3 w-full">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white shadow-md active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CENTERED ALERT MODAL ─── */}
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
