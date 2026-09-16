/**
 * Helper to dynamically parse the kids pricing rate based on package name.
 * Supports single prices (e.g. "£18" or "20") as well as package-mapped prices
 * (e.g. "Basic: £18, Classic: £20, Silver: £25, Gold: £30").
 */
export function parseKidsPriceForPackage(priceStr?: string, packageName?: string): number {
  if (!priceStr || typeof priceStr !== 'string') return 20;
  const cleanStr = priceStr.trim();
  if (!cleanStr) return 20;

  if (packageName) {
    const pName = packageName.toLowerCase().trim();
    // Words to match: full name, or main keyword (e.g. "classic" from "Classic Package")
    const words = pName.replace(/package|menu/gi, '').trim().split(/\s+/).filter(Boolean);
    const candidateTerms = [pName, ...words].filter(t => t.length >= 3);

    for (const term of candidateTerms) {
      // Look for "term: £XX", "term - £XX", "term £XX", etc.
      const regex = new RegExp(`(?:^|[,;/|\\s])(?:${term})\\s*[:=\\-]?\\s*£?\\s*(\\d+(?:\\.\\d+)?)`, 'i');
      const m = cleanStr.match(regex);
      if (m && m[1]) {
        const val = parseFloat(m[1]);
        if (!isNaN(val) && val > 0 && val <= 500) {
          return val;
        }
      }
    }
  }

  // Fallback: extract the first valid number from the string
  const allMatches = Array.from(cleanStr.matchAll(/£?\s*(\d+(?:\.\d+)?)/g));
  if (allMatches.length > 0) {
    const firstNum = parseFloat(allMatches[0][1]);
    if (!isNaN(firstNum) && firstNum > 0 && firstNum <= 500) {
      return firstNum;
    }
  }

  return 20;
}

/**
 * Given a list of kids pricing rows (from Firestore / Settings),
 * find the 4–10 yr row and parse the price for the specific package.
 */
export function getKidsPriceFromList(
  kidsPricingList?: { ageRange: string; price: string }[],
  packageName?: string,
  packageKidsPrice?: number
): number {
  if (typeof packageKidsPrice === 'number' && packageKidsPrice > 0) {
    return packageKidsPrice;
  }
  if (!kidsPricingList || kidsPricingList.length === 0) return 20;
  const match = kidsPricingList.find(k => {
    const lower = k.ageRange.toLowerCase();
    const isFree = lower.includes('free') || k.price.toLowerCase().includes('free') || lower.includes('under') || lower.includes('0-2') || lower.includes('0-4') || lower.includes('0 to 4');
    return !isFree && (lower.includes('4-10') || lower.includes('3-10') || lower.includes('4 to 10') || lower.includes('kids') || lower.includes('child'));
  }) || kidsPricingList.find(k => {
    const lower = k.ageRange.toLowerCase();
    return !lower.includes('under') && !lower.includes('0-2') && !lower.includes('0-4') && !k.price.toLowerCase().includes('free');
  });

  if (match) {
    return parseKidsPriceForPackage(match.price, packageName);
  }
  return 20;
}
