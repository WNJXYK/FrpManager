/**
 * FRP Manager - FRP服务管理模块
 * 
 * 该模块负责：
 * 1. FRP配置的管理（保存、读取、删除）
 * 2. FRP进程的生命周期管理（启动、停止、重启）
 * 3. 系统架构检测和二进制文件管理
 * 4. 与主进程的通信和状态同步
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { app, BrowserWindow } from 'electron';
import * as fsSync from 'fs';
import * as TOML from '@iarna/toml';
import * as process from 'process';

/**
 * FRP配置接口
 * @interface FrpConfig
 * @property {string} id - 配置唯一标识符
 * @property {string} name - 配置名称
 * @property {string} config - TOML格式的FRP配置内容
 * @property {boolean} isRunning - 当前运行状态
 * @property {boolean} autoStart - 是否自动启动
 * @property {any} parsedConfig - 解析后的配置对象（可选）
 */
export interface FrpConfig {
  id: string;
  name: string;
  config: string;
  isRunning: boolean;
  autoStart: boolean;
  parsedConfig?: any;
}

/**
 * FRP管理器类
 * 负责管理FRP配置和进程的核心类
 */
export class FrpManager {
  /** 运行中的FRP进程映射表 */
  private processes: Map<string, ChildProcess> = new Map();
  /** 配置文件目录路径 */
  private configDir: string;
  /** 配置文件完整路径 */
  private configPath: string;
  /** 系统架构标识 */
  private architecture: string;
  /** FRP二进制文件路径 */
  private binPath: string;
  /** FRP配置列表 */
  private configs: FrpConfig[];
  /** Electron主窗口实例 */
  private mainWindow: BrowserWindow | null = null;

  /**
   * 构造函数
   * @param window - Electron主窗口实例
   */
  constructor(window: BrowserWindow) {
    this.mainWindow = window;
    this.configDir = path.join(os.homedir(), '.frp-manager');
    this.configPath = path.join(this.configDir, 'configs.json');
    this.architecture = this.detectArchitecture();
    this.binPath = this.getBinaryPath();

    console.log('当前系统架构:', this.architecture);
    console.log('FRP二进制文件路径:', this.binPath);

    this.processes = new Map();
    this.configs = [];
  }

