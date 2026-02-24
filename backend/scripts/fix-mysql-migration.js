/**
 * MySQL 数据库字段修复脚本
 * 添加缺失的 isConsumableDeleted 字段和 consumableSnapshot 字段
 */

const { sequelize, DB_TYPE, dbDialect } = require('../db');

async function fix() {
  try {
    console.log('开始修复 MySQL 数据库字段...');
    console.log(`DB_TYPE: ${DB_TYPE}, dbDialect: ${dbDialect}`);

    const actualDbType = dbDialect || DB_TYPE;
    if (actualDbType !== 'mysql') {
      console.log(`当前数据库类型是 ${actualDbType}，不是 MySQL，跳过修复`);
      process.exit(0);
    }

    // 检查字段是否存在
    const [columns] = await sequelize.query(
      `SHOW COLUMNS FROM consumable_logs LIKE 'isConsumableDeleted'`
    );

    if (columns.length === 0) {
      console.log('添加 isConsumableDeleted 字段...');
      await sequelize.query(`
        ALTER TABLE consumable_logs
        ADD COLUMN isConsumableDeleted BOOLEAN DEFAULT FALSE COMMENT '关联耗材是否已被删除'
      `);
      console.log('✓ 添加成功');
    } else {
      console.log('✓ isConsumableDeleted 字段已存在');
    }

    // 检查 consumableSnapshot 字段
    const [snapshotColumns] = await sequelize.query(
      `SHOW COLUMNS FROM consumable_logs LIKE 'consumableSnapshot'`
    );

    if (snapshotColumns.length === 0) {
      console.log('添加 consumableSnapshot 字段...');
      await sequelize.query(`
        ALTER TABLE consumable_logs
        ADD COLUMN consumableSnapshot JSON DEFAULT NULL COMMENT '耗材快照信息'
      `);
      console.log('✓ 添加成功');
    } else {
      console.log('✓ consumableSnapshot 字段已存在');
    }

    // 检查 relatedId 字段
    const [relatedColumns] = await sequelize.query(
      `SHOW COLUMNS FROM consumable_logs LIKE 'relatedId'`
    );

    if (relatedColumns.length === 0) {
      console.log('添加 relatedId 字段...');
      await sequelize.query(`
        ALTER TABLE consumable_logs
        ADD COLUMN relatedId VARCHAR(255) DEFAULT NULL COMMENT '关联归档ID'
      `);
      console.log('✓ 添加成功');
    } else {
      console.log('✓ relatedId 字段已存在');
    }

    // 检查索引是否存在
    const [indexes] = await sequelize.query(
      `SHOW INDEX FROM consumable_logs WHERE Key_name = 'consumable_logs_is_consumable_deleted'`
    );

    if (indexes.length === 0) {
      console.log('添加索引...');
      await sequelize.query(`
        ALTER TABLE consumable_logs
        ADD INDEX consumable_logs_is_consumable_deleted (isConsumableDeleted)
      `);
      console.log('✓ 索引添加成功');
    } else {
      console.log('✓ 索引已存在');
    }

    // 创建归档表
    console.log('\n检查归档表...');
    const [archiveTables] = await sequelize.query(
      `SHOW TABLES LIKE 'consumable_log_archives'`
    );

    if (archiveTables.length === 0) {
      console.log('创建归档表...');
      await sequelize.query(`
        CREATE TABLE consumable_log_archives (
          id INTEGER PRIMARY KEY AUTO_INCREMENT,
          archiveId VARCHAR(255) NOT NULL UNIQUE COMMENT '归档记录唯一标识',
          consumableId VARCHAR(255) NOT NULL COMMENT '被删除的耗材ID',
          consumableName VARCHAR(255) NOT NULL COMMENT '耗材名称',
          consumableSnapshot JSON DEFAULT NULL COMMENT '耗材快照信息',
          totalOperations INTEGER DEFAULT 0 COMMENT '操作记录总数',
          firstOperationAt DATETIME COMMENT '首次操作时间',
          lastOperationAt DATETIME COMMENT '最后操作时间',
          totalInQuantity INTEGER DEFAULT 0 COMMENT '总入库数量',
          totalOutQuantity INTEGER DEFAULT 0 COMMENT '总出库数量',
          finalStock INTEGER DEFAULT 0 COMMENT '删除时库存',
          deletedBy VARCHAR(255) COMMENT '删除人',
          deletedAt DATETIME COMMENT '删除时间',
          deleteReason VARCHAR(255) COMMENT '删除原因',
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_consumable_id (consumableId),
          INDEX idx_archive_id (archiveId),
          INDEX idx_deleted_at (deletedAt),
          INDEX idx_consumable_deleted (consumableId, deletedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='耗材操作日志归档表'
      `);
      console.log('✓ 归档表创建成功');
    } else {
      console.log('✓ 归档表已存在');
    }

    console.log('\n数据库修复完成！');
    process.exit(0);
  } catch (error) {
    console.error('修复失败:', error);
    process.exit(1);
  }
}

fix();
