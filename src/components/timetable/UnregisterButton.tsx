import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCellStateStore } from "@/stores";
import type { CellData } from "@/types";

type UnregisterButtonProps = {
  /** 授業を登録解除するコールバック (対象セル情報を渡す) */
  unregister: (cell: CellData) => void;
};

function UnregisterButton({ unregister }: UnregisterButtonProps) {
  const clickedCell = useCellStateStore((state) => state.clickedCell);

  const selectedCellExists = clickedCell.day !== null;

  if (!selectedCellExists) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            unregister(clickedCell);
          }}
        >
          授業削除
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">Ctrl+D / Delete</TooltipContent>
    </Tooltip>
  );
}

export default UnregisterButton;
