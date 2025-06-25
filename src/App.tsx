import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "./App.css";
import Cursor from "./components/Cursor/Cursor";
import IDE from "./components/IDE/IDE";
import { useWebSocket } from "./hooks/useWebSocket";

const App = React.memo(() => {
	const [searchParams] = useSearchParams();
	// const socketRef = useRef<WebSocket | null>(null);
	const roomId = searchParams.get("roomId");
	const telegramId =
		searchParams.get("telegramId") ||
		window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() ||
		"1234567890";

	// Мемоизируем параметры WebSocket
	const webSocketParams = useMemo(
		() => ({
			socketUrl: "http://10.1.30.51:3001",
			myTelegramId: telegramId,
			roomId,
		}),
		[telegramId, roomId]
	);

	// Инициализация WebSocket
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
