import axios from 'axios';
import { Task, CheckResult, CodeCheckRequest, SubmitRequest } from '../types/task';

const API_URL = 'https://bot.innoprog.ru:8443';
const BASE_API = axios.create({
  baseURL: API_URL,
  headers: {
    Authorization: "Bearer bot"
  }
})


export const api = {
  async getTask(taskId: string): Promise<Task> {
    const response = await axios.get(`https://api.innoprog.ru/task/${taskId}`);
    return response.data;
  },

  async checkCode(data: CodeCheckRequest, language: string): Promise<CheckResult> {
    console.log('Отправка запроса:', data);
    const response = await BASE_API.post(`/check/${language}`, data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bot'
      }
    });
    console.log('Ответ:', response.data);
    return response.data;
  },

  async submitCode(data: SubmitRequest) {
    const response = await BASE_API.post(`/answer/code`, data);
    console.log('Submit response: ', response.data);
    return response.data;
  },

  async getSubmitCode(answer_id: number, user_id: number, task_id: number) {
    const response = await fetch(`https://bot.innoprog.ru:8443/answer/code?answer_id=${answer_id}&user_id=${user_id}&task_id=${task_id}`);
    const data = await response.json();
    // const {data} = await BASE_API.get();
    console.log('Submit code response: ', data);
    return data;
  }
}; 