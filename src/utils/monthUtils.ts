const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Standardizes any month input (e.g. "January 2024", "Jan-24", "2024-01", "01/2024", "Jan 2024")
 * into a single unified standard format: "MMM YYYY" (e.g., "Jan 2024").
 */
export function standardizeMonth(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str) return '';

  // Clean string
  const clean = str.replace(/[,_]/g, ' ').replace(/\s+/g, ' ').trim();

  // Pattern A: Textual month e.g., "Jan 2024", "January 2024", "Jan-24", "Jan-2024", "January-24"
  const monthMatch = clean.match(/(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)/i);

  if (monthMatch) {
    const mTerm = monthMatch[1].toLowerCase();
    let mIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === mTerm);
    if (mIdx === -1) {
      mIdx = MONTH_FULL_NAMES.findIndex((m) => m === mTerm);
    }

    if (mIdx !== -1) {
      const monthStr = MONTH_NAMES[mIdx];
      // Search for year
      const yearMatch = clean.match(/\b(20\d{2}|\d{2})\b/);
      if (yearMatch) {
        let yr = parseInt(yearMatch[1], 10);
        if (yr < 100) yr += 2000;
        return `${monthStr} ${yr}`;
      } else {
        return monthStr;
      }
    }
  }

  // Pattern B: Numeric patterns e.g. "2024-01", "2024/01", "01-2024", "01/2024", "1/2024", "01-24"
  const numMatch = clean.match(/^(\d{1,4})[-/](\d{1,4})$/);
  if (numMatch) {
    const part1 = parseInt(numMatch[1], 10);
    const part2 = parseInt(numMatch[2], 10);
    let mIdx = -1;
    let year = 0;

    if (part1 > 1000) {
      // YYYY-MM
      year = part1;
      if (part2 >= 1 && part2 <= 12) mIdx = part2 - 1;
    } else if (part2 > 1000) {
      // MM-YYYY
      year = part2;
      if (part1 >= 1 && part1 <= 12) mIdx = part1 - 1;
    } else if (part2 <= 99) {
      // MM-YY or YY-MM
      if (part1 >= 1 && part1 <= 12) {
        mIdx = part1 - 1;
        year = 2000 + part2;
      } else if (part2 >= 1 && part2 <= 12) {
        mIdx = part2 - 1;
        year = 2000 + part1;
      }
    }

    if (mIdx >= 0 && mIdx < 12 && year >= 2000) {
      return `${MONTH_NAMES[mIdx]} ${year}`;
    }
  }

  // Pattern C: ISO or standard JS Date string e.g., "2024-01-15T00:00:00"
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    const mIdx = parsedDate.getUTCMonth();
    const yr = parsedDate.getUTCFullYear();
    if (yr >= 2000 && yr <= 2100) {
      return `${MONTH_NAMES[mIdx]} ${yr}`;
    }
  }

  return clean;
}

/**
 * Parses month string for chronological sorting
 */
export function parseMonthTimestamp(mStr: string): number {
  const std = standardizeMonth(mStr);
  if (!std) return 0;
  const parts = std.split(' ');
  if (parts.length === 2) {
    const mIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === parts[0].toLowerCase());
    const yr = parseInt(parts[1], 10);
    if (mIdx !== -1 && !isNaN(yr)) {
      return new Date(yr, mIdx, 1).getTime();
    }
  }
  return 0;
}
