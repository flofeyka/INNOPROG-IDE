import { defaultKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
	Decoration,
	DecorationSet,
	EditorView,
	keymap,
} from "@codemirror/view";
import React, { useEffect, useRef } from "react";

interface CodeEditorProps {
	value: string;
	onChange: (value: string) => void;
	language?: string;
	codeBefore?: string;
	codeAfter?: string;
	readOnly?: boolean;
	// WebSocket props для выделения
	sendSelection?: (selectionData: {
		// Для курсора
		line?: number;
		column?: number;
		// Для выделения фрагмента
		selectionStart?: { line: number; column: number };
		selectionEnd?: { line: number; column: number };
		selectedText?: string;
		// Флаг для явной очистки выделения
		clearSelection?: boolean;
	}) => void;
	selections?: Map<
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
	// WebSocket props для редактирования
	sendCodeEdit?: (
		changes: { from: number; to: number; insert: string }[],
		newCode: string
	) => void;
	codeEdits?: Map<
		string,
		{
			telegramId: string;
			changes: { from: number; to: number; insert: string }[];
			newCode: string;
			userColor: string;
			timestamp: number;
		}
	>;
	// Информация о том, кто сейчас печатает
	activeTypers?: Set<string>;
	myTelegramId?: string;
	completed: boolean;
}

// Effect для замены всех выделений
const replaceSelectionsEffect = StateEffect.define<DecorationSet>();

// Effect для применения изменений кода от других пользователей
const applyCodeEditEffect = StateEffect.define<{
	changes: { from: number; to: number; insert: string }[];
	userColor: string;
}>();

// State field для хранения выделений других пользователей
const selectionHighlightField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		// Проверяем эффекты замены выделений
		for (let effect of tr.effects) {
			if (effect.is(replaceSelectionsEffect)) {
				// Полностью заменяем декорации новыми
				return effect.value;
			}
		}

		// Если нет эффектов замены, применяем изменения документа к существующим выделениям
		return decorations.map(tr.changes);
	},
	provide: (f) => EditorView.decorations.from(f),
});

// Extension для обработки изменений кода от других пользователей
const codeEditExtension = EditorView.updateListener.of((update) => {
	// Обрабатываем эффекты изменения кода
	for (let effect of update.transactions.flatMap((tr) => tr.effects)) {
		if (effect.is(applyCodeEditEffect)) {
			const { changes } = effect.value;
			console.log("📝 Applying code changes from other user:", changes);
			// Изменения уже применены через dispatch, просто логируем
		}
	}
});

