import { useDisclosure } from "@heroui/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCodeExecution } from "../../../../hooks/useCodeExecution";
import { api } from "../../../../services/api";
import { Answer, Language, Task } from "../../../../types/task";

import { Socket } from "socket.io-client";
import CodeEditorSection from "../CodeEditorSection/CodeEditorSection";
import Loader from "../../Room/Loader/Loader";
import OutputSection from "../OutputSection/OutputSection";
import StartFormModal from "../../Room/StartFormModal/StartFormModal";
import SubmitModal from "../SubmitModal/SubmitModal";
import TaskDescription from "../TaskDescription/TaskDescription";
import Header from "../../Header/Header";
import Footer from "../../Footer/Footer";
import { CursorData, RoomMember } from "../../../../hooks/useWebSocket";

interface RoomPermissions {
  studentCursorEnabled: boolean;
  studentSelectionEnabled: boolean;
  studentEditCodeEnabled: boolean;
}

interface WebSocketData {
  socket: Socket | null;
  isConnected: boolean;
  isJoinedRoom: boolean;
  connectionError: string | null;
  roomMembers: RoomMember[];
  cursors: Map<string, CursorData>;
  completeSession: () => void;
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
  roomPermissions: RoomPermissions;
  isTeacher?: boolean;
  sendCursorPosition: (position: [number, number]) => void;
  sendSelection: (selectionData: {
    line?: number;
    column?: number;
    selectionStart?: { line: number; column: number };
    selectionEnd?: { line: number; column: number };
    selectedText?: string;
  }) => void;
  onSendUpdate?: (update: Uint8Array) => void;
  updatesFromProps?: Uint8Array[];
  sendEditMember: (username?: string) => void;
  sendRoomPermissions: (permissions: RoomPermissions) => void;
  activeTypers: Set<string>;
  markUserAsTyping: (telegramId: string) => void;
  completed: boolean;
  sendChangeLanguage: (language: Language) => void;
  language?: Language;
  joinedCode?: string;
}

interface IDEProps {
  webSocketData?: WebSocketData;
  telegramId: string;
}

