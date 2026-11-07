import type { ReactNode } from "react";
import { useRoute } from "./router";
import { useSettings } from "./settings";
import HomePage from "./pages/HomePage";
import SubjectPage from "./pages/SubjectPage";
import NewTestPage from "./pages/NewTestPage";
import TestPage from "./pages/TestPage";
import RunPage from "./pages/RunPage";
import ResultPage from "./pages/ResultPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const route = useRoute();
  const settings = useSettings();

  let page: ReactNode;
  const [section, id, sub] = route;
  if (section === "subject" && id && sub === "new-test") page = <NewTestPage subjectId={id} />;
  else if (section === "subject" && id) page = <SubjectPage subjectId={id} />;
  else if (section === "test" && id) page = <TestPage testId={id} />;
  else if (section === "run" && id) page = <RunPage attemptId={id} />;
  else if (section === "result" && id) page = <ResultPage attemptId={id} />;
  else if (section === "settings") page = <SettingsPage />;
  else page = <HomePage />;

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
            {!settings.apiKey && <span className="dot" title="API-Schlüssel fehlt" />}
          </a>
        </nav>
      </header>
      <main className="container" key={route.join("/")}>
        {page}
      </main>
    </div>
  );
}
