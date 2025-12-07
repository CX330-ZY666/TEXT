// src/pages/GraphPage.jsx
import { useEffect, useState, useRef } from 'react';
import apiClient from '../api/axios';
import ReactECharts from 'echarts-for-react';
import { useNavigate } from 'react-router-dom';

// 配置常量
const CHART_HEIGHT = '700px';
const FORCE_REPULSION = 150;
const FORCE_EDGE_LENGTH = 80;
const EMPHASIS_LINE_WIDTH = 15;

// 本地真实星球纹理 (需配合纯黑背景使用)
const PLANET_TEXTURES = [
    'jupiter.jpg',
    'mars.jpg',
    'mercury.jpg',
    'neptune.jpg',
    'pluto.jpg',
    'saturn.jpg',
    'uranus.jpg',
    'venus.jpg'
];

// 节点状态对应的颜色（严格按照文档：mastered 绿色、reviewList 为 true 橙色、其他蓝色）
const NODE_COLOR_MASTERED = '#22c55e'; // 绿色
const NODE_COLOR_REVIEW = '#f97316';   // 橙色
const NODE_COLOR_DEFAULT = '#3b82f6';  // 蓝色

// 难度级别映射
const difficultyMap = {
    beginner: '初级',
    intermediate: '中级',
    advanced: '高级'
};

// 根据 status 与 reviewList 计算节点颜色
function getNodeColor(node) {
    if (node.status === 'mastered') {
        return NODE_COLOR_MASTERED;
    }
    // 复习中（status = reviewing）或被标记需要复习（reviewList = true）统一用橙色
    if (node.status === 'reviewing' || node.reviewList) {
        return NODE_COLOR_REVIEW;
    }
    return NODE_COLOR_DEFAULT;
}

