import React from "react";
import type { Answer, Task } from "../../types/task";
import CodeEditor from "../CodeEditor/CodeEditor";

interface CodeEditorSectionProps {
	code: string;
	setCode: (code: string) => void;
	language: string;
	currentAnswer: Answer | null;
	task: Task | null;
	activeTab: string;
	webSocketData?: {
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
		sendCodeEdit: (
			changes: { from: number; to: number; insert: string }[],
			newCode: string
		) => void;
		codeEdits: Map<
			string,
			{
				telegramId: string;
				changes: { from: number; to: number; insert: string }[];
				newCode: string;
				userColor: string;
				timestamp: number;
			}
		>;
		activeTypers: Set<string>;
		myTelegramId: string;
		completed: boolean;
	};
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
					readOnly={
						task?.type === "Дополнение кода" && task.answers!.length > 1
							? currentAnswer
								? false
								: true
							: false
					}
					sendSelection={webSocketData?.sendSelection}
					selections={webSocketData?.selections}
					sendCodeEdit={webSocketData?.sendCodeEdit}
					codeEdits={webSocketData?.codeEdits}
					activeTypers={webSocketData?.activeTypers}
					myTelegramId={webSocketData?.myTelegramId}
					completed={webSocketData?.completed ?? false}
				/>
			</div>
		);
	}
);

CodeEditorSection.displayName = "CodeEditorSection";

export default CodeEditorSection;
