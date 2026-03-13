const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  getBackupPath,
  ensureBackupDir,
  createBackup,
  validateBackupFile,
  restoreBackup,
  cleanOldBackups,
} = require('../utils/backup');
const {
  loadSettings,
  saveSettings,
  validateCronExpression,
  timeToCron,
  startAutoBackup,
  stopAutoBackup,
  getAutoBackupStatus,
  updateAutoBackupSettings,
  executeBackupNow,
} = require('../utils/autoBackupScheduler');

const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

router.post('/', async (req, res) => {
  try {
    const { description = '', includeFiles = true } = req.body;

    console.log('开始创建备份...');
    const result = await createBackup({
      description,
      includeFiles: includeFiles !== false,
    });

    res.json({
      success: true,
      message: '备份创建成功',
      data: result,
    });
  } catch (error) {
    console.error('创建备份失败:', error);
    res.status(500).json({
      success: false,
      message: '创建备份失败',
      error: error.message,
    });
  }
});

router.get('/list', async (req, res) => {
  try {
    const backupPath = getBackupPath();

    if (!fs.existsSync(backupPath)) {
      return res.json({
        success: true,
        data: { backups: [], total: 0 },
      });
    }

    const files = fs.readdirSync(backupPath)
      .filter(f => (f.startsWith('backup_') || f.startsWith('uploaded_')) && (f.endsWith('.json') || f.endsWith('.json.gz')))
      .map(async f => {
        const filePath = path.join(backupPath, f);
        const stats = fs.statSync(filePath);
        const isCompressed = f.endsWith('.gz');
        
        // 尝试从文件内容中提取元数据
        let metadata = {
          filename: f,
          size: stats.size,
          compressed: isCompressed,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
        };
        
        try {
          // 读取文件头部的元数据信息
          let content;
          if (isCompressed) {
            const compressed = fs.readFileSync(filePath);
            content = zlib.gunzipSync(compressed).toString('utf8');
          } else {
            content = fs.readFileSync(filePath, 'utf8');
          }
          
          const backupData = JSON.parse(content);
          
          // 提取关键元数据
          metadata.description = backupData.description || '';
          metadata.backupType = backupData.backupType || 'full';
          metadata.version = backupData.version || '1.0.0';
          metadata.timestamp = backupData.timestamp;
          metadata.checksum = backupData.checksum;
          metadata.metadata = backupData.metadata;
          metadata.systemInfo = backupData.systemInfo;
          
          // 判断是否为上传的文件（通过文件名判断）
          metadata.isUploaded = f.startsWith('uploaded_');
          
        } catch (error) {
          // 如果读取失败，标记为无效文件
          metadata.invalid = true;
          metadata.error = '无法读取文件内容';
        }
        
        return metadata;
      });
    
    const resolvedFiles = await Promise.all(files);

    res.json({
      success: true,
      data: { backups: resolvedFiles, total: resolvedFiles.length },
    });
  } catch (error) {
    console.error('获取备份列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取备份列表失败',
      error: error.message,
    });
  }
});

router.get('/validate/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const backupPath = getBackupPath();
    const filePath = path.join(backupPath, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '备份文件不存在',
      });
    }

    const validation = await validateBackupFile(filePath);

    res.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    console.error('验证备份文件失败:', error);
    res.status(500).json({
      success: false,
      message: '验证备份文件失败',
      error: error.message,
    });
  }
});

router.post('/restore', async (req, res) => {
  try {
    const { filename, options = {} } = req.body;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: '请提供备份文件名',
      });
    }

    const backupPath = getBackupPath();
    const filePath = path.join(backupPath, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '备份文件不存在',
      });
    }

    console.log(`开始恢复备份: ${filename}`);

    const result = await restoreBackup(filePath, {
      overwriteExisting: options.overwriteExisting !== false,
      skipTables: options.skipTables || [],
      skipFiles: options.skipFiles === true,
      onProgress: (tableName, status, count) => {
        console.log(`  ${tableName}: ${status}${count ? ` (${count})` : ''}`);
      },
    });

    res.json({
      success: true,
      message: '数据恢复成功',
      data: result,
    });
  } catch (error) {
    console.error('恢复备份失败:', error);
    res.status(500).json({
      success: false,
      message: '恢复备份失败',
      error: error.message,
    });
  }
});

router.post('/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.backup) {
      return res.status(400).json({
        success: false,
        message: '请上传备份文件',
      });
    }

    const backupFile = req.files.backup;
    const originalName = backupFile.name || '';
    const nameLower = originalName.toLowerCase();
    
    // 验证文件类型
    if (!nameLower.endsWith('.json') && !nameLower.endsWith('.gz')) {
      return res.status(400).json({
        success: false,
        message: '只支持 JSON 或 GZ 格式的备份文件',
      });
    }
    
    const isCompressed = nameLower.endsWith('.gz');
    
    console.log(`上传备份文件: ${originalName}, 压缩: ${isCompressed}, 大小: ${backupFile.size}`);

    // 保存到临时文件
    const tempFilename = `upload_${Date.now()}`;
    const tempPath = path.join(tempDir, tempFilename);
    
    await backupFile.mv(tempPath);

    const validation = await validateBackupFile(tempPath, { isCompressed });

    if (!validation.valid) {
      fs.unlinkSync(tempPath);
      return res.status(400).json({
        success: false,
        message: `备份文件验证失败: ${validation.error}`,
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const ext = isCompressed ? '.json.gz' : '.json';
    const newFilename = `uploaded_${timestamp}${ext}`;
    const backupPath = getBackupPath();
    ensureBackupDir(backupPath);
    const targetPath = path.join(backupPath, newFilename);

    fs.renameSync(tempPath, targetPath);

    res.json({
      success: true,
      message: '备份文件上传成功',
      data: {
        filename: newFilename,
        validation,
      },
    });
  } catch (error) {
    console.error('上传备份文件失败:', error);
    res.status(500).json({
      success: false,
      message: '上传备份文件失败',
      error: error.message,
    });
  }
});

