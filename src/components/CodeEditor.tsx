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
            const newValue = update.state.doc.toString();
            if (newValue.startsWith(codeBefore) && newValue.endsWith(codeAfter)) {
              const userCode = newValue.slice(
                codeBefore.length,
                newValue.length - codeAfter.length
              );
              onChange(userCode);
            } else {
              isUpdating.current = true;
              editor.current?.dispatch({
                changes: {
                  from: 0,
                  to: newValue.length,
                  insert: `${codeBefore}${value}${codeAfter}`
                }
              });
              isUpdating.current = false;
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
          },
          '.cm-readonly': {
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
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
  }, [language, readOnly]);

  // Обновляем содержимое при изменении props
  useEffect(() => {
    if (editor.current) {
      const fullContent = `${codeBefore}${value}${codeAfter}`;
      const currentContent = editor.current.state.doc.toString();

      if (fullContent !== currentContent) {
        isUpdating.current = true;
        editor.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: fullContent
          }
        });
        isUpdating.current = false;
      }
    }
  }, [value, codeBefore, codeAfter]);

  return (
    <div className="relative h-full rounded-lg overflow-hidden bg-ide-editor">
      <div className="px-3 py-2 border-b border-ide-border bg-ide-secondary">
        <span className="text-ide-text-secondary text-sm">script.js</span>
      </div>
      <div 
        ref={editorContainer} 
        className="h-[calc(100%-40px)] overflow-auto"
      />
    </div>
  );
};

export default CodeEditor; 