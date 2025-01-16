import axios from 'axios';
import { Task, CheckResult, CodeCheckRequest } from '../types/task';

const API_URL = 'https://api.innoprog.ru';

export const api = {
  async getTask(taskId: string): Promise<Task> {
    const response = await axios.get(`${API_URL}/task/${taskId}`);
    return response.data;
  },

  async checkCode(data: CodeCheckRequest): Promise<CheckResult> {
    console.log('Отправка запроса:', data);
    const response = await axios.post(`${API_URL}/check/py`, data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bot'
      }
    });
    console.log('Ответ:', response.data);
    return response.data;
  }
}; 