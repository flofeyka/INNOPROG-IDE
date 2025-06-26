import { Button, Switch, useDisclosure } from "@heroui/react";
import React from "react";
import { isDesktop } from "../..";
import { RoomMember } from "../IDE/IDE";
import { EditUsernameModal } from "../StartFormModal/StartFormModal";

// CSS стили для анимаций
const animationStyles = `
@keyframes fadeInScale {
	from {
		opacity: 0;
		transform: translateX(-50%) scale(0.95) translateY(-5px);
	}
	to {
		opacity: 1;
		transform: translateX(-50%) scale(1) translateY(0);
	}
}

@keyframes fadeOutScale {
	from {
		opacity: 1;
		transform: translateX(-50%) scale(1) translateY(0);
	}
	to {
		opacity: 0;
		transform: translateX(-50%) scale(0.95) translateY(-5px);
	}
}

@keyframes fadeInScaleMembers {
	from {
		opacity: 0;
		transform: translateX(0) scale(0.95) translateY(-5px);
	}
	to {
		opacity: 1;
		transform: translateX(0) scale(1) translateY(0);
	}
}
`;

interface RoomPermissions {
	studentCursorEnabled: boolean;
	studentSelectionEnabled: boolean;
	studentEditCodeEnabled: boolean;
}

interface IProps {
	members?: RoomMember[];
	onEditMember?: (username?: string) => void;
	onCompleteSession?: () => void;
	myTelegramId?: string;
	roomPermissions?: RoomPermissions;
	isTeacher?: boolean;
	onPermissionsChange?: (permissions: RoomPermissions) => void;
	roomId?: string | null;
}

