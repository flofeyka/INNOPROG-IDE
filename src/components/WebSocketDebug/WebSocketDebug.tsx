import React from "react";

interface CursorData {
	telegramId: string;
	position: [number, number];
	userColor: string;
	isOffline?: boolean;
}

interface RoomMember {
	telegramId: string;
	online: boolean;
	userColor?: string;
}

interface WebSocketDebugProps {
	webSocketData: {
		socket: WebSocket | null;
		isConnected: boolean;
		roomMembers: RoomMember[];
		cursors: Map<string, CursorData>;
		selections: Map<
			string,
			{
				line?: number;
				column?: number;
				selectionStart?: { line: number; column: number };
				selectionEnd?: { line: number; column: number };
				selectedText?: string;
				userColor: string;
			}
		>;
		myUserColor: string;
	};
	roomId: string | null;
	telegramId?: string;
}

const WebSocketDebug: React.FC<WebSocketDebugProps> = ({
	webSocketData,
	roomId,
	telegramId,
}) => {
	const { socket, isConnected, roomMembers, cursors, myUserColor } =
		webSocketData;

	if (!roomId) return null;

	return (
		<div
			style={{
				position: "fixed",
				top: 10,
				left: 10,
				background: "rgba(0,0,0,0.8)",
				color: "white",
				padding: "10px",
				borderRadius: "5px",
				fontSize: "12px",
				zIndex: 9999,
				minWidth: "250px",
				maxHeight: "80vh",
				overflow: "auto",
			}}
		>
			<h3>WebSocket Debug</h3>
			<div>Room ID: {roomId}</div>
			<div>Telegram ID: {telegramId}</div>
			<div>Connected: {isConnected ? "✅" : "❌"}</div>
			<div>
				My Color:
				<span
					style={{
						backgroundColor: myUserColor,
						color: "white",
						padding: "2px 6px",
						borderRadius: "3px",
						marginLeft: "8px",
					}}
				>
					{myUserColor}
				</span>
			</div>
			<div>
				Socket State:{" "}
				{socket?.readyState === WebSocket.OPEN
					? "OPEN"
					: socket?.readyState === WebSocket.CONNECTING
					? "CONNECTING"
					: socket?.readyState === WebSocket.CLOSING
					? "CLOSING"
					: socket?.readyState === WebSocket.CLOSED
					? "CLOSED"
					: "UNKNOWN"}
			</div>
			<div>Members: {roomMembers.length}</div>
			<div>Cursors: {cursors.size}</div>

			<details style={{ marginTop: "10px" }}>
				<summary>Members List</summary>
				{roomMembers.map((member, idx) => (
					<div
						key={idx}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							marginBottom: "4px",
							paddingLeft: "10px",
						}}
					>
						<div
							style={{
								width: "12px",
								height: "12px",
								borderRadius: "50%",
								backgroundColor: member.userColor || "#888",
								border: "1px solid white",
							}}
						/>
						<span>{member.telegramId}</span>
						<span style={{ color: member.online ? "#4CAF50" : "#F44336" }}>
							{member.online ? "🟢" : "🔴"}
						</span>
					</div>
				))}
			</details>

			<details style={{ marginTop: "10px" }}>
				<summary>Active Cursors</summary>
				{Array.from(cursors.entries()).map(([id, cursorData]) => (
					<div
						key={id}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							marginBottom: "4px",
							paddingLeft: "10px",
							opacity: cursorData.isOffline ? 0.6 : 1,
						}}
					>
						<div
							style={{
								width: "12px",
								height: "12px",
								borderRadius: "50%",
								backgroundColor: cursorData.userColor,
								border: "1px solid white",
							}}
						/>
						<span style={{ fontSize: "10px" }}>
							{id}: [{cursorData.position[0].toFixed(2)},{" "}
							{cursorData.position[1].toFixed(2)}]
							{cursorData.isOffline && " (offline)"}
						</span>
					</div>
				))}
			</details>
		</div>
	);
};

export default WebSocketDebug;
