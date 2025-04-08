import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { TetrisProvider } from "./context/tetris.tsx";

createRoot(document.getElementById("root")!).render(
	// <StrictMode>
	<TetrisProvider>
		<App />
	</TetrisProvider>,
	// </StrictMode>,
);
