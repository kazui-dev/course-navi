import type { UserProfile, ProcessedRow } from '@/types';

type RawCourseRowLocal = {
  subject: string;
  course: string;
  abbr: string;
  section: string;
  credits: number;
  day: number;
  periods_str: string;
  x_mark: number | null;
  code: string | number;
  year: number;
  subject_sort_key?: string | number | null;
  is_display?: number | null;
};

export const buildClassName = (profile: UserProfile | null): string | null => {
  if (!profile?.department || !profile?.division || !profile?.class) {
    return null;
  }
  return `${profile.department}${profile.division}${profile.class}`;
};

export function parseClassName(className: string | null): { department: string; division: string; classNum: string } | null {
  if (!className || className.length < 3) return null;
  return {
    department: className[0],
    division: className[1],
    classNum: className[2],
  };
}

export function normalizeRawCourseRow(row: RawCourseRowLocal): ProcessedRow {
  return {
    subject: row.subject,
    course: row.course,
    abbr: row.abbr,
    section: row.section,
    credits: row.credits,
    day: row.day,
    period: row.periods_str.split(',').map(Number).sort((a: number, b: number) => a - b),
    x_mark: row.x_mark,
    code: String(row.code),
    year: row.year,
  };
}

export function groupRowsByCourseCode(rows: RawCourseRowLocal[]): ProcessedRow[][] {
  if (rows.length === 0) {
    return [];
  }

  const grouped = new Map<string, ProcessedRow[]>();
  rows.forEach(row => {
    const processed = normalizeRawCourseRow(row);
    const existing = grouped.get(processed.code);
    if (existing) {
      existing.push(processed);
    } else {
      grouped.set(processed.code, [processed]);
    }
  });

  return Array.from(grouped.values());
}
