import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { LoadModal, MainLayout, SaveModal } from "@/components";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useModalStore,
  useSaveSlotsStore,
  useSettingsStore,
  useTimetableStore,
} from "@/stores";

function App() {
  const currentYear = useSettingsStore((state) => state.currentYear);
  const loadInitialData = useSettingsStore((state) => state.loadInitialData);
  const loadInitialTimetable = useTimetableStore(
    (state) => state.loadInitialTimetable,
  );
  const loadSaveSlots = useSaveSlotsStore((state) => state.loadSaveSlots);

  const isSaveModalVisible = useModalStore((state) => state.isSaveModalVisible);
  const isLoadModalVisible = useModalStore((state) => state.isLoadModalVisible);
  const hideSaveModal = useModalStore((state) => state.hideSaveModal);
  const hideLoadModal = useModalStore((state) => state.hideLoadModal);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (currentYear === null) return;
    loadInitialTimetable(currentYear);
    loadSaveSlots(currentYear);
  }, [currentYear, loadInitialTimetable, loadSaveSlots]);

  return (
    <TooltipProvider delayDuration={200}>
      <Routes>
        <Route path="/" element={<MainLayout />} />
        <Route path="/timetable" element={<MainLayout />} />
        <Route path="/transcripts" element={<MainLayout />} />
      </Routes>

      <SaveModal show={isSaveModalVisible} onHide={hideSaveModal} />
      <LoadModal show={isLoadModalVisible} onHide={hideLoadModal} />

      <Toaster />
    </TooltipProvider>
  );
}

export default App;