const IDE: React.FC<IDEProps> = React.memo(({ webSocketData, telegramId }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [task, setTask] = useState<Task | null>(null);
  const [code, setCode] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"editor" | "output">("editor");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null);
  const [submitResult, setSubmitResult] = useState<
    "success" | "error" | "no_data"
  >("success");
  const [inputData, setInputData] = useState<string>("");
  const [outputData, setOutputData] = useState<string>("");
  const [isOutputData, setIsOutputData] = useState<boolean>(false);
  const [isInputData, setIsInputData] = useState<boolean>(true);
  const [showStartModal, setShowStartModal] = useState<boolean>(false);

  const { onOpen, onOpenChange, isOpen, onClose } = useDisclosure();

  const taskId = searchParams.get("task_id") || null;
  const language = searchParams.get("lang") || "py";
  const answer_id = searchParams.get("answer_id");
  const roomId = searchParams.get("roomId");

  const { isRunning, handleRunCode, onSendCheck } = useCodeExecution({
    currentAnswer,
    task,
    code,
    inputData,
    outputData,
    taskId,
    answer_id,
    language,
    setOutput,
    setStatus,
    setActiveTab,
    setSubmitResult,
    onOpen,
    status,
  });

  const onModalRunCode = async () => {
    if (!task?.answers?.length || !taskId) {
      setSubmitResult("no_data");
      onOpen();
    } else {
      await handleRunCode();
    }
  };

  useEffect(() => {
    if (webSocketData?.language) {
      const language: Language = webSocketData.language;
      setSearchParams((prev: URLSearchParams): URLSearchParams => {
        prev.set("lang", language);

        return prev;
      });
    }
  }, [setSearchParams, webSocketData?.language]);

  const memoizedSetCode = useCallback((newCode: string) => {
    setCode(newCode);
  }, []);

  const handleStartFormSubmit = useCallback(
    (username?: string) => {
      if (webSocketData?.sendEditMember) {
        webSocketData.sendEditMember(username);
      }
      setShowStartModal(false);
    },
    [webSocketData?.sendEditMember]
  );

  // Проверяем, нужно ли показывать модалку (только если есть roomId)
  useEffect(() => {
    // Если нет roomId, то модалка не нужна
    if (!roomId) {
      return;
    }

    if (!webSocketData?.isConnected || !webSocketData?.isJoinedRoom) {
      return;
    }

    // Проверяем localStorage
    const savedUsername = localStorage.getItem("innoprog-username");

    // Проверяем, есть ли у текущего пользователя имя в roomMembers
    const currentMember = webSocketData.roomMembers?.find(
      (member) => member.isYourself
    );

    // Показываем модалку только если нет сохраненного имени И у пользователя нет имени в комнате
    if (
      !savedUsername &&
      (!currentMember?.username || currentMember.username.trim() === "")
    ) {
      setShowStartModal(true);
    } else {
      // Если есть сохраненное имя, но нет имени у пользователя в комнате - отправляем его
      if (
        savedUsername &&
        (!currentMember?.username || currentMember.username.trim() === "")
      ) {
        webSocketData?.sendEditMember?.(savedUsername);
      }
    }
  }, [
    webSocketData?.isConnected,
    webSocketData?.isJoinedRoom,
    webSocketData?.roomMembers,
    webSocketData?.sendEditMember,
    telegramId,
  ]);

  // Состояние для отслеживания источников кода
  const [codeSource, setCodeSource] = useState<"none" | "api" | "room">("none");
  const [roomCodeLoaded, setRoomCodeLoaded] = useState(false);

  // Загрузка данных задачи
  useEffect(() => {
    const loadTask = async () => {
      if (!taskId) return;

      try {
        const taskData = await api.getTask(taskId);
        setTask(taskData);
        if (taskData.answers && taskData.answers.length > 1) {
          setCurrentAnswer({
            ...taskData.answers[0],
          });
        }
      } catch (error) {
        console.error("Failed to load task:", error);
      }
    };

    loadTask();
  }, [taskId]);

  // Загрузка кода с приоритетами
  useEffect(() => {
    const loadCode = async () => {
      // Если есть roomId, ждем сначала загрузки из комнаты
      if (roomId && !roomCodeLoaded) {
        return;
      }

      // Если код уже загружен из комнаты, не перезаписываем его
      if (codeSource === "room") {
        return;
      }

      // Загружаем код из API
      if (taskId && answer_id) {
        try {
          const data = await api.getSubmitCode(
            answer_id,
            window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 429272623,
            Number(taskId)
          );

          // Проверяем, что код из комнаты не был загружен между запросом и ответом
          if (data.code) {
            setCode(data.code);
            setCodeSource("api");
          }
        } catch (error) {
          console.error("Failed to load answer code:", error);
        }
      } else if (taskId && !answer_id && codeSource === "none") {
        setCode("");
        setCodeSource("api");
      }
    };

    loadCode();
  }, [taskId, answer_id, roomId, roomCodeLoaded, codeSource]);

  // Обработчик события загрузки состояния комнаты
  useEffect(() => {
    const handleRoomStateLoaded = (event: CustomEvent) => {
      const { lastCode, participantCount } = event.detail;

      if (lastCode && lastCode.trim()) {
        let editableCode = lastCode;

        if (task?.answers?.[0]) {
          const codeBefore = task.answers[0].code_before || "";
          const codeAfter = task.answers[0].code_after || "";

          // Если код содержит нередактируемые части, извлекаем только редактируемую часть
          if (codeBefore && lastCode.startsWith(codeBefore)) {
            editableCode = lastCode.slice(codeBefore.length);
            if (codeAfter && editableCode.endsWith(codeAfter)) {
              editableCode = editableCode.slice(0, -codeAfter.length);
            }
          }
        }

        setCode(editableCode);
        setCodeSource("room");
      } else {
      }
      setRoomCodeLoaded(true);
    };

    window.addEventListener(
      "roomStateLoaded",
      handleRoomStateLoaded as EventListener
    );

    // Если нет roomId, сразу помечаем как "загружено"
    if (!roomId) {
      setRoomCodeLoaded(true);
    }

    return () => {
      window.removeEventListener(
        "roomStateLoaded",
        handleRoomStateLoaded as EventListener
      );
    };
  }, [roomId, task]); // Добавляем task как зависимость

  const handleLanguageChange = useCallback(
    (lang: Language) => {
      setSearchParams((prev) => {
        prev.set("lang", lang);
        return prev;
      });
      if (webSocketData) {
        webSocketData.sendChangeLanguage(lang);
      }
    },
    [setSearchParams, webSocketData]
  );

  const memoizedWebSocketData = useMemo(() => {
    if (!webSocketData) return undefined;

    return {
      sendSelection: webSocketData.sendSelection,
      selections: webSocketData.selections,
      onSendUpdate: webSocketData.onSendUpdate,
      updatesFromProps: webSocketData.updatesFromProps,
      activeTypers: webSocketData.activeTypers,
      myTelegramId: telegramId,
      completed: webSocketData.completed,
      roomPermissions: webSocketData.roomPermissions,
      isTeacher: webSocketData.isTeacher,
      joinedCode: webSocketData.joinedCode,
    };
  }, [
    webSocketData?.isTeacher,
    telegramId,
    webSocketData?.sendSelection,
    webSocketData?.selections,
    webSocketData?.onSendUpdate,
    webSocketData?.updatesFromProps,
    webSocketData?.activeTypers,
    webSocketData?.joinedCode,
    searchParams,
  ]);

  return (
    <div className="min-h-screen h-screen flex flex-col bg-ide-background text-ide-text-primary">
      {/* Лоадер подключения - только если есть roomId и проблемы с подключением */}
      {roomId &&
        (!webSocketData?.isConnected || !webSocketData?.isJoinedRoom) && (
          <Loader
            message={
              webSocketData?.connectionError
                ? webSocketData.connectionError
                : !webSocketData?.isConnected
                ? "Подключение к серверу..."
                : "Присоединение к комнате..."
            }
            isError={Boolean(webSocketData?.connectionError ?? false)}
          />
        )}

      <SubmitModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onClose={onClose}
        submitResult={submitResult}
        isRunning={isRunning}
        inputData={inputData}
        setInputData={setInputData}
        outputData={outputData}
        setOutputData={setOutputData}
        isInputData={isInputData}
        setIsInputData={setIsInputData}
        isOutputData={isOutputData}
        setIsOutputData={setIsOutputData}
        onApply={handleRunCode}
      />

      {roomId &&
        webSocketData?.isConnected &&
        webSocketData?.isJoinedRoom &&
        showStartModal && <StartFormModal onSendForm={handleStartFormSubmit} />}

      <Header
        completedSession={webSocketData?.completed}
        onCompleteSession={webSocketData?.completeSession}
        members={webSocketData?.roomMembers}
        onEditMember={webSocketData?.sendEditMember}
        myTelegramId={telegramId}
        roomPermissions={webSocketData?.roomPermissions}
        isTeacher={webSocketData?.isTeacher || false}
        onPermissionsChange={webSocketData?.sendRoomPermissions}
        roomId={roomId}
      />

      <TaskDescription task={task} />

      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col md:flex-row">
          <CodeEditorSection
            code={code}
            setCode={memoizedSetCode}
            language={language}
            currentAnswer={currentAnswer}
            task={task}
            activeTab={activeTab}
            webSocketData={memoizedWebSocketData}
            handleLanguageChange={handleLanguageChange}
          />

          <OutputSection
            output={output}
            status={status}
            activeTab={activeTab}
          />
        </div>
      </main>

      <Footer
        status={status}
        taskId={taskId}
        isRunning={isRunning}
        activeTab={activeTab}
        onRunCode={onModalRunCode}
        onSubmitCheck={onSendCheck}
        setActiveTab={setActiveTab}
        setStatus={setStatus}
      />
    </div>
  );
});

export default IDE;
