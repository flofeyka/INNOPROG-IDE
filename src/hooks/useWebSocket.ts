import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { io, Socket } from "socket.io-client";

interface UseWebSocketProps {
	socketUrl: string;
	myTelegramId: string;
	roomId: string | null;
}

interface RoomMember {
	telegramId: string;
	online: boolean;
	userColor?: string;
	username?: string;
}

interface CursorData {
	telegramId: string;
	position: [number, number];
	userColor: string;
	username?: string;
}

interface CodeEditData {
	telegramId: string;
	changes: {
		from: number;
		to: number;
		insert: string;
	}[];
	newCode: string;
	userColor: string;
	username?: string;
	timestamp: number;
}

interface RoomPermissions {
	studentCursorEnabled: boolean;
	studentSelectionEnabled: boolean;
	studentEditCodeEnabled: boolean;
}

export const useWebSocket = ({
	socketUrl,
	myTelegramId,
	roomId,
}: UseWebSocketProps) => {
	const [isConnected, setIsConnected] = useState<boolean>(false);
	const [isJoinedRoom, setIsJoinedRoom] = useState<boolean>(false);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
	const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map());
	const [selections, setSelections] = useState<
		Map<
			string,
			{
				line?: number;
				column?: number;
				selectionStart?: { line: number; column: number };
				selectionEnd?: { line: number; column: number };
				selectedText?: string;
				userColor: string;
			}
		>
	>(new Map());
	const [codeEdits, setCodeEdits] = useState<Map<string, CodeEditData>>(
		new Map()
	);
	const [myUserColor, setMyUserColor] = useState<string>("#FF6B6B");
	const [roomPermissions, setRoomPermissions] = useState<RoomPermissions>({
		studentCursorEnabled: true,
		studentSelectionEnabled: true,
		studentEditCodeEnabled: true,
	});
	const [isTeacher, setIsTeacher] = useState<boolean>(false);
	const [completed, setCompleted] = useState<boolean>(false);

	const [activeTypers, setActiveTypers] = useState<Set<string>>(new Set());
	const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

	const socketRef = useRef<Socket | null>(null);
	const socketUrlRef = useRef<string>(socketUrl);
	const myTelegramIdRef = useRef<string>(myTelegramId);
	const roomIdRef = useRef(roomId);
	const isConnectedRef = useRef<boolean>(false);
	const shouldReconnectRef = useRef<boolean>(true);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const connectionAttempts = useRef<number>(0);
	const lastConnectionTime = useRef<number>(0);
	const maxRetriesBeforeError = useRef<number>(3);

	const [forceReconnectTrigger, setForceReconnectTrigger] = useState(0);

	const clearIntervals = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
		if (pingIntervalRef.current) {
			clearInterval(pingIntervalRef.current);
			pingIntervalRef.current = null;
		}
		if (heartbeatTimeoutRef.current) {
			clearTimeout(heartbeatTimeoutRef.current);
			heartbeatTimeoutRef.current = null;
		}
	}, []);

	const joinRoom = useCallback(() => {
		if (!roomIdRef.current) {
			return;
		}

		if (socketRef.current?.connected) {
			const savedUsername = localStorage.getItem("innoprog-username");

			socketRef.current.emit("join-room", {
				telegramId: myTelegramIdRef.current,
				roomId: roomIdRef.current,
				username: savedUsername || undefined,
			});
		}
	}, []);

	const completeSession = useCallback(() => {
		if (completed) return;
		if (socketRef.current) {
			socketRef.current?.emit("close-session", {
				telegramId: myTelegramIdRef.current,
				roomId: roomIdRef.current,
			});
		}
	}, [completed]);

	const markUserAsTyping = useCallback(
		(telegramId: string) => {
			if (completed) return;
			setActiveTypers((prev) => {
				const newSet = new Set(prev);
				newSet.add(telegramId);
				return newSet;
			});

			if (typingTimeouts.current.has(telegramId)) {
				clearTimeout(typingTimeouts.current.get(telegramId)!);
			}

			const timeout = setTimeout(() => {
				setActiveTypers((prev) => {
					const newSet = new Set(prev);
					newSet.delete(telegramId);
					return newSet;
				});
				typingTimeouts.current.delete(telegramId);
			}, 2000);

			typingTimeouts.current.set(telegramId, timeout);
		},
		[completed]
	);

	const connectWebSocket = useCallback(() => {
		const currentRoomId = roomIdRef.current;
		const currentSocketUrl = socketUrlRef.current;

		if (!currentRoomId) {
			setIsConnected(false);
			setIsJoinedRoom(false);
			return;
		}

		if (!shouldReconnectRef.current) return;

		const now = Date.now();
		const timeSinceLastConnection = now - lastConnectionTime.current;
		if (timeSinceLastConnection < 5000 && lastConnectionTime.current > 0)
			return;
		lastConnectionTime.current = now;

		if (socketRef.current && !socketRef.current.disconnected) {
			socketRef.current.close();
		}

		clearIntervals();

		let wsUrl;
		if (currentSocketUrl.startsWith("https://")) {
			wsUrl = currentSocketUrl.replace("https://", "wss://");
		} else if (currentSocketUrl.startsWith("http://")) {
			wsUrl = currentSocketUrl.replace("http://", "ws://");
		} else {
			wsUrl = `ws://${currentSocketUrl}`;
		}

		const socket = io(wsUrl, {
			transports: ["websocket"],
			reconnection: true,
		});
		socketRef.current = socket;

		socket.on("connect", () => {
			setIsConnected(true);
			setConnectionError(null);
			isConnectedRef.current = true;
			connectionAttempts.current = 0;

			setTimeout(joinRoom, 100);
		});

		socketRef.current?.on("disconnect", (reason) => {
			setIsConnected(false);
			setIsJoinedRoom(false);
			isConnectedRef.current = false;
			clearIntervals();

			if (shouldReconnectRef.current && currentRoomId) {
				connectionAttempts.current++;

				if (connectionAttempts.current > maxRetriesBeforeError.current) {
					if (
						reason !== "io client disconnect" &&
						reason !== "io server disconnect"
					) {
						setConnectionError("Не удается подключиться к серверу");
					}
				} else {
					setConnectionError(null);
				}

				const delay = 2000;
				reconnectTimeoutRef.current = setTimeout(() => {
					socketRef.current?.disconnect();
					socketRef.current = io("wss://your-server.com", {
						transports: ["websocket"],
						reconnection: false,
					});
					connectWebSocket();
				}, delay);
			}
		});

		socket.on("connect_error", (error) => {
			setIsConnected(false);

			isConnectedRef.current = false;
		});

		socket.on("joined", (eventData) => {
			setIsJoinedRoom(true);
			setCompleted(eventData.completed);
			setMyUserColor(eventData.userColor || "#FF6B6B");
			setIsTeacher(eventData.isTeacher || false);

			if (eventData.roomPermissions) {
				setRoomPermissions(eventData.roomPermissions);
			}

			if (eventData.currentCursors) {
				setCursors(
					new Map(
						eventData.currentCursors.map((cursor: CursorData) => [
							cursor.telegramId,
							cursor,
						])
					)
				);
			}

			if (eventData.currentSelections) {
				const selectionsMap = new Map();
				eventData.currentSelections.forEach((selection: any) => {
					if (selection.telegramId !== myTelegramIdRef.current) {
						selectionsMap.set(selection.telegramId, {
							line: selection.line,
							column: selection.column,
							selectionStart: selection.selectionStart,
							selectionEnd: selection.selectionEnd,
							selectedText: selection.selectedText,
							userColor: selection.userColor || "#FF6B6B",
							username: selection.username,
						});
					}
				});
				setSelections(selectionsMap);
			}
		});
		socket.on("members-updated", (eventData) => {
			const members = eventData.members || [];
			setRoomMembers(members);
		});

		socket.on("member-left", (eventData) => {
			if (!eventData.keepCursor) {
				setCursors((prev) => {
					const newCursors = new Map(prev);
					newCursors.delete(eventData.telegramId);
					return newCursors;
				});
			} else {
				setCursors((prev) => {
					const newCursors = new Map(prev);
					const existingCursor = newCursors.get(eventData.telegramId);
					if (existingCursor) {
						newCursors.set(eventData.telegramId, {
							...existingCursor,
							isOffline: true,
						} as any);
					}
					return newCursors;
				});
			}

			setSelections((prev) => {
				const newSelections = new Map(prev);
				newSelections.delete(eventData.telegramId);
				return newSelections;
			});
		});

		socket.on("cursor-action", (eventData) => {
			if (eventData.telegramId !== myTelegramIdRef.current) {
				setCursors((prev) => {
					const newCursors = new Map(prev);
					newCursors.set(eventData.telegramId, {
						telegramId: eventData.telegramId,
						position: eventData.position,
						userColor: eventData.userColor,
						username: eventData.username,
					});
					return newCursors;
				});
			}
		});

		socket.on("selection-state", (eventData) => {
			const newSelections = new Map();
			eventData.selections.forEach((selection: any) => {
				if (
					selection.telegramId &&
					selection.telegramId !== myTelegramIdRef.current
				) {
					newSelections.set(selection.telegramId, {
						line: selection.line,
						column: selection.column,
						selectionStart: selection.selectionStart,
						selectionEnd: selection.selectionEnd,
						selectedText: selection.selectedText,
						userColor: selection.userColor || "#FF6B6B",
						username: selection.username,
					});
				}
			});

			setSelections(newSelections);
		});

		socket.on("complete-session", (eventData) => {
			toast(eventData.message);

			setTimeout(() => {
				const url = new URL(window.location.href);
				url.search = "";
				window.location.href = url.origin + url.pathname;
			}, 2000);
		});

		socket.on("code-edit-action", (eventData) => {
			if (eventData.telegramId !== myTelegramIdRef.current) {
				markUserAsTyping(eventData.telegramId);

				setCodeEdits((prev) => {
					const newCodeEdits = new Map(prev);
					newCodeEdits.set(eventData.telegramId, {
						telegramId: eventData.telegramId,
						changes: eventData.changes,
						newCode: eventData.newCode,
						userColor: eventData.userColor,
						username: eventData.username,
						timestamp: eventData.timestamp,
					});
					return newCodeEdits;
				});
			}
		});

		socket.on("room-edited", (eventData) => {
			if (
				eventData.studentCursorEnabled !== undefined &&
				eventData.studentSelectionEnabled !== undefined &&
				eventData.studentEditCodeEnabled !== undefined
			) {
				setRoomPermissions({
					studentCursorEnabled: eventData.studentCursorEnabled,
					studentSelectionEnabled: eventData.studentSelectionEnabled,
					studentEditCodeEnabled: eventData.studentEditCodeEnabled,
				});
			}
		});

		socket.on("room-state-loaded", (eventData) => {
			window.dispatchEvent(
				new CustomEvent("roomStateLoaded", {
					detail: {
						lastCode: eventData.lastCode,
						participantCount: eventData.participantCount,
					},
				})
			);
		});

		socket.on("clear-user-selections", (eventData) => {
			if (eventData.telegramId !== myTelegramIdRef.current) {
				setSelections((prev) => {
					const newSelections = new Map(prev);
					newSelections.delete(eventData.telegramId);
					return newSelections;
				});
			}
		});

		socket.on("room-sound", (eventData) => {
			if (
				eventData.telegramId !== myTelegramIdRef.current &&
				eventData.soundType === "permission-change"
			) {
				try {
					const audioContext = new (window.AudioContext ||
						(window as any).webkitAudioContext)();
					const oscillator = audioContext.createOscillator();
					const gainNode = audioContext.createGain();

					oscillator.connect(gainNode);
					gainNode.connect(audioContext.destination);

					oscillator.frequency.setValueAtTime(700, audioContext.currentTime);
					gainNode.gain.setValueAtTime(0, audioContext.currentTime);
					gainNode.gain.linearRampToValueAtTime(
						0.03,
						audioContext.currentTime + 0.01
					);
					gainNode.gain.exponentialRampToValueAtTime(
						0.001,
						audioContext.currentTime + 0.15
					);

					oscillator.type = "sine";
					oscillator.start(audioContext.currentTime);
					oscillator.stop(audioContext.currentTime + 0.15);
				} catch (e) {
					try {
						const audio = new Audio();
						audio.volume = 0.08;
						audio.src = `data:audio/wav;base64,UklGRlQDAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=`;
						audio.play();
					} catch (fallbackError) {}
				}
			}
		});

		socket.on("error", (eventData) => {
			console.error("❌ Server error:", eventData.message);
		});
	}, [joinRoom, markUserAsTyping]);
	useEffect(() => {
		if (
			forceReconnectTrigger > 0 &&
			roomIdRef.current &&
			shouldReconnectRef.current
		) {
			lastConnectionTime.current = 0;
			connectionAttempts.current = 0;
			setConnectionError(null);

			connectWebSocket();
		}
	}, [forceReconnectTrigger, connectWebSocket]);

	useEffect(() => {
		socketUrlRef.current = socketUrl;
		myTelegramIdRef.current = myTelegramId;
		const wasRoomId = roomIdRef.current;
		roomIdRef.current = roomId;

		if (wasRoomId !== roomId) {
			if (!roomId) {
				shouldReconnectRef.current = false;
				setIsConnected(false);
				setIsJoinedRoom(false);
				setConnectionError(null);
				if (reconnectTimeoutRef.current) {
					clearTimeout(reconnectTimeoutRef.current);
					reconnectTimeoutRef.current = null;
				}
				if (pingIntervalRef.current) {
					clearInterval(pingIntervalRef.current);
					pingIntervalRef.current = null;
				}
				if (heartbeatTimeoutRef.current) {
					clearTimeout(heartbeatTimeoutRef.current);
					heartbeatTimeoutRef.current = null;
				}
				if (socketRef.current) {
					socketRef.current.close();
				}
				return;
			}

			if (roomId) {
				shouldReconnectRef.current = true;
				setConnectionError(null);
				connectionAttempts.current = 0;

				if (
					wasRoomId &&
					isConnectedRef.current &&
					socketRef.current?.connected
				) {
					const savedUsername = localStorage.getItem("innoprog-username");
					socketRef.current.emit("join-room", {
						telegramId: myTelegramIdRef.current,
						roomId: roomId,
						username: savedUsername || undefined,
					});
					return;
				}

				if (socketRef.current) {
					socketRef.current.close();
				} else {
					lastConnectionTime.current = 0;
					connectionAttempts.current = 0;
					setConnectionError(null);

					setForceReconnectTrigger((prev) => prev + 1);
				}
				return;
			}
		}
	}, [socketUrl, myTelegramId, roomId]);

	useEffect(() => {
		shouldReconnectRef.current = true;
		if (roomId) {
			setConnectionError(null);
			connectionAttempts.current = 0;
			lastConnectionTime.current = 0;
			connectWebSocket();
		}

		const handleBeforeUnload = () => {
			shouldReconnectRef.current = false;
			clearIntervals();
			if (socketRef.current) {
				socketRef.current.close();
			}
		};

		const handleVisibilityChange = () => {
			if (document.hidden) {
			} else {
				if (
					roomIdRef.current &&
					!isConnectedRef.current &&
					shouldReconnectRef.current
				) {
					setConnectionError(null);
					connectionAttempts.current = 0;
					lastConnectionTime.current = 0;
					connectWebSocket();
				}
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			shouldReconnectRef.current = false;
			clearIntervals();
			typingTimeouts.current.forEach((timeout) => clearTimeout(timeout));
			typingTimeouts.current.clear();

			if (socketRef.current) {
				socketRef.current.close();
			}
			window.removeEventListener("beforeunload", handleBeforeUnload);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	const sendCursorPosition = useCallback(
		(position: [number, number]) => {
			if (socketRef.current?.connected && roomIdRef.current && !completed) {
				socketRef.current.emit("cursor", {
					telegramId: myTelegramIdRef.current,
					roomId: roomIdRef.current,
					position,
					logs: [],
				});
			}
		},
		[completed]
	);

	const sendSelection = useCallback(
		(selectionData: {
			line?: number;
			column?: number;
			selectionStart?: { line: number; column: number };
			selectionEnd?: { line: number; column: number };
			selectedText?: string;
			clearSelection?: boolean;
		}) => {
			if (completed) return;
			if (socketRef.current?.connected && roomIdRef.current) {
				socketRef.current.emit("selection", {
					telegramId: myTelegramIdRef.current,
					roomId: roomIdRef.current,
					...selectionData,
				});
			}
		},
		[completed]
	);

	const sendCodeEdit = useCallback(
		(
			changes: { from: number; to: number; insert: string }[],
			newCode: string
		) => {
			if (completed) return;
			if (socketRef.current?.connected && roomIdRef.current) {
				markUserAsTyping(myTelegramIdRef.current);

				socketRef.current.emit("code-edit", {
					roomId: roomIdRef.current,
					telegramId: myTelegramIdRef.current,
					changes,
					newCode,
				});
			}
		},
		[markUserAsTyping, completed]
	);

	const sendEditMember = useCallback(
		(username?: string) => {
			if (completed) return;
			if (socketRef.current?.connected && roomIdRef.current) {
				socketRef.current.emit("edit-member", {
					telegramId: myTelegramIdRef.current,
					roomId: roomIdRef.current,
					username,
				});
			}
		},
		[completed]
	);

	const sendRoomPermissions = useCallback(
		(permissions: RoomPermissions) => {
			if (completed) return;
			if (socketRef.current?.connected && roomIdRef.current) {
				socketRef.current.emit("edit-room", {
					id: myTelegramIdRef.current,
					roomId: roomIdRef.current,
					studentCursorEnabled: permissions.studentCursorEnabled,
					studentSelectionEnabled: permissions.studentSelectionEnabled,
					studentEditCodeEnabled: permissions.studentEditCodeEnabled,
				});

				socketRef.current.emit("room-sound", {
					telegramId: myTelegramIdRef.current,
					roomId: roomIdRef.current,
					soundType: "permission-change",
				});
			}
		},
		[completed]
	);

	return {
		socket: socketRef.current,
		isConnected,
		isJoinedRoom,
		roomMembers,
		cursors,
		selections,
		codeEdits,
		myUserColor,
		roomPermissions,
		isTeacher,
		sendCursorPosition,
		sendSelection,
		sendCodeEdit,
		sendEditMember,
		sendRoomPermissions,
		activeTypers,
		markUserAsTyping,
		connectionError,
		completeSession,
		completed,
	};
};
