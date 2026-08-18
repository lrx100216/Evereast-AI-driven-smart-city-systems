/**
 * 后端入口 —— 仅做引导启动
 * 应用构造 → src/app/createApp.ts
 * 引擎启动  → src/app/bootstrap.ts
 */
import { startServer } from './app/bootstrap';

const { server } = startServer();
export { server };
