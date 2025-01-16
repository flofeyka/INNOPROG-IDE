import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './App.css';
import CodeEditor from './components/CodeEditor';
import { api } from './services/api';
import { Answer, Task } from './types/task';

function App() {
  const [searchParams] = useSearchParams();
  const [task, setTask] = useState<Task | null>(null);
  const [code, setCode] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'editor' | 'output'>('editor');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isRunning, setIsRunning] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null);

  console.log(currentAnswer)

  const taskId = searchParams.get('task_id');
  const language = searchParams.get('lang') || 'py';

  useEffect(() => {
    if (taskId) {
      api.getTask(taskId)
        .then(taskData => {
          setTask(taskData);
          setCode(taskData.answers![0].code_after || '');

          if (taskData.answers && taskData.answers.length > 0) {
            setCurrentAnswer(taskData.answers[0]);
          }
        })
        .catch(error => {
          console.error('Failed to load task:', error);
        });
    }
  }, [taskId]);

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
    setIsRunning(true);
    setStatus('idle');

    try {
      if (!currentAnswer) {
        throw new Error('Нет тестовых данных');
      }

      const fullCode = `${code}`;

      const checkData = {
        input_data: currentAnswer.input || "-",
        output_data: currentAnswer.output,
        program: fullCode,
        test_number: 1,
        timeout: currentAnswer.timeout
      };

      console.log('Отправляемые данные:', checkData);

      try {
        const result = await api.checkCode(checkData);
        console.log('Ответ от сервера:', result);

        if (result.result) {
          setOutput(result.comment || 'Тест пройден успешно!');
          setStatus('success');
        } else {
          setOutput(
            `Ошибка: ${result.comment || 'Неверный результат'}\nПолучено: ${result.output}\nОжидалось: ${task?.answers![0].output}`
          );
          setStatus('error');
        }
      } catch (apiError) {
        console.error('Ошибка API:', apiError);
        setStatus('error');
      }
    } catch (error: any) {
      console.error('Общая ошибка:', error);
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
      <header className="bg-ide-secondary border-b border-ide-border flex-none">
        <div className="container mx-auto lg:px-0 px-4 py-3 md:py-4">
          <h1 className="text-lg md:text-xl font-bold">
            <img src="/logo.svg" alt="innoprog" className='lg:h-[50px] h-[40px]' />
          </h1>
        </div>
      </header>

      {task && (
        <div className="bg-ide-secondary p-4 border-b border-ide-border overflow-auto">
          <div className="container mx-auto">
            <div className="prose prose-invert max-w-none">
              <div dangerouslySetInnerHTML={{ __html: task.description }} />
              {task.answers && task.answers.length > 0 && (
                <>
                  {task.answers[0].input && <>
                    <div>Входные данные:</div>
                    <pre>{task.answers[0].input}</pre></>}

                  <div className='mt-3'>Выходные данные:</div>
                  <pre>{task.answers[0].output}</pre>
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
            <div className="h-full">
              <CodeEditor
                value={code}
                onChange={setCode}
                language={language}
                codeBefore={currentAnswer?.code_before || ''}
                codeAfter={currentAnswer?.code_after || ''}
                readOnly={false}
              />
            </div>
          </div>

          <div
            className={`h-full md:w-1/2 ${activeTab === 'output' ? 'block' : 'hidden md:block'
              }`}
          >
            <div className="h-full p-4">
              <div className="h-full flex flex-col bg-ide-editor rounded-lg overflow-hidden">
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

      <footer className="bg-ide-secondary border-t border-ide-border flex-none">
        <div className="container mx-auto px-4 py-3 md:py-4 flex items-center lg:flex-row flex-col gap-3 justify-between">
          <button
            onClick={handleRunCode}
            disabled={isRunning}
            className={`w-full md:w-auto bg-ide-button-primary hover:bg-ide-button-primary-hover text-ide-text-primary font-medium px-6 py-2.5 rounded transition-colors flex items-center justify-center gap-2 ${isRunning ? 'opacity-50 cursor-not-allowed' : ''
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
          {activeTab === "output" && <div className='lg:hidden w-full md:hidden'>
            <button onClick={() => setActiveTab("editor")} className={`w-full md:w-auto bg-red-500 hover:bg-red-600 text-ide-text-primary font-medium px-6 py-2.5 rounded transition-colors flex items-center justify-center gap-2`}>Попробовать снова</button>
          </div>}
        </div>
      </footer>
    </div>
  );
}

export default App;
