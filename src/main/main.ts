/**
 * FRP Manager - Electron主进程入口文件
 * 
 * 该文件负责：
 * 1. 应用程序的生命周期管理
 * 2. 主窗口和托盘的创建与管理
 * 3. IPC通信的处理
 * 4. FRP服务的管理
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import { FrpManager, FrpConfig } from './FrpManager';

// 全局变量声明
let mainWindow: BrowserWindow | null = null;  // 主窗口实例
let tray: Tray | null = null;                 // 系统托盘实例
let frpManager: FrpManager | null = null;     // FRP管理器实例
let isQuitting = false;                       // 应用退出标志

/**
 * 获取资源文件路径
 * @param resourcePath - 相对于assets目录的资源路径
 * @returns 完整的资源文件路径
 */
const getResourcePath = (resourcePath: string): string => {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(app.getAppPath(), 'assets', resourcePath);
  } else {
    return path.join(process.resourcesPath, 'assets', resourcePath);
  }
};

/**
 * 获取应用图标路径
 * @returns 应用图标的完整路径
 */
const getIconPath = () => {
  return getResourcePath('icons/icon.png');
};

/**
 * 获取托盘图标路径
 * @returns 托盘图标的完整路径
 */
const getTrayIconPath = () => {
  return getResourcePath('icons/tray.png');
};

