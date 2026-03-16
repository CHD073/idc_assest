import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Empty, Spin, Badge, Typography, Space, Checkbox, Tooltip } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  PlusOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import ServerBackplanePanel from './ServerBackplanePanel';
import PortPanel from './PortPanel';

const { Text } = Typography;

/**
 * 虚拟设备列表组件
 * 用于优化大量设备面板的渲染性能
 *
 * @param {Object[]} devices - 设备列表
 * @param {Object} groupedPorts - 按设备分组的端口数据
 * @param {Object[]} cables - 接线列表
 * @param {Object[]} allDevices - 所有设备列表（用于查找设备信息）
 * @param {Function} onPortClick - 端口点击回调
 * @param {Function} onAddPort - 添加端口回调 (device) => void
 * @param {Function} onManageNetworkCards - 网卡管理回调 (device) => void
 * @param {number} initialVisibleCount - 初始显示数量
 * @param {number} loadMoreCount - 每次加载更多数量
 */
const VirtualDeviceList = ({
  devices,
  groupedPorts,
  cables,
  allDevices,
  onPortClick,
  onAddPort,
  onManageNetworkCards,
  initialVisibleCount = 5,
  loadMoreCount = 5,
}) => {
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const [loading, setLoading] = useState(false);
  const [expandedDevices, setExpandedDevices] = useState({});
  const [showAll, setShowAll] = useState(false);
  const containerRef = useRef(null);
  const observerRef = useRef(null);

  // 初始化展开状态
  useEffect(() => {
    const initialExpanded = {};
    devices.slice(0, initialVisibleCount).forEach((device, index) => {
      initialExpanded[device.deviceId] = index < 3; // 前3个默认展开
    });
    setExpandedDevices(initialExpanded);
  }, [devices, initialVisibleCount]);

  // 无限滚动观察器
  useEffect(() => {
    if (showAll) return;

    const options = {
      root: null,
      rootMargin: '100px',
      threshold: 0.1,
    };

    observerRef.current = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !loading && visibleCount < devices.length) {
          loadMore();
        }
      });
    }, options);

    const loadMoreTrigger = document.getElementById('load-more-trigger');
    if (loadMoreTrigger) {
      observerRef.current.observe(loadMoreTrigger);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [visibleCount, devices.length, loading, showAll]);

  const loadMore = useCallback(() => {
    if (loading || visibleCount >= devices.length) return;

    setLoading(true);
    // 模拟异步加载，实际可以直接同步更新
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + loadMoreCount, devices.length));
      setLoading(false);
    }, 100);
  }, [loading, visibleCount, devices.length, loadMoreCount]);

  const handleShowAll = useCallback(() => {
    // 先显示所有设备
    setVisibleCount(devices.length);
    // 展开所有设备
    const allExpanded = {};
    devices.forEach(device => {
      allExpanded[device.deviceId] = true;
    });
    setExpandedDevices(allExpanded);
    setShowAll(true);
  }, [devices]);

  const handleCollapseAll = useCallback(() => {
    // 收起所有面板（折叠所有设备），但保持当前显示的设备数量
    const allCollapsed = {};
    devices.forEach(device => {
      allCollapsed[device.deviceId] = false;
    });
    setExpandedDevices(allCollapsed);
    setShowAll(false);
  }, [devices]);

  const toggleDeviceExpand = deviceId => {
    setExpandedDevices(prev => ({
      ...prev,
      [deviceId]: prev[deviceId] === true ? false : true,
    }));
  };

  const isDeviceExpanded = deviceId => {
    return expandedDevices[deviceId] === true;
  };

  const visibleDevices = devices.slice(0, visibleCount);
  const hasMore = visibleCount < devices.length;

  if (devices.length === 0) {
    return <Empty description="暂无设备数据" style={{ padding: '60px 0' }} />;
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 控制栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <Space align="center">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text strong style={{ fontSize: '14px' }}>
              设备列表
            </Text>
            <Badge count={devices.length} style={{ backgroundColor: '#667eea' }} />
          </div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            显示 {visibleDevices.length} / {devices.length}
          </Text>
        </Space>

        <Space>
          <Button
            size="small"
            icon={showAll ? <UpOutlined /> : <DownOutlined />}
            onClick={showAll ? handleCollapseAll : handleShowAll}
          >
            {showAll ? '收起全部' : '展开全部'}
          </Button>
        </Space>
      </div>

      {/* 设备面板列表 */}
      {visibleDevices.map(device => {
        const deviceId = device.deviceId;
        const data = groupedPorts[deviceId] || { device, ports: [] };
        const isExpanded = isDeviceExpanded(deviceId);
        const portCount = data.ports?.length || 0;
        const occupiedCount = data.ports?.filter(p => p.status === 'occupied').length || 0;

        return (
          <div
            key={deviceId}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#fff',
              transition: 'all 0.3s ease',
            }}
          >
            {/* 设备标题栏 */}
            <div
              onClick={() => toggleDeviceExpand(deviceId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: isExpanded ? '#f1f5f9' : '#fff',
                cursor: 'pointer',
                borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f1f5f9';
              }}
              onMouseLeave={e => {
                if (!isExpanded) {
                  e.currentTarget.style.background = '#fff';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}
                >
                  {device.type?.toLowerCase()?.includes('server')
                    ? '🖥️'
                    : device.type?.toLowerCase()?.includes('switch')
                      ? '🔀'
                      : device.type?.toLowerCase()?.includes('router')
                        ? '🌐'
                        : '📦'}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>
                    {device.name || '未知设备'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {device.deviceId} · {device.type || '未知类型'}
                  </div>
                </div>
              </div>

              <Space size="middle">
                <Space size="small">
                  <Badge
                    count={occupiedCount}
                    style={{ backgroundColor: '#3b82f6' }}
                    overflowCount={999}
                  />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    已用
                  </Text>
                  <Badge
                    count={portCount}
                    style={{ backgroundColor: '#10b981' }}
                    overflowCount={999}
                  />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    端口
                  </Text>
                </Space>

                {/* 网卡管理按钮 - 只有服务器显示 */}
                {device.type?.toLowerCase()?.includes('server') && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<CloudServerOutlined />}
                    onClick={e => {
                      e.stopPropagation(); // 防止触发折叠
                      onManageNetworkCards && onManageNetworkCards(device);
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                    }}
                  >
                    网卡管理
                  </Button>
                )}

                {/* 添加端口按钮 */}
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={e => {
                    e.stopPropagation(); // 防止触发折叠
                    onAddPort && onAddPort(device);
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                  }}
                >
                  添加端口
                </Button>

                <Button
                  type="text"
                  size="small"
                  icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                  onClick={e => {
                    e.stopPropagation();
                    toggleDeviceExpand(deviceId);
                  }}
                  style={{ color: '#64748b' }}
                >
                  {isExpanded ? '收起' : '展开'}
                </Button>
              </Space>
            </div>

            {/* 面板内容 - 可折叠 */}
            {isExpanded && (
              <div style={{ padding: '16px' }}>
                {device.type?.toLowerCase()?.includes('switch') ? (
                  // 交换机使用普通端口面板
                  <PortPanel
                    ports={data.ports || []}
                    deviceName={device.name}
                    deviceId={deviceId}
                    cables={cables}
                    devices={allDevices}
                    onPortClick={onPortClick}
                    compact={true}
                  />
                ) : (
                  // 服务器使用背板布局
                  <ServerBackplanePanel
                    deviceId={deviceId}
                    deviceName={device.name}
                    cables={cables}
                    allDevices={allDevices}
                    onPortClick={onPortClick}
                    onManageNetworkCards={() =>
                      onManageNetworkCards && onManageNetworkCards(device)
                    }
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 加载更多触发器 */}
      {hasMore && !showAll && (
        <div
          id="load-more-trigger"
          style={{
            textAlign: 'center',
            padding: '20px',
            color: '#64748b',
          }}
        >
          {loading ? (
            <Spin size="small" tip="加载更多设备..." />
          ) : (
            <Text type="secondary">向下滚动加载更多 ({devices.length - visibleCount} 个设备)</Text>
          )}
        </div>
      )}

      {/* 已显示全部提示 */}
      {!hasMore && devices.length > initialVisibleCount && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
          <Text type="secondary">已显示全部 {devices.length} 个设备</Text>
        </div>
      )}
    </div>
  );
};

export default VirtualDeviceList;
