# OpenCode 启动指南

本文档介绍如何在开发环境中启动 OpenCode 项目的不同模式。

---

## 前置要求

- **Bun** >= 1.3.6
- **Node.js** (用于某些依赖)
- **macOS**: Xcode Command Line Tools
- **Linux**: build-essential, libgtk-3-dev 等
- **Windows**: Visual Studio C++ Build Tools

### 安装 Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

---

## 一、项目初始化

### 1. 克隆仓库

```bash
git clone https://github.com/anomalyco/opencode.git
cd opencode
```

### 2. 安装依赖

```bash
bun install
```

### 3. 配置 AI 提供商

创建配置文件 `~/.opencode/config.json`:

```json
{
  "provider": {
    "default": "anthropic",
    "anthropic": {
      "apiKey": "your-anthropic-api-key"
    }
  }
}
```

或通过环境变量：

```bash
export ANTHROPIC_API_KEY="your-key"
```

---

## 二、启动模式

### 模式 1: CLI/TUI 模式 (终端界面)

这是主要的开发模式，在终端中提供交互式界面。

#### 方式 A: 直接运行源码

```bash
# 进入核心包目录
cd packages/opencode

# 运行 TUI 模式
bun run src/index.ts tui

# 或者运行 run 命令 (带服务器)
bun run src/index.ts run
```

#### 方式 B: 从根目录运行

```bash
# 使用根目录的 dev 脚本
bun dev

# 这等同于
bun run --cwd packages/opencode --conditions=browser src/index.ts
```

#### 方式 C: 构建后运行

```bash
# 构建单文件可执行程序
bun run packages/opencode/script/build.ts --single

# 运行构建后的程序
./opencode tui
```

#### TUI 模式快捷键

| 按键 | 功能 |
|------|------|
| `Tab` | 切换 Agent (build <-> plan) |
| `Ctrl+C` | 退出 |
| `Ctrl+D` | 发送消息 |
| `?` | 帮助 |

---

### 模式 2: Desktop 模式 (桌面应用)

使用 Tauri 构建的桌面应用，提供原生窗口体验。

#### 开发模式 (热重载)

```bash
# 进入 desktop 包目录
cd packages/desktop

# 启动开发服务器
bun run dev

# 这会自动:
# 1. 运行 predev 脚本准备环境
# 2. 启动 Vite 开发服务器
# 3. 打开 Tauri 窗口
```

#### 构建桌面应用

```bash
cd packages/desktop

# 类型检查
bun run typecheck

# 构建
bun run build

# 使用 Tauri CLI 打包
bun run tauri build
```

#### 桌面应用构建产物

构建完成后，可在以下位置找到：

```
packages/desktop/src-tauri/target/release/
├── bundle/
│   ├── dmg/           # macOS .dmg 安装包
│   ├── macos/         # macOS .app
│   └── ...
└── opencode-desktop   # 可执行文件
```

---

### 模式 3: Web 模式 (浏览器访问)

在浏览器中访问 OpenCode 的 Web 界面。

#### 启动 Web 服务器

```bash
# 进入 app 包目录
cd packages/app

# 启动开发服务器
bun run dev

# 服务器运行在 http://localhost:5173
```

#### 访问 Web 界面

1. 打开浏览器访问 `http://localhost:5173`
2. 确保 OpenCode 服务器正在运行（见下方）

#### 同时启动后端服务器

Web 模式需要后端服务器支持：

```bash
# 终端 1: 启动后端服务器
bun run packages/opencode/src/index.ts serve

# 终端 2: 启动 Web 前端
bun run --cwd packages/app dev
```

---

### 模式 4: 服务器模式 (Server Mode)

启动 HTTP/WebSocket 服务器，供其他客户端连接。

```bash
# 启动服务器
bun run packages/opencode/src/index.ts serve

# 服务器配置
# - 端口: 默认 6464
# - WebSocket: ws://localhost:6464
# - HTTP API: http://localhost:6464/api
```

#### 服务器选项

```bash
# 指定端口
PORT=8080 bun run packages/opencode/src/index.ts serve

# 启用 CORS
bun run packages/opencode/src/index.ts serve --cors

# 调试模式
OPENCODE_LOG_LEVEL=DEBUG bun run packages/opencode/src/index.ts serve
```

---

## 三、多客户端模式

