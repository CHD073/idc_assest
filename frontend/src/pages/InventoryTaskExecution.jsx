import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Card,
  Space,
  Tag,
  Row,
  Col,
  Statistic,
  Progress,
  Descriptions,
  Empty,
  Badge,
  Tooltip,
  Tabs,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
  InboxOutlined,
  ScanOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { designTokens } from '../config/theme';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const InventoryTaskExecution = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [currentTask, setCurrentTask] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkModalVisible, setCheckModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('1');
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [recordPagination, setRecordPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const planId = searchParams.get('planId');

  const fetchPlan = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const res = await api.get(`/inventory/plans/${planId}`);
      setPlan(res.data.plan);
      setTasks(res.data.tasks || []);
    } catch (error) {
      message.error('获取盘点计划失败');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  const fetchTaskRecords = async (taskId) => {
    try {
      const res = await api.get(`/inventory/tasks/${taskId}`);
      setCurrentTask(res.data.task);
      setRecords(res.data.records || []);
      setRecordPagination(prev => ({ ...prev, total: res.data.records?.length || 0, current: 1 }));
      setSelectedRowKeys([]);
      setActiveTab('2');
    } catch (error) {
      message.error('获取盘点记录失败');
    }
  };

  const filteredRecords = records.filter(record => {
    if (statusFilter && record.status !== statusFilter) return false;
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      return (
        (record.deviceName && record.deviceName.toLowerCase().includes(keyword)) ||
        (record.deviceId && record.deviceId.toLowerCase().includes(keyword)) ||
        (record.serialNumber && record.serialNumber.toLowerCase().includes(keyword))
      );
    }
    return true;
  });

  const handleBatchCheck = async (status) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要盘点的记录');
      return;
    }
    setBatchLoading(true);
    try {
      const promises = selectedRowKeys.map(recordId => 
        api.post(`/inventory/records/${recordId}/check`, {
          status,
          checkedAt: new Date().toISOString(),
        })
      );
      await Promise.all(promises);
      message.success(`已批量标记 ${selectedRowKeys.length} 条记录`);
      if (currentTask) {
        fetchTaskRecords(currentTask.taskId);
      }
    } catch (error) {
      message.error('批量操作失败');
    } finally {
      setBatchLoading(false);
      setSelectedRowKeys([]);
    }
  };

  const handleQuickCheckAll = async (status) => {
    const pendingRecords = filteredRecords.filter(r => r.status === 'pending');
    if (pendingRecords.length === 0) {
      message.info('没有待盘点的记录');
      return;
    }
    setBatchLoading(true);
    try {
      const promises = pendingRecords.map(record => 
        api.post(`/inventory/records/${record.recordId}/check`, {
          status,
          checkedAt: new Date().toISOString(),
        })
      );
      await Promise.all(promises);
      message.success(`已一键标记 ${pendingRecords.length} 条记录`);
      if (currentTask) {
        fetchTaskRecords(currentTask.taskId);
      }
    } catch (error) {
      message.error('操作失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleScan = async (sn) => {
    if (!sn || sn.trim() === '') return;
    
    const trimmedSN = sn.trim().toUpperCase();
    const matchedRecord = records.find(r => 
      r.serialNumber && r.serialNumber.toUpperCase() === trimmedSN
    );

    if (!matchedRecord) {
      setScanResult({ success: false, message: `未找到序列号为 "${sn}" 的设备`, sn: trimmedSN });
      setScanModalVisible(true);
      return;
    }

    if (matchedRecord.status !== 'pending') {
      setScanResult({ 
        success: false, 
        message: `设备 "${matchedRecord.deviceName}" 已盘点`, 
        record: matchedRecord,
        sn: trimmedSN 
      });
      setScanModalVisible(true);
      return;
    }

    try {
      await api.post(`/inventory/records/${matchedRecord.recordId}/check`, {
        status: 'normal',
        actualSerialNumber: matchedRecord.serialNumber,
        checkedAt: new Date().toISOString(),
      });
      setScanResult({ 
        success: true, 
        message: `设备 "${matchedRecord.deviceName}" 盘点成功！`, 
        record: matchedRecord,
        sn: trimmedSN 
      });
      setScanModalVisible(true);
      if (currentTask) {
        fetchTaskRecords(currentTask.taskId);
      }
    } catch (error) {
      message.error('盘点失败');
    }
  };

  const handleScanInput = (e) => {
    const value = e.target.value;
    setScanInput(value);
    if (value.includes('\n') || value.includes('\r')) {
      const sn = value.replace(/[\r\n]/g, '').trim();
      if (sn) {
        handleScan(sn);
        setScanInput('');
      }
    }
  };

  const handleScanKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const sn = e.target.value.trim();
      if (sn) {
        handleScan(sn);
        setScanInput('');
      }
    }
  };

  const handleScanClick = () => {
    const sn = scanInput.trim();
    if (sn) {
      handleScan(sn);
      setScanInput('');
    } else {
      message.warning('请输入序列号');
    }
  };

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handleCheck = (record) => {
    setCurrentRecord(record);
    form.setFieldsValue({
      actualSerialNumber: record.serialNumber,
      actualRackId: record.rackId,
      actualPosition: record.position,
      status: record.status === 'pending' ? null : record.status,
      remark: record.remark,
    });
    setCheckModalVisible(true);
  };

  const handleQuickCheck = async (record, status) => {
    try {
      await api.post(`/inventory/records/${record.recordId}/check`, {
        status,
        checkedAt: new Date().toISOString(),
      });
      message.success(status === 'normal' ? '标记正常' : '标记异常');
      if (currentTask) {
        fetchTaskRecords(currentTask.taskId);
      }
      fetchPlan();
    } catch (error) {
      message.error(error.response?.data?.error || '标记失败');
    }
  };

  const handleSubmitCheck = async (values) => {
    if (!currentRecord) return;
    try {
      await api.post(`/inventory/records/${currentRecord.recordId}/check`, {
        actualSerialNumber: values.actualSerialNumber,
        actualRackId: values.actualRackId,
        actualPosition: values.actualPosition,
        status: values.status,
        remark: values.remark,
      });
      message.success('盘点提交成功');
      setCheckModalVisible(false);
      if (currentTask) {
        fetchTaskRecords(currentTask.taskId);
      }
      fetchPlan();
    } catch (error) {
      message.error(error.response?.data?.error || '提交失败');
    }
  };

  const getStatusTag = (status) => {
    const statusMap = {
      pending: { color: 'default', text: '待盘点', icon: <ExclamationCircleOutlined /> },
      normal: { color: 'success', text: '正常', icon: <CheckCircleOutlined /> },
      abnormal: { color: 'error', text: '异常', icon: <CloseCircleOutlined /> },
      missed: { color: 'warning', text: '漏盘', icon: <ExclamationCircleOutlined /> },
    };
    const config = statusMap[status] || statusMap.pending;
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  const getAbnormalTypeTag = (type) => {
    const typeMap = {
      serial_mismatch: '序列号不符',
      position_mismatch: '位置不符',
      device_missing: '设备缺失',
      extra_device: '多出设备',
    };
    return typeMap[type] || type;
  };

  const taskColumns = [
    {
      title: '任务信息',
      key: 'taskInfo',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.targetName}</div>
          <div style={{ fontSize: '12px', color: designTokens.colors.text.tertiary }}>
            {record.targetType === 'room' ? '机房' : record.targetType === 'rack' ? '机柜' : '全部设备'}
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusMap = {
          pending: <Badge status="default" text="待执行" />,
          in_progress: <Badge status="processing" text="进行中" />,
          completed: <Badge status="success" text="已完成" />,
          skipped: <Badge status="warning" text="已跳过" />,
        };
        return statusMap[status] || status;
      },
    },
    {
      title: '设备进度',
      key: 'progress',
      width: 150,
      render: (_, record) => (
        <Progress
          percent={record.totalDevices > 0 ? Math.round((record.checkedDevices / record.totalDevices) * 100) : 0}
          size="small"
          format={() => `${record.checkedDevices}/${record.totalDevices}`}
        />
      ),
    },
    {
      title: '异常',
      dataIndex: 'abnormalDevices',
      key: 'abnormalDevices',
      width: 80,
      render: (count) => (count > 0 ? <Tag color="error">{count}</Tag> : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          onClick={() => {
            setCurrentTask(record);
            fetchTaskRecords(record.taskId);
          }}
        >
          查看详情
        </Button>
      ),
    },
  ];

  const recordColumns = [
    {
      title: '设备信息',
      key: 'deviceInfo',
      width: 180,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.deviceName}</div>
          <div style={{ fontSize: '12px', color: designTokens.colors.text.tertiary }}>
            {record.deviceId}
          </div>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'deviceType',
      key: 'deviceType',
      width: 80,
      render: (type) => {
        const typeMap = {
          server: '服务器',
          switch: '交换机',
          router: '路由器',
          storage: '存储设备',
          other: '其他',
        };
        return typeMap[type] || type;
      },
    },
    {
      title: '系统序列号',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      width: 140,
      render: (sn) => <code style={{ fontSize: '12px' }}>{sn}</code>,
    },
    {
      title: '实际序列号',
      dataIndex: 'actualSerialNumber',
      key: 'actualSerialNumber',
      width: 140,
      render: (sn, record) => (
        <div>
          {sn ? (
            <code style={{ fontSize: '12px' }}>{sn}</code>
          ) : (
            <span style={{ color: designTokens.colors.text.tertiary }}>-</span>
          )}
          {record.abnormalType === 'serial_mismatch' && (
            <Tag color="error" style={{ marginLeft: 4 }}>不符</Tag>
          )}
        </div>
      ),
    },
    {
      title: '系统位置',
      dataIndex: 'displayLocation',
      key: 'displayLocation',
      width: 180,
      render: (_, record) => (
        <span>{record.displayLocation || `${record.rackId} - U${record.position}`}</span>
      ),
    },
    {
      title: '实际位置',
      key: 'actualPosition',
      width: 100,
      render: (_, record) => (
        <div>
          {record.actualRackId ? (
            <div>{record.actualRackId} - U{record.actualPosition}</div>
          ) : (
            <span style={{ color: designTokens.colors.text.tertiary }}>-</span>
          )}
          {record.abnormalType === 'position_mismatch' && (
            <Tag color="error" style={{ marginLeft: 4 }}>不符</Tag>
          )}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status) => getStatusTag(status),
    },
    {
      title: '盘点人',
      dataIndex: ['Checker', 'realName'],
      key: 'checker',
      width: 90,
      render: (name) => name || '-',
    },
    {
      title: '盘点时间',
      dataIndex: 'checkedAt',
      key: 'checkedAt',
      width: 140,
      render: (date) => (date ? dayjs(date).format('MM-DD HH:mm') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          {record.status === 'pending' ? (
            <>
              <Tooltip title="标记正常">
                <Button
                  type="text"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleQuickCheck(record, 'normal')}
                  style={{ color: '#52c41a' }}
                />
              </Tooltip>
              <Tooltip title="标记异常">
                <Button
                  type="text"
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleQuickCheck(record, 'abnormal')}
                  style={{ color: '#ff4d4f' }}
                />
              </Tooltip>
            </>
          ) : null}
          <Button
            type="link"
            icon={<ScanOutlined />}
            onClick={() => handleCheck(record)}
          >
            盘点
          </Button>
        </Space>
      ),
    },
  ];

  const pageContainerStyle = {
    padding: '24px',
    background: designTokens.colors.bg,
    minHeight: '100vh',
  };

  if (!planId) {
    return (
      <div style={pageContainerStyle}>
        <Card bordered={false}>
          <Empty description="请选择要执行的盘点计划" />
        </Card>
      </div>
    );
  }

  return (
    <div style={pageContainerStyle}>
      <Card bordered={false} style={{ marginBottom: 16, borderRadius: 12 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <InboxOutlined style={{ fontSize: 32, color: designTokens.colors.primary.main }} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{plan?.name || '加载中...'}</div>
                <div style={{ fontSize: 12, color: designTokens.colors.text.secondary }}>
                  计划ID: {planId}
                </div>
              </div>
            </div>
          </Col>
          <Col>
            <Space>
              <Statistic
                title="总设备"
                value={plan?.totalDevices || 0}
              />
              <Statistic
                title="已盘点"
                value={plan?.checkedDevices || 0}
                valueStyle={{ color: '#52c41a' }}
              />
              <Statistic
                title="正常"
                value={plan?.normalDevices || 0}
                valueStyle={{ color: '#52c41a' }}
              />
              <Statistic
                title="异常"
                value={plan?.abnormalDevices || 0}
                valueStyle={{ color: '#ff4d4f' }}
              />
              <Statistic
                title="漏盘"
                value={plan?.missedDevices || 0}
                valueStyle={{ color: '#faad14' }}
              />
            </Space>
          </Col>
        </Row>
        {plan?.totalDevices > 0 && (
          <Progress
            percent={Math.round((plan.checkedDevices / plan.totalDevices) * 100)}
            status={plan.abnormalDevices > 0 ? 'exception' : 'active'}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: '1',
              label: '盘点任务',
              children: (
                <Table
                  columns={taskColumns}
                  dataSource={tasks}
                  rowKey="taskId"
                  pagination={false}
                  loading={loading}
                />
              ),
            },
            {
              key: '2',
              label: (
                <span>
                  盘点记录
                  {records.length > 0 && (
                    <Tag style={{ marginLeft: 8 }} color={plan?.status === 'completed' ? 'success' : 'processing'}>
                      {filteredRecords.length}/{records.length}
                    </Tag>
                  )}
                </span>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Select
                        placeholder="筛选状态"
                        variant="outlined"
                        style={{ width: 120, height: 32 }}
                        className="统一输入框"
                        allowClear
                        value={statusFilter}
                        onChange={(value) => {
                          setStatusFilter(value);
                          setRecordPagination(prev => ({ ...prev, current: 1 }));
                        }}
                      >
                        <Select.Option value="pending">待盘点</Select.Option>
                        <Select.Option value="normal">正常</Select.Option>
                        <Select.Option value="abnormal">异常</Select.Option>
                      </Select>
                      <Input
                        placeholder="搜索设备名称/ID/序列号"
                        variant="outlined"
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        style={{ width: 250, height: 32 }}
                        className="统一输入框"
                        allowClear
                        value={searchKeyword}
                        onChange={(e) => {
                          setSearchKeyword(e.target.value);
                          setRecordPagination(prev => ({ ...prev, current: 1 }));
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button 
                        type="primary"
                        size="small"
                        onClick={() => setScanModalVisible(true)}
                        icon={<ScanOutlined />}
                      >
                        扫码盘点
                      </Button>
                      <Button 
                        type="primary" 
                        size="small"
                        onClick={() => handleQuickCheckAll('normal')}
                        loading={batchLoading}
                        disabled={filteredRecords.filter(r => r.status === 'pending').length === 0}
                        icon={<CheckCircleOutlined />}
                      >
                        一键正常
                      </Button>
                      <Button 
                        danger
                        size="small"
                        onClick={() => handleQuickCheckAll('abnormal')}
                        loading={batchLoading}
                        disabled={filteredRecords.filter(r => r.status === 'pending').length === 0}
                        icon={<CloseCircleOutlined />}
                      >
                        一键异常
                      </Button>
                    </div>
                  </div>
                  
                  {records.length > 0 && (
                    <Progress 
                      percent={Math.round(((records.filter(r => r.status !== 'pending').length) / records.length) * 100)} 
                      status="active"
                      strokeColor={{ from: '#108ee9', to: '#87d068' }}
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  <Table
                    rowSelection={{
                      selectedRowKeys,
                      onChange: setSelectedRowKeys,
                    }}
                    columns={recordColumns}
                    dataSource={filteredRecords}
                    rowKey="recordId"
                    pagination={{ 
                      current: recordPagination.current, 
                      pageSize: recordPagination.pageSize, 
                      total: recordPagination.total,
                      showSizeChanger: true, 
                      showTotal: (total) => `共 ${total} 条`,
                      onChange: (page, pageSize) => {
                        setRecordPagination(prev => ({ ...prev, current: page, pageSize }));
                      }
                    }}
                    scroll={{ x: 1400 }}
                    loading={batchLoading}
                    locale={{
                      emptyText: <Empty description="暂无盘点记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={null}
        open={scanModalVisible}
        onCancel={() => {
          setScanModalVisible(false);
          setScanInput('');
        }}
        footer={null}
        width={560}
        centered
        closeIcon={null}
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: { borderRadius: 16, overflow: 'hidden' }
        }}
      >
        {/* 自定义 Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #69c0ff 0%, #b37feb 100%)',
          color: '#1f1f1f'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ScanOutlined style={{ fontSize: 20, color: '#fff' }} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>扫码盘点</span>
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => {
              setScanModalVisible(false);
              setScanInput('');
            }}
            style={{
              color: '#fff',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          />
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)', 
            borderRadius: 12, 
            padding: 24,
            marginBottom: 20,
            border: '1px solid #91d5ff'
          }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <ScanOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </div>
            <Input
              placeholder="请用扫码枪扫描或输入设备序列号..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleScanKeyPress}
              variant="outlined"
              style={{ 
                fontSize: 16, 
                textAlign: 'center', 
                height: 40,
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(24, 144, 255, 0.1)'
              }}
              suffix={
                <Button 
                  type="primary" 
                  size="small"
                  onClick={handleScanClick}
                  style={{ height: 32, borderRadius: 6 }}
                  icon={<CheckOutlined />}
                >
                  盘点
                </Button>
              }
              autoFocus
            />
            <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12, textAlign: 'center' }}>
              扫码枪扫描或手动输入序列号后按回车 / 点击盘点
            </div>
          </div>

          {scanResult && (
            <div style={{ 
              padding: 24, 
              borderRadius: 12,
              background: scanResult.success ? 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)' : 'linear-gradient(135deg, #fff2f0 0%, #ffccc7 100%)',
              border: `1px solid ${scanResult.success ? '#b7eb8f' : '#ffccc7'}`,
              marginBottom: 16,
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                {scanResult.success ? (
                  <div style={{ 
                    width: 64, 
                    height: 64, 
                    borderRadius: '50%', 
                    background: '#52c41a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto'
                  }}>
                    <CheckOutlined style={{ fontSize: 36, color: '#fff' }} />
                  </div>
                ) : (
                  <div style={{ 
                    width: 64, 
                    height: 64, 
                    borderRadius: '50%', 
                    background: '#ff4d4f',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto'
                  }}>
                    <CloseOutlined style={{ fontSize: 36, color: '#fff' }} />
                  </div>
                )}
              </div>
              <div style={{ 
                fontSize: 18, 
                fontWeight: 'bold', 
                textAlign: 'center', 
                marginBottom: 16,
                color: scanResult.success ? '#52c41a' : '#ff4d4f'
              }}>
                {scanResult.message}
              </div>
              {scanResult.record && (
                <div style={{ 
                  background: 'rgba(255,255,255,0.7)', 
                  borderRadius: 8, 
                  padding: 16,
                  fontSize: 13,
                  color: '#595959'
                }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <div style={{ marginBottom: 8 }}>
                        <Tag color="blue">设备ID</Tag>
                        <span>{scanResult.record.deviceId}</span>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <Tag color="cyan">设备名称</Tag>
                        <span>{scanResult.record.deviceName}</span>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ marginBottom: 8 }}>
                        <Tag color="purple">序列号</Tag>
                        <span style={{ fontFamily: 'monospace' }}>{scanResult.record.serialNumber}</span>
                      </div>
                      <div>
                        <Tag color="orange">当前位置</Tag>
                        <span>{scanResult.record.displayLocation || `${scanResult.record.rackId} - U${scanResult.record.position}`}</span>
                      </div>
                    </Col>
                  </Row>
                </div>
              )}
            </div>
          )}

          {scanResult && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button 
                size="large" 
                onClick={() => {
                  setScanResult(null);
                  setScanInput('');
                }}
                icon={<ScanOutlined />}
                style={{ borderRadius: 8 }}
              >
                继续扫描
              </Button>
              <Button 
                type="primary" 
                size="large" 
                onClick={() => {
                  setScanModalVisible(false);
                  setScanInput('');
                  setScanResult(null);
                }}
                style={{ borderRadius: 8 }}
              >
                完成盘点
              </Button>
            </div>
          )}

          {!scanResult && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Statistic 
                title="今日已盘点" 
                value={records.filter(r => r.status !== 'pending').length} 
                suffix={`/ ${records.length}`}
                valueStyle={{ color: '#52c41a', fontWeight: 'bold' }}
              />
              <Progress 
                percent={records.length > 0 ? Math.round((records.filter(r => r.status !== 'pending').length / records.length) * 100) : 0} 
                strokeColor={{ from: '#1890ff', to: '#52c41a' }}
                style={{ marginTop: 12 }}
              />
            </div>
          )}
        </div>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </Modal>

      <Modal
        title="设备盘点"
        open={checkModalVisible}
        onCancel={() => setCheckModalVisible(false)}
        footer={null}
        width={600}
      >
        {currentRecord && (
          <Form form={form} layout="vertical" onFinish={handleSubmitCheck}>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="设备ID">{currentRecord.deviceId}</Descriptions.Item>
              <Descriptions.Item label="设备名称">{currentRecord.deviceName}</Descriptions.Item>
              <Descriptions.Item label="系统序列号">{currentRecord.serialNumber}</Descriptions.Item>
              <Descriptions.Item label="系统位置">{currentRecord.displayLocation || `${currentRecord.rackId} - U${currentRecord.position}`}</Descriptions.Item>
            </Descriptions>

            <Form.Item
              name="actualSerialNumber"
              label="实际序列号"
            >
              <Input placeholder="请输入实际序列号" />
            </Form.Item>

            <Form.Item
              name="actualRackId"
              label="实际机柜"
            >
              <Input placeholder="请输入实际机柜ID" />
            </Form.Item>

            <Form.Item
              name="actualPosition"
              label="实际位置(U)"
            >
              <Input type="number" placeholder="请输入实际位置" />
            </Form.Item>

            <Form.Item
              name="status"
              label="盘点结果"
              rules={[{ required: true, message: '请选择盘点结果' }]}
            >
              <Select placeholder="请选择盘点结果">
                <Select.Option value="normal">
                  <Badge status="success" text="正常" />
                </Select.Option>
                <Select.Option value="abnormal">
                  <Badge status="error" text="异常" />
                </Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="remark"
              label="备注"
            >
              <Input.TextArea rows={2} placeholder="请输入备注（如有异常请说明原因）" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setCheckModalVisible(false)}>取消</Button>
                <Button type="primary" htmlType="submit">
                  提交
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default InventoryTaskExecution;
