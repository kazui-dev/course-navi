import { DropdownSelect } from "@/components";

type YearSelectProps = {
  /** 選択可能な年度の配列 (例: [2024, 2023]) */
  availableYears: number[];
  /** 現在選択されている年度 */
  currentYear: number | null;
  /** 年度（数値）が選択されたときに呼び出されるコールバック */
  onYearChange: (year: number) => void;
};

function YearSelect({
  availableYears,
  currentYear,
  onYearChange,
}: YearSelectProps) {
  const renderYear = (year: number) => `${year}年度`;

  const handleSelect = (year: number) => {
    onYearChange(year);
  };

  return (
    <DropdownSelect
      items={availableYears}
      currentItem={currentYear}
      onItemSelect={handleSelect}
      renderItem={renderYear}
      placeholder="年度選択"
      disabled={!availableYears || availableYears.length === 0}
    />
  );
}

export default YearSelect;
