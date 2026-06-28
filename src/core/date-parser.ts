const DATE_PATTERNS = [
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+GMT([+-]\d{4})?$/,
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
  /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
  /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
  /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}:\d{2})?$/,
];

const MONTH_MAP: Record<string, number> = {
  'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
  'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
  'january': 0, 'february': 1, 'march': 2, 'april': 3,
  'june': 5, 'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
};

export function parseDate(input: string): string {
  if (!input) return '';

  const cleaned = input.trim().replace(/\s+/g, ' ');

  const directParse = new Date(cleaned);
  if (!isNaN(directParse.getTime())) {
    return directParse.toISOString();
  }

  const rfc2822Match = cleaned.match(DATE_PATTERNS[0]);
  if (rfc2822Match) {
    const [, , day, mon, year, hour, min, sec] = rfc2822Match;
    const month = MONTH_MAP[mon.toLowerCase()];
    if (month !== undefined) {
      const date = new Date(Date.UTC(parseInt(year), month, parseInt(day), parseInt(hour), parseInt(min), parseInt(sec)));
      if (!isNaN(date.getTime())) return date.toISOString();
    }
  }

  const isoMatch = cleaned.match(DATE_PATTERNS[1]);
  if (isoMatch) {
    const [, year, month, day, hour, min, sec, ms, tz] = isoMatch;
    const msNum = ms ? parseFloat(ms) * 1000 : 0;
    const dateStr = `${year}-${month}-${day}T${hour}:${min}:${sec}${ms ? ms : ''}${tz || 'Z'}`;
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toISOString();
  }

  const compactMatch = cleaned.match(DATE_PATTERNS[4]);
  if (compactMatch) {
    const [, year, month, day, hour, min, sec, tz] = compactMatch;
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}${tz || 'Z'}`);
    if (!isNaN(date.getTime())) return date.toISOString();
  }

  return input;
}

export function normalizeDate(dateStr: string): string {
  return parseDate(dateStr);
}

export function formatDate(dateStr: string, format: 'iso' | 'rfc2822' | 'unix' | 'human'): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  switch (format) {
    case 'iso': return date.toISOString();
    case 'rfc2822': return date.toUTCString();
    case 'unix': return Math.floor(date.getTime() / 1000).toString();
    case 'human': return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    default: return date.toISOString();
  }
}

export function isRecent(dateStr: string, withinMs: number): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= withinMs;
}

export function sortByDate(items: { published: string }[], ascending = false): { published: string }[] {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.published).getTime();
    const dateB = new Date(b.published).getTime();
    return ascending ? dateA - dateB : dateB - dateA;
  });
}
