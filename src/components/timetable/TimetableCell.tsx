import React, { useCallback, useMemo } from "react";
import { TableCell } from "@/components/ui/table";
import { useHighlightStore } from "@/stores";
import type {
  CellData,
  CourseData,
  SearchResult,
  TimetableCellContent,
} from "@/types";

const isMatch = (
  day: number,
  period: number,
  targetCell: CellData | SearchResult[] | CourseData[] | null,
): boolean => {
  if (!targetCell) return false;
  if (Array.isArray(targetCell)) {
    return targetCell.some(
      (entry) => entry.day === day && entry.period.includes(period),
    );
  }
  if (targetCell.day === null || !targetCell.period) return false;
  return targetCell.day === day && targetCell.period.includes(period);
};

type TimetableCellProps = {
  day: number;
  period: number;
  cell: TimetableCellContent;
  selectedCell: CellData | null;
  isEvenRow: boolean;
  nextCell: TimetableCellContent;
  prevCell: TimetableCellContent;
  handleCellSelect: (cell: CellData | null) => void;
};

const TimetableCell = React.memo(
  ({
    day,
    period,
    cell,
    selectedCell,
    isEvenRow,
    nextCell,
    prevCell,
    handleCellSelect,
  }: TimetableCellProps) => {
    const previewHighlight = useHighlightStore(
      (state) => state.previewHighlight,
    );
    const searchHighlight = useHighlightStore((state) => state.searchHighlight);

    const isPreview = useMemo(
      () => isMatch(day, period, previewHighlight),
      [day, period, previewHighlight],
    );

    const isSearch = useMemo(
      () => isMatch(day, period, searchHighlight),
      [day, period, searchHighlight],
    );

    const isSelected = useMemo(
      () => isMatch(day, period, selectedCell),
      [day, period, selectedCell],
    );

    const cellValue =
      cell !== "" ? `${cell.abbr || ""} ${cell.section || ""}` : "";

    const handleClick = useCallback(
      () => handleCellSelect({ day, period: [period] }),
      [day, period, handleCellSelect],
    );

    const classList = useMemo(
      () => [
        isSelected && "selectedCell",
        isPreview && "previewHighlight",
        isSearch && "searchHighlight",
      ],
      [isSelected, isPreview, isSearch],
    );

    if (isEvenRow) {
      const isSame =
        cell !== "" && nextCell !== "" && cell.code === nextCell.code;

      return (
        <TableCell
          className={`text-center cursor-pointer hover:bg-muted/50 p-1 border ${[...classList, isSame && "merged-cell"].filter(Boolean).join(" ")}`}
          onClick={handleClick}
          rowSpan={isSame ? 2 : 1}
          style={{
            verticalAlign: "middle",
            ...(isSame ? { borderBottom: "none" } : {}),
          }}
        >
          {cellValue}
        </TableCell>
      );
    }

    const prevCellTyped = prevCell as TimetableCellContent;
    const isSame =
      cell !== "" && prevCellTyped !== "" && cell.code === prevCellTyped.code;

    if (isSame) return null;

    return (
      <TableCell
        className={`text-center align-middle cursor-pointer hover:bg-muted/50 p-1 border ${classList.filter(Boolean).join(" ")}`}
        onClick={handleClick}
        style={{ verticalAlign: "middle" }}
      >
        {cellValue}
      </TableCell>
    );
  },
);

export default TimetableCell;
