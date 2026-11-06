import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n/config";
import "./openaec/openaec-fonts.css";
import "./openaec/openaec-tokens.css";
import "./themes.css";
import "./App.css";
import { applyRuntimeBaseline } from "./domain/settings/uiBaseline.ts";

applyRuntimeBaseline();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
