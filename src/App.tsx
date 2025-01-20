import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner, Textarea, useDisclosure } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isDesktop } from '.';
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
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null);
  const [submitResult, setSubmitResult] = useState<"success" | "error" | "no_data">("success");
  const [inputData, setInputData] = useState<string>("");
  const [outputData, setoutputData] = useState<string>("");

  const { onOpen, onOpenChange, isOpen, onClose } = useDisclosure();

  const taskId = searchParams.get('task_id') || undefined;
  const language = searchParams.get('lang') || 'py';
  const answer_id = searchParams.get('answer_id');


  const onSendCheck = async () => {
    setIsRunning(true);
    const submittedCode = task?.answers && task.answers.length > 1 ? code : `${currentAnswer?.code_before ? currentAnswer.code_before : ''}${code}${currentAnswer?.code_after ? currentAnswer.code_after : ''}`;
    try {
      await api.submitCode({
        program: submittedCode,
        user_id: window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 429272623,
        answer_id: Number(answer_id) || 123,
        task_id: Number(taskId)
      });
      setSubmitResult("success");
    } catch {
      setSubmitResult("error")
      setStatus('idle');
    }
    onOpen();

    setIsRunning(false);
    await window.Telegram.WebApp.close();
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
          answer_id,
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

  const onModalRunCode = async () => {
    if (!currentAnswer || !taskId) {
      setSubmitResult("no_data");
      onOpen();
    } else {
      await handleRunCode();
    }
  }

  const handleRunCode = async () => {
    if (status === "success" && taskId) {
      await onSendCheck();
      return;
    }
    setIsRunning(true);
    setStatus('idle');
    setOutput('');

    try {

      const fullCode = `${currentAnswer?.code_before ? currentAnswer?.code_before : ''}${code}${currentAnswer?.code_after ? currentAnswer?.code_after : ''}`;

      const checkData = {
        input_data: currentAnswer?.input || inputData || "-",
        output_data: currentAnswer?.output || outputData || "-",
        program: fullCode,
        test_number: -1,
        timeout: currentAnswer?.timeout || 2
      };

      const result = await api.checkCode(checkData, language);

      if (result.result) {
        setOutput(result.comment || 'Тест пройден успешно!');
        setStatus('success');
      } else {
        setOutput(
          `Ошибка: ${result.comment || 'Неверный результат'}${result.output !== "error" ? `\nПолучено: ${result.output}\nОжидалось: ${currentAnswer?.output || outputData}` : ''
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

  const [height, setHeight] = useState(200); // Начальная высота
  const isResizing = useRef(false); // Флаг изменения
  const containerRef = useRef<HTMLDivElement | null>(null); // Ссылка на контейнер
  const startTouchY = useRef(0); // Для отслеживания начальной точки касания

  // Для десктопа
  const handleMouseDown = (event: React.MouseEvent) => {
    isResizing.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.overflow = "hidden"; // Блокируем прокрутку во время изменения
  };

  // Для мобильных
  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 1) { // Обрабатываем только одно прикосновение
      isResizing.current = true;
      startTouchY.current = event.touches[0].clientY; // Сохраняем начальную точку
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      document.addEventListener("touchend", handleTouchEnd);
      document.body.style.overflow = "hidden"; // Блокируем прокрутку во время изменения
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isResizing.current) return;

    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = event.clientY - containerRect.top;

      // Ограничиваем высоту в допустимых пределах
      const minHeight = 10;
      const maxHeight = 700;
      setHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
    }
  };

  // Мобильная версия для движения пальца
  const handleTouchMove = (event: TouchEvent) => {
    if (!isResizing.current) return;

    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = event.touches[0].clientY - containerRect.top;

      // Ограничиваем высоту в допустимых пределах
      const minHeight = 10;
      const maxHeight = 500;
      setHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));

      // Чтобы блокировать прокрутку на iOS
      event.preventDefault();
    }
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.body.style.overflow = ""; // Разблокировать прокрутку
  };

  // Мобильная версия для завершения прикосновения
  const handleTouchEnd = () => {
    isResizing.current = false;
    document.removeEventListener("touchmove", handleTouchMove);
    document.removeEventListener("touchend", handleTouchEnd);
    document.body.style.overflow = ""; // Разблокировать прокрутку
  };


  return (
    <div className="min-h-screen h-screen flex flex-col bg-ide-background text-ide-text-primary">
      <Modal onOpenChange={onOpenChange} isOpen={isOpen} >
        <ModalContent>
          {submitResult === "no_data" && <ModalHeader>Введите данные</ModalHeader>}
          <ModalBody>
            <div className='text-center text-3xl'>{submitResult === "success" ? "✅Все тесты прошли успешно!" : submitResult === "error" ? "❌Неверное решение." : <div className='flex flex-col gap-2'>
              <Textarea value={inputData} label='Входные данные' onChange={(e) => setInputData(e.target.value)} />
              <Textarea value={outputData} label='Выходные данные' onChange={(e) => setoutputData(e.target.value)} />
            </div>}</div>
          </ModalBody>
          <ModalFooter className='flex justify-center w-full'>
            <Button size="lg" disabled={isRunning} onPress={async () => {
              if (submitResult === "no_data" && outputData) {
                await handleRunCode();
              }
              onClose()
            }} className='w-full' color={submitResult === "no_data" ? "secondary" : "danger"}> {submitResult === "no_data" ? <div className='flex gap-2 items-center'>
              {isRunning && <Spinner />} Применить
            </div> : "Закрыть"}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {isDesktop() && (
        <header className="bg-ide-secondary border-b border-ide-border flex-none">
          <div className="container mx-auto lg:px-0 px-4 py-3 md:py-4">
            <img src="/logo.svg" alt="INNOPROG" className="h-10" />
          </div>
        </header>
      )}

      <div className={`${!isDesktop() ? "mt-[110px]" : ""}`}>
        {task && (
          <div
            ref={containerRef}
            style={{
              position: "relative", // Контейнер для абсолютного позиционирования полосы
              height: `${height}px`,
            }}
            className={`flex-none bg-ide-secondary p-4 border-b border-ide-border max-h-[30dvh]`}
          >
            <div
              style={{
                overflow: "auto", // Прокрутка только для контента
                height: "100%",
              }}
            >
              <div className="container mx-auto">
                <div className="prose prose-invert max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: task.description }} />
                  {task.answers && task.answers.length > 1 && (
                    <>
                      {task.answers[0].input && (
                        <>
                          <div>Входные данные:</div>
                          <pre>{task.answers[0].input}</pre>
                        </>
                      )}
                      <div className="mt-3">Выходные данные:</div>
                      <pre>{task.answers[0].output}</pre>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Полоса для изменения высоты */}
            <div
              style={{
                position: "absolute", // Абсолютное позиционирование относительно контейнера
                bottom: 0, // Привязка к нижней границе контейнера
                left: 0,
                right: 0,
                height: "8px",
                cursor: "row-resize", // Изменение курсора при наведении
              }}
              onMouseDown={handleMouseDown} // Обработка зажима на ПК
              onTouchStart={handleTouchStart} // Обработка зажима на мобильных устройствах
            >
              <div
                style={{
                  width: "60px",
                  height: "4px",
                  background: "#666",
                  margin: "2px auto",
                  borderRadius: "2px",
                }}
              />
            </div>
          </div>
        )}
      </div>



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
                    className={`font-mono text-sm md:text-base whitespace-pre-wrap break-words ${status === 'error' ? 'error-output' : status === "success" ? "text-green-500" : ""
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
          <Button
            onPress={status === "success" && taskId ? onSendCheck : onModalRunCode}
            disabled={isRunning}
            color={status === "success" && taskId ? 'secondary' : 'success'}
            className='w-full lg:w-auto text-white'
          // className={`w-full md:w-auto ${status !== "success" ? "bg-ide-button-primary" : "bg-[#9C78FF]"} ${status === "success" ? "" : "hover:bg-ide-button-primary-hover"}  text-ide-text-primary font-medium px-6 py-2.5 rounded transition-colors flex items-center justify-center gap-2 ${isRunning ? 'opacity-50 cursor-not-allowed' : ''
          //   }`}
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
            {status === "success" && taskId ? "Отправить на проверку" : isRunning ? 'Выполняется...' : 'Выполнить'}
          </Button>
          {activeTab === "output" && status !== "success" && <div className='lg:hidden w-full md:hidden'>
            <Button onPress={() => setActiveTab("editor")} color='danger' className={`w-full`}>Попробовать снова</Button>
          </div>}
        </div>
      </footer>
    </div >
  );
}

export default App;
