import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 开发模式：加载 Vite dev server
  // 生产模式：加载打包后的 index.html（使用 pathToFileURL 确保 Windows 路径与空格安全）
  const indexHtmlUrl = pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href;
  const startUrl = process.env.ELECTRON_START_URL || indexHtmlUrl;
  win.loadURL(startUrl);

  // 仅在开发模式打开 DevTools
  if (process.env.ELECTRON_START_URL) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
