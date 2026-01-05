import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';

import { MainLayout, SaveModal, LoadModal } from '@/components';
import { useSettingsStore, useModalStore, useTimetableStore, useSaveSlotsStore } from '@/stores';

function App() {
  // Settings Store
  const currentYear = useSettingsStore(state => state.currentYear);
  const loadInitialData = useSettingsStore(state => state.loadInitialData);

  // Modal Store
  const isSaveModalVisible = useModalStore(state => state.isSaveModalVisible);
  const isLoadModalVisible = useModalStore(state => state.isLoadModalVisible);
  const hideSaveModal = useModalStore(state => state.hideSaveModal);
  const hideLoadModal = useModalStore(state => state.hideLoadModal);
  const showSaveModal = useModalStore(state => state.showSaveModal);
  const showLoadModal = useModalStore(state => state.showLoadModal);

  // Timetable Store
  const loadInitialTimetable = useTimetableStore(state => state.loadInitialTimetable);
  const handleUndo = useTimetableStore(state => state.handleUndo);
  const handleRedo = useTimetableStore(state => state.handleRedo);

  // SaveSlots Store
  const loadSaveSlots = useSaveSlotsStore(state => state.loadSaveSlots);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (currentYear === null) return;
    loadInitialTimetable(currentYear);
    loadSaveSlots(currentYear);
  }, [currentYear, loadInitialTimetable, loadSaveSlots]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 入力系要素にフォーカスがある場合はショートカットを無視する
      const target = e.target as HTMLElement | null;
      if (target) {
        const tagName = (target.tagName || '').toUpperCase();
        if (
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (!(e.metaKey || e.ctrlKey)) return;

      const key = (e.key || '').toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (key === 's') {
        e.preventDefault();
        showSaveModal();
        return;
      }
      if (key === 'o') {
        e.preventDefault();
        showLoadModal();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleUndo, handleRedo, showSaveModal, showLoadModal]);


  return (
    <TooltipProvider delayDuration={200}>
      <Routes>
        <Route path="/" element={<MainLayout />} />
        <Route path="/timetable" element={<MainLayout />} />
        <Route path="/transcripts" element={<MainLayout />} />
      </Routes>

      <SaveModal
        show={isSaveModalVisible}
        onHide={hideSaveModal}
      />
      <LoadModal
        show={isLoadModalVisible}
        onHide={hideLoadModal}
      />

      <Toaster />
    </TooltipProvider>
  );
}

export default App;