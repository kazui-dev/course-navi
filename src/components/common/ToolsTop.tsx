import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Undo, Redo } from 'lucide-react';

import { useTimetableStore, useSettingsStore, useModalStore } from '@/stores';

export default function ToolsTop() {
  const canUndo = useTimetableStore(state => state.canUndo);
  const canRedo = useTimetableStore(state => state.canRedo);

  const isLoadingTimetable = useTimetableStore(state => state.isLoading);
  const isSettingsLoading = useSettingsStore(state => state.isSettingsLoading);

  const disabled = isLoadingTimetable || isSettingsLoading;

  const handleUndo = useTimetableStore(state => state.handleUndo);
  const handleRedo = useTimetableStore(state => state.handleRedo);
  const showSaveModal = useModalStore(state => state.showSaveModal);
  const showLoadModal = useModalStore(state => state.showLoadModal);

  return (
    <div className="flex gap-2 items-center">
      <ButtonGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={showSaveModal}
              disabled={disabled}
            >
              保存
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">保存 (Ctrl+S)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={showLoadModal}
              disabled={disabled}
            >
              読み込み
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">読み込み (Ctrl+O)</TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              disabled={disabled || !canUndo}
            >
              <Undo size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            元に戻す (Ctrl+Z)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRedo}
              disabled={disabled || !canRedo}
            >
              <Redo size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            やり直し (Ctrl+Y / Ctrl+Shift+Z)
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
