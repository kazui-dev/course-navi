import type { UserProfile, TranscriptData, SaveSlot } from '@/types';

// シンプルな localStorage バックアップサービス
// - 目的: DB が初期化されたときにユーザーデータを復元できるよう、
//   `user_profile`, `transcripts`, `save_slots` の最新版を localStorage に保持する。
// - 要件: 最低限の実装、バージョンは持たない、直近の1件のみ保存

const KEY_USER_PROFILE = `$backup_user_profile`;
const KEY_TRANSCRIPTS = `backup_transcripts`;
const KEY_SAVE_SLOTS = `backup_save_slots`;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error('localBackup: parse error', e);
    return null;
  }
}

// 年度付きの user_profile を配列で保存するユーティリティ
export type StoredUserProfile = { year: number; profile: UserProfile };

export async function saveUserProfile(profile: StoredUserProfile[] | null): Promise<void> {
  try {
    if (!profile || profile.length === 0) {
      localStorage.removeItem(KEY_USER_PROFILE);
      return;
    }
    localStorage.setItem(KEY_USER_PROFILE, JSON.stringify(profile));
  } catch (e) {
    console.error('localBackup.saveUserProfile error', e);
  }
}

export function loadUserProfile(): StoredUserProfile[] | null {
  return safeParse<StoredUserProfile[]>(localStorage.getItem(KEY_USER_PROFILE));
}

export async function saveTranscripts(transcripts: TranscriptData[] | null): Promise<void> {
  try {
    if (!transcripts || transcripts.length === 0) {
      localStorage.removeItem(KEY_TRANSCRIPTS);
      return;
    }
    localStorage.setItem(KEY_TRANSCRIPTS, JSON.stringify(transcripts));
  } catch (e) {
    console.error('localBackup.saveTranscripts error', e);
  }
}

export function loadTranscripts(): TranscriptData[] | null {
  return safeParse<TranscriptData[]>(localStorage.getItem(KEY_TRANSCRIPTS));
}

export async function saveSaveSlots(slots: SaveSlot[] | null): Promise<void> {
  try {
    if (!slots || slots.length === 0) {
      localStorage.removeItem(KEY_SAVE_SLOTS);
      return;
    }
    localStorage.setItem(KEY_SAVE_SLOTS, JSON.stringify(slots));
  } catch (e) {
    console.error('localBackup.saveSaveSlots error', e);
  }
}

export function loadSaveSlots(): SaveSlot[] | null {
  return safeParse<SaveSlot[]>(localStorage.getItem(KEY_SAVE_SLOTS));
}

export function clearAllBackups(): void {
  try {
    localStorage.removeItem(KEY_USER_PROFILE);
    localStorage.removeItem(KEY_TRANSCRIPTS);
    localStorage.removeItem(KEY_SAVE_SLOTS);
  } catch (e) {
    console.error('localBackup.clearAllBackups error', e);
  }
}

// 補助: ストア側で変更発生時に呼び出すユーティリティ
export const localBackup = {
  saveUserProfile,
  loadUserProfile,
  saveTranscripts,
  loadTranscripts,
  saveSaveSlots,
  loadSaveSlots,
  clearAllBackups,
};

export default localBackup;
