import React from "react";
import type { Answer, Task } from "../../../../types/task";
import CodeEditor from "../CodeEditor/CodeEditor";

interface CodeEditorSectionProps {
  code: string;
  setCode: (code: string) => void;
  language: string;
  currentAnswer: Answer | null;
  task: Task | null;
  activeTab: string;
  webSocketData?: {
    isTeacher?: boolean;
    roomPermissions: {
      studentEditCodeEnabled: boolean;
    };
    sendSelection: (selectionData: {
      line?: number;
      column?: number;
      selectionStart?: { line: number; column: number };
      selectionEnd?: { line: number; column: number };
      selectedText?: string;
    }) => void;
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
    onSendUpdate?: (update: Uint8Array) => void;
    updatesFromProps?: Uint8Array[];
    activeTypers: Set<string>;
    myTelegramId: string;
    completed: boolean;
    joinedCode?: string;
  };
  handleLanguageChange: (language: "js" | "py" | "cpp") => void;
}

const CodeEditorSection: React.FC<CodeEditorSectionProps> = React.memo(
  ({
    code,
    setCode,
    language,
    currentAnswer,
    task,
    activeTab,
    webSocketData,
    handleLanguageChange,
  }) => {
    return (
      <div
        className={`h-full md:w-1/2 p-4 ${
          activeTab === "editor" ? "block" : "hidden md:block"
        }`}
      >
        <CodeEditor
          value={code}
          onChange={setCode}
          language={language}
          codeBefore={currentAnswer?.code_before || ""}
          codeAfter={currentAnswer?.code_after || ""}
          handleLanguageChange={handleLanguageChange}
          disabled={
            !(
              Boolean(webSocketData?.roomPermissions.studentEditCodeEnabled) ||
              Boolean(webSocketData?.isTeacher)
            )
          }
          readOnly={
            task?.type === "Дополнение кода" && task.answers!.length > 1
              ? !currentAnswer
              : false
          }
          sendSelection={webSocketData?.sendSelection}
          selections={webSocketData?.selections}
          onSendUpdate={webSocketData?.onSendUpdate}
          updatesFromProps={webSocketData?.updatesFromProps}
          activeTypers={webSocketData?.activeTypers}
          myTelegramId={webSocketData?.myTelegramId}
          completed={webSocketData?.completed ?? false}
          isTeacher={webSocketData?.isTeacher}
          joinedCode={webSocketData?.joinedCode}
        />
      </div>
    );
  }
);

export default CodeEditorSection;
