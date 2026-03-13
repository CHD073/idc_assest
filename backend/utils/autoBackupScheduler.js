/**
 * 自动备份调度器模块
 * 使用 node-cron 实现定时自动备份功能
 */

const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { createBackup, createIncrementalBackup, getBackupPath } = require('./backup');

// 全局调度器存储
const schedulers = new Map();

// 备份设置文件路径
const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'auto-backup-settings.json');

// 默认设置
const DEFAULT_SETTINGS = {
  enabled: false,
  cronExpression: '0 2 * * *', // 每天凌晨 2 点
  description: '自动备份',
  backupType: 'full', // 'full' 或 'incremental'
  includeFiles: true,
  compress: true,
  maxCount: 30,
  maxAgeDays: 90,
};

/**
 * 加载备份设置
 */
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    }
  } catch (error) {
    console.error('加载自动备份设置失败:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 保存备份设置
 */
function saveSettings(settings) {
  try {
    const configDir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('保存自动备份设置失败:', error);
    return false;
  }
}

/**
 * 验证 Cron 表达式
 */
function validateCronExpression(expression) {
  return cron.validate(expression);
}

/**
 * 将中文时间转换为 Cron 表达式
 */
function timeToCron(hour, minute) {
  return `${minute} ${hour} * * *`;
}

/**
 * 创建自动备份任务
 */
function createAutoBackupTask(settings) {
  const { cronExpression, description, backupType, includeFiles, compress, maxCount, maxAgeDays } = settings;

  if (!validateCronExpression(cronExpression)) {
    throw new Error('无效的 Cron 表达式');
  }

  // 如果已有调度器，先停止
  if (schedulers.has('auto-backup')) {
    stopAutoBackup();
  }

  // 创建新的调度器
  const task = cron.schedule(cronExpression, async () => {
    console.log('=== 开始执行自动备份 ===');
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      
      // 根据备份类型选择函数
      const backupFunction = backupType === 'incremental' ? createIncrementalBackup : createBackup;
      
      const result = await backupFunction({
        description: `${description} - ${timestamp}`,
        includeFiles,
        compress,
        autoClean: true,
        maxCount,
        maxAgeDays,
      });

      if (result) {
        console.log('自动备份完成:', result.filename);
        console.log(`备份类型：${result.isIncremental ? '增量备份' : '全量备份'}`);
        console.log('========================\n');
      } else {
        console.log('无数据变化，跳过备份');
      }
    } catch (error) {
      console.error('自动备份失败:', error);
      console.error('========================\n');
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai', // 设置时区为中国时区
  });

  schedulers.set('auto-backup', task);
  console.log(`自动备份任务已启动，Cron 表达式：${cronExpression}, 备份类型：${backupType}`);

  return task;
}

/**
 * 启动自动备份
 */
function startAutoBackup(settings = null) {
  if (!settings) {
    settings = loadSettings();
  }

  if (!settings.enabled) {
    console.log('自动备份已禁用');
    return false;
  }

  try {
    createAutoBackupTask(settings);
    return true;
  } catch (error) {
    console.error('启动自动备份失败:', error.message);
    return false;
  }
}

/**
 * 停止自动备份
 */
function stopAutoBackup() {
  if (schedulers.has('auto-backup')) {
    const task = schedulers.get('auto-backup');
    task.stop();
    schedulers.delete('auto-backup');
    console.log('自动备份任务已停止');
    return true;
  }
  return false;
}

/**
 * 获取自动备份状态
 */
function getAutoBackupStatus() {
  const settings = loadSettings();
  const isActive = schedulers.has('auto-backup');

  // 计算下次执行时间
  let nextRun = null;
  if (isActive && settings.enabled) {
    // 简单计算下次执行时间（基于当前时间和 Cron 表达式）
    const now = new Date();
    const [minute, hour] = settings.cronExpression.split(' ').slice(0, 2);
    
    const next = new Date(now);
    next.setHours(parseInt(hour), parseInt(minute), 0, 0);
    
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    
    nextRun = next.toISOString();
  }

  return {
    enabled: settings.enabled,
    isActive,
    cronExpression: settings.cronExpression,
    description: settings.description,
    backupType: settings.backupType || 'full',
    includeFiles: settings.includeFiles,
    compress: settings.compress,
    maxCount: settings.maxCount,
    maxAgeDays: settings.maxAgeDays,
    nextRun,
  };
}

/**
 * 更新自动备份设置
 */
function updateAutoBackupSettings(newSettings) {
  const currentSettings = loadSettings();
  const updatedSettings = { ...currentSettings, ...newSettings };

  // 如果提供了小时和分钟，转换为 Cron 表达式
  if (newSettings.hour !== undefined && newSettings.minute !== undefined) {
    updatedSettings.cronExpression = timeToCron(newSettings.hour, newSettings.minute);
    delete updatedSettings.hour;
    delete updatedSettings.minute;
  }

  // 验证 Cron 表达式
  if (!validateCronExpression(updatedSettings.cronExpression)) {
    throw new Error('无效的 Cron 表达式');
  }

  // 保存设置
  if (saveSettings(updatedSettings)) {
    // 如果启用了自动备份，重新启动调度器
    if (updatedSettings.enabled) {
      startAutoBackup(updatedSettings);
    } else {
      stopAutoBackup();
    }
    return true;
  }

  return false;
}

/**
 * 立即执行一次备份
 */
async function executeBackupNow(options = {}) {
  console.log('=== 手动触发备份 ===');
  try {
    const settings = loadSettings();
    const result = await createBackup({
      description: options.description || '手动备份',
      includeFiles: options.includeFiles !== undefined ? options.includeFiles : settings.includeFiles,
      compress: options.compress !== undefined ? options.compress : settings.compress,
      autoClean: true,
      maxCount: settings.maxCount,
      maxAgeDays: settings.maxAgeDays,
    });

    console.log('手动备份完成:', result.filename);
    console.log('====================\n');
    return { success: true, result };
  } catch (error) {
    console.error('手动备份失败:', error);
    console.error('====================\n');
    return { success: false, error: error.message };
  }
}

/**
 * 初始化自动备份（服务器启动时调用）
 */
function initAutoBackup() {
  console.log('初始化自动备份...');
  const settings = loadSettings();
  
  if (settings.enabled) {
    startAutoBackup(settings);
  } else {
    console.log('自动备份当前为禁用状态');
  }

  return getAutoBackupStatus();
}

module.exports = {
  loadSettings,
  saveSettings,
  validateCronExpression,
  timeToCron,
  startAutoBackup,
  stopAutoBackup,
  getAutoBackupStatus,
  updateAutoBackupSettings,
  executeBackupNow,
  initAutoBackup,
};
