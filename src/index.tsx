import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import App from "./App";
import "./index.css";
import reportWebVitals from "./reportWebVitals";

declare global {
	interface Window {
		Telegram: {
			WebApp: {
				requestFullscreen: () => void;
				initDataUnsafe: any;
				close: () => void;
				expand: () => void;
			};
		};
	}
}

const root = ReactDOM.createRoot(
	document.getElementById("root") as HTMLElement
);

export function isDesktop() {
	const userAgent = navigator.userAgent.toLowerCase();
	return (
		userAgent.includes("windows") ||
		userAgent.includes("macintosh") ||
		userAgent.includes("linux")
	);
}
if (!isDesktop()) {
	const header = document.querySelector(".header") as HTMLElement;
	const footer = document.querySelector(".footer") as HTMLElement;
	if (header) {
		header.style.marginTop = "90px";
	}
	if (footer) {
		footer.style.marginBottom = "15px";
	}

	try {
		window.Telegram.WebApp.expand();
		window.Telegram.WebApp.requestFullscreen();
	} catch (e) {
		alert(e);
	}
}

document.addEventListener("touchstart", function (event) {
	const activeElement = document.activeElement as HTMLElement;
	const target = event.target as Node;

	if (
		activeElement &&
		(activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
	) {
		if (!activeElement.contains(target)) {
			activeElement.blur();
		}
	}
});
root.render(
	<React.StrictMode>
		<ToastContainer theme="dark" />
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<App />} />
			</Routes>
		</BrowserRouter>
	</React.StrictMode>
);

reportWebVitals();