const CodeEditor: React.FC<CodeEditorProps> = React.memo(
	({
		value,
		onChange,
		language = "javascript",
		codeBefore = "",
		codeAfter = "",
		readOnly = false,
		sendSelection,
		selections,
		sendCodeEdit,
		codeEdits,
		activeTypers,
		myTelegramId,
		completed,
	}) => {
		const editor = useRef<EditorView>();
		const editorContainer = useRef<HTMLDivElement>(null);
		const isUpdating = useRef(false);
		const prevValue = useRef(value);

		const lastLocalEditTime = useRef<number>(0);
		const hadTextSelection = useRef<boolean>(false); // Отслеживаем было ли выделение текста

		// Используем refs для стабильного доступа к функциям
		const onChangeRef = useRef(onChange);
		const sendSelectionRef = useRef(sendSelection);
		const sendCodeEditRef = useRef(sendCodeEdit);

		// Обновляем refs при изменении функций
		onChangeRef.current = onChange;
		sendSelectionRef.current = sendSelection;
		sendCodeEditRef.current = sendCodeEdit;

		// Обрабатываем загрузку состояния комнаты
		useEffect(() => {
			const handleRoomStateLoaded = (event: CustomEvent) => {
				const { lastCode } = event.detail;
				if (lastCode && lastCode !== value && editor.current) {
					console.log("🔄 Loading saved code from DB...");

					// ⚠️ КРИТИЧНО: код из комнаты должен быть ТОЛЬКО редактируемой частью
					// Не перезаписываем весь редактор, а только редактируемую область
					// Это предотвращает конфликт с нередактируемыми частями задачи

					isUpdating.current = true;
					try {
						// Извлекаем только редактируемую часть из сохраненного кода
						let editableCode = lastCode;

						// Если код содержит нередактируемые части (старый формат), извлекаем только редактируемую часть
						if (codeBefore && lastCode.startsWith(codeBefore)) {
							editableCode = lastCode.slice(codeBefore.length);
							if (codeAfter && editableCode.endsWith(codeAfter)) {
								editableCode = editableCode.slice(0, -codeAfter.length);
							}
							console.log("🔄 Extracted editable part from legacy full code");
						}

						// Формируем новый полный контент с правильными нередактируемыми частями
						const fullContent = `${codeBefore}${editableCode}${codeAfter}`;

						// Обновляем код в редакторе
						const transaction = editor.current.state.update({
							changes: {
								from: 0,
								to: editor.current.state.doc.length,
								insert: fullContent,
							},
						});
						editor.current.dispatch(transaction);

						// Обновляем внешнее состояние ТОЛЬКО редактируемой частью
						if (onChangeRef.current) {
							onChangeRef.current(editableCode);
						}

						prevValue.current = editableCode;
						console.log("✅ Room code loaded preserving task structure");
					} catch (error) {
						console.error("Error loading room state:", error);
					} finally {
						isUpdating.current = false;
					}
				}
			};

			window.addEventListener(
				"roomStateLoaded",
				handleRoomStateLoaded as EventListener
			);
			return () => {
				window.removeEventListener(
					"roomStateLoaded",
					handleRoomStateLoaded as EventListener
				);
			};
		}, [value, codeBefore, codeAfter]); // Добавляем codeBefore и codeAfter как зависимости

		// Проверяем, заблокирован ли редактор
		const isEditorBlocked = !!(
			activeTypers &&
			myTelegramId &&
			activeTypers.size > 0 &&
			!activeTypers.has(myTelegramId)
		);

		// Комбинируем блокировку с оригинальным readOnly
		// const effectiveReadOnly = readOnly || isEditorBlocked;
		const effectiveReadOnly = readOnly || completed;

		// Обновляем выделения других пользователей
		useEffect(() => {
			if (editor.current) {
				console.log(
					"📍 Processing selections:",
					selections?.size || 0,
					"selections"
				);

				// Заменяем все декорации на новые
				const decorations: any[] = [];

				if (selections && selections.size > 0) {
					selections.forEach((selectionData, telegramId) => {
						try {
							const doc = editor.current!.state.doc;

							// Обрабатываем выделение фрагмента
							if (
								selectionData.selectionStart &&
								selectionData.selectionEnd &&
								selectionData.selectedText
							) {
								if (
									selectionData.selectionStart.line <= doc.lines &&
									selectionData.selectionEnd.line <= doc.lines
								) {
									const startLineInfo = doc.line(
										selectionData.selectionStart.line
									);
									const endLineInfo = doc.line(selectionData.selectionEnd.line);

									const from =
										startLineInfo.from + selectionData.selectionStart.column;
									const to =
										endLineInfo.from + selectionData.selectionEnd.column;

									const selectionDecoration = Decoration.mark({
										class: "cm-user-text-selection",
										attributes: {
											style: `background-color: ${selectionData.userColor}40 !important; border-bottom: 2px solid ${selectionData.userColor} !important;`,
											title: `Selected by ${telegramId}: "${selectionData.selectedText}"`,
										},
									});

									decorations.push(selectionDecoration.range(from, to));
									console.log(
										`📍 Added text selection for ${telegramId}: "${selectionData.selectedText}"`
									);
								}
							}
							// Обрабатываем позицию курсора
							else if (
								selectionData.line &&
								typeof selectionData.column === "number"
							) {
								if (selectionData.line <= doc.lines) {
									const lineInfo = doc.line(selectionData.line);
									const position = lineInfo.from + selectionData.column;

									const cursorDecoration = Decoration.mark({
										class: "cm-user-cursor-position",
										attributes: {
											style: `border-left: 3px solid ${selectionData.userColor} !important; margin-left: -1px;`,
											title: `${telegramId} cursor at ${selectionData.line}:${selectionData.column}`,
										},
									});

									decorations.push(cursorDecoration.range(position, position));
									console.log(
										`📍 Added cursor position for ${telegramId}: ${selectionData.line}:${selectionData.column}`
									);
								}
							}
						} catch (error) {
							console.error(
								"Error processing selection for",
								telegramId,
								error
							);
						}
					});
				}

				// Применяем все декорации сразу
				editor.current.dispatch({
					effects: replaceSelectionsEffect.of(Decoration.set(decorations)),
				});

				console.log("📍 Applied", decorations.length, "selection decorations");
			}
		}, [selections]);

		// Обрабатываем изменения кода от других пользователей
		useEffect(() => {
			if (editor.current && codeEdits) {
				const latestEdit = Array.from(codeEdits.values()).sort(
					(a, b) => b.timestamp - a.timestamp
				)[0];
				if (latestEdit) {
					// Проверяем, не старше ли изменение от других пользователей наших локальных изменений
					const timeDiff = Date.now() - lastLocalEditTime.current;
					if (timeDiff < 1000) {
						// Если мы редактировали менее секунды назад
						console.log("🚫 Skipping remote edit - local edit too recent");
						return;
					}

					console.log("📝 Applying code edit from:", latestEdit.telegramId);

					// Применяем новый код напрямую, сохраняя позицию курсора
					try {
						isUpdating.current = true;

						// Сохраняем текущую позицию курсора относительно редактируемой области
						const selection = editor.current.state.selection;
						const cursorPos = selection.main.head;
						const relativeCursorPos = Math.max(
							codeBefore.length,
							Math.min(
								cursorPos,
								editor.current.state.doc.length - codeAfter.length
							)
						);

						const fullContent = `${codeBefore}${latestEdit.newCode}${codeAfter}`;

						// Вычисляем новую позицию курсора
						const newCursorPos = Math.min(
							relativeCursorPos,
							fullContent.length - codeAfter.length
						);

						editor.current.dispatch({
							changes: {
								from: 0,
								to: editor.current.state.doc.length,
								insert: fullContent,
							},
							selection: { anchor: newCursorPos, head: newCursorPos }, // Устанавливаем корректную позицию курсора
							effects: applyCodeEditEffect.of({
								changes: latestEdit.changes,
								userColor: latestEdit.userColor,
							}),
						});

						// Обновляем состояние родительского компонента
						if (latestEdit.newCode !== prevValue.current) {
							prevValue.current = latestEdit.newCode;
							onChangeRef.current(latestEdit.newCode);
						}

						isUpdating.current = false;
					} catch (error) {
						console.error("Error applying code edit:", error);
						isUpdating.current = false;
					}
				}
			}
		}, [codeEdits, codeBefore, codeAfter, onChange]);

		useEffect(() => {
			if (!editorContainer.current) return;

			const languageSupport = language === "py" ? python() : javascript();

			const state = EditorState.create({
				doc: `${codeBefore}${value}${codeAfter}`,
				extensions: [
					languageSupport,
					oneDark,
					keymap.of(defaultKeymap),
					selectionHighlightField, // Добавляем поле для выделений
					codeEditExtension, // Добавляем обработку изменений кода
					EditorView.updateListener.of((update) => {
						if (update.docChanged && !isUpdating.current) {
							try {
								const newValue = update.state.doc.toString();
								if (
									!newValue.startsWith(codeBefore) ||
									!newValue.endsWith(codeAfter)
								) {
									// Восстанавливаем состояние если пользователь изменил защищенные части
									isUpdating.current = true;
									editor.current?.dispatch({
										changes: {
											from: 0,
											to: newValue.length,
											insert: `${codeBefore}${prevValue.current}${codeAfter}`,
										},
									});
									isUpdating.current = false;
									return;
								}

								const userCode = newValue.slice(
									codeBefore.length,
									newValue.length - codeAfter.length
								);

								if (userCode !== prevValue.current) {
									prevValue.current = userCode;
									lastLocalEditTime.current = Date.now(); // Отмечаем время локального изменения
									onChangeRef.current(userCode);

									// Отправляем изменения кода через WebSocket (каждый символ)
									if (sendCodeEditRef.current) {
										const changes: {
											from: number;
											to: number;
											insert: string;
										}[] = [];
										update.changes.iterChanges(
											(fromA, toA, fromB, toB, text) => {
												changes.push({
													from: fromA,
													to: toA,
													insert: text.toString(),
												});
											}
										);
										sendCodeEditRef.current(changes, userCode);
									}
								}
							} catch (error) {
								console.error("Error in editor update:", error);
							}
						}

						// Обработка выделения текста - НО ТОЛЬКО если НЕ изменялся документ
						if (
							update.selectionSet &&
							!update.docChanged &&
							sendSelectionRef.current
						) {
							const selection = update.state.selection.main;
							// Отправляем информацию о выделении даже если оно пустое (курсор)
							try {
								const doc = update.state.doc;

								if (!selection.empty) {
									// Есть выделение текста
									const selectedText = doc.sliceString(
										selection.from,
										selection.to
									);

									// Находим строки начала и конца выделения
									const startLine = doc.lineAt(selection.from);
									const endLine = doc.lineAt(selection.to);

									const selectionData = {
										selectionStart: {
											line: startLine.number,
											column: selection.from - startLine.from,
										},
										selectionEnd: {
											line: endLine.number,
											column: selection.to - endLine.from,
										},
										selectedText: selectedText,
									};

									// Отправляем информацию о выделении
									sendSelectionRef.current(selectionData);
									hadTextSelection.current = true; // Отмечаем что есть выделение
									console.log(
										"📤 Sending text selection:",
										`${selectionData.selectionStart.line}:${selectionData.selectionStart.column} - ${selectionData.selectionEnd.line}:${selectionData.selectionEnd.column}`,
										`"${selectedText}"`
									);
								} else {
									// Просто курсор - проверяем было ли раньше выделение
									const line = doc.lineAt(selection.head);
									const lineNumber = line.number;
									const columnNumber = selection.head - line.from;

									if (hadTextSelection.current) {
										// Было выделение, теперь его нет - явно очищаем
										console.log("📤 Clearing text selection - user deselected");
										sendSelectionRef.current({
											line: lineNumber,
											column: columnNumber,
											clearSelection: true, // Специальный флаг для очистки
										});
										hadTextSelection.current = false;
									} else {
										// Просто движение курсора
										sendSelectionRef.current({
											line: lineNumber,
											column: columnNumber,
										});
										console.log(
											"📤 Sending cursor position:",
											`${lineNumber}:${columnNumber}`
										);
									}
								}
							} catch (error) {
								console.error("Error sending selection:", error);
							}
						}
					}),
					EditorView.editable.of(!effectiveReadOnly),
					EditorState.readOnly.of(effectiveReadOnly),
					EditorView.theme({
						"&": {
							height: "100%",
							fontSize: "14px",
						},
						".cm-scroller": {
							fontFamily: "Consolas, monospace",
							lineHeight: "1.6",
						},
						".cm-content": {
							caretColor: "#fff",
						},
						"&.cm-focused": {
							outline: "none",
						},
						// Стили для выделений пользователей
						".cm-user-text-selection": {
							borderRadius: "2px",
							position: "relative",
							opacity: "0.8",
							fontWeight: "500",
						},
						".cm-user-cursor-position": {
							position: "relative",
							display: "inline-block",
							animation: "pulse 1s infinite",
						},
						"@keyframes pulse": {
							"0%": { opacity: "1" },
							"50%": { opacity: "0.5" },
							"100%": { opacity: "1" },
						},
					}),
				],
			});

			const view = new EditorView({
				state,
				parent: editorContainer.current,
			});

			editor.current = view;

			return () => {
				view.destroy();
			};
		}, [language, effectiveReadOnly, codeBefore, codeAfter]); // Убираем value, onChange, sendSelection, sendCodeEdit из зависимостей

		// Обновляем содержимое при изменении value извне
		useEffect(() => {
			if (editor.current && value !== prevValue.current) {
				try {
					isUpdating.current = true;

					// Сохраняем текущую позицию курсора относительно редактируемой области
					const selection = editor.current.state.selection;
					const cursorPos = selection.main.head;
					const relativeCursorPos = Math.max(
						codeBefore.length,
						Math.min(
							cursorPos,
							editor.current.state.doc.length - codeAfter.length
						)
					);

					const fullContent = `${codeBefore}${value}${codeAfter}`;

					// Вычисляем новую позицию курсора
					const newCursorPos = Math.min(
						relativeCursorPos,
						fullContent.length - codeAfter.length
					);

					editor.current.dispatch({
						changes: {
							from: 0,
							to: editor.current.state.doc.length,
							insert: fullContent,
						},
						selection: { anchor: newCursorPos, head: newCursorPos }, // Устанавливаем корректную позицию курсора
					});
					prevValue.current = value;
					isUpdating.current = false;
				} catch (error) {
					console.error("Error updating editor content:", error);
				}
			}
		}, [value, codeBefore, codeAfter]);

		return (
			<div className="relative h-full rounded-lg overflow-hidden bg-ide-editor">
				<div className="px-3 py-2 border-b border-ide-border bg-ide-secondary">
					<span className="text-ide-text-secondary text-sm">
						{language === "py" ? "script.py" : "script.js"}
					</span>
					{/* {isEditorBlocked && (
						<span className="ml-2 text-yellow-500 text-xs">
							🔒 Кто-то печатает...
						</span>
					)} */}
				</div>
				<div
					ref={editorContainer}
					className="h-[calc(100%-40px)] overflow-auto"
				/>
			</div>
		);
	}
);

CodeEditor.displayName = "CodeEditor";

export default CodeEditor;
