import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './App.css';
import CodeEditor from './components/CodeEditor';
import { api } from './services/api';
import { Answer, Task } from './types/task';
import { isDesktop } from '.';

function App() {
  const [searchParams] = useSearchParams();
  const [task, setTask] = useState<Task | null>(null);
  const [code, setCode] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'editor' | 'output'>('editor');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null);

  const taskId = searchParams.get('task_id');
  const language = searchParams.get('lang') || 'py';
  const answer_id = searchParams.get('answer_id');


  const onSendCheck = async () => {
    const submittedCode = task?.answers && task.answers.length > 1 ? code : `${currentAnswer?.code_before}${code}${currentAnswer?.code_after}`;

    await api.submitCode({
      program: submittedCode,
      user_id: window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 429272623,
      answer_id: Number(answer_id) || 123,
      task_id: Number(taskId)
    });
    window.Telegram.WebApp.close();
  }

  useEffect(() => {
    if (taskId) {
      api.getTask(taskId)
        .then(taskData => {
          setTask(taskData);
          if (taskData.answers && taskData.answers.length > 0) {
            setCurrentAnswer(taskData.answers[0]);
          }

          if (!answer_id) {
            setCode('');
          }
        })
        .catch(error => {
          console.error('Failed to load task:', error);
        });

      if (answer_id) {
        api.getSubmitCode(
          Number(answer_id),
          window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 429272623,
          Number(taskId)
        ).then(data => {
          if (data.code) {
            setCode(data.code);
          }
        });
      }
    }
  }, [taskId, answer_id]);

  console.log(currentAnswer);

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

  const handleRunCode = async () => {
    if (status === "success") {
      await onSendCheck();
      return;
    }
    setIsRunning(true);
    setStatus('idle');
    setOutput('');

    try {
      if (!currentAnswer || !task) {
        throw new Error('Нет тестовых данных');
      }

      const fullCode = `${currentAnswer.code_before ? currentAnswer.code_before : ''}${code}${currentAnswer.code_after ? currentAnswer.code_after : ''}`;

      const checkData = {
        input_data: currentAnswer.input || "-",
        output_data: currentAnswer.output,
        program: fullCode,
        test_number: -1,
        timeout: currentAnswer.timeout || 2
      };

      const result = await api.checkCode(checkData, language);

      if (result.result) {
        setOutput(result.comment || 'Тест пройден успешно!');
        setStatus('success');
      } else {
        setOutput(
          `Ошибка: ${result.comment || 'Неверный результат'}${result.output !== "error" ? `\nПолучено: ${result.output}\nОжидалось: ${currentAnswer.output}` : ''
          }`
        );
        setStatus('error');
      }
    } catch (error: any) {
      setOutput(`Ошибка выполнения: ${error.message}`);
      setStatus('error');
    } finally {
      setIsRunning(false);
      if (window.innerWidth < 768) {
        setActiveTab('output');
      }
    }
  };

  return (
    <div className="min-h-screen h-screen flex flex-col bg-ide-background text-ide-text-primary">
      {isDesktop() && (
      <header className="bg-ide-secondary border-b border-ide-border flex-none">
        <div className="container mx-auto lg:px-0 px-4 py-3 md:py-4">
          <img src="/logo.svg" alt="INNOPROG" className="h-10" />
        </div>
      </header>
      )}

      {task && (
        <div className={`bg-ide-secondary ${!isDesktop() ? "mt-[110px]" : ""} border-b border-ide-border overflow-auto`}>
          <div className="container mx-auto p-3.5">
            <div className="prose prose-invert max-w-none">
              <div dangerouslySetInnerHTML={{ __html: task.description }} />
              {task.input_description && (
                <>
                  <h3>Входные данные</h3>
                  <div dangerouslySetInnerHTML={{ __html: task.input_description }} />
                </>
              )}
              {task.output_description && (
                <>
                  <h3>Выходные данные</h3>
                  <div dangerouslySetInnerHTML={{ __html: task.output_description }} />
                </>
              )}
              {task.examples && task.examples.length > 0 && (
                <>
                  <h3>Примеры</h3>
                  {task.examples.map((example, index) => (
                    <div key={index} className="mb-4">
                      <div className="font-mono bg-ide-editor p-2 rounded">
                        <div>Входные данные:</div>
                        <pre>{example.input}</pre>
                        <div>Выходные данные:</div>
                        <pre>{example.output}</pre>
                      </div>
                      {example.explanation && (
                        <div className="mt-2">{example.explanation}</div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col md:flex-row">
          <div
            className={`h-full md:w-1/2 p-4 ${activeTab === 'editor' ? 'block' : 'hidden md:block'
              }`}
          >
            <CodeEditor
              value={code}
              onChange={setCode}
              language={language}
              codeBefore={currentAnswer?.code_before || ''}
              codeAfter={currentAnswer?.code_after || ''}
              readOnly={task?.type === 'Дополнение кода' ?
                (currentAnswer ? false : true) :
                false
              }
            />
          </div>

          <div
            className={`h-full md:w-1/2 ${activeTab === 'output' ? 'block' : 'hidden md:block'
              }`}
          >
            <div className="h-full p-4">
              <div className="flex flex-col h-full bg-ide-editor rounded-lg overflow-hidden">
                <div className="bg-ide-secondary px-3 py-2 border-b border-ide-border flex items-center justify-between">
                  <span className="text-ide-text-secondary text-sm">Output</span>
                  {getStatusIcon()}
                </div>
                <div className="flex-1 p-4 overflow-auto">
                  <pre
                    ref={outputRef}
                    className={`font-mono text-sm md:text-base whitespace-pre-wrap break-words ${status === 'error' ? 'error-output' : ''
                      }`}
                  >
                    {output || 'Нет результата'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className={`bg-ide-secondary  ${!isDesktop() ? "mb-[15px]" : ""} border-t border-ide-border flex-none`}>
        <div className="container mx-auto px-4 py-3 md:py-4 flex items-center lg:flex-row flex-col gap-3 ">
          <button
            onClick={handleRunCode}
            disabled={isRunning}
              className={`w-full md:w-auto ${status !== "success" ? "bg-ide-button-primary" : "bg-[#9C78FF]"} ${status === "success" ? "" : "hover:bg-ide-button-primary-hover"}  text-ide-text-primary font-medium px-6 py-2.5 rounded transition-colors flex items-center justify-center gap-2 ${isRunning ? 'opacity-50 cursor-not-allowed' : ''
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
            {status === "success" ? "Отправить на проверку" : isRunning ? 'Выполняется...' : 'Выполнить'}
          </button>
          {activeTab === "output" && status !== "success" && <div className='lg:hidden w-full md:hidden'>
            <button onClick={() => setActiveTab("editor")} className={`w-full md:w-auto bg-red-500 hover:bg-red-600 text-ide-text-primary font-medium px-6 py-2.5 rounded transition-colors flex items-center justify-center gap-2`}>Попробовать снова</button>
          </div>}
        </div>
      </footer>
    </div>
  );
}

export default App;