function GraphPage() {
    const [option, setOption] = useState({});
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const chartInstanceRef = useRef(null);

    // 点击节点跳转到编辑页
    const onChartClick = (params) => {
        if (params.componentType === 'series' && params.dataType === 'node') {
            const nodeId = params.data.id;
            navigate(`/kp/edit/${nodeId}`);
        }
    };

    // 图表准备就绪时的回调
    const onChartReady = (instance) => {
        chartInstanceRef.current = instance;
        // 解绑旧事件以防万一
        instance.off('click');
        // 强制绑定点击事件，确保图片也能触发
        instance.on('click', onChartClick);
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await apiClient.get('/graph/knowledge-map');
                const graphData = response.data;

                // 处理空数据情况
                if (graphData.nodes.length === 0) {
                    setLoading(false);
                    return;
                }

                // 按文档要求：使用简单圆形节点，通过颜色区分状态/reviewList
                const processedNodes = graphData.nodes.map((node) => {
                    const nodeColor = getNodeColor(node);

                    return {
                        ...node,
                        // 使用默认 circle 符号，仅通过大小 + 颜色表达信息
                        symbolSize: node.symbolSize * 1.8,
                        itemStyle: {
                            color: nodeColor,
                            borderWidth: 1.5,
                            borderColor: '#ffffff',
                            shadowBlur: 10,
                            shadowColor: nodeColor,
                            opacity: 1
                        }
                    };
                });

                // 构建 ECharts 配置对象
                const chartOption = {
                    backgroundColor: 'transparent',
                    animationDuration: 2000,
                    animationEasingUpdate: 'quinticInOut',
                    tooltip: {
                        trigger: 'item', // 明确指定触发类型
                        confine: true, // 限制在图表区域内
                        backgroundColor: 'rgba(0, 0, 0, 0.8)', // 纯黑半透明
                        borderColor: '#666',
                        borderWidth: 1,
                        padding: 0,
                        textStyle: { color: '#fff' },
                        formatter: (params) => {
                            if (params.dataType === 'node') {
                                const node = params.data;
                                const difficultyText = difficultyMap[node.difficulty] || node.difficulty;
                                const formattedDate = new Date(node.createdAt).toLocaleString('zh-CN');
                                
                                return `
                                    <div style="
                                        padding: 12px 16px; 
                                        border-radius: 4px;
                                        background: rgba(0,0,0,0.9);
                                        border: 1px solid #333;
                                    ">
                                        <strong style="font-size: 15px; color: #fff; display:block; margin-bottom:5px;">${node.name}</strong>
                                        <div style="font-size: 12px; color: #aaa; line-height: 1.5;">
                                            难度: <span style="color: #ddd;">${difficultyText}</span><br/>
                                            创建: ${formattedDate}
                                        </div>
                                    </div>
                                `;
                            }
                            return '';
                        }
                    },
                    series: [{
                        type: 'graph',
                        layout: 'force',
                        data: processedNodes,
                        links: graphData.links,
                        roam: true,
                        draggable: true,
                        triggerEvent: true, // 强制开启事件响应
                        cursor: 'pointer', // 鼠标移上去变成小手
                        // 不需要默认 symbol，因为 data 里已经指定了
                        label: {
                            show: true,
                            position: 'bottom', // 标签放下边
                            formatter: '{b}',
                            fontSize: 12,
                            color: 'rgba(255, 255, 255, 0.8)',
                            distance: 10,
                            textShadowColor: '#000',
                            textShadowBlur: 3
                        },
                        edgeSymbol: ['none', 'arrow'],
                        edgeSymbolSize: [0, 10],
                        lineStyle: {
                            color: '#a0cfff', // 恢复浅蓝光束
                            curveness: 0.2, // 恢复曲线
                            width: 1,
                            opacity: 0.3,
                            shadowBlur: 5,
                            shadowColor: '#4facfe'
                        },
                        force: {
                            repulsion: 200, // 恢复正常的斥力
                            edgeLength: 100,
                            gravity: 0.05,
                            friction: 0.6
                        },
                        emphasis: {
                            focus: 'adjacency',
                            scale: 1.2,
                            label: {
                                fontWeight: 'bold',
                                fontSize: 16
                            },
                            lineStyle: {
                                width: 1,
                                opacity: 0.8
                            }
                        }
                    }]
                };

                setOption(chartOption);
                setLoading(false);
            } catch (error) {
                console.error('获取图谱数据失败', error);
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // 移除旧的 onChartClick 定义，因为已经移到组件作用域内并被 useEffect 使用

    // 公共背景样式 - 纯黑背景以融合本地纹理
    const containerStyle = {
        position: 'relative',
        height: 'calc(100vh - 64px)', // 减去导航栏高度
        background: '#000000', // 必须纯黑，否则 jpg 背景会显形
        overflow: 'hidden',
        color: '#fff'
    };

    // 渲染逻辑
    if (loading) {
        return (
            <div style={{ 
                ...containerStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(10px)',
                    padding: '40px',
                    borderRadius: '20px',
                    textAlign: 'center',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                    <div style={{ marginBottom: '20px', fontSize: '48px', animation: 'float 3s ease-in-out infinite' }}>🌌</div>
                    <div style={{ fontSize: '18px', letterSpacing: '2px' }}>正在生成知识宇宙...</div>
                    <div style={{ marginTop: '10px', fontSize: '12px', opacity: 0.5 }}>载入神经元节点</div>
                    <style>{`
                        @keyframes float {
                            0% { transform: translateY(0px); }
                            50% { transform: translateY(-10px); }
                            100% { transform: translateY(0px); }
                        }
                    `}</style>
                </div>
            </div>
        );
    }

    if (!option.series || option.series.length === 0 || option.series[0].data.length === 0) {
        return (
            <div style={{ 
                ...containerStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(10px)',
                    padding: '60px 40px',
                    borderRadius: '20px',
                    textAlign: 'center',
                    maxWidth: '500px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                    <div style={{ fontSize: '64px', marginBottom: '20px' }}>🌑</div>
                    <h2 style={{ fontSize: '28px', marginBottom: '15px', fontWeight: '300' }}>这片宇宙尚待开垦</h2>
                    <p style={{ fontSize: '16px', opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
                        当前没有任何知识节点。<br/>点击下方按钮，点亮你的第一颗星辰。
                    </p>
                    <button 
                        onClick={() => navigate('/kp/new')}
                        style={{
                            background: 'linear-gradient(90deg, #4facfe 0%, #00f2fe 100%)',
                            color: '#fff',
                            border: 'none',
                            padding: '12px 35px',
                            borderRadius: '50px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 0 20px rgba(79, 172, 254, 0.5)',
                            transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.05)';
                            e.target.style.boxShadow = '0 0 30px rgba(79, 172, 254, 0.7)';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                            e.target.style.boxShadow = '0 0 20px rgba(79, 172, 254, 0.5)';
                        }}
                    >
                        ✨ 创建奇点
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            {/* 背景图谱层 */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                <ReactECharts
                    option={option}
                    style={{ height: '100%', width: '100%' }}
                    onChartReady={onChartReady}
                />
            </div>

            {/* 顶部标题栏 - 悬浮（pointerEvents: 'none' 确保标题本身不挡点击） */}
            <div style={{
                position: 'absolute',
                top: '20px',
                left: '30px',
                zIndex: 10,
                pointerEvents: 'none' // 让点击穿透到图表
            }}>
                <h1 style={{ 
                    color: '#fff',
                    fontSize: '28px',
                    fontWeight: '700',
                    textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    margin: 0,
                    letterSpacing: '1px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <span style={{ fontSize: '32px' }}>🌌</span> 知识图谱宇宙
                </h1>
                <p style={{ 
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: '14px',
                    margin: '5px 0 0 45px',
                    fontWeight: '300'
                }}>
                    Exploring the Neural Network of Ideas
                </p>
            </div>

            {/* 右上角图例 - 悬浮玻璃态，对应 status/reviewList 配色 */}
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '30px',
                zIndex: 10,
                pointerEvents: 'none', // 允许点击穿透
                background: 'rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)', // Safari support
                padding: '15px',
                borderRadius: '15px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <span style={{ 
                        width: '12px', height: '12px', borderRadius: '50%', 
                        background: `radial-gradient(circle at 30% 30%, #bbf7d0 0%, ${NODE_COLOR_MASTERED} 60%, #052e16 100%)`,
                        boxShadow: `0 0 10px ${NODE_COLOR_MASTERED}`
                    }}></span>
                    <span>掌握良好（status = mastered）</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <span style={{ 
                        width: '12px', height: '12px', borderRadius: '50%', 
                        background: `radial-gradient(circle at 30% 30%, #ffedd5 0%, ${NODE_COLOR_REVIEW} 60%, #431407 100%)`,
                        boxShadow: `0 0 10px ${NODE_COLOR_REVIEW}`
                    }}></span>
                    <span>需要复习（reviewList = true）</span>
                </div>
            </div>

            {/* 底部控制栏 - 悬浮 */}
            <div style={{
                position: 'absolute',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
                pointerEvents: 'none', // 允许点击穿透
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)', // Safari support
                padding: '10px 30px',
                borderRadius: '50px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.8)',
                display: 'flex',
                gap: '20px',
                boxShadow: '0 5px 20px rgba(0,0,0,0.2)'
            }}>
                 <span>🕹️ 拖拽节点</span>
                 <span>🔍 滚轮缩放</span>
                 <span>👆 点击查看详情</span>
            </div>
        </div>
    );
}

export default GraphPage;