router.get('/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const backupPath = getBackupPath();
    const filePath = path.join(backupPath, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '备份文件不存在',
      });
    }

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('下载备份文件失败:', err);
      }
    });
  } catch (error) {
    console.error('下载备份文件失败:', error);
    res.status(500).json({
      success: false,
      message: '下载备份文件失败',
      error: error.message,
    });
  }
});

router.delete('/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const backupPath = getBackupPath();
    const filePath = path.join(backupPath, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '备份文件不存在',
      });
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: '备份文件已删除',
      data: { filename },
    });
  } catch (error) {
    console.error('删除备份文件失败:', error);
    res.status(500).json({
      success: false,
      message: '删除备份文件失败',
      error: error.message,
    });
  }
});

router.get('/info', (req, res) => {
  try {
    const backupPath = getBackupPath();
    let totalSize = 0;
    let backupCount = 0;

    if (fs.existsSync(backupPath)) {
      const files = fs.readdirSync(backupPath).filter(f => f.endsWith('.json') || f.endsWith('.json.gz'));
      backupCount = files.length;
      files.forEach(f => {
        const stats = fs.statSync(path.join(backupPath, f));
        totalSize += stats.size;
      });
    }

    res.json({
      success: true,
      data: {
        backupPath,
        backupCount,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
      },
    });
  } catch (error) {
    console.error('获取备份信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取备份信息失败',
      error: error.message,
    });
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

router.post('/clean', (req, res) => {
  try {
    const { maxCount = 30, maxAgeDays = 90, dryRun = false } = req.body;

    const result = cleanOldBackups({ maxCount, maxAgeDays, dryRun });

    res.json({
      success: true,
      message: dryRun ? '预览完成' : '清理完成',
      data: result,
    });
  } catch (error) {
    console.error('清理备份失败:', error);
    res.status(500).json({
      success: false,
      message: '清理备份失败',
      error: error.message,
    });
  }
});

router.use((error, req, res, next) => {
  console.error('路由错误:', error);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: error.message,
  });
});

// ==================== 自动备份接口 ====================

// 获取自动备份状态
router.get('/auto/status', (req, res) => {
  try {
    const status = getAutoBackupStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('获取自动备份状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取自动备份状态失败',
      error: error.message,
    });
  }
});

// 更新自动备份设置
router.post('/auto/settings', (req, res) => {
  try {
    const {
      enabled,
      hour,
      minute,
      cronExpression,
      description,
      includeFiles,
      compress,
      maxCount,
      maxAgeDays,
    } = req.body;

    const newSettings = {};
    if (enabled !== undefined) newSettings.enabled = enabled;
    if (hour !== undefined || minute !== undefined) {
      newSettings.hour = hour || 2;
      newSettings.minute = minute || 0;
    }
    if (cronExpression) {
      if (!validateCronExpression(cronExpression)) {
        return res.status(400).json({
          success: false,
          message: '无效的 Cron 表达式',
        });
      }
      newSettings.cronExpression = cronExpression;
    }
    if (description) newSettings.description = description;
    if (includeFiles !== undefined) newSettings.includeFiles = includeFiles;
    if (compress !== undefined) newSettings.compress = compress;
    if (maxCount !== undefined) newSettings.maxCount = maxCount;
    if (maxAgeDays !== undefined) newSettings.maxAgeDays = maxAgeDays;

    const success = updateAutoBackupSettings(newSettings);
    if (success) {
      const status = getAutoBackupStatus();
      res.json({
        success: true,
        message: '自动备份设置已更新',
        data: status,
      });
    } else {
      res.status(500).json({
        success: false,
        message: '保存设置失败',
      });
    }
  } catch (error) {
    console.error('更新自动备份设置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新自动备份设置失败',
      error: error.message,
    });
  }
});

// 立即执行备份
router.post('/auto/execute', async (req, res) => {
  try {
    const { description, includeFiles, compress } = req.body;
    
    const result = await executeBackupNow({
      description: description || '手动触发备份',
      includeFiles,
      compress,
    });

    if (result.success) {
      res.json({
        success: true,
        message: '备份执行成功',
        data: result.result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    console.error('立即执行备份失败:', error);
    res.status(500).json({
      success: false,
      message: '立即执行备份失败',
      error: error.message,
    });
  }
});

// 测试 Cron 表达式
router.post('/auto/test-cron', (req, res) => {
  try {
    const { cronExpression } = req.body;
    
    if (!cronExpression) {
      return res.status(400).json({
        success: false,
        message: '请提供 Cron 表达式',
      });
    }

    const isValid = validateCronExpression(cronExpression);
    
    res.json({
      success: isValid,
      message: isValid ? 'Cron 表达式有效' : 'Cron 表达式无效',
      data: {
        valid: isValid,
        cronExpression,
      },
    });
  } catch (error) {
    console.error('测试 Cron 表达式失败:', error);
    res.status(500).json({
      success: false,
      message: '测试 Cron 表达式失败',
      error: error.message,
    });
  }
});

module.exports = router;
