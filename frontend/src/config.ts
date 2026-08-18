/**
 * 【模块说明】config.ts — 前端全局配置
 * Module: config.ts — Frontend global configuration
 *
 * 【功能】集中定义后端 API 与 WebSocket 的基础地址，便于统一修改
 * Function: Centralizes the backend API and WebSocket base URLs for easy modification.
 *
 * 【关键配置 / Key Configurations】
 *   - API_BASE  : 后端服务根地址，默认 http://localhost:3001
 *                 Root address of the backend service, default http://localhost:3001
 *   - API_URL   : REST API 前缀路径 `${API_BASE}/api`
 *                 REST API prefix path.
 *   - SOCKET_URL: WebSocket (Socket.IO) 连接地址，与 API_BASE 共用同一主机端口
 *                 WebSocket (Socket.IO) connection address, shares the same host:port as API_BASE.
 *
 * 【修改提示 / Modification Notes】
 *   生产环境部署时，将 API_BASE 改为实际域名或 IP，例如：
 *   When deploying to production, change API_BASE to the actual domain or IP, e.g.:
 *     const API_BASE = 'https://api.smartcity.example.com';
 *
 * 【用法 / Usage】
 *   import { API_URL, SOCKET_URL } from './config';
 */

const API_BASE = 'http://localhost:3001';
export const API_URL = `${API_BASE}/api`;
export const SOCKET_URL = API_BASE;