const Header: React.FC<IProps> = ({
	members,
	onEditMember,
	myTelegramId,
	roomPermissions,
	isTeacher = false,
	onPermissionsChange,
	roomId,
	onCompleteSession,
}) => {
	const { isOpen, onOpen, onOpenChange } = useDisclosure();
	const [editingMember, setEditingMember] = React.useState<RoomMember | null>(
		null
	);
	const [showPermissionsCard, setShowPermissionsCard] = React.useState(false);
	const [showMembersCard, setShowMembersCard] = React.useState(false);
	const permissionsCardRef = React.useRef<HTMLDivElement>(null);
	const membersCardRef = React.useRef<HTMLDivElement>(null);

	// Закрываем карточки при клике вне их
	React.useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				permissionsCardRef.current &&
				!permissionsCardRef.current.contains(event.target as Node)
			) {
				setShowPermissionsCard(false);
			}

			if (
				membersCardRef.current &&
				!membersCardRef.current.contains(event.target as Node)
			) {
				setShowMembersCard(false);
			}
		};

		if (showPermissionsCard || showMembersCard) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [showPermissionsCard, showMembersCard]);

	const handleMemberClick = (member: RoomMember) => {
		// Разрешаем редактировать только свой профиль
		if (member.telegramId === myTelegramId) {
			setEditingMember(member);
			onOpen();
		}
	};

	const handleEditSubmit = (username?: string) => {
		if (onEditMember) {
			onEditMember(username);
		}
		setEditingMember(null);
	};

	const handlePermissionChange = (
		permission: keyof RoomPermissions,
		value: boolean
	) => {
		// Мягкий звуковой эффект при переключении
		try {
			const audioContext = new (window.AudioContext ||
				(window as any).webkitAudioContext)();
			const oscillator = audioContext.createOscillator();
			const gainNode = audioContext.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(audioContext.destination);

			// Мягкие параметры звука
			oscillator.frequency.setValueAtTime(
				value ? 800 : 600,
				audioContext.currentTime
			);
			gainNode.gain.setValueAtTime(0, audioContext.currentTime);
			gainNode.gain.linearRampToValueAtTime(
				0.02,
				audioContext.currentTime + 0.01
			); // Очень тихий звук
			gainNode.gain.exponentialRampToValueAtTime(
				0.001,
				audioContext.currentTime + 0.1
			);

			oscillator.type = "sine"; // Мягкий синусоидальный тон
			oscillator.start(audioContext.currentTime);
			oscillator.stop(audioContext.currentTime + 0.1);
		} catch (e) {
			// Если Web Audio API не поддерживается, используем fallback
			try {
				const audio = new Audio();
				audio.volume = 0.05; // Очень тихий звук
				// Простой тон для fallback
				audio.src = `data:audio/wav;base64,UklGRlQDAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=`;
				audio.play();
			} catch (fallbackError) {
				// Если и это не работает, просто игнорируем
			}
		}

		if (onPermissionsChange && roomPermissions) {
			const newPermissions = {
				...roomPermissions,
				[permission]: value,
			};
			onPermissionsChange(newPermissions);
		}
	};

	const permissionLabels = {
		studentCursorEnabled: "Курсоры студентов",
		studentSelectionEnabled: "Выделения студентов",
		studentEditCodeEnabled: "Редактирование кода",
	};

	const permissionIcons = {
		studentCursorEnabled: "⚡",
		studentSelectionEnabled: "🎯",
		studentEditCodeEnabled: "✏️",
	};

	// Функции для работы с участниками
	const sortedMembers = React.useMemo(() => {
		if (!members) return [];
		return [...members].sort((a, b) => {
			// Сначала онлайн, потом оффлайн
			if (a.online !== b.online) {
				return a.online ? -1 : 1;
			}
			// Внутри каждой группы сортируем по имени
			const nameA = a.username || a.telegramId;
			const nameB = b.username || b.telegramId;
			return nameA.localeCompare(nameB);
		});
	}, [members]);

	const onlineMembers = sortedMembers.filter((member) => member.online);
	const visibleMembers = onlineMembers.slice(0, 3);
	const hasMoreMembers = sortedMembers.length > 3;

	if (!isDesktop()) return null;

	return (
		<>
			{/* Добавляем CSS стили */}
			<style>{animationStyles}</style>

			<header className="bg-ide-secondary border-b border-ide-border flex items-center relative px-4 md:px-6">
				{/* Логотип с отступами */}
				<div className="flex-shrink-0 py-3 md:py-4">
					<img src="/logo.svg" alt="INNOPROG" className="h-10" />
				</div>

				{/* Кнопка "Права" - только для комнат */}
				{roomId && roomPermissions && (
					<div className="flex gap-2 justify-center w-full">
						<div className="flex justify-center relative mx-8">
							<button
								onClick={() => setShowPermissionsCard(!showPermissionsCard)}
								className={`relative inline-flex items-center gap-2 px-6 py-2 rounded-xl font-semibold text-sm transition-all duration-300 ${
									isTeacher
										? "bg-ide-editor hover:bg-ide-background text-ide-text-primary shadow-lg hover:shadow-xl hover:scale-105 cursor-pointer border border-ide-border"
										: "bg-gray-600 text-gray-300 cursor-not-allowed opacity-60"
								}`}
								title={
									isTeacher
										? "Управление правами студентов"
										: "Доступно только учителю"
								}
							>
								<span className="text-lg">⚙️</span>
								<span>Настройки</span>

								{/* Индикатор активных разрешений */}
								<span className="bg-white/20 text-xs px-2 py-1 rounded-full">
									{Object.values(roomPermissions).filter(Boolean).length}/
									{Object.keys(roomPermissions).length}
								</span>

								<span
									className={`ml-1 transition-transform duration-200 ${
										showPermissionsCard ? "rotate-180" : ""
									}`}
								>
									▼
								</span>
							</button>

							{/* Выпадающая карточка */}
							{showPermissionsCard && (
								<div
									ref={permissionsCardRef}
									className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-50 opacity-0 scale-95 animate-in fade-in zoom-in-95 duration-300 ease-out"
									style={{
										animation: showPermissionsCard
											? "fadeInScale 0.3s ease-out forwards"
											: "fadeOutScale 0.2s ease-in forwards",
									}}
								>
									<div className="bg-ide-background border border-ide-border rounded-xl shadow-2xl p-4 min-w-[400px]">
										<div className="space-y-3">
											{Object.entries(roomPermissions).map(([key, value]) => (
												<div
													key={key}
													title={
														!isTeacher ? "Доступно только учителю!" : undefined
													}
													className={`flex items-center justify-between p-3 rounded-lg bg-ide-secondary hover:bg-ide-editor transition-all duration-300 border border-ide-border`}
												>
													<div className="flex items-center gap-3">
														<span className="text-lg">
															{permissionIcons[key as keyof RoomPermissions]}
														</span>
														<span className="text-sm font-medium text-ide-text-primary">
															{permissionLabels[key as keyof RoomPermissions]}
														</span>
													</div>

													{/* Тумблер */}
													<Switch
														isDisabled={!isTeacher}
														color="secondary"
														isSelected={
															roomPermissions[key as keyof RoomPermissions]
														}
														onValueChange={(value) =>
															handlePermissionChange(
																key as keyof RoomPermissions,
																value
															)
														}
													/>
												</div>
											))}
											{isTeacher && (
												<Button
													className="w-full disabled:opacity-60"
													disabled={!isTeacher}
													color="danger"
													size="lg"
													onPress={onCompleteSession}
												>
													Завершить сессию
												</Button>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Секция участников - только для комнат */}
				{roomId && members && members.length > 0 && (
					<div className="flex gap-4 items-center relative">
						{/* Первые 3 онлайн участника */}
						{visibleMembers.map((member) => (
							<div
								key={member.telegramId}
								className={`border-2 p-[3px] rounded-full cursor-pointer transition-all duration-200 hover:scale-105 ${
									member?.userColor && `border-[${member?.userColor}]`
								}`}
								style={{
									borderColor: member?.userColor,
								}}
								onClick={() => handleMemberClick(member)}
								title={
									member.telegramId === myTelegramId
										? "Нажмите чтобы изменить имя"
										: `Участник: ${member.username || member.telegramId} ${
												member.online ? "(онлайн)" : "(оффлайн)"
										  }`
								}
							>
								<span
									className={`bg-[#444] h-12 w-12 flex items-center justify-center rounded-full text-white text-sm font-medium transition-opacity duration-200 ${
										!member.online && "opacity-50"
									}`}
								>
									{member.username
										? member.username.slice(0, 2).toUpperCase()
										: member.telegramId.slice(0, 3)}
								</span>
							</div>
						))}

						{/* Кнопка "Ещё" если участников больше 3 */}
						{hasMoreMembers && (
							<div className="relative">
								<button
									onClick={() => setShowMembersCard(!showMembersCard)}
									className="border-2 border-dashed border-gray-500 p-[3px] rounded-full cursor-pointer transition-all duration-200 hover:scale-105 hover:border-gray-400"
									title={`Ещё ${sortedMembers.length - 3} участников`}
								>
									<span className="bg-gray-600 h-12 w-12 flex items-center justify-center rounded-full text-white text-sm font-medium hover:bg-gray-500 transition-colors duration-200">
										+{sortedMembers.length - 3}
									</span>
								</button>

								{/* Выпадающая карточка со всеми участниками */}
								{showMembersCard && (
									<div
										ref={membersCardRef}
										className="absolute top-full right-0 mt-2 z-50"
										style={{
											animation: showMembersCard
												? "fadeInScaleMembers 0.3s ease-out forwards"
												: "fadeOutScale 0.2s ease-in forwards",
										}}
									>
										<div className="bg-ide-background border border-ide-border rounded-xl shadow-2xl p-4 min-w-[300px] max-w-[400px]">
											<div className="mb-3">
												<h3 className="text-sm font-semibold text-ide-text-primary mb-1">
													Участники комнаты
												</h3>
												<p className="text-xs text-ide-text-secondary">
													Всего: {sortedMembers.length} • Онлайн:{" "}
													{onlineMembers.length}
												</p>
											</div>

											<div className="max-h-60 overflow-y-auto space-y-2">
												{sortedMembers.map((member) => (
													<div
														key={member.telegramId}
														className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 cursor-pointer hover:bg-ide-editor bg-ide-secondary border border-ide-border ${
															!member.online && "opacity-60"
														}`}
														onClick={() => {
															handleMemberClick(member);
															setShowMembersCard(false);
														}}
													>
														{/* Аватар участника */}
														<div
															className="border-2 p-[2px] rounded-full"
															style={{
																borderColor: member?.userColor || "#666",
															}}
														>
															<span
																className={`bg-[#444] h-8 w-8 flex items-center justify-center rounded-full text-white text-xs font-medium ${
																	!member.online && "opacity-70"
																}`}
															>
																{member.username
																	? member.username.slice(0, 2).toUpperCase()
																	: member.telegramId.slice(0, 2)}
															</span>
														</div>

														{/* Информация об участнике */}
														<div className="flex-1 min-w-0">
															<div className="flex items-center gap-2">
																<span
																	className={`text-sm font-medium truncate ${
																		member.online
																			? "text-ide-text-primary"
																			: "text-ide-text-secondary"
																	}`}
																>
																	{member.username ||
																		`User ${member.telegramId.slice(-4)}`}
																</span>

																{member.telegramId === myTelegramId && (
																	<span className="text-xs bg-ide-button-primary/30 text-ide-button-primary px-2 py-0.5 rounded border border-ide-button-primary/50">
																		Вы
																	</span>
																)}
															</div>

															<div className="flex items-center gap-2 mt-0.5">
																<div
																	className={`w-2 h-2 rounded-full ${
																		member.online
																			? "bg-ide-button-primary"
																			: "bg-gray-500"
																	}`}
																/>
																<span className="text-xs text-ide-text-secondary">
																	{member.online ? "Онлайн" : "Оффлайн"}
																</span>
															</div>
														</div>
													</div>
												))}
											</div>

											{/* Подвал карточки */}
											<div className="mt-3 pt-3 border-t border-ide-border flex justify-between items-center">
												<span className="text-xs text-ide-text-secondary">
													Нажмите на участника для редактирования
												</span>
												<button
													onClick={() => setShowMembersCard(false)}
													className="text-xs text-ide-button-primary hover:text-ide-button-primary-hover transition-colors duration-200 hover:underline"
												>
													Закрыть
												</button>
											</div>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</header>

			<EditUsernameModal
				isOpen={isOpen}
				onOpenChange={onOpenChange}
				onSendForm={handleEditSubmit}
				currentUsername={editingMember?.username || ""}
			/>
		</>
	);
};

export default Header;
