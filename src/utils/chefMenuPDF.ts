export interface ChefMenuData {
  id?: string;
  bookingRef?: string;
  name?: string;
  phone?: string;
  eventType?: string;
  date?: string;
  time?: string;
  timeOfDay?: string;
  guests?: number;
  adults?: number;
  kids4to10?: number;
  kidsUnder4?: number;
  package?: string;
  selectedMenu?: string;
  hallName?: string;
  notes?: string;
  selectedDishes?: {
    vegStarters?: string[];
    nonVegStarters?: string[];
    vegMains?: string[];
    nonVegMains?: string[];
    sundries?: string[];
    desserts?: string[];
    extraMenuItems?: { name: string; description?: string; cost?: number }[] | string[];
  };
  // Fallbacks if passed directly as arrays
  vegStarters?: string[];
  nonVegStarters?: string[];
  vegMains?: string[];
  nonVegMains?: string[];
  sundries?: string[];
  desserts?: string[];
  extraMenuItems?: { name: string; description?: string; cost?: number }[] | string[];
  liveCounters?: { name: string; price?: number }[] | string[];
  extras?: { name: string; price?: number }[] | string[];
}

export function generateChefMenuPDF(data: ChefMenuData): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to open the Chef Menu PDF.');
    return;
  }

  // Extract fields with fallbacks
  const bookingId = data.id || data.bookingRef || 'DRAFT-' + new Date().getTime().toString().slice(-6);
  const clientName = data.name || 'Client';
  const clientPhone = data.phone || 'N/A';
  const eventType = data.eventType || 'Event / Function';
  const eventDateRaw = data.date;
  const timeSession = data.time || data.timeOfDay || 'To be confirmed';
  const packageName = data.selectedMenu || data.package || 'Custom Banquet Package';
  const hallName = data.hallName || 'Main Banqueting Suite';
  const notes = data.notes || '';

  const adults = data.adults ?? (data.guests || 0);
  const kids4to10 = data.kids4to10 || 0;
  const kidsUnder4 = data.kidsUnder4 || 0;
  const totalGuests = (data.guests && data.guests > 0) ? data.guests : (adults + kids4to10 + kidsUnder4);

  // Dishes extraction
  const vegStarters = data.selectedDishes?.vegStarters || data.vegStarters || [];
  const nonVegStarters = data.selectedDishes?.nonVegStarters || data.nonVegStarters || [];
  const vegMains = data.selectedDishes?.vegMains || data.vegMains || [];
  const nonVegMains = data.selectedDishes?.nonVegMains || data.nonVegMains || [];
  const sundries = data.selectedDishes?.sundries || data.sundries || [];
  const desserts = data.selectedDishes?.desserts || data.desserts || [];

  // Live counters extraction
  const liveCountersList: string[] = (data.liveCounters || []).map((item) =>
    typeof item === 'string' ? item : item.name
  );

  // Extras extraction
  const extrasList: string[] = (data.extras || []).map((item) =>
    typeof item === 'string' ? item : item.name
  );

  // Extra menu items extraction
  const extraMenuItemsList: string[] = (
    data.selectedDishes?.extraMenuItems ||
    data.extraMenuItems ||
    []
  ).map((item) =>
    typeof item === 'string'
      ? item
      : `${item.name}${item.description ? ` (${item.description})` : ''}`
  );

  // Formatted dates
  let formattedDate = 'To be confirmed';
  if (eventDateRaw) {
    try {
      const d = new Date(eventDateRaw);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } else {
        formattedDate = eventDateRaw;
      }
    } catch {
      formattedDate = eventDateRaw;
    }
  }

  const generatedDate = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logoUrl = origin + '/assets/images/oie_gAxqzQFu0Ixw-1777831503416.png';

  const renderDishColumn = (title: string, icon: string, items: string[], badgeColor: string) => {
    return `
      <div class="dish-card">
        <div class="dish-header">
          <div class="dish-title-wrap">
            <span class="dish-icon">${icon}</span>
            <span class="dish-title">${title}</span>
          </div>
          <span class="dish-badge ${badgeColor}">${items.length} ${items.length === 1 ? 'Item' : 'Items'}</span>
        </div>
        <div class="dish-body">
          ${
            items.length > 0
              ? `
              <ul class="dish-list">
                ${items
                  .map(
                    (d) => `
                  <li class="dish-item">
                    <span class="checkbox-box"></span>
                    <span class="dish-name">${d}</span>
                  </li>
                `
                  )
                  .join('')}
              </ul>
            `
              : `<div class="empty-dish">None selected for this category</div>`
          }
        </div>
      </div>
    `;
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Chef & Kitchen Order Sheet - ${bookingId} - ${clientName}</title>
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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          color: #111827;
          background: #ffffff;
          margin: 0;
          padding: 24px;
          line-height: 1.45;
          font-size: 13px;
        }

        @media print {
          body {
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
          .avoid-break {
            page-break-inside: avoid;
          }
        }

        /* Top Action Bar (hidden on print) */
        .action-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 18px;
          background: #FFFBEB;
          border: 1px solid #FDE68A;
          border-radius: 12px;
          margin-bottom: 24px;
        }
        .action-btn {
          background: #C8860A;
          color: white;
          border: none;
          padding: 8px 18px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }
        .action-btn:hover {
          background: #9A6205;
        }

        /* Header */
        .sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2.5px solid #C8860A;
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        .header-left h1 {
          margin: 0 0 3px 0;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #111827;
          text-transform: uppercase;
        }
        .header-left .sub-title {
          font-size: 12px;
          color: #C8860A;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .header-meta {
          display: flex;
          gap: 16px;
          font-size: 11px;
          color: #4B5563;
        }
        .header-meta span strong {
          color: #111827;
        }
        .logo-wrap {
          text-align: right;
        }
        .logo-img {
          max-height: 48px;
          max-width: 170px;
          object-fit: contain;
        }

        /* Logistics Grid */
        .logistics-card {
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 20px;
          page-break-inside: avoid;
        }
        .logistics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px 16px;
        }
        .log-item {
          display: flex;
          flex-direction: column;
        }
        .log-label {
          font-size: 10px;
          font-weight: 700;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 3px;
        }
        .log-value {
          font-size: 13px;
          font-weight: 700;
          color: #111827;
        }
        .log-value-highlight {
          color: #C8860A;
          font-size: 14px;
        }

        /* Headcount pill banner */
        .headcount-strip {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px dashed #D1D5DB;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
        }
        .headcount-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #FEF3C7;
          border: 1px solid #FCD34D;
          color: #92400E;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
        }

        /* Menu Grid */
        .menu-section-title {
          font-size: 13px;
          font-weight: 800;
          color: #111827;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 18px 0 10px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .menu-section-title::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #E5E7EB;
        }

        .dishes-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 16px;
        }

        .dish-card {
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          background: #ffffff;
          overflow: hidden;
          page-break-inside: avoid;
        }
        .dish-header {
          padding: 8px 12px;
          background: #F9FAFB;
          border-bottom: 1px solid #E5E7EB;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dish-title-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dish-icon {
          font-size: 14px;
        }
        .dish-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #1F2937;
        }
        .dish-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
        }
        .badge-green {
          background: #DEF7EC;
          color: #03543F;
          border: 1px solid #BCF0DA;
        }
        .badge-red {
          background: #FDE8E8;
          color: #9B1C1C;
          border: 1px solid #FBD5D5;
        }
        .badge-amber {
          background: #FEF3C7;
          color: #92400E;
          border: 1px solid #FDE68A;
        }
        .badge-purple {
          background: #F3E8FF;
          color: #6B21A8;
          border: 1px solid #E9D5FF;
        }
        .badge-blue {
          background: #E1EFFE;
          color: #1E429F;
          border: 1px solid #C3DDFD;
        }

        .dish-body {
          padding: 10px 14px;
        }
        .dish-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .dish-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #1F2937;
        }
        .checkbox-box {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 1.5px solid #9CA3AF;
          border-radius: 3px;
          flex-shrink: 0;
          margin-top: 1px;
          background: #FFFFFF;
        }
        .dish-name {
          font-weight: 600;
          color: #111827;
        }
        .empty-dish {
          font-size: 11px;
          color: #9CA3AF;
          font-style: italic;
          padding: 4px 0;
        }

        /* Live counters & extras strip */
        .live-extras-box {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 16px;
          page-break-inside: avoid;
        }

        /* Allergen Warning Box */
        .allergen-box {
          background: #FFFBEB;
          border: 1px solid #FCD34D;
          border-left: 4px solid #F59E0B;
          border-radius: 8px;
          padding: 10px 14px;
          margin: 14px 0;
          page-break-inside: avoid;
        }
        .allergen-title {
          font-size: 11px;
          font-weight: 800;
          color: #92400E;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 3px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .allergen-desc {
          font-size: 11px;
          color: #78350F;
          line-height: 1.4;
          margin: 0;
        }

        /* Special Notes Box */
        .notes-box {
          background: #F3F4F6;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 16px;
          page-break-inside: avoid;
        }
        .notes-title {
          font-size: 10px;
          font-weight: 700;
          color: #4B5563;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .notes-content {
          font-size: 12px;
          font-weight: 600;
          color: #111827;
        }

        /* Sign-off & Production Table */
        .signoff-card {
          border: 1.5px solid #D1D5DB;
          border-radius: 10px;
          background: #FFFFFF;
          margin-top: 18px;
          page-break-inside: avoid;
        }
        .signoff-header {
          background: #111827;
          color: #FFFFFF;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 7px 14px;
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
        }
        .signoff-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          padding: 12px 14px;
          gap: 12px;
        }
        .signoff-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .signoff-label {
          font-size: 9.5px;
          font-weight: 700;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .signoff-line {
          border-bottom: 1.5px dotted #9CA3AF;
          height: 22px;
          margin-top: 4px;
        }

        /* Footer */
        .sheet-footer {
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px solid #E5E7EB;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #6B7280;
        }
      </style>
    </head>
    <body>
      <div class="action-bar no-print">
        <div>
          <strong style="color: #92400E; font-size: 13px;">Chef &amp; Kitchen Production Sheet Preview</strong>
          <div style="font-size: 11px; color: #78350F; margin-top: 2px;">
            Ready to print or save as PDF. Formatted for A4 portrait with clear alignment and kitchen checklist.
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="action-btn" onclick="if(window.opener){window.close();}else{history.back();}" style="background:#4B5563;">
            <span>✕ Close / Go Back</span>
          </button>
          <button class="action-btn" onclick="window.print()">
            <span>🖨️ Print / Save as PDF</span>
          </button>
        </div>
      </div>

      <!-- Header -->
      <div class="sheet-header">
        <div class="header-left">
          <div class="sub-title">Catering &amp; Kitchen Operations</div>
          <h1>CHEF PRODUCTION SHEET</h1>
          <div class="header-meta">
            <span>Ref: <strong>#${bookingId}</strong></span>
            <span>Generated: <strong>${generatedDate}</strong></span>
            <span>Service: <strong>${timeSession}</strong></span>
          </div>
        </div>
        <div class="logo-wrap">
          <img class="logo-img" src="${logoUrl}" alt="Honeymoon Events" onerror="this.style.display='none'" />
          <div style="font-size: 11px; font-weight: 800; color: #C8860A; letter-spacing: 1px; margin-top: 3px;">
            HONEYMOON EVENTS
          </div>
        </div>
      </div>

      <!-- Event Logistics Card -->
      <div class="logistics-card">
        <div class="logistics-grid">
          <div class="log-item">
            <span class="log-label">📅 Event Date</span>
            <span class="log-value log-value-highlight">${formattedDate}</span>
          </div>
          <div class="log-item">
            <span class="log-label">⏰ Service Time</span>
            <span class="log-value">${timeSession}</span>
          </div>
          <div class="log-item">
            <span class="log-label">🎪 Event Type</span>
            <span class="log-value">${eventType}</span>
          </div>
          <div class="log-item">
            <span class="log-label">📍 Venue / Hall</span>
            <span class="log-value">${hallName}</span>
          </div>
          <div class="log-item">
            <span class="log-label">📦 Banquet Package</span>
            <span class="log-value" style="color: #C8860A;">${packageName}</span>
          </div>
          <div class="log-item">
            <span class="log-label">👤 Event Host / Client</span>
            <span class="log-value">${clientName}</span>
          </div>
          <div class="log-item">
            <span class="log-label">📞 Contact Phone</span>
            <span class="log-value">${clientPhone}</span>
          </div>
          <div class="log-item">
            <span class="log-label">👥 Total Headcount</span>
            <span class="log-value log-value-highlight">${totalGuests} Guests</span>
          </div>
        </div>

        <div class="headcount-strip">
          <div class="headcount-badge">
            <span>🍽️ Total Catering Portions:</span>
            <strong>${totalGuests} Pax</strong>
          </div>
          <div style="color: #4B5563; font-weight: 600;">
            Breakdown: <strong>${adults} Adults</strong> &bull; <strong>${kids4to10} Kids (4-10y)</strong> &bull; <strong>${kidsUnder4} Kids (&lt;4y)</strong>
          </div>
        </div>
      </div>

      <!-- Menu Items Title -->
      <div class="menu-section-title">
        <span>📋 Selected Menu Dishes &amp; Preparation Items</span>
      </div>

      <!-- Starters Row -->
      <div class="dishes-grid">
        ${renderDishColumn('Vegetarian Starters', '🥗', vegStarters, 'badge-green')}
        ${renderDishColumn('Non-Veg Starters', '🍗', nonVegStarters, 'badge-red')}
      </div>

      <!-- Mains Row -->
      <div class="dishes-grid">
        ${renderDishColumn('Vegetarian Mains', '🍛', vegMains, 'badge-green')}
        ${renderDishColumn('Non-Veg Mains', '🍖', nonVegMains, 'badge-red')}
      </div>

      <!-- Sundries & Desserts Row -->
      <div class="dishes-grid">
        ${renderDishColumn('Sundries & Breads', '🍚', sundries, 'badge-amber')}
        ${renderDishColumn('Desserts', '🍮', desserts, 'badge-purple')}
      </div>

      <!-- Extra / Custom Menu Items (if any) -->
      ${
        extraMenuItemsList.length > 0
          ? `
          <div class="dishes-grid" style="grid-template-columns: 1fr;">
            ${renderDishColumn('Extra / Custom Menu Items', '🍽️', extraMenuItemsList, 'badge-green')}
          </div>
        `
          : ''
      }

      <!-- Live Counters & Extras (if any) -->
      ${
        liveCountersList.length > 0 || extrasList.length > 0
          ? `
          <div class="dishes-grid">
            ${
              liveCountersList.length > 0
                ? renderDishColumn('Live Food Counters', '🎪', liveCountersList, 'badge-blue')
                : '<div></div>'
            }
            ${
              extrasList.length > 0
                ? renderDishColumn('Event Extras & Add-ons', '✨', extrasList, 'badge-amber')
                : '<div></div>'
            }
          </div>
        `
          : ''
      }

      <!-- Special Notes -->
      ${
        notes
          ? `
        <div class="notes-box">
          <div class="notes-title">📝 Special Kitchen Instructions &amp; Client Notes</div>
          <div class="notes-content">${notes}</div>
        </div>
      `
          : ''
      }

      <!-- Allergen Warning Box -->
      <div class="allergen-box">
        <div class="allergen-title">⚠️ ALLERGEN &amp; FOOD SAFETY NOTICE</div>
        <p class="allergen-desc">
          Food prepared in this facility may contain or come into contact with <strong>Milk, Eggs, Wheat, Gluten, Crustaceans, Lupin, Mustard, Peanuts, Tree Nuts, Sulphur &amp; Sesame</strong>. Please ensure strict food separation and hygiene standards during preparation and service.
        </p>
      </div>

      <!-- Kitchen Production Sign-off Box -->
      <div class="signoff-card avoid-break">
        <div class="signoff-header">
          Kitchen Production &amp; Dispatch Sign-Off
        </div>
        <div class="signoff-grid">
          <div class="signoff-item">
            <span class="signoff-label">Prep Started Time</span>
            <div class="signoff-line"></div>
          </div>
          <div class="signoff-item">
            <span class="signoff-label">Taste / QC Approved</span>
            <div class="signoff-line" style="display:flex; align-items:flex-end; padding-bottom:2px; font-size:11px; font-weight:700;">[ &nbsp; ] YES</div>
          </div>
          <div class="signoff-item">
            <span class="signoff-label">Head Chef Sign</span>
            <div class="signoff-line"></div>
          </div>
          <div class="signoff-item">
            <span class="signoff-label">Food Dispatch Time</span>
            <div class="signoff-line"></div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="sheet-footer">
        <span>Honeymoon Events Banqueting &amp; Catering &bull; Kitchen Operations</span>
        <span>Booking ID: #${bookingId} &bull; Page 1 of 1</span>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Builds a clean, formatted WhatsApp text summary of the menu to send directly to the chef.
 */
export function generateChefWhatsAppText(data: ChefMenuData): string {
  const bookingId = data.id || data.bookingRef || 'NEW-BOOKING';
  const clientName = data.name || 'Client';
  const eventDate = data.date || 'TBC';
  const timeSession = data.time || data.timeOfDay || 'TBC';
  const eventType = data.eventType || 'Event';
  const adults = data.adults ?? (data.guests || 0);
  const kids4to10 = data.kids4to10 || 0;
  const kidsUnder4 = data.kidsUnder4 || 0;
  const totalGuests = (data.guests && data.guests > 0) ? data.guests : (adults + kids4to10 + kidsUnder4);
  const packageName = data.selectedMenu || data.package || 'Catering Package';

  const vegStarters = data.selectedDishes?.vegStarters || data.vegStarters || [];
  const nonVegStarters = data.selectedDishes?.nonVegStarters || data.nonVegStarters || [];
  const vegMains = data.selectedDishes?.vegMains || data.vegMains || [];
  const nonVegMains = data.selectedDishes?.nonVegMains || data.nonVegMains || [];
  const sundries = data.selectedDishes?.sundries || data.sundries || [];
  const desserts = data.selectedDishes?.desserts || data.desserts || [];
  const liveCounters = (data.liveCounters || []).map((i) => (typeof i === 'string' ? i : i.name));

  let msg = `👨‍🍳 *KITCHEN ORDER TICKET (CHEF SHEET)* 📋\n`;
  msg += `*Ref:* #${bookingId}\n`;
  msg += `*Event:* ${eventType} (${clientName})\n`;
  msg += `*Date:* ${eventDate}\n`;
  msg += `*Serving Time:* ${timeSession}\n`;
  msg += `*Total Guests:* ${totalGuests} Pax (${adults} Adults, ${kids4to10} Kids 4-10y, ${kidsUnder4} Under 4y)\n`;
  msg += `*Package:* ${packageName}\n\n`;

  if (vegStarters.length > 0) {
    msg += `🥗 *Veg Starters (${vegStarters.length}):*\n${vegStarters.map((d) => `• ${d}`).join('\n')}\n\n`;
  }
  if (nonVegStarters.length > 0) {
    msg += `🍗 *Non-Veg Starters (${nonVegStarters.length}):*\n${nonVegStarters.map((d) => `• ${d}`).join('\n')}\n\n`;
  }
  if (vegMains.length > 0) {
    msg += `🍛 *Veg Mains (${vegMains.length}):*\n${vegMains.map((d) => `• ${d}`).join('\n')}\n\n`;
  }
  if (nonVegMains.length > 0) {
    msg += `🍖 *Non-Veg Mains (${nonVegMains.length}):*\n${nonVegMains.map((d) => `• ${d}`).join('\n')}\n\n`;
  }
  if (sundries.length > 0) {
    msg += `🍚 *Sundries & Breads (${sundries.length}):*\n${sundries.map((d) => `• ${d}`).join('\n')}\n\n`;
  }
  if (desserts.length > 0) {
    msg += `🍮 *Desserts (${desserts.length}):*\n${desserts.map((d) => `• ${d}`).join('\n')}\n\n`;
  }
  const extraMenuItems = (data.selectedDishes?.extraMenuItems || data.extraMenuItems || []).map((item) =>
    typeof item === 'string' ? item : `${item.name}${item.description ? ` (${item.description})` : ''}`
  );
  if (extraMenuItems.length > 0) {
    msg += `🍽️ *Extra / Custom Menu Items (${extraMenuItems.length}):*\n${extraMenuItems.map((d) => `• ${d}`).join('\n')}\n\n`;
  }
  if (liveCounters.length > 0) {
    msg += `🎪 *Live Counters (${liveCounters.length}):*\n${liveCounters.map((d) => `• ${d}`).join('\n')}\n\n`;
  }

  if (data.notes) {
    msg += `📝 *Kitchen Instructions / Notes:*\n${data.notes}\n\n`;
  }

  msg += `⚠️ *Allergen Note:* Facility processes dairy, nuts, gluten, mustard. Please maintain hygiene.\n`;
  msg += `Please confirm receipt of this order. Thank you! 🙏`;

  return msg;
}

export function openChefWhatsApp(data: ChefMenuData, chefPhone?: string): void {
  const text = generateChefWhatsAppText(data);
  let cleanPhone = chefPhone ? chefPhone.replace(/\D/g, '') : '';
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '44' + cleanPhone.slice(1);
  }
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
