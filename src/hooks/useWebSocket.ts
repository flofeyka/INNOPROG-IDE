import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

	// Отслеживание активных печатающих пользователей
	const [activeTypers, setActiveTypers] = useState<Set<string>>(new Set());
	const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

	const [searchParams] = useSearchParams();

	// Refs для стабильных значений
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
	const maxRetriesBeforeError = useRef<number>(3); // Максимум попыток перед показом ошибки

	// State для принудительного переподключения
	const [forceReconnectTrigger, setForceReconnectTrigger] = useState(0);

	// Функция очистки интервалов
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

	// Функция для присоединения к комнате (без пересоздания соединения)
	const joinRoom = useCallback(() => {
		// Если нет roomId, то присоединение к комнате не нужно
		if (!roomIdRef.current) {
			console.log("📝 No room ID, skipping room join");
			return;
		}

		if (socketRef.current?.connected) {
			// Проверяем localStorage на наличие сохраненного имени
			const savedUsername = localStorage.getItem("innoprog-username");

			// Отправляем событие join-room с данными
			socketRef.current.emit("join-room", {
				telegramId: myTelegramIdRef.current,
				roomId: roomIdRef.current,
				username: savedUsername || undefined,
			});

			console.log(
				"🏠 Joining room:",
				roomIdRef.current,
				"with username:",
				savedUsername
			);
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

	// Функция для отметки пользователя как печатающего
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

	// Стабильная функция подключения (мемоизированная)
	const connectWebSocket = useCallback(() => {
		const currentRoomId = roomIdRef.current;
		const currentSocketUrl = socketUrlRef.current;
		const currentMyTelegramId = myTelegramIdRef.current;

		// Если нет roomId, то WebSocket не нужен - работаем как обычный редактор
		if (!currentRoomId) {
			console.log("📝 Working in editor mode without room collaboration");
			setIsConnected(false);
			setIsJoinedRoom(false);
			return;
		}

		if (!shouldReconnectRef.current) {
			console.log("❌ Reconnection disabled");
			return;
		}

		// Защита от частых переподключений (но не для принудительных)
		const now = Date.now();
		const timeSinceLastConnection = now - lastConnectionTime.current;
		if (timeSinceLastConnection < 5000 && lastConnectionTime.current > 0) {
			// Не чаще раза в 5 секунд (но только если уже было предыдущее подключение)
			console.log(
				`⏳ Too frequent connection attempts, skipping... (${timeSinceLastConnection}ms since last)`
			);
			return;
		}
		console.log(
			`🔌 Connection allowed (${timeSinceLastConnection}ms since last, lastTime: ${lastConnectionTime.current})`
		);
		lastConnectionTime.current = now;

		// Закрываем предыдущее соединение
		if (socketRef.current && !socketRef.current.disconnected) {
			socketRef.current.close();
		}

		clearIntervals();

		// Правильно формируем WebSocket URL, сохраняя порт
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
			console.log("🟢 WebSocket connected successfully");
			setIsConnected(true);
			setConnectionError(null); // Очищаем ошибку при успешном подключении
			isConnectedRef.current = true;
			connectionAttempts.current = 0; // Сбрасываем счетчик попыток

			// Socket.IO handshake
			socket.send("40");
			console.log("📤 Sent handshake");

			// Присоединяемся к комнате
			setTimeout(joinRoom, 100);
		});

		socketRef.current?.on("disconnect", (reason) => {
			console.log("🔴 Socket.IO disconnected:", {
				reason,
				timestamp: new Date().toISOString(),
			});

			setIsConnected(false);
			setIsJoinedRoom(false);
			isConnectedRef.current = false;
			clearIntervals();

			// Проверяем, нужно ли переподключаться
			if (shouldReconnectRef.current && currentRoomId) {
				connectionAttempts.current++;

				// Показываем ошибку после нескольких попыток
				if (connectionAttempts.current > maxRetriesBeforeError.current) {
					// В socket.io нет кода 1000, но можно исключить нормальное отключение
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
				console.log(
					`🔄 Reconnecting in ${delay / 1000}s (attempt ${
						connectionAttempts.current
					}/${maxRetriesBeforeError.current}) for room ${currentRoomId}`
				);

				reconnectTimeoutRef.current = setTimeout(() => {
					// Вручную отключаем старое соединение и создаём новое
					socketRef.current?.disconnect();
					socketRef.current = io("wss://your-server.com", {
						transports: ["websocket"],
						reconnection: false, // выключаем авто переподключение, т.к. делаем вручную
					});
					connectWebSocket(); // твоя функция инициализации сокета, переиспользуй её
				}, delay);
			} else {
				console.log("❌ Not reconnecting: no room or reconnection disabled");
			}
		});

		socket.on("connect_error", (error) => {
			setIsConnected(false);

			isConnectedRef.current = false;
		});

		socket.on("joined", (eventData) => {
			console.log("✅ Successfully joined room:", eventData);

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
				console.log("📍 Loaded initial selections:", selectionsMap);
			}
		});
		socket.on("members-updated", (eventData) => {
			console.log("👥 Members updated:", eventData);
			const members = eventData.members || [];
			setRoomMembers(members);
		});

		socket.on("member-left", (eventData) => {
			console.log("👋 Member left:", eventData.telegramId);

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
				console.log("👆 Cursor update:", {
					telegramId: eventData.telegramId,
					username: eventData.username,
					position: eventData.position,
					userColor: eventData.userColor,
				});
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
			console.log("📍 Received selection state:", eventData);

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
			console.log("📍 Updated selections map:", newSelections);
		});

		socket.on("complete-session", (eventData) => {
			console.log("🏁 Session completed:", eventData.message);

			toast(eventData.message);

			setTimeout(() => {
				const url = new URL(window.location.href);
				url.search = ""; // Очищаем параметры
				window.location.href = url.origin + url.pathname;
			}, 2000);
		});

		socket.on("code-edit-action", (eventData) => {
			if (eventData.telegramId !== myTelegramIdRef.current) {
				console.log("📝 Received code edit from:", eventData.telegramId);
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

		socket.on("code-edit-confirmed", (eventData) => {
			console.log("✅ Code edit confirmed at:", new Date(eventData.timestamp));
		});

		socket.on("room-edited", (eventData) => {
			console.log("🏠 Room settings updated:", eventData);

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

				console.log("🔧 Room permissions updated:", {
					studentCursorEnabled: eventData.studentCursorEnabled,
					studentSelectionEnabled: eventData.studentSelectionEnabled,
					studentEditCodeEnabled: eventData.studentEditCodeEnabled,
				});
			}
		});

		socket.on("room-state-loaded", (eventData) => {
			console.log("🔄 Room state loaded from DB:", eventData);

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
			console.log("🧹 Clearing selections for user:", eventData.telegramId);

			if (eventData.telegramId !== myTelegramIdRef.current) {
				setSelections((prev) => {
					const newSelections = new Map(prev);
					newSelections.delete(eventData.telegramId);
					return newSelections;
				});
			}
		});

		socket.on("room-sound", (eventData) => {
			console.log("🔊 Received room sound:", eventData);

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
					// Fallback для старых браузеров
					try {
						const audio = new Audio();
						audio.volume = 0.08;
						audio.src = `data:audio/wav;base64,UklGRlQDAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=`;
						audio.play();
					} catch (fallbackError) {
						// Игнорируем если звук не может быть воспроизведен
					}
				}
			}
		});

		socket.on("error", (eventData) => {
			console.error("❌ Server error:", eventData.message);
		});
	}, [joinRoom, markUserAsTyping]); // Только стабильные зависимости

	// useEffect для принудительного переподключения
	useEffect(() => {
		if (
			forceReconnectTrigger > 0 &&
			roomIdRef.current &&
			shouldReconnectRef.current
		) {
			console.log("🔥 Force reconnect triggered, calling connectWebSocket");
			// Очищаем все защиты
			lastConnectionTime.current = 0;
			connectionAttempts.current = 0;
			setConnectionError(null);

			// Вызываем основную функцию подключения
			connectWebSocket();
		}
	}, [forceReconnectTrigger, connectWebSocket]);

	// Обновляем refs при изменении props (но не переподключаемся автоматически)
	useEffect(() => {
		socketUrlRef.current = socketUrl;
		myTelegramIdRef.current = myTelegramId;
		const wasRoomId = roomIdRef.current;
		roomIdRef.current = roomId;

		// ✅ ИСПРАВЛЕНО: Упрощенная логика обработки изменения roomId
		if (wasRoomId !== roomId) {
			console.log(`🔄 Room changed from "${wasRoomId}" to "${roomId}"`);

			// Если roomId стал null - отключаемся от WebSocket
			if (!roomId) {
				console.log("📝 Switching to standalone mode");
				shouldReconnectRef.current = false;
				setIsConnected(false);
				setIsJoinedRoom(false);
				setConnectionError(null);
				// Очищаем таймеры
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

			// Если появился новый roomId или изменилась комната - переподключаемся
			if (roomId) {
				console.log("🔌 Room connection needed for:", roomId);
				shouldReconnectRef.current = true;
				setConnectionError(null);
				connectionAttempts.current = 0;

				// Если это смена комнаты и соединение активно - просто переподключаемся к новой комнате
				if (
					wasRoomId &&
					isConnectedRef.current &&
					socketRef.current?.connected
				) {
					console.log("🏠 Switching to new room via existing connection");
					// Присоединяемся к новой комнате через существующее соединение
					const savedUsername = localStorage.getItem("innoprog-username");
					const joinMessage = `42["join-room",${JSON.stringify({
						telegramId: myTelegramIdRef.current,
						roomId: roomId,
						username: savedUsername || undefined,
					})}]`;
					socketRef.current.send(joinMessage);
					return;
				}

				// Закрываем старое соединение - это автоматически запустит переподключение через onclose
				console.log("🔄 Triggering reconnection by closing socket");
				if (socketRef.current) {
					socketRef.current.close();
				} else {
					// Если нет активного соединения, запускаем принудительное переподключение
					console.log("🔌 No existing socket, triggering force reconnect");
					lastConnectionTime.current = 0; // Сбрасываем защиту от частых подключений
					connectionAttempts.current = 0; // Сбрасываем счётчик попыток
					setConnectionError(null);

					// Триггерим принудительное переподключение через state change
					setForceReconnectTrigger((prev) => prev + 1);
				}
				return;
			}
		}
	}, [socketUrl, myTelegramId, roomId]);

	// Одноразовый useEffect для инициализации
	useEffect(() => {
		shouldReconnectRef.current = true;
		// Подключаемся только если есть roomId
		if (roomId) {
			// ✅ ИСПРАВЛЕНО: Сбрасываем состояние ошибки при новом подключении
			setConnectionError(null);
			connectionAttempts.current = 0; // Сбрасываем счетчик попыток
			lastConnectionTime.current = 0; // Сбрасываем защиту от частых подключений
			connectWebSocket();
		} else {
			console.log("📝 Starting in standalone editor mode");
		}

		// Обработчик закрытия вкладки
		const handleBeforeUnload = () => {
			shouldReconnectRef.current = false;
			clearIntervals();
			if (socketRef.current) {
				socketRef.current.close();
			}
		};

		// Обработчик скрытия/показа вкладки (не переподключаемся)
		const handleVisibilityChange = () => {
			if (document.hidden) {
				console.log("📱 Tab hidden, keeping connection");
			} else {
				console.log("📱 Tab visible");
				// Переподключаемся только если есть roomId, связь потеряна и переподключение разрешено
				if (
					roomIdRef.current &&
					!isConnectedRef.current &&
					shouldReconnectRef.current
				) {
					console.log("🔄 Reconnecting after tab became visible");
					// ✅ ИСПРАВЛЕНО: Сбрасываем состояние при видимости вкладки
					setConnectionError(null);
					connectionAttempts.current = 0;
					lastConnectionTime.current = 0; // Сбрасываем защиту от частых подключений
					connectWebSocket();
				}
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			shouldReconnectRef.current = false;
			clearIntervals();
			// Очищаем все таймеры печати
			typingTimeouts.current.forEach((timeout) => clearTimeout(timeout));
			typingTimeouts.current.clear();

			if (socketRef.current) {
				socketRef.current.close();
			}
			window.removeEventListener("beforeunload", handleBeforeUnload);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []); // Пустой массив зависимостей - выполняется только один раз!

	// Стабильные функции для отправки сообщений
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
				console.log("📤 Sent selection message");
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
				console.log("📤 Sent code edit:", changes.length, "changes");
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
				console.log("📤 Sent edit member:", username);
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
				console.log("📤 Sent room permissions:", permissions);

				socketRef.current.emit("room-sound", {
					telegramId: myTelegramIdRef.current,
					roomId: roomIdRef.current,
					soundType: "permission-change",
				});
			}
		},
		[completed]
	);

	console.log(completed);

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
