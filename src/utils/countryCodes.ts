export interface CountryCodeItem {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  priority?: boolean;
}

export const COUNTRY_CODES: CountryCodeItem[] = [
  // ── Popular / Primary ──
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', priority: true },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', priority: true },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', priority: true },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', priority: true },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰', priority: true },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩', priority: true },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰', priority: true },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', priority: true },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦', priority: true },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦', priority: true },
  { code: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼', priority: true },
  { code: 'BH', name: 'Bahrain', dialCode: '+973', flag: '🇧🇭', priority: true },
  { code: 'OM', name: 'Oman', dialCode: '+968', flag: '🇴🇲', priority: true },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', priority: true },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿', priority: true },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪', priority: true },

  // ── Europe ──
  { code: 'AL', name: 'Albania', dialCode: '+355', flag: '🇦🇱' },
  { code: 'AD', name: 'Andorra', dialCode: '+376', flag: '🇦🇩' },
  { code: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { code: 'BE', name: 'Belgium', dialCode: '+32', flag: '🇧🇪' },
  { code: 'BA', name: 'Bosnia & Herzegovina', dialCode: '+387', flag: '🇧🇦' },
  { code: 'BG', name: 'Bulgaria', dialCode: '+359', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatia', dialCode: '+385', flag: '🇭🇷' },
  { code: 'CY', name: 'Cyprus', dialCode: '+357', flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic', dialCode: '+420', flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰' },
  { code: 'EE', name: 'Estonia', dialCode: '+372', flag: '🇪🇪' },
  { code: 'FI', name: 'Finland', dialCode: '+358', flag: '🇫🇮' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'GR', name: 'Greece', dialCode: '+30', flag: '🇬🇷' },
  { code: 'HU', name: 'Hungary', dialCode: '+36', flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland', dialCode: '+354', flag: '🇮🇸' },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
  { code: 'LV', name: 'Latvia', dialCode: '+371', flag: '🇱🇻' },
  { code: 'LT', name: 'Lithuania', dialCode: '+370', flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg', dialCode: '+352', flag: '🇱🇺' },
  { code: 'MT', name: 'Malta', dialCode: '+356', flag: '🇲🇹' },
  { code: 'MC', name: 'Monaco', dialCode: '+377', flag: '🇲🇨' },
  { code: 'ME', name: 'Montenegro', dialCode: '+382', flag: '🇲🇪' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
  { code: 'MK', name: 'North Macedonia', dialCode: '+389', flag: '🇲🇰' },
  { code: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴' },
  { code: 'PL', name: 'Poland', dialCode: '+48', flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { code: 'RO', name: 'Romania', dialCode: '+40', flag: '🇷🇴' },
  { code: 'RS', name: 'Serbia', dialCode: '+381', flag: '🇷🇸' },
  { code: 'SK', name: 'Slovakia', dialCode: '+421', flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia', dialCode: '+386', flag: '🇸🇮' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
  { code: 'TR', name: 'Turkey', dialCode: '+90', flag: '🇹🇷' },
  { code: 'UA', name: 'Ukraine', dialCode: '+380', flag: '🇺🇦' },

  // ── Asia & Middle East ──
  { code: 'AF', name: 'Afghanistan', dialCode: '+93', flag: '🇦🇫' },
  { code: 'AM', name: 'Armenia', dialCode: '+374', flag: '🇦🇲' },
  { code: 'AZ', name: 'Azerbaijan', dialCode: '+994', flag: '🇦🇿' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'GE', name: 'Georgia', dialCode: '+995', flag: '🇬🇪' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
  { code: 'IQ', name: 'Iraq', dialCode: '+964', flag: '🇮🇶' },
  { code: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'JO', name: 'Jordan', dialCode: '+962', flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan', dialCode: '+7', flag: '🇰🇿' },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { code: 'LB', name: 'Lebanon', dialCode: '+961', flag: '🇱🇧' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
  { code: 'MV', name: 'Maldives', dialCode: '+960', flag: '🇲🇻' },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },

  // ── Africa ──
  { code: 'DZ', name: 'Algeria', dialCode: '+213', flag: '🇩🇿' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
  { code: 'ET', name: 'Ethiopia', dialCode: '+251', flag: '🇪🇹' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪' },
  { code: 'MU', name: 'Mauritius', dialCode: '+230', flag: '🇲🇺' },
  { code: 'MA', name: 'Morocco', dialCode: '+212', flag: '🇲🇦' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'TZ', name: 'Tanzania', dialCode: '+255', flag: '🇹🇿' },
  { code: 'UG', name: 'Uganda', dialCode: '+256', flag: '🇺🇬' },
  { code: 'ZW', name: 'Zimbabwe', dialCode: '+263', flag: '🇿🇼' },

  // ── Americas & Caribbean ──
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'JM', name: 'Jamaica', dialCode: '+1876', flag: '🇯🇲' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { code: 'TT', name: 'Trinidad & Tobago', dialCode: '+1868', flag: '🇹🇹' },
];

/**
 * Parses any phone string into country code, dial code, and national number.
 */
export function parsePhoneNumber(rawPhone: string | undefined): {
  countryCode: string;
  dialCode: string;
  nationalNumber: string;
} {
  if (!rawPhone || !rawPhone.trim()) {
    return { countryCode: 'GB', dialCode: '+44', nationalNumber: '' };
  }

  const cleaned = rawPhone.trim().replace(/\s+/g, '');

  if (cleaned.startsWith('+')) {
    // Sort dial codes by descending length to match longer dial codes first (e.g. +1876 before +1)
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sorted) {
      if (cleaned.startsWith(c.dialCode)) {
        const nationalNumber = cleaned.slice(c.dialCode.length);
        return {
          countryCode: c.code,
          dialCode: c.dialCode,
          nationalNumber,
        };
      }
    }
    // Fallback if country not found in list
    return { countryCode: 'GB', dialCode: '+44', nationalNumber: cleaned.replace(/^\+44/, '') };
  }

  // If starts with 07 or UK local pattern, default to UK
  return {
    countryCode: 'GB',
    dialCode: '+44',
    nationalNumber: cleaned,
  };
}

/**
 * Formats dialCode + nationalNumber into a standard international format string.
 */
export function formatFullPhoneNumber(dialCode: string, nationalNumber: string): string {
  const digits = nationalNumber.replace(/\D/g, '');
  if (!digits) return '';

  const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;

  // If UK (+44) and user entered leading 0 (e.g. 0782043589), strip leading 0 for standard international storage (+44782043589)
  if (cleanDial === '+44' && digits.startsWith('0')) {
    return `+44${digits.slice(1)}`;
  }

  return `${cleanDial}${digits}`;
}

/**
 * Validates a national phone number based on dial code.
 * Accommodates standard UK formats (including 10-11 digit mobiles like 0782043589 or 782043589)
 * and international E.164 formats (6-15 digits).
 */
export function validatePhoneNumber(dialCode: string, nationalNumber: string): boolean {
  const digits = nationalNumber.replace(/\D/g, '');
  if (!digits) return false;

  const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;

  if (cleanDial === '+44') {
    // UK mobile/landline numbers:
    // With leading 0: 10 or 11 digits (e.g., 0782043589 is 10 digits, 07700900101 is 11 digits)
    // Without leading 0: 9 or 10 digits
    if (digits.startsWith('0')) {
      return digits.length >= 10 && digits.length <= 11;
    }
    return digits.length >= 9 && digits.length <= 10;
  }

  // Standard international number validation (E.164: between 6 and 15 digits)
  return digits.length >= 6 && digits.length <= 15;
}
