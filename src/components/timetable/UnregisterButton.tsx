import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type UnregisterButtonProps = {
  /** 授業を登録解除するコールバック */
  onClick: () => void;
  /** ボタンを表示するかどうか */
  visible: boolean;
};

function UnregisterButton({ onClick, visible }: UnregisterButtonProps) {
  if (!visible) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="destructive" size="sm" onClick={onClick}>
          授業削除
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">Ctrl+D / Delete</TooltipContent>
    </Tooltip>
  );
}

export default UnregisterButton;
