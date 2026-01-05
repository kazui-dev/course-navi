import { create } from 'zustand';
import { dbClient } from '@/services/dbClient';
import type { SaveSlot, DbResult, ParsedSaveSlot, TimetableCodesTable, Timetable } from '@/types';
import { convertTimetableToCodes } from '@/utils';
import { localBackup } from '@/services/localBackup';

// バリデーション結果の型
type ValidationResult = {
  success: boolean;
  error: string | null;
};

// ストアの状態: 保存スロットの配列を保持
type SaveSlotsState = { allSaveSlots: ParsedSaveSlot[] };

// ストア操作の定義
type SaveSlotsActions = {
  loadSaveSlots: (year: number | null) => Promise<void>;
  saveTimetable: (name: string, memo: string, currentYear: number, timetable: Timetable) => Promise<DbResult | ValidationResult>;
  overwriteSaveSlot: (name: string, memo: string, currentYear: number, timetable: Timetable) => Promise<DbResult>;
  deleteSaveSlot: (idToDelete: number, currentYear: number) => Promise<DbResult>;
  updateSaveSlot: (idToUpdate: number, newName: string, newMemo: string, currentYear: number) => Promise<DbResult | ValidationResult>;
  restoreDeletedSlot: (slot: ParsedSaveSlot) => Promise<DbResult>;
  revertSlotToSnapshot: (slot: ParsedSaveSlot) => Promise<DbResult>;
};

type SaveSlotsStore = SaveSlotsState & SaveSlotsActions;

// 保存名のクライアント側バリデーション
const validateSlotName = (
  slots: ParsedSaveSlot[],
  newName: string,
  currentId: number | null = null
): ValidationResult => {
  if (newName === '') {
    return { success: false, error: '保存名は必須です。' };
  }
  const isDuplicate = slots.some(
    slot => slot.name === newName && slot.id !== currentId
  );
  if (isDuplicate) {
    return { success: false, error: 'その名前は既に使用されています。' };
  }
  return { success: true, error: null };
};

// DB の行をパースしてフロントで扱う型に変換する
const parseDbSlots = (slots: SaveSlot[]): ParsedSaveSlot[] =>
  slots.map(slot => ({
    ...slot,
    timetable: JSON.parse(slot.timetable_codes_json) as TimetableCodesTable,
  }));

// 空文字列を null に変換するユーティリティ
const toNullableMeta = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

// 時間割を DB に保存するためのシリアライズ
const serializeTimetable = (timetable: Timetable): string =>
  JSON.stringify(convertTimetableToCodes(timetable));


