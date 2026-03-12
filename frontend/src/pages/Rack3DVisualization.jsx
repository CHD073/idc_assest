import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Layout,
  Select,
  Card,
  Spin,
  message,
  Typography,
  Descriptions,
  Tag,
  Button,
  Space,
  Empty,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Checkbox,
  Switch,
} from 'antd';
import {
  CloudServerOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  InfoCircleOutlined,
  UpOutlined,
  DownOutlined,
  EditOutlined,
  SettingOutlined,
  FullscreenOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import Scene from '../components/3d/Scene';
import NetworkCardCreateModal from '../components/NetworkCardCreateModal';
import PortCreateModal from '../components/PortCreateModal';
import CableCreateModal from '../components/CableCreateModal';
import DeviceDetailDrawer from '../components/DeviceDetailDrawer';
import CloseButton from '../components/CloseButton';
import { useScene3D } from '../context/Scene3DContext';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const Rack3DVisualization = () => {
  const navigate = useNavigate();

  // Scene 组件的 ref，用于调用重置视角方法
  const sceneRef = useRef(null);

  // 使用 Scene3DContext 管理3D场景状态
  const {
    devices,
    setDevices,
    selectedDevice,
    setSelectedDevice,
    hoveredDevice,
    setHoveredDevice,
    deviceSlideEnabled,
    setDeviceSlideEnabled,
    selectedRack,
    setSelectedRack,
    racks,
    setRacks,
    deviceCables,
    setDeviceCables,
    loadingDevices,
    setLoadingDevices,
  } = useScene3D();

  const [selectedRoom, setSelectedRoom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRackInfoCollapsed, setIsRackInfoCollapsed] = useState(false); // Rack Info Card collapsed state

  // Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [form] = Form.useForm();

  // Field configuration state
  const [tooltipFields, setTooltipFields] = useState({});
  const [showTooltipConfig, setShowTooltipConfig] = useState(false);
  const [loadingTooltipFields, setLoadingTooltipFields] = useState(false);
  const [savingTooltipConfig, setSavingTooltipConfig] = useState(false);

  // Add Port/NIC/Cable Modal State
  const [nicModalVisible, setNicModalVisible] = useState(false);
  const [portModalVisible, setPortModalVisible] = useState(false);
  const [cableModalVisible, setCableModalVisible] = useState(false);
  const [operatingDevice, setOperatingDevice] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 使用 ref 存储模态框状态，避免 handleDeviceHover 频繁重新创建
  const modalsOpenRef = useRef(false);

  // 同步 ref 与 state
  useEffect(() => {
    modalsOpenRef.current =
      modalVisible || nicModalVisible || portModalVisible || cableModalVisible;
  }, [modalVisible, nicModalVisible, portModalVisible, cableModalVisible]);

  const fetchDeviceCables = useCallback(async deviceId => {
    if (!deviceId) return;
    try {
      const response = await axios.get(`/api/cables/device/${deviceId}`);
      setDeviceCables(response.data || []);
    } catch (error) {
      console.error('Failed to fetch device cables:', error);
      setDeviceCables([]);
    }
  }, []);

  const handleAddNic = device => {
    setOperatingDevice(device);
    setNicModalVisible(true);
  };

  const handleAddPort = device => {
    setOperatingDevice(device);
    setPortModalVisible(true);
  };

  const handleAddCable = device => {
    setOperatingDevice(device);
    setCableModalVisible(true);
  };

  // Handle Edit Device Click
  const handleEditDevice = device => {
    setEditingDevice(device);
    setModalVisible(true);
  };

  // 当 Modal 打开时，初始化表单数据
  useEffect(() => {
    if (modalVisible && editingDevice) {
      // Prepare form data (similar to DeviceManagement)
      const deviceData = { ...editingDevice };
      if (deviceData.purchaseDate) deviceData.purchaseDate = dayjs(deviceData.purchaseDate);
      if (deviceData.warrantyExpiry) deviceData.warrantyExpiry = dayjs(deviceData.warrantyExpiry);

      // Fixed fields
      const fixedFields = [
        'deviceId',
        'name',
        'type',
        'model',
        'serialNumber',
        'rackId',
        'position',
        'height',
        'powerConsumption',
        'status',
        'purchaseDate',
        'warrantyExpiry',
        'ipAddress',
        'description',
      ];

      const cleanDeviceData = {};
      fixedFields.forEach(field => {
        if (deviceData[field] !== undefined) {
          cleanDeviceData[field] = deviceData[field];
        }
      });

      // Custom fields if any (simplified for 3D view context)
      if (deviceData.customFields && typeof deviceData.customFields === 'object') {
        Object.entries(deviceData.customFields).forEach(([key, value]) => {
          cleanDeviceData[key] = value;
        });
      }

      form.setFieldsValue(cleanDeviceData);
    }
  }, [modalVisible, editingDevice, form]);

  const handleModalCancel = () => {
    setModalVisible(false);
    setEditingDevice(null);
    form.resetFields();
  };

  const handleModalSubmit = async values => {
    try {
      const deviceData = {
        ...values,
        purchaseDate: values.purchaseDate ? values.purchaseDate.format('YYYY-MM-DD') : null,
        warrantyExpiry: values.warrantyExpiry ? values.warrantyExpiry.format('YYYY-MM-DD') : null,
      };

      if (editingDevice) {
        await axios.put(`/api/devices/${editingDevice.deviceId || editingDevice.id}`, deviceData);
        message.success('设备更新成功');

        // Refresh devices
        if (selectedRack) {
          fetchDevices(selectedRack.rackId);
        }
        setModalVisible(false);
        setEditingDevice(null);
      }
    } catch (error) {
      message.error('设备更新失败');
      console.error(error);
    }
  };

  // Fetch Racks
  const fetchRacks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/racks', { params: { pageSize: 1000 } });
      const racksArray = response.data.racks || [];
      // Filter valid racks
      const validRacks = racksArray.filter(r => r && r.rackId && typeof r.height === 'number');
      setRacks(validRacks);

      if (validRacks.length > 0) {
        // Default select first rack
        const firstRack = validRacks[0];
        setSelectedRack(firstRack);
        if (firstRack?.Room) {
          const roomKey = firstRack.Room.roomId || firstRack.Room.id || firstRack.Room.name;
          setSelectedRoom(roomKey);
        }
      }
    } catch (error) {
      console.error('Failed to fetch racks:', error);
      message.error('获取机柜列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Devices for Rack
  const fetchDevices = useCallback(async rackId => {
    if (!rackId) return;
    try {
      setLoadingDevices(true);
      const response = await axios.get(`/api/devices?rackId=${rackId}&pageSize=100`);

      let devicesData = [];
      if (Array.isArray(response.data)) {
        devicesData = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        devicesData = response.data.data;
      } else if (response.data && Array.isArray(response.data.devices)) {
        devicesData = response.data.devices;
      }

      // Process devices (ensure position/height are numbers)
      const validDevices = devicesData.filter(d => {
        if (!d.deviceId && !d.id) return false;

        // Normalize deviceId
        if (!d.deviceId && d.id) d.deviceId = d.id;

        let pos = d.position || d.u_position;
        let h = d.height || d.u_height || 1;
        if (typeof pos === 'string') pos = parseInt(pos, 10);
        if (typeof h === 'string') h = parseInt(h, 10);

        // Mutate for consistency
        d.position = pos;
        d.height = h;

        return typeof pos === 'number' && !isNaN(pos);
      });

      setDevices(validDevices);
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      message.error('获取设备列表失败');
      setDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  // Fetch Tooltip Fields from API
  const fetchTooltipDeviceFields = useCallback(async () => {
    try {
      setLoadingTooltipFields(true);
      const response = await axios.get('/api/deviceFields');
      const fields = response.data;

      const newTooltipFields = {};
      if (fields && fields.length > 0) {
        fields.forEach(field => {
          newTooltipFields[field.fieldName] = {
            label: field.displayName,
            enabled: field.visible,
            field: field.fieldName,
            fieldType: field.fieldType || 'text',
          };
        });
      }
      setTooltipFields(newTooltipFields);
    } catch (error) {
      console.error('Failed to fetch device fields:', error);
      message.error('获取字段配置失败');
    } finally {
      setLoadingTooltipFields(false);
    }
  }, []);

  const saveTooltipConfig = async () => {
    try {
      setSavingTooltipConfig(true);

      // Transform object to array for backend API
      const fieldConfigs = Object.values(tooltipFields).map(field => ({
        fieldName: field.field,
        visible: field.enabled,
        displayName: field.label,
        fieldType: field.fieldType,
      }));

      await axios.post('/api/deviceFields/config', fieldConfigs);
      message.success('字段配置保存成功');
      setShowTooltipConfig(false);

      // Refresh fields to sync with DB
      fetchTooltipDeviceFields();
    } catch (error) {
      console.error('Failed to save tooltip config:', error);
      message.error('保存失败');
    } finally {
      setSavingTooltipConfig(false);
    }
  };

  useEffect(() => {
    fetchRacks();
    fetchTooltipDeviceFields();
  }, [fetchRacks, fetchTooltipDeviceFields]);

  useEffect(() => {
    if (selectedRack?.rackId) {
      fetchDevices(selectedRack.rackId);
      setSelectedDevice(null); // Reset selection on rack change
    }
  }, [selectedRack, fetchDevices]);

  // Group racks by room
  const rooms = useMemo(() => {
    const roomMap = new Map();
    racks.forEach(rack => {
      if (rack?.Room) {
        const roomKey = rack.Room.roomId || rack.Room.id || rack.Room.name;
        if (!roomMap.has(roomKey)) {
          roomMap.set(roomKey, { ...rack.Room, key: roomKey });
        }
      }
    });
    return Array.from(roomMap.values());
  }, [racks]);

  const racksInSelectedRoom = useMemo(() => {
    if (!selectedRoom) return [];
    return racks.filter(r => {
      const rKey = r.Room?.roomId || r.Room?.id || r.Room?.name;
      return rKey === selectedRoom;
    });
  }, [selectedRoom, racks]);

  // 使用 useCallback 稳定回调函数引用，避免 DeviceModel 不必要的重渲染
  const handleDeviceClick = useCallback(
    device => {
      setSelectedDevice(device);
      if (device) {
        fetchDeviceCables(device.deviceId || device.id);
      }
    },
    [fetchDeviceCables]
  );

  const handleDeviceLeave = device => {
    // 移除鼠标离开事件，避免抽屉意外关闭
    // setSelectedDevice((current) => {
    //     const deviceId = device.deviceId || device.id;
    //     const currentId = current?.deviceId || current?.id;
    //     return currentId === deviceId ? null : current;
    // });
  };

  // 优化 handleDeviceHover - 使用 ref 获取最新状态，减少依赖项
  const handleDeviceHover = useCallback(device => {
    // 使用 ref 检查模态框状态，避免频繁重新创建回调
    if (modalsOpenRef.current) return;
    setHoveredDevice(device);
  }, []); // 空依赖项，回调引用永远稳定

  const handleClosePortModal = useCallback(() => {
    setPortModalVisible(false);
    setOperatingDevice(null);
  }, []);

  const handlePortSuccess = useCallback(() => {
    message.success('端口添加成功');
  }, []);

  const handleCloseNicModal = useCallback(() => {
    setNicModalVisible(false);
    setOperatingDevice(null);
  }, []);

  const handleNicSuccess = useCallback(() => {
    message.success('网卡添加成功');
  }, []);

  const handleCloseCableModal = useCallback(() => {
    setCableModalVisible(false);
    setOperatingDevice(null);
  }, []);

  const handleCableSuccess = useCallback(() => {
    message.success('接线添加成功');
    setRefreshTrigger(prev => prev + 1);
    if (selectedDevice) {
      fetchDeviceCables(selectedDevice.deviceId || selectedDevice.id);
    }
  }, [selectedDevice, fetchDeviceCables]);

  const handleDeleteCable = useCallback(
    async cableId => {
      try {
        await axios.delete(`/api/cables/${cableId}`);
        message.success('接线删除成功');
        setRefreshTrigger(prev => prev + 1);
        if (selectedDevice) {
          fetchDeviceCables(selectedDevice.deviceId || selectedDevice.id);
        }
      } catch (error) {
        console.error('删除接线失败:', error);
        message.error('删除接线失败');
      }
    },
    [selectedDevice, fetchDeviceCables]
  );

  return (
    <Layout
      style={{ height: '100vh', overflow: 'hidden', background: '#000', position: 'relative' }}
    >
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: 'rgba(15, 23, 42, 0.6)', // Deep blue-grey, semi-transparent
          backdropFilter: 'blur(20px)',
          position: 'absolute',
          width: '100%',
          zIndex: 100,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          height: '64px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined style={{ color: 'rgba(255,255,255,0.8)' }} />}
            onClick={() => navigate('/')}
            style={{ marginRight: 16 }}
            className="hover-bright"
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.05)',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <CloudServerOutlined
              style={{ fontSize: '20px', color: '#3b82f6', marginRight: '10px' }}
            />
            <span
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: '#f8fafc',
                letterSpacing: '0.5px',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              3D 机柜可视化
            </span>
          </div>
        </div>
        <Space size="middle">
          <Select
            placeholder="选择机房"
            style={{ width: 180 }}
            value={selectedRoom}
            onChange={val => {
              setSelectedRoom(val);
              const roomRacks = racks.filter(
                r => (r.Room?.roomId || r.Room?.id || r.Room?.name) === val
              );
              if (roomRacks.length > 0) setSelectedRack(roomRacks[0]);
              else setSelectedRack(null);
            }}
            variant="borderless"
            popupMatchSelectWidth={false}
            className="glass-select"
          >
            {rooms.map(room => (
              <Option key={room.key} value={room.key}>
                {room.name}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="选择机柜"
            style={{ width: 180 }}
            value={selectedRack?.rackId}
            onChange={val => setSelectedRack(racks.find(r => r.rackId === val))}
            disabled={!selectedRoom}
            variant="borderless"
            className="glass-select"
          >
            {racksInSelectedRoom.map(rack => (
              <Option key={rack.rackId} value={rack.rackId}>
                {rack.name}
              </Option>
            ))}
          </Select>
          <Button
            type="primary"
            ghost
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchRacks();
              if (selectedRack) fetchDevices(selectedRack.rackId);
            }}
            style={{
              borderRadius: '6px',
              borderColor: 'rgba(255,255,255,0.3)',
              color: 'rgba(255,255,255,0.9)',
            }}
            className="hover-bright"
          >
            刷新
          </Button>
          <Button
            type="primary"
            ghost
            icon={<EyeOutlined />}
            onClick={() => {
              if (sceneRef.current) sceneRef.current.resetView();
            }}
            style={{
              borderRadius: '6px',
              borderColor: 'rgba(255,255,255,0.3)',
              color: 'rgba(255,255,255,0.9)',
            }}
            className="hover-bright"
          >
            重置视角
          </Button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.05)',
              padding: '4px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <FullscreenOutlined
              style={{
                color: deviceSlideEnabled ? '#22c55e' : 'rgba(255,255,255,0.4)',
                marginRight: 8,
              }}
            />
            <span
              style={{
                fontSize: '13px',
                color: deviceSlideEnabled ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                marginRight: 8,
              }}
            >
              设备弹出
            </span>
            <Switch
              size="small"
              checked={deviceSlideEnabled}
              onChange={setDeviceSlideEnabled}
              checkedChildren="开"
              unCheckedChildren="关"
            />
          </div>
          <Button
            type="primary"
            ghost
            icon={<SettingOutlined />}
            onClick={() => setShowTooltipConfig(true)}
            style={{
              borderRadius: '6px',
              borderColor: 'rgba(255,255,255,0.3)',
              color: 'rgba(255,255,255,0.9)',
            }}
            className="hover-bright"
          >
            显示配置
          </Button>
        </Space>
      </Header>

      {/* Inject custom styles for glass selects */}
      <style>{`
        .glass-select .ant-select-selector {
            background: rgba(255, 255, 255, 0.08) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            color: white !important;
            border-radius: 6px !important;
            transition: all 0.3s;
        }
        .glass-select:hover .ant-select-selector {
            background: rgba(255, 255, 255, 0.15) !important;
            border-color: rgba(255, 255, 255, 0.3) !important;
        }
        .glass-select .ant-select-selection-item, 
        .glass-select .ant-select-selection-placeholder {
            color: rgba(255, 255, 255, 0.9) !important;
            font-size: 13px;
        }
        .glass-select .ant-select-arrow {
            color: rgba(255, 255, 255, 0.6) !important;
        }
        .hover-bright:hover {
            color: white !important;
            background: rgba(255,255,255,0.1) !important;
        }
      `}</style>

      <Layout>
        <Content style={{ position: 'relative', background: '#ffffff' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
              }}
            >
              <Spin size="large" />
              <div style={{ marginTop: 16, color: '#1890ff' }}>加载资源中...</div>
            </div>
          ) : selectedRack ? (
            <>
              <Scene
                ref={sceneRef}
                rack={selectedRack}
                devices={devices}
                selectedDeviceId={selectedDevice?.deviceId || selectedDevice?.id}
                onDeviceClick={handleDeviceClick}
                onDeviceLeave={handleDeviceLeave}
                onDeviceHover={handleDeviceHover}
                tooltipFields={tooltipFields}
                deviceSlideEnabled={deviceSlideEnabled}
              />

              {/* Rack Info Overlay (New) */}
              {selectedRack && (
                <div
                  style={{
                    position: 'absolute',
                    top: 88, // Moved down to avoid header overlap
                    left: 24,
                    background: 'rgba(255, 255, 255, 0.85)', // Slightly more transparent
                    backdropFilter: 'blur(12px)',
                    padding: isRackInfoCollapsed ? '12px 16px' : '20px',
                    borderRadius: '16px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)', // Softer, deeper shadow
                    width: isRackInfoCollapsed ? 'auto' : '280px',
                    zIndex: 5,
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    overflow: 'hidden',
                    cursor: isRackInfoCollapsed ? 'pointer' : 'default',
                  }}
                  onClick={() => isRackInfoCollapsed && setIsRackInfoCollapsed(false)}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: isRackInfoCollapsed ? 0 : 16,
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                          flexShrink: 0,
                        }}
                      >
                        <CloudServerOutlined style={{ color: 'white', fontSize: 18 }} />
                      </div>
                      <div
                        style={{
                          opacity: isRackInfoCollapsed ? 0 : 1,
                          width: isRackInfoCollapsed ? 0 : 'auto',
                          transition: 'opacity 0.2s',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '16px',
                            fontWeight: 700,
                            color: '#1e293b',
                            lineHeight: 1.2,
                          }}
                        >
                          {selectedRack.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                          ID: {selectedRack.rackId}
                        </div>
                      </div>
                    </div>

                    <Button
                      type="text"
                      size="small"
                      icon={isRackInfoCollapsed ? <DownOutlined /> : <UpOutlined />}
                      onClick={e => {
                        e.stopPropagation();
                        setIsRackInfoCollapsed(!isRackInfoCollapsed);
                      }}
                      style={{ color: '#94a3b8', marginLeft: isRackInfoCollapsed ? 8 : 0 }}
                    />
                  </div>

                  {/* Content Area - Collapsible */}
                  <div
                    style={{
                      maxHeight: isRackInfoCollapsed ? 0 : '500px',
                      opacity: isRackInfoCollapsed ? 0 : 1,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Stats Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 12,
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          background: 'rgba(241, 245, 249, 0.6)',
                          padding: '10px',
                          borderRadius: '10px',
                        }}
                      >
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: 2 }}>
                          总高度
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                          {selectedRack.height}
                          <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: 2 }}>
                            U
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          background: 'rgba(241, 245, 249, 0.6)',
                          padding: '10px',
                          borderRadius: '10px',
                        }}
                      >
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: 2 }}>
                          设备数
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: '#3b82f6' }}>
                          {devices.length}
                          <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: 2 }}>
                            台
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Guide Section */}
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#94a3b8',
                          marginBottom: 8,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <InfoCircleOutlined style={{ marginRight: 6 }} /> 操作指南
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[
                          { icon: '🖱️', text: '左键旋转视图' },
                          { icon: '🔍', text: '滚轮缩放视图' },
                          { icon: '👆', text: '点击设备查看详情' },
                        ].map((item, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: '12px',
                              color: '#475569',
                              display: 'flex',
                              alignItems: 'center',
                              background: 'rgba(255,255,255,0.5)',
                              padding: '4px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            <span style={{ marginRight: 8, opacity: 0.8 }}>{item.icon}</span>
                            {item.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Overlay Info for Hovered Device */}
              {hoveredDevice && !selectedDevice && (
                <div
                  style={{
                    position: 'absolute',
                    top: 88, // Moved down to avoid header overlap
                    right: 24,
                    background: 'rgba(0, 0, 0, 0.7)',
                    padding: '12px',
                    borderRadius: '8px',
                    color: 'white',
                    pointerEvents: 'none',
                    maxWidth: '300px',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    zIndex: 10,
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{hoveredDevice.name}</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    <div>位置: U{hoveredDevice.position}</div>
                    <div>高度: {hoveredDevice.height}U</div>
                    <div>状态: {hoveredDevice.status}</div>
                  </div>
                </div>
              )}

              {/* Device Detail Floating Popup - Removed, now handled in DeviceModel */}
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
              }}
            >
              <Empty
                description={
                  <span style={{ color: 'rgba(0, 0, 0, 0.45)' }}>请选择一个机柜以查看 3D 视图</span>
                }
              />
            </div>
          )}

          <Modal
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <EditOutlined style={{ color: '#667eea' }} />
                <span>编辑设备信息</span>
              </div>
            }
            open={modalVisible}
            onCancel={handleModalCancel}
            closeIcon={<CloseButton />}
            footer={null}
            width={700}
          >
            <Form form={form} layout="vertical" onFinish={handleModalSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item name="name" label="设备名称" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="type" label="设备类型" rules={[{ required: true }]}>
                  <Select>
                    <Option value="server">服务器</Option>
                    <Option value="switch">交换机</Option>
                    <Option value="router">路由器</Option>
                    <Option value="storage">存储设备</Option>
                    <Option value="firewall">防火墙</Option>
                    <Option value="other">其他设备</Option>
                  </Select>
                </Form.Item>
                <Form.Item name="model" label="型号" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="serialNumber" label="序列号" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="position" label="位置(U)" rules={[{ required: true }]}>
                  <InputNumber min={1} max={selectedRack?.height || 45} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="height" label="高度(U)" rules={[{ required: true }]}>
                  <InputNumber min={1} max={10} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                  <Select>
                    <Option value="running">运行中</Option>
                    <Option value="maintenance">维护中</Option>
                    <Option value="offline">离线</Option>
                    <Option value="fault">故障</Option>
                  </Select>
                </Form.Item>
                <Form.Item name="powerConsumption" label="功率(W)" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="ipAddress" label="IP地址">
                  <Input />
                </Form.Item>
                <Form.Item name="purchaseDate" label="购买日期">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="warrantyExpiry" label="保修到期">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={3} />
              </Form.Item>

              <div style={{ textAlign: 'right', marginTop: 16 }}>
                <Space>
                  <Button onClick={handleModalCancel}>取消</Button>
                  <Button type="primary" htmlType="submit">
                    保存
                  </Button>
                </Space>
              </div>
            </Form>
          </Modal>

          {/* Field Configuration Modal */}
          <Modal
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SettingOutlined style={{ color: '#1890ff' }} />
                <span>设备详情字段配置</span>
              </div>
            }
            open={showTooltipConfig}
            onCancel={() => setShowTooltipConfig(false)}
            closeIcon={<CloseButton />}
            footer={null}
            width={520}
            styles={{
              content: { padding: '24px' },
              header: { marginBottom: 16 },
            }}
          >
            {loadingTooltipFields ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin />
                <div style={{ marginTop: 8 }}>加载配置中...</div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 16, color: '#666' }}>
                  选择要在设备详情卡片中显示的字段：
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    maxHeight: '400px',
                    overflowY: 'auto',
                  }}
                >
                  {Object.entries(tooltipFields).map(([key, field]) => (
                    <div
                      key={key}
                      style={{
                        padding: '8px 12px',
                        border: field.enabled ? '1px solid #1890ff' : '1px solid #d9d9d9',
                        background: field.enabled ? '#e6f7ff' : '#fff',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.3s',
                      }}
                      onClick={() => {
                        setTooltipFields(prev => ({
                          ...prev,
                          [key]: { ...prev[key], enabled: !prev[key].enabled },
                        }));
                      }}
                    >
                      <Checkbox checked={field.enabled} style={{ marginRight: 8 }} />
                      <span>{field.label}</span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 24,
                    textAlign: 'right',
                    borderTop: '1px solid #f0f0f0',
                    paddingTop: 16,
                  }}
                >
                  <Space>
                    <Button onClick={() => setShowTooltipConfig(false)}>取消</Button>
                    <Button
                      type="primary"
                      onClick={saveTooltipConfig}
                      loading={savingTooltipConfig}
                    >
                      保存配置
                    </Button>
                  </Space>
                </div>
              </div>
            )}
          </Modal>

          <NetworkCardCreateModal
            device={operatingDevice}
            visible={nicModalVisible}
            onClose={handleCloseNicModal}
            onSuccess={handleNicSuccess}
          />

          <PortCreateModal
            device={operatingDevice}
            visible={portModalVisible}
            onClose={handleClosePortModal}
            onSuccess={handlePortSuccess}
          />

          <CableCreateModal
            visible={cableModalVisible}
            onClose={handleCloseCableModal}
            onSuccess={handleCableSuccess}
            sourceDevice={operatingDevice}
          />

          <DeviceDetailDrawer
            visible={!!selectedDevice}
            device={selectedDevice}
            onClose={() => setSelectedDevice(null)}
            onEdit={handleEditDevice}
            onAddNic={handleAddNic}
            onAddPort={handleAddPort}
            onAddCable={handleAddCable}
            tooltipFields={tooltipFields}
            cables={deviceCables}
            onRefreshCables={() =>
              selectedDevice && fetchDeviceCables(selectedDevice.deviceId || selectedDevice.id)
            }
            onDeleteCable={handleDeleteCable}
            refreshTrigger={refreshTrigger}
          />
        </Content>
      </Layout>
    </Layout>
  );
};

export default Rack3DVisualization;
