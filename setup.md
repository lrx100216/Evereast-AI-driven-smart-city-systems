# 搬到新电脑运行指南

## 1. 装 Node.js

去 https://nodejs.org/ 下载 LTS 版本（左边那个大按钮），一直下一步就行。

装完打开 cmd，输：
```bash
node -v
npm -v
```
有版本号出来就是成功了。

## 2. 复制项目

整个 `smart-city` 文件夹复制到新电脑。注意：
- **别放中文路径**（比如 `D:\文档\项目\` 这种不行）
- `node_modules` 不用复制，后面 `npm install` 会自动下

## 3. 一键启动（推荐）

Windows 直接双击 `start.bat`，会自动：
1. 检测 Node.js
2. 装后端依赖
3. 装前端依赖
4. 启动后端（3001端口）
5. 等后端就绪
6. 启动前端（5173端口）
7. 自动开浏览器

会弹出两个黑色终端窗口，**别关**。

macOS / Linux 在终端里跑：
```bash
bash start.sh
```

## 4. 手动启动（如果脚本出问题）

```bash
cd backend && npm install && npm run dev
# 另开终端：
cd frontend && npm install && npm run dev
```

浏览器开 http://localhost:5173。

## 5. 环境变量

把 `backend/.env.example` 复制成 `backend/.env`，填上你的 Key：
```
DEEPSEEK_API_KEY=sk-your-key-here
SERIAL_PORT=
```

- `DEEPSEEK_API_KEY`：AI 建议功能用，去 https://platform.deepseek.com/ 申请，免费额度够用
- `SERIAL_PORT`：接 Arduino 时填（比如 `COM3`），不接就留空
- `SMART_CITY_CPU_COUNT`：可选，控制并行线程数

## 6. 功能说明

启动后浏览器打开 http://localhost:5173：

| 页面 | 功能 |
|------|------|
| `/` | Dashboard，数据总览 |
| `/traffic` | 交通监控 + MARL 训练 |
| `/energy` | 能源管理 |
| `/weather` | 天气 |
| `/about` | 项目介绍 |

**MARL 训练**：在交通页底部，点 Start Training，大概 28 分钟跑完 500 episodes。
训练完可以切 fixed / marl 模式对比效果。

**What-If 沙盒**：交通/能源页底部，有 6 个预定义场景，跑 100 次配对实验。

**CFM 模型**：About 页面有介绍。训练脚本 `ai_model/train_cfm.py`，需要 Python + PyTorch。

## 7. 常见问题

**npm install 慢 / 报错**
```bash
npm config set registry https://registry.npmmirror.com
```

**macOS 上 serialport 编译报错**
不接硬件的话 `serialport` 是可选依赖，装不上不影响运行：
```bash
cd backend && npm install --no-optional
```

**端口被占用**
默认前端 5173、后端 3001。如果被占：
- 后端端口改 `backend/src/index.ts`
- 前端端口改 `frontend/vite.config.ts`
- 同时改 `frontend/src/config.ts` 里的 `API_BASE`

**启动后白屏**
按 F12 看 Console 里的红色报错，截图发我。

**AI 建议不显示**
检查 `backend/.env` 里的 `DEEPSEEK_API_KEY`。没有 AI 不影响其他功能。

**MARL 训练没反应**
确认后端是重启过的（Ctrl+C 停掉再 `npm run dev`）。训练占 CPU，别开太多别的程序。

**start.bat 乱码**
脚本内置了 UTF-8 切换，如果还乱码就右键编辑，另存为 UTF-8 编码。

## 8. 需要复制的文件

核心就是 `src/` 里的源码 + `package.json` + `.env`，`node_modules` 和 `dist` 不用复制。

具体清单太长不列了，直接复制整个文件夹最省事。
