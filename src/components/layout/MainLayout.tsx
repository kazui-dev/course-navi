import { useLocation } from "react-router-dom";
import { Sidebar } from "@/components";
import { ConfirmModalRoot } from "@/components/modals/ConfirmModal";
import TimetablePage from "@/pages/TimetablePage";
import TranscriptsPage from "@/pages/TranscriptsPage";

export default function MainLayout() {
  const location = useLocation();
  const isTimetable =
    location.pathname === "/" || location.pathname === "/timetable";
  const isTranscripts = location.pathname === "/transcripts";

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-40 bg-white border-r border-neutral-200 overflow-y-auto">
        <Sidebar />
      </div>
      <div className="flex-1 overflow-auto">
        <div hidden={!isTimetable}>
          <TimetablePage />
        </div>
        <div hidden={!isTranscripts}>
          <TranscriptsPage />
        </div>
        <ConfirmModalRoot />
      </div>
    </div>
  );
}
