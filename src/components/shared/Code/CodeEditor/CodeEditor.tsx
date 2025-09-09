import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import useYDocFromUpdates from "../../../../hooks/useYDocFromUpdates";
import { yCollab } from "y-codemirror.next";
import { Awareness } from "y-protocols/awareness";
import { Select, SelectItem } from "@heroui/react";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { sql } from "@codemirror/lang-sql";
import { Language } from "../../../../types/task";
import { dart } from "@codemirror/legacy-modes/mode/clike";
import { StreamLanguage } from "@codemirror/language";

interface IProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  codeBefore?: string;
  codeAfter?: string;
  readOnly?: boolean;
  currentCode: string;
  setCurrentCode: (val: string) => void;
  sendSelection?: (selectionData: {
    line?: number;
    column?: number;
    selectionStart?: { line: number; column: number };
    selectionEnd?: { line: number; column: number };
    selectedText?: string;
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
  onSendUpdate?: (update: Uint8Array) => void;
  updatesFromProps?: Uint8Array[];
  activeTypers?: Set<string>;
  myTelegramId?: string;
  disabled: boolean;
  handleLanguageChange: (language: Language) => void;
  isTeacher?: boolean;
  joinedCode?: string;
}

const replaceSelectionsEffect = StateEffect.define<DecorationSet>();

const applyCodeEditEffect = StateEffect.define<{
  changes: { from: number; to: number; insert: string }[];
  userColor: string;
}>();

const selectionHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    try {
      for (let effect of tr.effects) {
        if (effect.is(replaceSelectionsEffect)) {
          return effect.value;
        }
      }

      return decorations.map(tr.changes);
    } catch (e) {
      console.error(e);
      return decorations;
    }
  },
  provide: (f) => EditorView.decorations.from(f),
});

// const codeEditExtension = EditorView.updateListener.of((update) => {
//   for (let effect of update.transactions.flatMap((tr) => tr.effects)) {
//     if (effect.is(applyCodeEditEffect)) {
//       const { changes } = effect.value;
//     }
//   }
// });

