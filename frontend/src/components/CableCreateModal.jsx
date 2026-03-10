import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Form, Select, Input, Button, message, Space, Spin } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import axios from 'axios';
import { debounce } from '../utils/common';

const { Option } = Select;

const CableCreateModal = ({ visible, onClose, onSuccess, sourceDevice }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [sourcePorts, setSourcePorts] = useState([]);
  const [targetPorts, setTargetPorts] = useState([]);
  const [fetchingDevices, setFetchingDevices] = useState(false);
  const prevVisibleRef = useRef(false);

  const fetchDevices = useCallback(async (keyword = '') => {
    try {
      setFetchingDevices(true);
      const params = { pageSize: 50 };
      if (keyword && keyword.trim()) {
        params.keyword = keyword.trim();
      }
      const response = await axios.get('/api/devices', { params });
      setDevices(response.data.devices || []);
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      message.error('获取设备列表失败');
    } finally {
      setFetchingDevices(false);
    }
  }, []);

  const handleDeviceSearch = useCallback(
    debounce(value => {
      fetchDevices(value);
    }, 300),
    [fetchDevices]
  );

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      form.resetFields();
      if (sourceDevice) {
        form.setFieldsValue({
          sourceDeviceId: sourceDevice.deviceId || sourceDevice.id,
        });
        fetchDevicePorts(sourceDevice.deviceId || sourceDevice.id, 'source');
      }
      fetchDevices();
    }
    prevVisibleRef.current = visible;
  }, [visible, sourceDevice, form, fetchDevices]);

  const fetchDevicePorts = async (deviceId, type) => {
    if (!deviceId) {
      if (type === 'source') setSourcePorts([]);
      else setTargetPorts([]);
      return;
    }

    try {
      const response = await axios.get(`/api/device-ports/device/${deviceId}`);
      const ports = response.data || [];
      if (type === 'source') {
        setSourcePorts(ports);
      } else {
        setTargetPorts(ports);
      }
    } catch (error) {
      console.error(`Failed to fetch ${type} ports:`, error);
      message.error('获取端口列表失败');
    }
  };

  const handleSourceDeviceChange = deviceId => {
    form.setFieldsValue({ sourcePort: undefined });
    fetchDevicePorts(deviceId, 'source');
  };

  const handleTargetDeviceChange = deviceId => {
    form.setFieldsValue({ targetPort: undefined });
    fetchDevicePorts(deviceId, 'target');
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const sourceDev = devices.find(d => d.deviceId === values.sourceDeviceId);
      const targetDev = devices.find(d => d.deviceId === values.targetDeviceId);

      let payload = { ...values };

      if (sourceDev && targetDev && sourceDev.type !== 'switch' && targetDev.type === 'switch') {
        payload = {
          ...values,
          sourceDeviceId: values.targetDeviceId,
          sourcePort: values.targetPort,
          targetDeviceId: values.sourceDeviceId,
          targetPort: values.sourcePort,
        };
      }

      await axios.post('/api/cables', payload);

      message.success('接线创建成功');
      onSuccess?.();
      onClose();
    } catch (error) {
      if (error.errorFields) return;
      console.error('Failed to create cable:', error);
      message.error('接线创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <SwapOutlined style={{ color: '#1890ff' }} />
          <span>新增接线</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={600}
      maskClosable={false}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="源设备" name="sourceDeviceId" rules={[{ required: true, message: '请选择源设备' }]}>
          <Select
            showSearch
            filterOption={false}
            placeholder="搜索设备..."
            onSearch={handleDeviceSearch}
            onChange={handleSourceDeviceChange}
          >
            {devices.map(device => (
              <Option key={device.deviceId} value={device.deviceId}>
                {device.name} ({device.deviceId})
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="源端口" name="sourcePort" rules={[{ required: true, message: '请选择源端口' }]}>
          <Select
            placeholder="请先选择设备"
            disabled={!sourcePorts.length}
          >
            {sourcePorts.map(port => (
              <Option key={port.portId} value={port.portName}>
                {port.portName}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="目标设备" name="targetDeviceId" rules={[{ required: true, message: '请选择目标设备' }]}>
          <Select
            showSearch
            filterOption={false}
            placeholder="搜索设备..."
            onSearch={handleDeviceSearch}
            onChange={handleTargetDeviceChange}
          >
            {devices.map(device => (
              <Option key={device.deviceId} value={device.deviceId}>
                {device.name} ({device.deviceId})
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="目标端口" name="targetPort" rules={[{ required: true, message: '请选择目标端口' }]}>
          <Select
            placeholder="请先选择设备"
            disabled={!targetPorts.length}
          >
            {targetPorts.map(port => (
              <Option key={port.portId} value={port.portName}>
                {port.portName}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="备注" name="notes">
          <Input.TextArea placeholder="接线备注信息" rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CableCreateModal;