/**
 * 创建主窗口
 * 设置窗口属性、加载页面、注册事件监听器
 */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 800,
    webPreferences: {
      nodeIntegration: true,     // 启用Node.js集成
      contextIsolation: false,   // 禁用上下文隔离
      sandbox: false             // 禁用沙箱模式
    },
    show: false,
    icon: getIconPath()
  });

  // 根据环境加载页面
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  // 窗口事件处理
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('show', () => {
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  });

  mainWindow.on('hide', () => {
    if (process.platform === 'darwin') app.dock.hide();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

/**
 * 创建系统托盘
 * 设置托盘图标、菜单项和事件处理
 */
async function createTray() {
  const iconPath = getTrayIconPath();
  console.log('托盘图标路径:', iconPath);
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon);
  tray.setToolTip('FRP Manager');

  /**
   * 更新托盘上下文菜单
   * 动态生成包含所有FRP配置的菜单
   */
  const updateContextMenu = () => {
    const configs = frpManager?.getConfigs() || [];
    const menuTemplate: MenuItemConstructorOptions[] = [
      { 
        label: mainWindow?.isVisible() ? '隐藏主界面' : '显示主界面',
        type: 'normal', 
        click: () => {
          if (mainWindow?.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow?.show();
          }
        }
      },
      { type: 'separator' },
      {
        label: '配置列表',
        type: 'normal',
        enabled: false,
      },
      ...configs.map(config => ({
        label: config.name,
        type: 'submenu' as const,
        submenu: [
          {
            label: config.isRunning ? '运行中' : '已停止',
            type: 'normal' as const,
            enabled: false,
          },
          {
            label: config.isRunning ? '停止' : '启动',
            type: 'normal' as const,
            click: async () => {
              try {
                if (config.isRunning) {
                  await frpManager?.stopFrp(config);
                } else {
                  await frpManager?.startFrp(config);
                }
              } catch (error: any) {
                console.error(`操作失败: ${error.message}`);
                mainWindow?.webContents.send('frp-error', { configId: config.id, error: error.message });
              }
            }
          },
          {
            label: '重启',
            type: 'normal' as const,
            enabled: config.isRunning,
            click: async () => {
              try {
                await frpManager?.restartFrp(config);
              } catch (error: any) {
                console.error(`重启失败: ${error.message}`);
                mainWindow?.webContents.send('frp-error', { configId: config.id, error: error.message });
              }
            }
          }
        ]
      })),
      { type: 'separator' },
      { 
        label: '退出',
        type: 'normal', 
        click: () => {
          isQuitting = true;
          frpManager?.cleanup();
          app.quit();
        }
      }
    ];
    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    tray?.setContextMenu(contextMenu);
  };

  // 初始设置菜单
  updateContextMenu();

  // 注册窗口状态变化事件
  mainWindow?.on('show', updateContextMenu);
  mainWindow?.on('hide', updateContextMenu);

  // 注册托盘点击事件
  tray.on('click', () => {
    updateContextMenu();
    tray?.popUpContextMenu();
  });
}

/**
 * 应用程序初始化
 * 创建窗口、托盘和FRP管理器，设置IPC通信
 */
async function initialize() {
  try {
    // macOS特定处理
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    // 创建主要组件
    await createWindow();
    await createTray();

    if (!mainWindow) throw new Error('主窗口创建失败');

    // 初始化FRP管理器
    frpManager = new FrpManager(mainWindow);
    await frpManager.init();
  } catch (error: any) {
    console.error('初始化失败:', error);
    if (mainWindow) {
      mainWindow.webContents.send('initialization-error', error.message);
    }
  }

  // 注册IPC通信处理器
  ipcMain.handle('get-configs', async () => {
    try {
      return await frpManager?.getConfigs() || [];
    } catch (error: any) {
      console.error('获取配置失败:', error);
      return [];
    }
  });

  ipcMain.handle('save-config', async (_, config: FrpConfig) => {
    try {
      if (frpManager) {
        await frpManager.saveConfig(config);
      }
    } catch (error: any) {
      console.error('保存配置失败:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-config', async (_, id: string) => {
    try {
      if (frpManager) {
        await frpManager.deleteConfig(id);
      }
    } catch (error: any) {
      console.error('删除配置失败:', error);
      throw error;
    }
  });

  ipcMain.handle('start-frp', async (_, config: FrpConfig) => {
    try {
      if (frpManager) {
        await frpManager.startFrp(config);
      }
    } catch (error: any) {
      console.error('启动FRP失败:', error);
      throw error;
    }
  });

  ipcMain.handle('stop-frp', async (_, config: FrpConfig) => {
    try {
      if (frpManager) {
        await frpManager.stopFrp(config);
      }
    } catch (error: any) {
      console.error('停止FRP失败:', error);
      throw error;
    }
  });

  ipcMain.handle('restart-frp', async (_, config: FrpConfig) => {
    try {
      if (frpManager) {
        await frpManager.restartFrp(config);
      }
    } catch (error: any) {
      console.error('重启FRP失败:', error);
      throw error;
    }
  });

  ipcMain.handle('get-architecture', () => {
    return frpManager?.getArchitecture() || 'x86';
  });

  ipcMain.handle('quit-app', () => {
    isQuitting = true;
    frpManager?.cleanup();
    app.quit();
  });

  // 开机自启动相关处理器
  ipcMain.handle('toggle-auto-start', () => {
    const settings = app.getLoginItemSettings();
    const newSettings = {
      openAtLogin: !settings.openAtLogin,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden']
    };
    app.setLoginItemSettings(newSettings);
    return newSettings.openAtLogin;
  });

  ipcMain.handle('disable-auto-start', () => {
    app.setLoginItemSettings({
      openAtLogin: false,
      openAsHidden: false,
      path: process.execPath,
      args: []
    });
  });

  ipcMain.handle('get-auto-start-status', () => {
    return app.getLoginItemSettings().openAtLogin;
  });
}

/**
 * 处理启动参数
 * 处理开机自启动等特殊启动场景
 */
const handleStartupArgs = () => {
  const args = process.argv;
  if (args.includes('--hidden')) {
    if (mainWindow) {
      mainWindow.hide();
    }
  }
};

// 单实例锁定
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // 处理第二个实例启动
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 应用就绪后初始化
  app.whenReady().then(() => {
    initialize();
    handleStartupArgs();
  });
}

// 应用程序生命周期事件处理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    frpManager?.cleanup();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (frpManager) {
    frpManager.cleanup();
  }
}); 