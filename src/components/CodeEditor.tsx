import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  codeBefore?: string;
  codeAfter?: string;
  readOnly?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'javascript',
  codeBefore = '',
  codeAfter = '',
  readOnly = false
}) => {
  const editor = useRef<EditorView>();
  const editorContainer = useRef<HTMLDivElement>(null);
  const isUpdating = useRef(false);

  // Создаем редактор только один раз при монтировании
  useEffect(() => {
    if (!editorContainer.current) return;

    const languageSupport = language === 'py' ? python() : cpp();

    const state = EditorState.create({
      doc: value,
      extensions: [
        languageSupport,
        oneDark,
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isUpdating.current) {
            const newValue = update.state.doc.toString();
            onChange(newValue);
          }
        }),
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
          },
          '.cm-scroller': {
            fontFamily: 'Consolas, monospace',
            lineHeight: '1.6',
            '-webkit-overflow-scrolling': 'touch',
            'touch-action': 'manipulation'
          },
          '.cm-content': {
            caretColor: '#fff',
          },
          '&.cm-focused': {
            outline: 'none',
          }
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
  }, [language, readOnly]); // Убрали value и onChange из зависимостей

  // Обновляем содержимое только когда value изменяется извне
  useEffect(() => {
    if (editor.current) {
      const currentContent = editor.current.state.doc.toString();
      if (value !== currentContent && !isUpdating.current) {
        const selection = editor.current.state.selection;
        isUpdating.current = true;
        editor.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: value
          },
          selection: selection // Сохраняем позицию курсора
        });
        isUpdating.current = false;
      }
    }
  }, [value]);

  return (
    <div className="relative h-full rounded-lg overflow-hidden bg-ide-editor">
      <div className="px-3 py-2 border-b border-ide-border bg-ide-secondary">
        <span className="text-ide-text-secondary text-sm">main.{language}</span>
      </div>
      <div
        ref={editorContainer}
        className="h-[calc(100%-40px)] overflow-auto"
      />
    </div>
  );
};

export default CodeEditor; 