OpenCode 采用客户端-服务器架构，可以同时运行多个客户端连接到同一个服务器。

### 示例: TUI + Web 同时运行

```bash
# 终端 1: 启动服务器 (内置 TUI)
bun run packages/opencode/src/index.ts run

# 终端 2: 启动 Web 客户端
bun run --cwd packages/app dev

# 终端 3: 启动 Desktop 客户端

bun run --cwd packages/desktop tauri dev
```

所有客户端会同步显示相同的会话和消息。

---

## 四、调试模式

### 启用详细日志

```bash
# 设置日志级别
export OPENCODE_LOG_LEVEL=DEBUG

# 运行
bun run packages/opencode/src/index.ts run
```

### 查看日志文件

```bash
# 实时查看日志
tail -f ~/.local/share/opencode/log/dev.log

# macOS 路径
tail -f ~/Library/Application\ Support/opencode/log/dev.log
```

### VS Code 调试

参考 `.vscode/launch.json`:

```json
{
  "type": "bun",
  "request": "launch",
  "name": "opencode (TUI)",
  "cwd": "${workspaceFolder}/packages/opencode",
  "program": "${workspaceFolder}/packages/opencode/src/index.ts",
  "args": ["tui"],
  "env": {
    "OPENCODE_LOG_LEVEL": "DEBUG"
  }
}
```

---

## 五、常见启动场景

### 场景 1: 学习源码

```bash
# 启动 TUI 模式，观察日志
OPENCODE_LOG_LEVEL=DEBUG bun run packages/opencode/src/index.ts run

# 另开终端查看日志
tail -f ~/.local/share/opencode/log/dev.log
```

### 场景 2: Web 开发

```bash
# 终端 1: 后端服务器
bun run packages/opencode/src/index.ts serve

# 终端 2: 前端开发服务器
bun run --cwd packages/app dev
```

### 场景 3: 桌面应用开发

```bash
cd packages/desktop
bun run dev
```

### 场景 4: 类型检查 + 测试

```bash
# 全量类型检查
bun turbo typecheck

# 运行测试
bun test
```

---

## 六、命令速查表

| 命令 | 模式 | 说明 |
|------|------|------|
| `bun run packages/opencode/src/index.ts run` | TUI | 启动 TUI 并运行会话 |
| `bun run packages/opencode/src/index.ts tui` | TUI | 仅启动 TUI 界面 |
| `bun run packages/opencode/src/index.ts serve` | Server | 启动 HTTP 服务器 |
| `bun run --cwd packages/app dev` | Web | 启动 Web 开发服务器 |
| `bun run --cwd packages/desktop dev` | Desktop | 启动桌面应用 |
| `bun dev` | TUI | 从根目录快捷启动 |

---

## 七、故障排除

### 问题 1: 端口被占用

```bash
# 查找占用端口的进程
lsof -i :6464

# 杀死进程
kill -9 <PID>

# 或使用其他端口
PORT=7000 bun run packages/opencode/src/index.ts serve
```

### 问题 2: 依赖安装失败

```bash
# 清理并重新安装
rm -rf node_modules bun.lockb
bun install
```

### 问题 3: 类型错误

```bash
# 重新生成类型
bun run build

# 类型检查
bun turbo typecheck
```

### 问题 4: Desktop 应用无法启动

```bash
# macOS: 安装缺少的依赖
brew install openssl

# Linux: 安装 WebView 依赖
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

---

## 八、开发工作流建议

### 典型开发流程

```bash
# 1. 拉取最新代码
git pull

# 2. 安装依赖
bun install

# 3. 类型检查
bun turbo typecheck

# 4. 启动开发模式
bun run packages/opencode/src/index.ts run

# 5. 修改代码后自动重载 (Tauri 支持)
```

### 提交代码前

```bash
# 类型检查
bun turbo typecheck

# 构建测试
bun run packages/opencode/script/build.ts --single
```

---

## 九、相关文档

- [架构分析文档](./ARCHITECTURE_ANALYSIS.md)
- [官方文档](https://opencode.ai/docs)
- [贡献指南](./CONTRIBUTING.md)
- [Agents 文档](https://opencode.ai/docs/agents)

---

## 十、获取帮助

- **Discord**: https://discord.gg/opencode
- **GitHub Issues**: https://github.com/anomalyco/opencode/issues
- **X (Twitter)**: https://x.com/opencode
