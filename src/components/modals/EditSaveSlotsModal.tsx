import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { ParsedSaveSlot } from '@/types';


/** このコンポーネントが受け取る Props の型 */
type EditSaveSlotsModalProps = {
  show: boolean;
  onHide: () => void;
  onSave: (newName: string, newMemo: string) => void;
  currentSlot: ParsedSaveSlot | null;
  error: string | null;
};


function EditSaveSlotsModal({
  show,
  onHide,
  onSave,
  currentSlot,
  error
}: EditSaveSlotsModalProps) {
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (show && currentSlot) {
      setName(currentSlot.name);
      setMemo(currentSlot.memo || '');
    }
    if (!show) {
      setName('');
      setMemo('');
    }
  }, [show, currentSlot]);

  return (
    <Dialog open={show} onOpenChange={onHide}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nameInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>保存した時間割を編集</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            onSave(name, memo);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">保存名:</Label>
            <Input
              id="name"
              type='text'
              value={name}
              placeholder='（必須）'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setName(e.target.value);
              }}
              aria-invalid={!!error}
              ref={nameInputRef}
              required
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo">メモ:</Label>
            <Input
              id="memo"
              type='text'
              value={memo}
              placeholder='（任意）'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMemo(e.target.value)}
            />
          </div>

          <DialogFooter className="flex gap-2 justify-end">
            <Button variant='outline' onClick={onHide} type="button">
              キャンセル
            </Button>
            <Button variant='default' type='submit'>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EditSaveSlotsModal;
