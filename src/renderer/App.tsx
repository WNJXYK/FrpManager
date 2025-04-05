/**
 * FRP Manager - 渲染进程主组件
 * 
 * 该组件负责：
 * 1. FRP配置的界面展示和管理
 * 2. 与主进程的IPC通信
 * 3. 用户操作的处理
 * 4. 状态管理和错误处理
 */

import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  Container,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  Chip,
  FormControlLabel,
  Checkbox,
  Link
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Memory as MemoryIcon,
  Info as InfoIcon,
  CheckBox
} from '@mui/icons-material';

/**
 * 扩展Window接口以支持Electron的require
 */
declare global {
  interface Window {
    require: (module: string) => any;
  }
}

const { ipcRenderer } = window.require('electron');

/**
 * FRP配置接口
 * @interface FrpConfig
 * @property {string} id - 配置唯一标识符
 * @property {string} name - 配置名称
 * @property {string} config - TOML格式的FRP配置内容
 * @property {boolean} isRunning - 当前运行状态
 * @property {boolean} autoStart - 是否自动启动
 */
interface FrpConfig {
  id: string;
  name: string;
  config: string;
  isRunning: boolean;
  autoStart: boolean;
}

/**
 * 错误消息接口
 * @interface ErrorMessage
 * @property {string} configId - 相关配置的ID
 * @property {string} error - 错误信息
 */
interface ErrorMessage {
  configId: string;
  error: string;
}

/**
 * 应用主组件
 * 管理FRP配置的界面和交互逻辑
 */
