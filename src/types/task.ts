export interface Task {
  id: number;
  module?: string;
  topic?: {
    id: number;
    name: string;
  };
  video?: {
    id: number;
    name: string;
  };
  title?: string;
  description: string;
  points?: number;
  type?: 'Дополнение кода' | 'Написание кода';
  input_description?: string;
  output_description?: string;
  note?: string;
  examples?: Example[];
  initial_code?: string;
  tests?: Test[];
  answers?: Answer[];
}

export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface Test {
  input: string;
  output: string;
}

export interface CodeCheckRequest {
  input_data: string;
  output_data: string;
  program: string;
  test_number: number;
  timeout: number;
}

export interface SubmitRequest {
  user_id: number;
  task_id: number;
  program: string;
  answer_id: number;
}

export interface CheckResult {
  result: boolean;
  error?: string;
  output?: string;
  comment?: string;
  expected?: string;
}

export interface Answer {
  id: number;
  code_before: string;
  code_after: string;
  input: string;
  output: string;
  hint: string;
  timeout: number;
}

export enum Language {
  JAVA = 'java',
  JS = 'js',
  CPP = 'cpp',
  SQL = 'SQL',
  PY = 'py',
  DART = 'dart'
}
