import type { ReactNode } from "react";
import platform from "@platform-impl";
import { DialogHost } from "./components/Dialogs";
import { IS_ARTIFACT } from "./platform";
import { useRoute } from "./router";
import { dismissError, useStore } from "./store/store";
import HomePage from "./pages/HomePage";
import SubjectPage from "./pages/SubjectPage";
import NewTestPage from "./pages/NewTestPage";
import NewPlanPage from "./pages/NewPlanPage";
import PlanPage from "./pages/PlanPage";
import NotePage from "./pages/NotePage";
import TestPage from "./pages/TestPage";
import RunPage from "./pages/RunPage";
import ResultPage from "./pages/ResultPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const route = useRoute();
  const store = useStore();
  const ai = platform.useAiStatus();

  let page: ReactNode;
  const [section, id, sub, subId] = route;
  if (section === "subject" && id && sub === "new-test") page = <NewTestPage subjectId={id} />;
  else if (section === "subject" && id && sub === "new-plan") page = <NewPlanPage subjectId={id} />;
  else if (section === "plan" && id && sub === "note" && subId) page = <NotePage planId={id} topicId={subId} />;
  else if (section === "plan" && id) page = <PlanPage planId={id} />;
  else if (section === "subject" && id) page = <SubjectPage subjectId={id} />;
  else if (section === "test" && id) page = <TestPage testId={id} />;
  else if (section === "run" && id) page = <RunPage attemptId={id} />;
  else if (section === "result" && id) page = <ResultPage attemptId={id} />;
  else if (section === "settings") page = <SettingsPage />;
  else page = <HomePage />;
  if (!store.ready) {
    page = store.error ? null : (
      <div className="card generating">
        <div className="spinner" />
        <p className="muted">Deine Daten werden geladen …</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="./icon.svg" alt="" width={28} height={28} />
          <span>Lern-App</span>
        </a>
        <nav>
          <a className={`nav-link ${section === "settings" ? "active" : ""}`} href="#/settings">
            Einstellungen
            {ai.state === "unavailable" && !IS_ARTIFACT && <span className="dot" title="API-Schlüssel fehlt" />}
          </a>
        </nav>
      </header>
      <main className="container" key={route.join("/")}>
        {store.error && (
          <div className="callout callout-error row-between" role="alert">
            <span>{store.error}</span>
            {store.ready && (
              <button className="btn btn-ghost btn-sm" onClick={dismissError}>
                Schließen
              </button>
            )}
          </div>
        )}
        {page}
      </main>
      <DialogHost />
    </div>
  );
}
