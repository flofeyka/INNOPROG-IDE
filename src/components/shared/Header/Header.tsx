import { useDisclosure } from "@heroui/react";
import React from "react";
import { RoomMember } from "../Code/IDE/IDE";
import { RoomPermissions } from "../../../types/room";
import { isDesktop } from "../../..";
import Settings from "../Room/Settings/Settings";
import { EditUsernameModal } from "../Room/StartFormModal/StartFormModal";

interface IProps {
  members?: RoomMember[];
  onEditMember?: (username?: string) => void;
  onCompleteSession?: () => void;
  myTelegramId?: string;
  roomPermissions?: RoomPermissions;
  isTeacher?: boolean;
  onPermissionsChange?: (permissions: RoomPermissions) => void;
  roomId?: string | null;
  completedSession?: boolean;
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
  completedSession,
}) => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [editingMember, setEditingMember] = React.useState<RoomMember | null>(
    null
  );
  const [showMembersCard, setShowMembersCard] = React.useState<boolean>(false);
  const membersCardRef = React.useRef<HTMLDivElement>(null);

  // Закрываем карточки при клике вне их

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
      <header className="bg-ide-secondary border-b border-ide-border flex items-center relative px-4 md:px-6">
        {/* Логотип с отступами */}
        <div className="flex-shrink-0 py-3 md:py-4">
          <img src="/logo.svg" alt="INNOPROG" className="h-10" />
        </div>

        {roomId && roomPermissions && (
          <Settings
            isTeacher={isTeacher}
            onCompleteSession={onCompleteSession!}
            onPermissionsChange={onPermissionsChange!}
            roomPermissions={roomPermissions}
            completedSession={Boolean(completedSession)}
          />
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
