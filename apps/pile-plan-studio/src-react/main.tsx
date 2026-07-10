import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n/config";
import "./themes.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
