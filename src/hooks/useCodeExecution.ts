import { useState } from "react";
import { api } from "../services/api";
import { Answer, Task } from "../types/task";

interface UseCodeExecutionProps {
	currentAnswer: Answer | null;
	task: Task | null;
	code: string;
	inputData: string;
	outputData: string;
	taskId: string | null;
	answer_id: string | null;
	language: string;
	setOutput: (output: string) => void;
	setStatus: (status: "idle" | "success" | "error") => void;
	setActiveTab: (tab: "editor" | "output") => void;
	setSubmitResult: (result: "success" | "error" | "no_data") => void;
	onOpen: () => void;
	status: "idle" | "success" | "error";
}

export const useCodeExecution = ({
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
}: UseCodeExecutionProps) => {
	const [isRunning, setIsRunning] = useState<boolean>(false);
	const [currentCode, setCurrentCode] = useState<string>('');

	const handleRunCode = async () => {
		if (status === "success" && taskId) {
			await onSendCheck();
			return;
		}
		setIsRunning(true);
		setStatus("idle");
		setOutput("");

		try {
			const fullCode = `${currentAnswer?.code_before || task?.answers![0].code_before
				? task?.answers![0].code_before
				: ""
				}\n${currentCode || code}\n${currentAnswer?.code_after || task?.answers![0].code_after
					? task?.answers![0].code_after
					: ""
				}`;

			const checkData = {
				input_data: currentAnswer?.input || inputData || "-",
				output_data:
					task?.answers![0].output.trim() || outputData.trim() || "-",
				program: fullCode,
				test_number: -1,
				timeout: currentAnswer?.timeout || 2,
			};

			const result = await api.checkCode(checkData, language);

			if (result.result) {
				if (!outputData && !taskId) {
					setOutput(result.output!);
					return;
				}
				setOutput(
					`Тест пройден успешно!\n${task?.answers?.length! > 1
						? `Результат программы: ${result.output}`
						: ""
					}`
				);
				setStatus("success");
			} else {
				setOutput(
					`Ошибка: ${result.comment || "Неверный результат"}${result.output !== "error"
						? `\nПолучено: ${result.output}\nОжидалось: ${task?.answers![0]?.output || outputData.trim()
						}`
						: ""
					}`
				);
				setStatus("error");
			}
		} catch (error: any) {
			setOutput(`Ошибка выполнения: ${error.message}`);
			setStatus("error");
		} finally {
			setIsRunning(false);
			if (window.innerWidth < 768) {
				setActiveTab("output");
			}
		}
	};

	const onSendCheck = async () => {
		setIsRunning(true);
		const submittedCode =
			task?.answers && task.answers.length > 1
				? code
				: `${currentAnswer?.code_before ? currentAnswer.code_before : ""
				}${code}${currentAnswer?.code_after ? currentAnswer.code_after : ""}`;
		try {
			await api.submitCode({
				program: submittedCode,
				user_id: window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 429272623,
				answer_id: Number(answer_id) || 123,
				task_id: Number(taskId),
			});
			setSubmitResult("success");
		} catch {
			setSubmitResult("error");
			setStatus("idle");
		}
		onOpen();

		setIsRunning(false);
		await window.Telegram.WebApp.close();
	};

	return {
		isRunning,
		handleRunCode,
		onSendCheck,
		currentCode,
		setCurrentCode
	};
};
