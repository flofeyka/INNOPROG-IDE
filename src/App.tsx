import React, { useState, useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import './App.css';

interface ErrorInfo {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

function App() {
  const [code, setCode] = useState<string>(`// Пример кода
console.log("Hello World!");

// Пример работы с массивами
const numbers = [1, 2, 3, 4, 5];
console.log("Массив:", numbers);
console.log("Сумма:", numbers.reduce((a, b) => a + b, 0));

// Пример объекта
const user = {
  name: "John",
  age: 30,
  hobbies: ["coding", "reading"]
};
console.log("Пользователь:", user);

// Пример асинхронного кода
setTimeout(() => {
  console.log("Это сообщение появится через 1 секунду");
}, 1000);

// Возвращаем результат
return "Выполнение завершено!";`);

  const [output, setOutput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'editor' | 'output'>('editor');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isRunning, setIsRunning] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const outputLines = useRef<string[]>([]);
  const [error, setError] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    if (preRef.current) {
      Prism.highlightElement(preRef.current);
    }
  }, [code]);

  useEffect(() => {
    if (outputRef.current) {
      Prism.highlightElement(outputRef.current);
    }
  }, [output]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      
      // Устанавливаем курсор после вставленных пробелов
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const createSandbox = () => {
    const logs: string[] = [];
    const sandbox = {
      console: {
        log: (...args: any[]) => {
          const formattedArgs = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          );
          logs.push(formattedArgs.join(' '));
        },
        error: (...args: any[]) => {
          const formattedArgs = args.map(arg => String(arg));
          logs.push(`Error: ${formattedArgs.join(' ')}`);
        },
        warn: (...args: any[]) => {
          const formattedArgs = args.map(arg => String(arg));
          logs.push(`Warning: ${formattedArgs.join(' ')}`);
        },
        clear: () => {
          logs.length = 0;
        }
      },
      setTimeout: (callback: Function, delay: number) => {
        return window.setTimeout(() => {
          callback();
          setOutput(logs.join('\n'));
        }, delay);
      },
      clearTimeout: window.clearTimeout,
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
      Date: window.Date,
      Math: window.Math,
      JSON: window.JSON,
      String: window.String,
      Number: window.Number,
      Array: window.Array,
      Object: window.Object,
      Error: window.Error,
      Promise: window.Promise
    };

    return { sandbox, logs };
  };

  const parseErrorInfo = (error: Error): ErrorInfo => {
    const errorInfo: ErrorInfo = {
      message: error.message
    };

    // Парсим стек ошибки для получения номера строки и колонки
    const stackLines = error.stack?.split('\n');
    if (stackLines && stackLines.length > 0) {
      const evalLine = stackLines.find(line => line.includes('eval'));
      if (evalLine) {
        const match = evalLine.match(/<anonymous>:(\d+):(\d+)/);
        if (match) {
          // Корректируем номер строки с учетом обертки кода
          errorInfo.line = parseInt(match[1], 10) - 3; // -3 из-за обертки async function
          errorInfo.column = parseInt(match[2], 10);
        }
      }
      errorInfo.stack = stackLines
        .filter(line => !line.includes('eval'))
        .join('\n');
    }

    return errorInfo;
  };

  const handleRunCode = async () => {
    setIsRunning(true);
    setStatus('idle');
    setError(null);
    outputLines.current = [];

    const { sandbox, logs } = createSandbox();
    const wrappedCode = `
      "use strict";
      async function __run() {
        ${code}
      }
      __run();
    `;

    try {
      const result = await new Function(...Object.keys(sandbox), wrappedCode)(...Object.values(sandbox));
      
      if (result !== undefined) {
        logs.push(`\nReturn value: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}`);
      }

      setOutput(logs.join('\n'));
      setStatus('success');
    } catch (err: any) {
      const errorInfo = parseErrorInfo(err);
      setError(errorInfo);
      const errorMessage = `Error: ${errorInfo.message}${
        errorInfo.line ? `\nAt line ${errorInfo.line}${
          errorInfo.column ? `:${errorInfo.column}` : ''
        }` : ''
      }${errorInfo.stack ? `\n\nStack trace:\n${errorInfo.stack}` : ''}`;
      setOutput(errorMessage);
      setStatus('error');
    } finally {
      setIsRunning(false);
      if (window.innerWidth < 768) {
        setActiveTab('output');
      }
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getCodeLines = () => {
    return code.split('\n').map((line, index) => {
      const isErrorLine = error?.line === index + 1;
      return (
        <div
          key={index}
          className={`code-line ${isErrorLine ? 'error-line' : ''}`}
        >
          <span className="line-number">{index + 1}</span>
          <span className="line-content">{line}</span>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-ide-background text-ide-text-primary flex flex-col">
      <header className="bg-ide-secondary border-b border-ide-border">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <h1 className="text-lg md:text-xl font-bold">INNOPROG</h1>
        </div>
      </header>

      <div className="md:hidden flex border-b border-ide-border">
        <button
          className={`flex-1 py-3 px-4 text-sm transition-colors ${
            activeTab === 'editor'
              ? 'bg-ide-editor text-ide-text-primary'
              : 'bg-ide-secondary text-ide-text-secondary'
          }`}
          onClick={() => setActiveTab('editor')}
        >
          Редактор
        </button>
        <button
          className={`flex-1 py-3 px-4 text-sm transition-colors ${
            activeTab === 'output'
              ? 'bg-ide-editor text-ide-text-primary'
              : 'bg-ide-secondary text-ide-text-secondary'
          }`}
          onClick={() => setActiveTab('output')}
        >
          Вывод
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div 
          className={`flex-1 md:w-1/2 p-4 md:border-r border-ide-border ${
            activeTab === 'editor' ? 'block' : 'hidden md:block'
          }`}
        >
          <div className="flex flex-col h-full bg-ide-editor rounded-lg overflow-hidden">
            <div className="bg-ide-secondary px-3 py-2 border-b border-ide-border">
              <span className="text-ide-text-secondary text-sm">script.js</span>
            </div>
            <div className="editor-container flex-1">
              <textarea
                ref={textareaRef}
                className="editor-textarea p-4 font-mono text-sm md:text-base resize-none focus:outline-none"
                value={code}
                onChange={handleCodeChange}
                onKeyDown={handleKeyDown}
                spellCheck="false"
                autoCapitalize="none"
                autoCorrect="off"
                data-gramm="false"
              />
              <pre 
                className="editor-highlighting p-4 font-mono text-sm md:text-base"
                aria-hidden="true"
              >
                <code ref={preRef} className="language-javascript">
                  {code}
                </code>
              </pre>
            </div>
          </div>
        </div>

        <div 
          className={`flex-1 md:w-1/2 p-4 ${
            activeTab === 'output' ? 'block' : 'hidden md:block'
          }`}
        >
          <div className="flex flex-col h-full bg-ide-editor rounded-lg overflow-hidden">
            <div className="bg-ide-secondary px-3 py-2 border-b border-ide-border flex items-center justify-between">
              <span className="text-ide-text-secondary text-sm">Output</span>
              {getStatusIcon()}
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <pre 
                ref={outputRef}
                className={`font-mono text-sm md:text-base whitespace-pre-wrap break-words ${
                  status === 'error' ? 'error-output' : ''
                }`}
              >
                {output || 'Нет результата'}
              </pre>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-ide-secondary border-t border-ide-border">
        <div className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
          <button
            onClick={handleRunCode}
            disabled={isRunning}
            className={`w-full md:w-auto bg-ide-button-primary hover:bg-ide-button-primary-hover text-ide-text-primary font-medium px-6 py-2.5 rounded transition-colors flex items-center justify-center gap-2 ${
              isRunning ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isRunning ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {isRunning ? 'Выполняется...' : 'Выполнить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
