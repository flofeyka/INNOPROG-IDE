import { useCallback, useEffect, useRef, useState } from "react";
import { redirect, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";

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

	// Отслеживание активных печатающих пользователей
	const [activeTypers, setActiveTypers] = useState<Set<string>>(new Set());
	const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

	const [searchParams] = useSearchParams();

	// Refs для стабильных значений
	const socketRef = useRef<WebSocket | null>(null);
	const socketUrlRef = useRef(socketUrl);
	const myTelegramIdRef = useRef(myTelegramId);
	const roomIdRef = useRef(roomId);
	const isConnectedRef = useRef(false);
	const shouldReconnectRef = useRef(true);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const connectionAttempts = useRef(0);
	const lastConnectionTime = useRef(0);
	const maxRetriesBeforeError = useRef(3); // Максимум попыток перед показом ошибки

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

		if (socketRef.current?.readyState === WebSocket.OPEN) {
			// Проверяем localStorage на наличие сохраненного имени
			const savedUsername = localStorage.getItem("innoprog-username");

			const joinMessage = `42["join-room",${JSON.stringify({
				telegramId: myTelegramIdRef.current,
				roomId: roomIdRef.current,
				username: savedUsername || undefined,
			})}]`;
			socketRef.current.send(joinMessage);
			console.log(
				"🏠 Joining room:",
				roomIdRef.current,
				"with username:",
				savedUsername
			);
		}
	}, []);

	const completeSession = useCallback(() => {
		if (!roomIdRef.current) return;

		if (socketRef.current?.readyState === WebSocket.OPEN) {
			const completeMessage = `42["close-session",${JSON.stringify({
				telegramId: myTelegramIdRef.current,
				roomId: roomIdRef.current,
			})}]`;
			socketRef.current.send(completeMessage);
			console.log("📤 Sent complete session message:", completeMessage);
		}
	}, []);

	// Функция для отметки пользователя как печатающего
	const markUserAsTyping = useCallback((telegramId: string) => {
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
	}, []);

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
		if (
			socketRef.current &&
			socketRef.current.readyState !== WebSocket.CLOSED
		) {
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

		const fullWsUrl = `${wsUrl}/socket.io/?EIO=4&transport=websocket&t=${Date.now()}`;

		console.log(
			`🔌 Connecting to WebSocket (attempt ${connectionAttempts.current + 1}):`,
			{ originalUrl: currentSocketUrl, wsUrl, fullWsUrl }
		);

		const socket = new WebSocket(fullWsUrl);
		socketRef.current = socket;

		socket.onopen = () => {
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

			// Запускаем ping/pong (каждые 60 секунд)
			const sendPing = () => {
				if (socket.readyState === WebSocket.OPEN) {
					socket.send("2");
					console.log("📤 Sent ping");

					// Ожидаем pong в течение 10 секунд
					heartbeatTimeoutRef.current = setTimeout(() => {
						console.log("💔 No pong received, closing connection");
						socket.close(1000, "No pong received");
					}, 10000);
				}
			};

			pingIntervalRef.current = setInterval(sendPing, 60000);
		};

		socket.onclose = (event) => {
			console.log("🔴 WebSocket disconnected:", {
				code: event.code,
				reason: event.reason,
				wasClean: event.wasClean,
				timestamp: new Date().toISOString(),
			});
			setIsConnected(false);
			setIsJoinedRoom(false);

			isConnectedRef.current = false;
			clearIntervals();

			// Переподключение только если есть roomId и переподключение разрешено
			if (shouldReconnectRef.current && currentRoomId) {
				connectionAttempts.current++;

				// ✅ ИСПРАВЛЕНО: Показываем ошибку только после нескольких неудачных попыток
				if (connectionAttempts.current > maxRetriesBeforeError.current) {
					if (event.code !== 1000) {
						// Не обычное закрытие и превышен лимит попыток
						setConnectionError("Не удается подключиться к серверу");
					}
				} else {
					// Еще есть попытки - не показываем ошибку, остаемся в режиме загрузки
					setConnectionError(null);
				}

				const delay = 2000; // ✅ Все попытки переподключения через 2 секунды

				console.log(
					`🔄 Reconnecting in 2s (attempt ${connectionAttempts.current}/${maxRetriesBeforeError.current}) for room ${currentRoomId}`
				);
				reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
			} else {
				console.log("❌ Not reconnecting: no room or reconnection disabled");
			}
		};

		socket.onerror = (error) => {
			console.error("❌ WebSocket error:", {
				error,
				url: fullWsUrl,
				readyState: socket.readyState,
				timestamp: new Date().toISOString(),
				attempt: connectionAttempts.current + 1,
			});
			setIsConnected(false);

			// ✅ ИСПРАВЛЕНО: Не устанавливаем ошибку сразу
			// Ошибка будет установлена в onclose только после превышения лимита попыток
			// setConnectionError("Ошибка подключения к серверу");

			isConnectedRef.current = false;
		};

		socket.onmessage = (event) => {
			const message = event.data;

			// Обрабатываем Engine.IO pong
			if (message === "3") {
				console.log("📥 Received pong");
				// Очищаем timeout ожидания pong
				if (heartbeatTimeoutRef.current) {
					clearTimeout(heartbeatTimeoutRef.current);
					heartbeatTimeoutRef.current = null;
				}
				return;
			}

			// Обрабатываем Socket.IO сообщения
			if (message.startsWith("42[")) {
				try {
					const data = JSON.parse(message.slice(2));
					const eventName = data[0];
					const eventData = data[1];

					console.log("📥 Received WebSocket message:", eventName, eventData);

					switch (eventName) {
						case "joined":
							console.log("✅ Successfully joined room:", eventData);
							setIsJoinedRoom(true);
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
							break;

						case "members-updated":
							console.log("👥 Members updated:", eventData);
							const members = eventData.members || [];
							setRoomMembers(members);
							break;

						case "member-left":
							console.log("👋 Member left:", eventData.telegramId);
							// Очищаем курсор и выделения при выходе
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

							// Очищаем выделения пользователя при выходе
							setSelections((prev) => {
								const newSelections = new Map(prev);
								newSelections.delete(eventData.telegramId);
								return newSelections;
							});
							break;

						case "cursor-action":
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
							break;

						case "selection-state":
							console.log("📍 Received selection state:", eventData);

							// Полностью заменяем выделения новым состоянием с сервера
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
							break;

						case "complete-session":
							console.log("🏁 Session completed:", eventData.message);

							toast(eventData.message);

							setTimeout(() => {
								const url = new URL(window.location.href);
								url.search = ""; // Очищаем все search параметры

								window.location.href = url.origin + url.pathname;
							}, 2000);
							break;

						case "code-edit-action":
							if (eventData.telegramId !== myTelegramIdRef.current) {
								console.log(
									"📝 Received code edit from:",
									eventData.telegramId
								);
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
							break;

						case "code-edit-confirmed":
							console.log(
								"✅ Code edit confirmed at:",
								new Date(eventData.timestamp)
							);
							break;

						case "room-edited":
							console.log("🏠 Room settings updated:", eventData);
							// Обновляем разрешения комнаты из события room-edited
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
							break;

						case "room-state-loaded":
							console.log("🔄 Room state loaded from DB:", eventData);
							// Уведомляем о загруженном состоянии
							window.dispatchEvent(
								new CustomEvent("roomStateLoaded", {
									detail: {
										lastCode: eventData.lastCode,
										participantCount: eventData.participantCount,
									},
								})
							);
							break;

						case "clear-user-selections":
							console.log(
								"🧹 Clearing selections for user:",
								eventData.telegramId
							);
							if (eventData.telegramId !== myTelegramIdRef.current) {
								setSelections((prev) => {
									const newSelections = new Map(prev);
									newSelections.delete(eventData.telegramId);
									return newSelections;
								});
							}
							break;

						case "room-sound":
							console.log("🔊 Received room sound:", eventData);
							// Воспроизводим звук только если это не от нас
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

									// Мягкий звук уведомления для других участников
									oscillator.frequency.setValueAtTime(
										700,
										audioContext.currentTime
									);
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
							break;

						case "error":
							console.error("❌ Server error:", eventData.message);
							break;
					}
				} catch (error) {
					console.error("❌ Failed to parse message:", error);
				}
			}
		};
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
					socketRef.current?.readyState === WebSocket.OPEN
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
	const sendCursorPosition = useCallback((position: [number, number]) => {
		if (socketRef.current?.readyState === WebSocket.OPEN && roomIdRef.current) {
			const message = `42["cursor",${JSON.stringify({
				telegramId: myTelegramIdRef.current,
				roomId: roomIdRef.current,
				position,
				logs: [],
			})}]`;
			socketRef.current.send(message);
		}
	}, []);

	const sendSelection = useCallback(
		(selectionData: {
			// Для курсора
			line?: number;
			column?: number;
			// Для выделения фрагмента
			selectionStart?: { line: number; column: number };
			selectionEnd?: { line: number; column: number };
			selectedText?: string;
			// Флаг для явной очистки выделения
			clearSelection?: boolean;
		}) => {
			if (
				socketRef.current?.readyState === WebSocket.OPEN &&
				roomIdRef.current
			) {
				const message = `42["selection",${JSON.stringify({
					telegramId: myTelegramIdRef.current,
					roomId: roomIdRef.current,
					...selectionData,
				})}]`;
				console.log("📤 Sending selection message:", message);
				socketRef.current.send(message);
			}
		},
		[]
	);

	const sendCodeEdit = useCallback(
		(
			changes: { from: number; to: number; insert: string }[],
			newCode: string
		) => {
			if (
				socketRef.current?.readyState === WebSocket.OPEN &&
				roomIdRef.current
			) {
				// Отмечаем себя как печатающего
				markUserAsTyping(myTelegramIdRef.current);

				const message = `42["code-edit",${JSON.stringify({
					roomId: roomIdRef.current,
					telegramId: myTelegramIdRef.current,
					changes,
					newCode,
				})}]`;
				socketRef.current.send(message);
				console.log("📤 Sent code edit:", changes.length, "changes");
			}
		},
		[markUserAsTyping]
	);

	const sendEditMember = useCallback((username?: string) => {
		if (socketRef.current?.readyState === WebSocket.OPEN && roomIdRef.current) {
			const message = `42["edit-member",${JSON.stringify({
				telegramId: myTelegramIdRef.current,
				roomId: roomIdRef.current,
				username,
			})}]`;
			socketRef.current.send(message);
			console.log("📤 Sent edit member:", username);
		}
	}, []);

	const sendRoomPermissions = useCallback((permissions: RoomPermissions) => {
		if (socketRef.current?.readyState === WebSocket.OPEN && roomIdRef.current) {
			const message = `42["edit-room",${JSON.stringify({
				id: myTelegramIdRef.current,
				roomId: roomIdRef.current,
				studentCursorEnabled: permissions.studentCursorEnabled,
				studentSelectionEnabled: permissions.studentSelectionEnabled,
				studentEditCodeEnabled: permissions.studentEditCodeEnabled,
			})}]`;
			socketRef.current.send(message);
			console.log("📤 Sent room permissions:", permissions);

			// Отправляем звуковой сигнал всем участникам
			const soundMessage = `42["room-sound",${JSON.stringify({
				telegramId: myTelegramIdRef.current,
				roomId: roomIdRef.current,
				soundType: "permission-change",
			})}]`;
			socketRef.current.send(soundMessage);
		}
	}, []);

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
	};
};