const CodeEditor: React.FC<IProps> = React.memo(
  ({
    value,
    onChange,
    language = "javascript",
    codeBefore = "",
    codeAfter = "",
    readOnly = false,
    sendSelection,
    selections,
    onSendUpdate,
    updatesFromProps,
    disabled,
    handleLanguageChange,
    joinedCode,
    isTeacher,
    currentCode,
    setCurrentCode,
  }) => {
    const editor = useRef<EditorView>();
    const editorContainer = useRef<HTMLDivElement>(null);
    const isUpdating = useRef(false);
    const prevValue = useRef(value);

    const lastLocalEditTime = useRef<number>(0);
    const hadTextSelection = useRef<boolean>(false);

    const onChangeRef = useRef(onChange);
    const sendSelectionRef = useRef(sendSelection);
    const isRemoteUpdate = useRef<boolean>(false);

    onChangeRef.current = onChange;
    sendSelectionRef.current = sendSelection;

    const ydoc = useYDocFromUpdates({
      updates: updatesFromProps,
      isRemoteUpdate,
    });

    useEffect(() => {
      const handleRoomStateLoaded = (event: CustomEvent) => {
        const { lastCode } = event.detail;
        if (lastCode && lastCode !== value && editor.current) {
          isUpdating.current = true;
          try {
            let editableCode = lastCode;

            if (codeBefore && lastCode.startsWith(codeBefore)) {
              editableCode = lastCode.slice(codeBefore.length);
              if (codeAfter && editableCode.endsWith(codeAfter)) {
                editableCode = editableCode.slice(0, -codeAfter.length);
              }
            }

            const fullContent = `${codeBefore}${editableCode}${codeAfter}`;

            const transaction = editor.current.state.update({
              changes: {
                from: 0,
                to: editor.current.state.doc.length,
                insert: fullContent,
              },
            });
            editor.current.dispatch(transaction);

            if (onChangeRef.current) {
              onChangeRef.current(editableCode);
            }

            prevValue.current = editableCode;
          } catch (error) {
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
    }, [value, codeBefore, codeAfter]);

    // const isEditorBlocked = !!(
    // 	activeTypers &&
    // 	myTelegramId &&
    // 	activeTypers.size > 0 &&
    // 	!activeTypers.has(myTelegramId)
    // );

    const effectiveReadOnly = useMemo(
      () => disabled || readOnly,
      [readOnly, disabled]
    );

    useEffect(() => {
      if (editor.current) {
        const decorations: any[] = [];

        if (selections && selections.size > 0) {
          selections.forEach((selectionData, telegramId) => {
            try {
              const doc = editor.current!.state.doc;

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
                }
              } else if (
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

        editor.current.dispatch({
          effects: replaceSelectionsEffect.of(Decoration.set(decorations)),
        });
      }
    }, [selections]);

    const awarenessRef = React.useRef<Awareness | null>(null);

    useEffect(() => {
      if (ydoc && !awarenessRef.current) {
        const awareness = new Awareness(ydoc);
        awareness.setLocalStateField("user", {
          name: "adolf",
          color: "#ff0000", // временно сделай цвет видимым
        });
        awarenessRef.current = awareness;
      }
    }, [ydoc]);

    useEffect(() => {
      if (!editorContainer.current) return;

      const languageSupport = (() => {
        switch (language) {
          case Language.PY:
            return python();
          case Language.JS:
            return javascript();
          case Language.CPP:
            return cpp();
          case Language.JAVA:
            return java();
          case Language.SQL:
            return sql();
          case Language.DART:
            return StreamLanguage.define(dart);
          default:
            return python();
        }
      })();

      const state = EditorState.create({
        doc: `${codeBefore}${value}${codeAfter}`,
        extensions: [
          ...(ydoc && awarenessRef.current
            ? [yCollab(ydoc.getText("codemirror"), awarenessRef.current)]
            : []),
          languageSupport,
          oneDark,
          keymap.of([...defaultKeymap, indentWithTab]),
          selectionHighlightField,
          lineNumbers(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isUpdating.current) {
              try {
                const newValue = update.state.doc.toString();

                setCurrentCode(newValue);

                if (
                  !newValue.startsWith(codeBefore) ||
                  !newValue.endsWith(codeAfter)
                ) {
                  isUpdating.current = true;
                  editor.current?.dispatch({
                    changes: {
                      from: 0,
                      to: newValue.length,
                      insert: `${codeBefore}${prevValue.current}${codeAfter}`,
                    },
                  });

                  console.log(`${codeBefore}${prevValue.current}${codeAfter}`);
                  isUpdating.current = false;
                  return;
                }

                const userCode = newValue.slice(
                  codeBefore.length,
                  newValue.length - codeAfter.length
                );

                if (userCode !== prevValue.current) {
                  prevValue.current = userCode;
                  lastLocalEditTime.current = Date.now();

                  if (!isRemoteUpdate.current) {
                    onChangeRef.current(userCode);
                  }

                  if (ydoc && onSendUpdate && !isRemoteUpdate.current) {
                    isRemoteUpdate.current = true;
                    const updateBinary = Y.encodeStateAsUpdate(ydoc);
                    onSendUpdate(updateBinary);
                    isRemoteUpdate.current = false;
                  }
                }
              } catch (error) {
                console.error("Error in editor update:", error);
              }
            }

            if (
              update.selectionSet &&
              !update.docChanged &&
              sendSelectionRef.current
            ) {
              try {
                const selection = update.state.selection.main;
                const doc = update.state.doc;

                if (!selection.empty) {
                  const selectedText = doc.sliceString(
                    selection.from,
                    selection.to
                  );
                  const startLine = doc.lineAt(selection.from);
                  const endLine = doc.lineAt(selection.to);

                  sendSelectionRef.current({
                    selectionStart: {
                      line: startLine.number,
                      column: selection.from - startLine.from,
                    },
                    selectionEnd: {
                      line: endLine.number,
                      column: selection.to - endLine.from,
                    },
                    selectedText,
                  });
                  hadTextSelection.current = true;
                } else {
                  const line = doc.lineAt(selection.head);
                  const lineNumber = line.number;
                  const columnNumber = selection.head - line.from;

                  if (hadTextSelection.current) {
                    sendSelectionRef.current({
                      line: lineNumber,
                      column: columnNumber,
                      clearSelection: true,
                    });
                    hadTextSelection.current = false;
                  } else {
                    sendSelectionRef.current({
                      line: lineNumber,
                      column: columnNumber,
                    });
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
    }, [
      language,
      effectiveReadOnly,
      codeBefore,
      codeAfter,
      ydoc,
      awarenessRef.current,
    ]);

    useEffect(() => {
      if (editor.current && value !== prevValue.current) {
        try {
          isUpdating.current = true;

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
            selection: { anchor: newCursorPos, head: newCursorPos },
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
        <div className="px-3 py-2 border-b border-ide-border bg-ide-secondary flex justify-between items-center">
          <span className="text-ide-text-secondary text-sm">
            {`script.${language}`}
          </span>
          <Select
            selectedKeys={[language]}
            isDisabled={isTeacher === false}
            onChange={(e) => handleLanguageChange(e.target.value as Language)}
            size={"sm"}
            className={"min-w-[100px] w-auto bg-[#333] rounded-xl"}
            variant={"bordered"}
            placeholder={"Язык программирования"}
          >
            <SelectItem key={"js"}>JS</SelectItem>
            <SelectItem key={"cpp"}>C++</SelectItem>
            <SelectItem key={"py"}>Python</SelectItem>
            <SelectItem key={"java"}>Java</SelectItem>
            <SelectItem key={"sql"}>SQL</SelectItem>
            <SelectItem key={"dart"}>Dart</SelectItem>
          </Select>
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
