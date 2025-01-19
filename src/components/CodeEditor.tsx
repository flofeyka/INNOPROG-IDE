import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap } from '@codemirror/commands';

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
  const prevValue = useRef(value);

  useEffect(() => {
    if (!editorContainer.current) return;

    const languageSupport = language === 'py' ? python() : javascript();

    const state = EditorState.create({
      doc: `${codeBefore}${value}${codeAfter}`,
      extensions: [
        languageSupport,
        oneDark,
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isUpdating.current) {
            try {
              const newValue = update.state.doc.toString();
              if (!newValue.startsWith(codeBefore) || !newValue.endsWith(codeAfter)) {
                // Восстанавливаем состояние если пользователь изменил защищенные части
                isUpdating.current = true;
                editor.current?.dispatch({
                  changes: {
                    from: 0,
                    to: newValue.length,
                    insert: `${codeBefore}${prevValue.current}${codeAfter}`
                  }
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
                onChange(userCode);
              }
            } catch (error) {
              console.error('Error in editor update:', error);
            }
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
  }, [language, readOnly, codeBefore, codeAfter]); // value намеренно исключен

  // Обновляем содержимое при изменении value извне
  useEffect(() => {
    if (editor.current && value !== prevValue.current) {
      try {
        isUpdating.current = true;
        const fullContent = `${codeBefore}${value}${codeAfter}`;
        editor.current.dispatch({
          changes: {
            from: 0,
            to: editor.current.state.doc.length,
            insert: fullContent
          }
        });
        prevValue.current = value;
        isUpdating.current = false;
      } catch (error) {
        console.error('Error updating editor content:', error);
      }
    }
  }, [value, codeBefore, codeAfter]);

  return (
    <div className="relative h-full rounded-lg overflow-hidden bg-ide-editor">
      <div className="px-3 py-2 border-b border-ide-border bg-ide-secondary">
        <span className="text-ide-text-secondary text-sm">
          main.{language}
        </span>
      </div>
      <div 
        ref={editorContainer} 
        className="h-[calc(100%-40px)] overflow-auto"
      />
    </div>
  );
};

export default CodeEditor; 