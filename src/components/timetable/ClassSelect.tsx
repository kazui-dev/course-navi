import { useMemo } from "react";
import { DropdownSelect } from "@/components";

type ClassSelectProps = {
  /** 選択可能なクラス名の配列 (例: ["1A", "1B"]) */
  availableClasses: string[];
  /** 現在選択されているクラス名 */
  currentClass: string | null;
  /** クラス名が選択されたときに呼び出されるコールバック */
  onClassChange: (className: string | null) => void;
  disabled?: boolean;
};

function ClassSelect({
  availableClasses,
  currentClass,
  onClassChange,
  disabled = false,
}: ClassSelectProps) {
  const renderClass = (className: string) => className;

  const handleSelect = (item: string) => {
    onClassChange(item);
  };

  // 2文字目まででグループ化して列を作る
  const { columns, titles } = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of availableClasses) {
      const key = c.length >= 2 ? c.slice(0, 2) : c;
      if (!map.has(key)) map.set(key, []);
      const group = map.get(key);
      if (group) group.push(c);
    }
    const keys = Array.from(map.keys()).sort();
    const cols = keys.map((k) => map.get(k) ?? []);
    return { columns: cols, titles: keys };
  }, [availableClasses]);

  // 各列を既定よりさらに少し狭くするクラス（min-width を小さく）
  const columnClassNames = columns.map(() => "min-w-[5rem]");

  return (
    <DropdownSelect
      items={availableClasses}
      columns={columns}
      columnTitles={titles}
      columnClassNames={columnClassNames}
      contentClassName="max-h-[320px]"
      currentItem={currentClass}
      onItemSelect={handleSelect}
      renderItem={renderClass}
      placeholder="クラス選択"
      disabled={disabled || !availableClasses || availableClasses.length === 0}
      allowReselect
    />
  );
}

export default ClassSelect;
