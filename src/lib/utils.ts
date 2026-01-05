import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 検索用に文字列を一方向に正規化するユーティリティ
export function normalizeForSearch(s: string): string {
  if (!s) return '';
  try {
    return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  } catch (_e) {
    return s.toLowerCase().replace(/\s+/g, '');
  }
}

// ひらがな/カタカナ正規化の簡易ユーティリティ
export function katakanaToHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