export const useSaveSlotsStore = create<SaveSlotsStore>((set, get) => {
  // DB 操作成功時に一覧を再読み込みするユーティリティ
  const reloadOnSuccess = async (result: DbResult, year: number) => {
    if (result.success) {
      await get().loadSaveSlots(year);
    }
    return result;
  };

  // 全年度の save_slots を収集してバックアップに保存するユーティリティ
  const backupAllSlots = async () => {
    try {
      const years = await dbClient.fetchAvailableYearsForTranscripts();
      const allSlots: SaveSlot[] = [];
      await Promise.all(years.map(async (y) => {
        try {
          const s = await dbClient.fetchSaveSlots(y);
          if (s && s.length > 0) allSlots.push(...s);
        } catch (_e) {
          // ignore per-year errors
        }
      }));
      await localBackup.saveSaveSlots(allSlots);
    } catch (err) {
      console.error('backupAllSlots error', err);
    }
  };

  return {
    allSaveSlots: [],

    // 指定年度の保存スロットを読み込む。year が null の場合は空配列をセット
    loadSaveSlots: async (year) => {
      if (year === null) {
        set({ allSaveSlots: [] });
        return;
      }
      try {
        let slots = await dbClient.fetchSaveSlots(year);

        // DB が空の場合、初回読み込み時のみ localBackup から復元を試みる
        if ((!slots || slots.length === 0) && get().allSaveSlots.length === 0) {
          const backup = localBackup.loadSaveSlots();
          if (backup && backup.length > 0) {
            try {
              // バックアップから DB に挿入を試みる
              for (const s of backup) {
                try {
                  await dbClient.insertSaveSlot(s.year, s.name, s.memo, s.timetable_codes_json);
                } catch (innerErr) {
                  console.error('Failed to insert save slot from backup:', innerErr);
                }
              }
              slots = await dbClient.fetchSaveSlots(year);
            } catch (err) {
              console.error('Failed to restore save slots from local backup:', err);
              // DB 挿入に失敗した場合は UI 用にバックアップを使う
              slots = backup;
            }
          }
        }

        set({ allSaveSlots: parseDbSlots(slots) });
      } catch (error) {
        console.error(error);
        set({ allSaveSlots: [] });
      }
    },

    // 保存: クライアント側バリデーションを行い、DB 挿入後に一覧を再読み込み
    saveTimetable: async (name, meta, currentYear, timetable) => {
      const trimmedName = name.trim();
      const metaValue = toNullableMeta(meta);

      const clientValidation = validateSlotName(get().allSaveSlots, trimmedName);
      if (!clientValidation.success) {
        if (clientValidation.error === 'その名前は既に使用されています。') {
          return { success: false, error: 'DUPLICATE_NAME' };
        }
        return clientValidation;
      }

      const result = await dbClient.insertSaveSlot(
        currentYear,
        trimmedName,
        metaValue,
        serializeTimetable(timetable)
      );

      const res = await reloadOnSuccess(result, currentYear);
      if (res.success) await backupAllSlots();
      return res;
    },

    // 名前重複時に既存スロットを上書きする
    overwriteSaveSlot: async (name, meta, currentYear, timetable) => {
      const trimmedName = name.trim();
      const result = await dbClient.overwriteSaveSlot(
        currentYear,
        trimmedName,
        toNullableMeta(meta),
        serializeTimetable(timetable)
      );

      const res = await reloadOnSuccess(result, currentYear);
      if (res.success) await backupAllSlots();
      return res;
    },

    deleteSaveSlot: async (idToDelete, currentYear) => {
      const result = await dbClient.deleteSaveSlot(idToDelete);
      const res = await reloadOnSuccess(result, currentYear);
      if (res.success) await backupAllSlots();
      return res;
    },

    updateSaveSlot: async (idToUpdate, newName, newMemo, currentYear) => {
      const trimmedName = newName.trim();

      const validation = validateSlotName(get().allSaveSlots, trimmedName, idToUpdate);
      if (!validation.success) return validation;

      const result = await dbClient.updateSaveSlotNameAndMemo(
        idToUpdate,
        trimmedName,
        toNullableMeta(newMemo || '')
      );

      const res = await reloadOnSuccess(result, currentYear);
      if (res.success) await backupAllSlots();
      return res;
    },

    // 削除済みスロットを復元する
    restoreDeletedSlot: async (slot) => {
      const codesJson = JSON.stringify(slot.timetable);
      const metaValue = toNullableMeta(slot.memo ?? '');
      const result = await dbClient.insertSaveSlot(
        slot.year,
        slot.name,
        metaValue,
        codesJson
      );
      const res = await reloadOnSuccess(result, slot.year);
      if (res.success) await backupAllSlots();
      return res;
    },

    // スロットのスナップショットを上書きで復元する
    revertSlotToSnapshot: async (slot) => {
      const codesJson = JSON.stringify(slot.timetable);
      const metaValue = toNullableMeta(slot.memo ?? '');
      const result = await dbClient.overwriteSaveSlot(
        slot.year,
        slot.name,
        metaValue,
        codesJson
      );
      const res = await reloadOnSuccess(result, slot.year);
      if (res.success) await backupAllSlots();
      return res;
    },
  };
});