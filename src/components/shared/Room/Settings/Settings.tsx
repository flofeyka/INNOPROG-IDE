import React from "react";
import {Button, Card, Switch} from "@heroui/react";
import {RoomPermissions} from "../../../../types/room";
import {motion} from 'framer-motion'

interface IProps {
    onCompleteSession: () => void;
    isTeacher: boolean;
    onPermissionsChange: (permissions: RoomPermissions) => void;
    roomPermissions: RoomPermissions;
    completedSession: boolean;
}

const Settings: React.FC<IProps> = ({onCompleteSession, isTeacher, onPermissionsChange, roomPermissions, completedSession}) => {
    const [showPermissionsCard, setShowPermissionsCard] = React.useState<boolean>(false);

    const handlePermissionChange = async (permission: keyof RoomPermissions, value: boolean) => {
        if (onPermissionsChange && roomPermissions) {
            const newPermissions = {
                ...roomPermissions, [permission]: value,
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
        studentCursorEnabled: "⚡", studentSelectionEnabled: "🎯", studentEditCodeEnabled: "✏️",
    };


    return <div className="flex gap-2 justify-center w-full">
        <div className="flex justify-center relative mx-8">
            <button
                onClick={() => setShowPermissionsCard(prev => !prev)}
                className={`relative inline-flex items-center gap-2 px-6 py-2 rounded-xl font-semibold text-sm transition-all duration-300 ${isTeacher ? "bg-ide-editor hover:bg-ide-background text-ide-text-primary shadow-lg hover:shadow-xl hover:scale-105 cursor-pointer border border-ide-border" : "bg-gray-600 text-gray-300 cursor-not-allowed opacity-60"}`}
                title={isTeacher ? "Управление правами студентов" : "Доступно только учителю"}
            >
                <span className="text-lg">⚙️</span>
                <span>Настройки</span>

                {/* Индикатор активных разрешений */}
                <span className="bg-white/20 text-xs px-2 py-1 rounded-full">
									{Object.values(roomPermissions).filter(Boolean).length}/
                    {Object.keys(roomPermissions).length}
								</span>

                <span
                    className={`ml-1 transition-transform duration-200 ${showPermissionsCard ? "rotate-180" : ""}`}
                >
									▼
								</span>
            </button>

            {/* Выпадающая карточка */}
            {showPermissionsCard && (<motion.div
                initial={{
                    opacity: 0,
                }}
                animate={{
                    opacity: 100,
                }}
                transition={{duration: 0.3}}
                className="absolute top-full mt-2 z-50"
            >
                <Card
                    className="bg-ide-background border border-ide-border rounded-xl shadow-2xl p-4 min-w-[400px]">
                    <div className="space-y-3">
                        {Object.entries(roomPermissions).map(([key]) => (<div
                            key={key}
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

                            <Switch
                                isDisabled={!isTeacher}
                                color="secondary"
                                isSelected={roomPermissions[key as keyof RoomPermissions]}
                                onValueChange={(value: boolean): Promise<void> => handlePermissionChange(key as keyof RoomPermissions, value)}
                            />
                        </div>))}
                        {isTeacher && !completedSession && (<Button
                            className="w-full disabled:opacity-60"
                            disabled={!isTeacher}
                            color="danger"
                            size="lg"
                            onPress={onCompleteSession}
                        >
                            Завершить сессию
                        </Button>)}
                    </div>
                </Card>
            </motion.div>)}
        </div>
    </div>
}

export default Settings;