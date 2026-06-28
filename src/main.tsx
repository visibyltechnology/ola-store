import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./integrations/firebase/client.ts";

createRoot(document.getElementById("root")!).render(<App />);