  /**
   * 通知配置状态变化
   * @param config - 发生变化的配置
   */
  private notifyStatusChange(config: FrpConfig) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('frp-status-changed', config);
    }
  }

  /**
   * 通知错误信息
   * @param configId - 配置ID
   * @param error - 错误信息
   */
  private notifyError(configId: string, error: string) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('frp-error', { configId, error });
    }
  }

  /**
   * 检测当前系统架构
   * @returns 系统架构标识（'arm64'或'x64'）
   */
  private detectArchitecture(): string {
    const arch = os.arch();
    return arch === 'arm64' ? 'arm64' : 'x64';
  }

  /**
   * 初始化FRP二进制文件
   * 检查文件存在性并设置执行权限
   */
  private async initBinary(): Promise<void> {
    try {
      await fs.access(this.binPath);
      await fs.chmod(this.binPath, 0o755);
    } catch (error) {
      console.error('二进制文件检查失败:', error);
      throw new Error(`找不到 frpc 二进制文件或无法访问：${this.binPath}`);
    }
  }

  /**
   * 获取当前系统架构
   * @returns 系统架构标识
   */
  public getArchitecture(): string {
    return this.architecture;
  }

  /**
   * 初始化FRP管理器
   * 创建配置目录、初始化二进制文件和配置
   */
  public async init(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await this.initBinary();
      await this.initConfigs();
      await this.startAutoStartConfigs();
      console.log('FRP Manager 初始化成功');
    } catch (error) {
      console.error('FRP Manager 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 初始化FRP配置
   * 从配置文件加载已保存的配置
   */
  private async initConfigs(): Promise<void> {
    try {
      const configPath = path.join(this.configDir, 'configs.json');
      const data = await fs.readFile(configPath, 'utf-8');
      this.configs = JSON.parse(data);
    } catch (error) {
      this.configs = [];
    }
  }

  /**
   * 启动设置了自动启动的配置
   */
  private async startAutoStartConfigs(): Promise<void> {
    for (const config of this.configs) {
      if (config.autoStart && !config.isRunning) {
        try {
          await this.startFrp(config);
          console.log(`自动启动配置: ${config.name}`);
        } catch (error) {
          console.error(`自动启动配置失败: ${config.name}`, error);
          this.notifyError(config.id, `自动启动失败: ${(error as Error).message}`);
        }
      }
    }
  }

  /**
   * 获取指定ID的配置
   * @param id - 配置ID
   * @returns 配置对象或undefined
   */
  public getConfig(id: string): FrpConfig | undefined {
    return this.configs.find(c => c.id === id);
  }

  /**
   * 获取所有配置
   * @returns 配置列表
   */
  public getConfigs(): FrpConfig[] {
    return this.configs;
  }

  /**
   * 保存FRP配置
   * @param config - 要保存的配置
   */
  public async saveConfig(config: FrpConfig): Promise<void> {
    try {
      config.parsedConfig = TOML.parse(config.config);
      const index = this.configs.findIndex(c => c.id === config.id);
      if (index >= 0) {
        this.configs[index] = config;
      } else {
        this.configs.push(config);
      }
      await fs.writeFile(this.configPath, JSON.stringify(this.configs, null, 2));
    } catch (error) {
      console.error('TOML 配置解析失败:', error);
      throw new Error('TOML 配置格式无效: ' + (error as Error).message);
    }
  }

  /**
   * 删除FRP配置
   * @param id - 要删除的配置ID
   */
  public async deleteConfig(id: string): Promise<void> {
    const config = this.getConfig(id);
    if (config) {
      await this.stopFrp(config);
      this.configs = this.configs.filter(c => c.id !== id);
      await fs.writeFile(this.configPath, JSON.stringify(this.configs, null, 2));
    }
  }

  /**
   * 获取FRP二进制文件路径
   * @returns 二进制文件完整路径
   */
  private getBinaryPath(): string {
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.join(app.getAppPath(), 'assets', 'bin', 'darwin', this.architecture, 'frpc');
    } else {
      return path.join(process.resourcesPath, 'assets', 'bin', 'darwin', this.architecture, 'frpc');
    }
  }

  /**
   * 启动FRP服务
   * @param config - 要启动的FRP配置
   */
  public async startFrp(config: FrpConfig): Promise<void> {
    // 写入TOML配置文件
    const configPath = path.join(this.configDir, `${config.id}.toml`);
    await fs.writeFile(configPath, config.config);

    // 启动FRP进程
    const frpcProcess = spawn(this.binPath, ['-c', configPath]);
    this.processes.set(config.id, frpcProcess);
    config.isRunning = true;
    this.notifyStatusChange(config);

    // 注册进程事件监听器
    frpcProcess.stdout.on('data', (data) => {
      console.log(`[${config.name}] ${data}`);
    });

    frpcProcess.stderr.on('data', (data) => {
      console.error(`[${config.name}] Error: ${data}`);
      this.notifyError(config.id, data.toString());
    });

    frpcProcess.on('close', (code) => {
      const name = config.name;
      console.log(`[${name}] Process exited with code ${code}`);
      this.processes.delete(config.id);
      config.isRunning = false;
      this.notifyStatusChange(config);
      if (code !== 0 && code !== null) this.notifyError(name, `进程退出，退出码: ${code}`);
    });

    frpcProcess.on('error', (error) => {
      console.error(`[${config.name}] Process error:`, error);
      this.processes.delete(config.id);
      config.isRunning = false;
      this.notifyStatusChange(config);
      this.notifyError(config.id, error.message);
    }); 
  }

  /**
   * 停止FRP服务
   * @param config - 要停止的FRP配置
   */
  public async stopFrp(config: FrpConfig): Promise<void> {
    const process = this.processes.get(config.id);
    if (process) {
      process.kill();
      this.processes.delete(config.id);
      config.isRunning = false;
      this.notifyStatusChange(config);
    }
  }

  /**
   * 重启FRP服务
   * @param config - 要重启的FRP配置
   */
  public async restartFrp(config: FrpConfig): Promise<void> {
    await this.stopFrp(config);
    await this.startFrp(config);
  }

  /**
   * 清理所有运行中的FRP进程
   * 在应用退出时调用
   */
  public cleanup(): void {
    for (const [id, process] of this.processes) {
      if (process && typeof process.kill === 'function') {
        process.kill();
        this.processes.delete(id);
      }
    }
  }
} 