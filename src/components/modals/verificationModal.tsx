import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type VerificationModalProps = {
  show: boolean;
  onHide: () => void;
};

function VerificationModal({ show, onHide }: VerificationModalProps) {
  return (
    <div>
      <Dialog open={show} onOpenChange={onHide}>
        <DialogContent
          className="max-w-md"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>検証結果</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <Card className="p-4 text-sm text-muted-foreground text-center">
              保存済みの時間割はまだありません。
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default VerificationModal;
