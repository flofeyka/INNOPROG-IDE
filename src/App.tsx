import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "./App.css";
import Cursor from "./components/Cursor/Cursor";
import IDE from "./components/IDE/IDE";
import { useWebSocket } from "./hooks/useWebSocket";

const App = React.memo(() => {
	const [searchParams] = useSearchParams();
	const roomId = searchParams.get("roomId");
	const telegramId =
		searchParams.get("telegramId") ||
		window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() ||
		"1234567890";

	const webSocketParams = useMemo(
		() => ({
			socketUrl: process.env.REACT_PUBLIC_WS_URL || "https://ide.innoprog.ru",
			myTelegramId: telegramId,
			roomId,
		}),
		[telegramId, roomId]
	);

	const webSocketData = useWebSocket(webSocketParams);

	return (
		<>
			<Cursor
				myTelegramId={telegramId}
				roomId={roomId}
				webSocketData={webSocketData}
			/>
			{/* <WebSocketDebug
				webSocketData={webSocketData}
				roomId={roomId}
				telegramId={telegramId}
			/> */}
			<IDE webSocketData={webSocketData} />
		</>
	);
});

App.displayName = "App";

export default App;