const App: React.FC = () => {
  // 状态定义
  const [frpConfigs, setFrpConfigs] = useState<FrpConfig[]>([]);        // FRP配置列表
  const [openDialog, setOpenDialog] = useState(false);                   // 配置对话框状态
  const [currentConfig, setCurrentConfig] = useState<FrpConfig | null>(null); // 当前编辑的配置
  const [error, setError] = useState<string | null>(null);              // 错误信息
  const [architecture, setArchitecture] = useState<string>('');         // 系统架构
  const [autoStart, setAutoStart] = useState<boolean>(false);           // 开机自启动状态
  const [openAboutDialog, setOpenAboutDialog] = useState(false);  // 关于对话框状态

  /**
   * 组件初始化和事件监听设置
   */
  useEffect(() => {
    // 加载初始数据
    loadConfigs();
    loadArchitecture();
    loadAutoStartStatus();

    // 注册IPC事件监听器
    ipcRenderer.on('frp-status-changed', (_: any, updatedConfig: FrpConfig) => {
      setFrpConfigs(configs =>
        configs.map(c => c.id === updatedConfig.id ? updatedConfig : c)
      );
    });

    ipcRenderer.on('frp-error', (_: any, { configId, error }: ErrorMessage) => {
      setError(`配置 "${frpConfigs.find(c => c.id === configId)?.name}" 出错: ${error}`);
    });

    ipcRenderer.on('initialization-error', (_: any, error: string) => {
      setError(`初始化失败: ${error}`);
    });

    // 清理事件监听器
    return () => {
      ipcRenderer.removeAllListeners('frp-status-changed');
      ipcRenderer.removeAllListeners('frp-error');
      ipcRenderer.removeAllListeners('initialization-error');
    };
  }, []);

  /**
   * 加载系统架构信息
   */
  const loadArchitecture = async () => {
    try {
      const arch = await ipcRenderer.invoke('get-architecture');
      setArchitecture(arch);
    } catch (err: any) {
      setError('获取系统架构信息失败: ' + err.message);
    }
  };

  /**
   * 加载FRP配置列表
   */
  const loadConfigs = async () => {
    try {
      const configs = await ipcRenderer.invoke('get-configs');
      setFrpConfigs(configs);
    } catch (err: any) {
      setError('加载配置失败: ' + err.message);
    }
  };

  /**
   * 加载开机自启动状态
   */
  const loadAutoStartStatus = async () => {
    try {
      const status = await ipcRenderer.invoke('get-auto-start-status');
      setAutoStart(status);
    } catch (err: any) {
      setError('获取开机自启动状态失败: ' + err.message);
    }
  };

  /**
   * 切换开机自启动状态
   */
  const toggleAutoStart = async () => {
    try {
      const newStatus = await ipcRenderer.invoke('toggle-auto-start');
      setAutoStart(newStatus);
    } catch (err: any) {
      setError('设置开机自启动失败: ' + err.message);
    }
  };

  /**
   * 打开添加配置对话框
   */
  const handleAddConfig = () => {
    setCurrentConfig(null);
    setOpenDialog(true);
  };

  /**
   * 打开编辑配置对话框
   * @param config - 要编辑的配置
   */
  const handleEditConfig = (config: FrpConfig) => {
    setCurrentConfig(config);
    setOpenDialog(true);
  };

  /**
   * 保存FRP配置
   * @param config - 要保存的配置
   */
  const handleSaveConfig = async (config: FrpConfig) => {
    try {
      await ipcRenderer.invoke('save-config', config);
      await loadConfigs();
      setOpenDialog(false);
    } catch (err: any) {
      setError('保存配置失败: ' + err.message);
    }
  };

  /**
   * 删除FRP配置
   * @param id - 要删除的配置ID
   */
  const handleDeleteConfig = async (id: string) => {
    try {
      await ipcRenderer.invoke('delete-config', id);
      await loadConfigs();
    } catch (err: any) {
      setError('删除配置失败: ' + err.message);
    }
  };

  /**
   * 切换FRP服务运行状态
   * @param config - 要操作的配置
   */
  const handleToggleRunning = async (config: FrpConfig) => {
    try {
      await ipcRenderer.invoke('toggle-frp', config);
    } catch (err: any) {
      setError('操作失败: ' + err.message);
    }
  };

  // 渲染用户界面
  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4, mb: 4 }}>
        {/* 标题栏 */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h4" component="h1">
            FRP Manager
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={<MemoryIcon />}
              label={`系统架构: ${architecture}`}
              variant="outlined"
              color="primary"
            />
            <IconButton
              color="primary"
              onClick={() => setOpenAboutDialog(true)}
              size="small"
              title="关于"
            >
              <InfoIcon />
            </IconButton>
          </Box>
        </Box>

        {/* 操作按钮 */}
        <Button
          variant="contained"
          color="primary"
          onClick={handleAddConfig}
          sx={{ mb: 2 }}
        >
          添加 FRP 配置
        </Button>
        <Box sx={{ display: 'inline-block', width: '10px' }} />
        <Button
          variant="contained"
          color={autoStart ? "success" : "primary"}
          onClick={toggleAutoStart}
          sx={{ mb: 2 }}
        >
          {autoStart ? '开机自启动' : '关闭自启动'}
        </Button>
        <Box sx={{ display: 'inline-block', width: '10px' }} />
        <Button
          variant="contained"
          color="error"
          onClick={() => {ipcRenderer.invoke('quit-app');}}
          sx={{ mb: 2 }}
        >
          退出应用
        </Button>
        <List>
          {frpConfigs.map((config) => (
            <ListItem key={config.id}>
              <ListItemText
                primary={config.name}
                secondary={
                  <Chip
                    label={config.isRunning ? '运行中' : '已停止'}
                    color={config.isRunning ? 'success' : 'default'}
                    size="small"
                  />
                }
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  aria-label={config.isRunning ? '停止' : '启动'}
                  onClick={() => handleToggleRunning(config)}
                >
                  {config.isRunning ? <StopIcon /> : <PlayIcon />}
                </IconButton>
                <IconButton
                  edge="end"
                  aria-label="编辑"
                  onClick={() => handleEditConfig(config)}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  edge="end"
                  aria-label="删除"
                  onClick={() => handleDeleteConfig(config.id)}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Box>

      {/* 错误提示 */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert onClose={() => setError(null)} severity="error">
          {error}
        </Alert>
      </Snackbar>

      {/* 配置编辑对话框 */}
      <ConfigDialog
        open={openDialog}
        config={currentConfig}
        onClose={() => setOpenDialog(false)}
        onSave={handleSaveConfig}
      />

      {/* 关于对话框 */}
      <Dialog
        open={openAboutDialog}
        onClose={() => setOpenAboutDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>FRP Manager</DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            <Typography variant="body1" paragraph>
              FRP Manager 是一个用于管理和配置 FRP (Fast Reverse Proxy) 的图形化工具。它提供了简单直观的界面，帮助用户管理多个 FRP 配置并监控其运行状态。
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              版本: 1.0.0. frp 版本: 0.61.2.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              作者: <Link href="https://github.com/WNJXYK" target="_blank" rel="noopener">WNJXYK</Link>. Apache License 2.0.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              基于: <Link href="https://github.com/fatedier/frp" target="_blank" rel="noopener">https://github.com/fatedier/frp</Link>
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAboutDialog(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

/**
 * 配置对话框组件属性接口
 * @interface ConfigDialogProps
 * @property {boolean} open - 对话框是否打开
 * @property {FrpConfig | null} config - 当前编辑的配置，为null时表示新建配置
 * @property {() => void} onClose - 关闭对话框的回调函数
 * @property {(config: FrpConfig) => void} onSave - 保存配置的回调函数
 */
interface ConfigDialogProps {
  open: boolean;
  config: FrpConfig | null;
  onClose: () => void;
  onSave: (config: FrpConfig) => void;
}

/**
 * FRP配置编辑对话框组件
 * 用于新建或编辑FRP配置
 */
const ConfigDialog: React.FC<ConfigDialogProps> = ({
  open,
  config,
  onClose,
  onSave
}: ConfigDialogProps) => {
  // 表单状态
  const [name, setName] = useState('');           // 配置名称
  const [configContent, setConfigContent] = useState(''); // 配置内容
  const [autoStart, setAutoStart] = useState(false);     // 自动启动设置

  /**
   * 当配置对象变化时更新表单状态
   */
  useEffect(() => {
    if (config) {
      setName(config.name);
      setConfigContent(config.config);
      setAutoStart(config.autoStart);
    } else {
      setName('');
      setConfigContent('');
      setAutoStart(false);
    }
  }, [config]);

  /**
   * 处理配置保存
   * 生成新的配置对象并调用保存回调
   */
  const handleSave = () => {
    const newConfig: FrpConfig = {
      id: config?.id || Date.now().toString(),
      name,
      config: configContent,
      isRunning: false,
      autoStart
    };
    onSave(newConfig);
  };

  /**
   * 处理配置名称变更
   * @param event - 输入事件
   */
  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  };

  /**
   * 处理配置内容变更
   * @param event - 输入事件
   */
  const handleConfigChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setConfigContent(event.target.value);
  };

  /**
   * 处理自动启动设置变更
   * @param event - 复选框事件
   */
  const handleAutoStartChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAutoStart(event.target.checked);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {config ? '编辑FRP配置' : '新建FRP配置'}
      </DialogTitle>
      <DialogContent>
        {/* 配置名称输入框 */}
        <TextField
          autoFocus
          margin="dense"
          label="配置名称"
          type="text"
          fullWidth
          value={name}
          onChange={handleNameChange}
          sx={{ mb: 2 }}
        />
        {/* 配置内容输入框 */}
        <TextField
          label="FRP配置内容 (TOML格式)"
          multiline
          rows={10}
          fullWidth
          value={configContent}
          onChange={handleConfigChange}
          sx={{ mb: 2 }}
        />
        {/* 自动启动设置 */}
        <FormControlLabel
          control={
            <Checkbox
              checked={autoStart}
              onChange={handleAutoStartChange}
            />
          }
          label="随程序启动"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default App; 