import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import * as d3 from 'd3-force-3d';
import DOMPurify from 'dompurify';
import apiClient from '../api/axios';

function KnowledgeUniversePage() {
    const mountRef = useRef(null);
    const labelsContainerRef = useRef(null);
    const labelsRef = useRef([]);
    const hoverState = useRef(null); // { nodeIdx, neighbors: Set<int>, links: Set<int> }
    const [knowledgePoints, setKnowledgePoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedNodeData, setSelectedNodeData] = useState(null);

    // 获取知识点数据
    useEffect(() => {
        apiClient.get('/knowledge-points')
            .then(res => {
                if (res.data.length === 0) {
                    setError('还没有知识点,快去创建吧!');
                } else {
                    setKnowledgePoints(res.data);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch knowledge points', err);
                setError('网络连接失败,请稍后重试');
                setLoading(false);
            });
    }, []);

    // 初始化3D场景
    useEffect(() => {
        if (!mountRef.current || knowledgePoints.length === 0) return;

        const currentMount = mountRef.current;
        const width = currentMount.clientWidth;
        const height = currentMount.clientHeight;

        // === Asteroid Trails 工具与共享资源 ===
        // 1. 几何体：稍微增大一点 (0.25 -> 0.35)，兼顾可见性与性能
        // InstancedMesh 技术极其高效，渲染数万个此类小物体对现代显卡几乎无压力
        const rockGeometry = new THREE.DodecahedronGeometry(0.35, 0);
        
        // 2. 材质：高亮设置，确保清晰可见
        const rockMaterial = new THREE.MeshStandardMaterial({
            color: 0xe0e0e0, // 接近白色的亮灰
            roughness: 0.6,  // 稍微光滑一点，反光更多
            metalness: 0.4,  // 增加金属感
            emissive: 0x666666, // 中等强度的自发光
            emissiveIntensity: 0.6, // 即使在阴影中也能看清
            flatShading: true
        });
        
        // 生成曲线：微弧线，不再大幅向中心弯曲
        const createCurve = (src, dst) => {
            const p0 = src.clone();
            const p1 = dst.clone();
            // 简单的三维直线略带弧度，不再强制指向球心
            // 使用中点向外稍微延伸一点点，或者直接用直线
            // 这里使用 CatmullRom 配合稍微偏移的中点，形成自然的微弧
            const mid = p0.clone().add(p1).multiplyScalar(0.5);
            const len = p0.distanceTo(p1);
            // 偏移方向：从中点向原点连线的反方向（向外拱），或者随机一点
            // 为了整洁，我们只做极微小的随机扰动，或者干脆直线
            // 现在的笼子感是因为所有线都往里弯。改为直线测试效果。
            return new THREE.LineCurve3(p0, p1); 
        };

        // 创建单条“陨石流” (Asteroid Trail)
        const createAsteroidTrail = (sourceIdx, targetIdx) => {
            const src = planets[sourceIdx].position.clone();
            const dst = planets[targetIdx].position.clone();
            
            // 对于直线，方向不敏感，但保留逻辑
            let start = src, end = dst, fromIdx = sourceIdx, toIdx = targetIdx;

            // 直线路径（为了计算点位）
            const curve = new THREE.LineCurve3(start, end);
            const distance = start.distanceTo(end);
            
            // 数量：保持较高密度，形成带状 (60-180)
            const COUNT = Math.max(60, Math.min(180, Math.floor(distance * 1.2)));
            
            // 管道半径：扩大散布范围 (1.5 -> 3.0)，让陨石散开，不要挤成一根肠
            const tubeRadius = 3.0; 

            const mesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, COUNT);
            mesh.frustumCulled = false;
            if (mesh.instanceMatrix && mesh.instanceMatrix.setUsage) {
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            }
            
            const palette = [
                new THREE.Color(0xcccccc), // 亮灰
                new THREE.Color(0xaaaaaa), // 中灰
                new THREE.Color(0x999999), // 深灰
                new THREE.Color(0xe0e0e0)  // 白灰
            ];
            
            for(let i=0; i<COUNT; i++) {
                const color = palette[Math.floor(Math.random() * palette.length)];
                // 整体提亮，确保没有太暗的石头
                color.multiplyScalar(0.9 + Math.random() * 0.3);
                mesh.setColorAt(i, color);
            }
            mesh.instanceColor.needsUpdate = true;

            // 预计算数据
            const baseT = new Float32Array(COUNT);
            const speed = new Float32Array(COUNT);
            
            // 使用 3D 缩放来实现形状差异 (Non-uniform scaling)
            const scale3D = new Float32Array(COUNT * 3);
            
            // 轨道参数
            const offsetRadius = new Float32Array(COUNT);
            const offsetAngle = new Float32Array(COUNT);
            const rotAxis = new Float32Array(COUNT * 3); // 随机旋转轴
            const rotSpeed = new Float32Array(COUNT);

            // 临时变量
            const tmpMatrix = new THREE.Matrix4();
            const tmpPos = new THREE.Vector3();
            const tmpScale = new THREE.Vector3();
            const tmpQuat = new THREE.Quaternion();
            const tangent = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);
            const axisX = new THREE.Vector3(1, 0, 0); // 辅助轴
            const binormal = new THREE.Vector3();
            const normal = new THREE.Vector3();

            for (let i = 0; i < COUNT; i++) {
                baseT[i] = Math.random(); 
                // 速度大幅降低：模拟太空失重的缓慢漂浮感
                speed[i] = 0.01 + Math.random() * 0.03; 
                
                // 随机形状：尺寸适中 (0.8 ~ 1.5)
                scale3D[i*3 + 0] = 0.8 + Math.random() * 0.7;
                scale3D[i*3 + 1] = 0.8 + Math.random() * 0.7;
                scale3D[i*3 + 2] = 0.8 + Math.random() * 0.7;
                
                offsetRadius[i] = Math.random() * tubeRadius;
                offsetAngle[i] = Math.random() * Math.PI * 2;
                
                // 随机自旋
                rotAxis[i*3 + 0] = Math.random() - 0.5;
                rotAxis[i*3 + 1] = Math.random() - 0.5;
                rotAxis[i*3 + 2] = Math.random() - 0.5;
                rotSpeed[i] = (Math.random() - 0.5) * 2.0;
            }

            mesh.userData = {
                curve,
                baseT,
                speed,
                scale3D,
                offsetRadius,
                offsetAngle,
                rotAxis,
                rotSpeed,
                tmpMatrix,
                tmpPos,
                tmpScale,
                tmpQuat,
                tangent,
                up,
                axisX,
                binormal,
                normal,
                count: COUNT,
                fromIdx,
                toIdx,
            };

            galaxyGroup.add(mesh);
            return mesh;
        };
        // 场景（纯黑背景，深邃宇宙）
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000); 

        // 创建一个包含所有行星和连线的星系容器，用于整体旋转
        const galaxyGroup = new THREE.Group();
        scene.add(galaxyGroup);

        // 相机（保持现有视角）
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 3000);
        camera.position.set(0, 40, 380);

        // 渲染器
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        currentMount.appendChild(renderer.domElement);

        // 能力检测与分档（Tier）
        const isWebGL2 = !!renderer.capabilities.isWebGL2;
        const deviceMemory = (navigator && navigator.deviceMemory) ? navigator.deviceMemory : 4;
        const cores = (navigator && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
        let tier = 1;
        if (isWebGL2 && deviceMemory >= 4 && cores >= 6) tier = 2;
        if (deviceMemory <= 2 || cores <= 4) tier = 0;
        const tierBudgets = { 0: 1500, 1: 10000, 2: 25000 };
        const instanceBudget = tierBudgets[tier];

        // 光照系统重构（模拟真实太空光照）
        // 1. 微弱的环境光，保证背光面不是死黑
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5); 
        scene.add(ambientLight);

        // 2. 主光源（模拟太阳），侧上方照射，制造明暗立体感
        const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
        sunLight.position.set(100, 50, 100);
        scene.add(sunLight);
        
        // 3. 轮廓补光（背光），增强边缘轮廓
        const rimLight = new THREE.DirectionalLight(0x4455ff, 1.0);
        rimLight.position.set(-50, 0, -20);
        scene.add(rimLight);

        // 控制器（扩大视野范围）
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 50;
        controls.maxDistance = 800;

        // 星空背景
        const createStars = () => {
            const geometry = new THREE.BufferGeometry();
            const count = 10000;
            const positions = new Float32Array(count * 3);

            for (let i = 0; i < count * 3; i++) {
                positions[i] = (Math.random() - 0.5) * 2500;  // 扩大星空范围
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const material = new THREE.PointsMaterial({
                color: 0xffffff,
                size: 1.5, // 星星变小，更精致
                transparent: true,
                opacity: 0.6 // 降低不透明度，不要抢了地球的风头
            });

            return new THREE.Points(geometry, material);
        };

        scene.add(createStars());

        // 中心地球
        const earthGroup = new THREE.Group(); // 地球单独一个组
        scene.add(earthGroup);

        const earthTexture = new THREE.TextureLoader().load(
            'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg'
        );
        
        const earthGeo = new THREE.SphereGeometry(25, 64, 64); 
        const earthMat = new THREE.MeshStandardMaterial({
            map: earthTexture,
            roughness: 0.6, // 增加粗糙度，减少类似塑料的高光
            metalness: 0.1, // 降低金属感，更像真实地表
            emissive: new THREE.Color(0x000000), // 关闭自发光！地球本身不发光
            emissiveIntensity: 0.0
        });
        const earth = new THREE.Mesh(earthGeo, earthMat);
        earthGroup.add(earth);

        // 大气层光晕 (Outer Atmosphere Glow) - 锐利的边缘光环
        const vertexShader = `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        // 调整后的 Fragment Shader：更锐利、更蓝、边缘更细
        const fragmentShader = `
            varying vec3 vNormal;
            void main() {
                // 计算视线与法线的点积，边缘处接近0
                float intensity = pow(0.55 - dot(vNormal, vec3(0, 0, 1.0)), 5.0);
                // 这种电光蓝颜色 (0.2, 0.6, 1.0) 加上高强度
                gl_FragColor = vec4(0.2, 0.6, 1.0, 1.0) * intensity * 2.0;
            }
        `;
        
        const atmosphereGeo = new THREE.SphereGeometry(28.5, 64, 64); // 稍微大一点点
        const atmosphereMat = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide, // 渲染背面，形成光环
            transparent: true,
            depthWrite: false
        });
        const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
        earthGroup.add(atmosphere);

        // 内部辉光 (Inner Glow) - 仅在边缘增强，模拟瑞利散射
        const innerGlowGeo = new THREE.SphereGeometry(25, 64, 64); // 与地球一样大
        const innerGlowMat = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: `
                varying vec3 vNormal;
                void main() {
                    // 只有在极边缘才显示出来的内部辉光
                    float intensity = pow(1.0 - dot(vNormal, vec3(0, 0, 1.0)), 4.0);
                    gl_FragColor = vec4(0.1, 0.5, 1.0, 1.0) * intensity * 0.8;
                }
            `,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide,
            transparent: true,
            depthWrite: false
        });
        const innerGlow = new THREE.Mesh(innerGlowGeo, innerGlowMat);
        earthGroup.add(innerGlow);

        // 行星纹理配置（使用本地下载的真实纹理）
        const textureLoader = new THREE.TextureLoader();
        
        const planetTextures = [
            { 
                url: '/textures/mercury.jpg',
                type: 'mercury',
                color: '#8c7853',
                emissive: '#5a4a3a',
                roughness: 1.0
            },
            { 
                url: '/textures/mars.jpg',
                type: 'mars',
                color: '#e67e22',
                emissive: '#8b4513',
                roughness: 0.9
            },
            { 
                url: '/textures/venus.jpg',
                type: 'venus',
                color: '#f39c12',
                emissive: '#e67e22',
                roughness: 0.8
            },
            { 
                url: '/textures/jupiter.jpg',
                type: 'jupiter',
                color: '#d4a373',
                emissive: '#b8860b',
                roughness: 0.6
            },
            { 
                url: '/textures/saturn.jpg',
                type: 'saturn',
                color: '#f0e68c',
                emissive: '#daa520',
                roughness: 0.7
            },
            { 
                url: '/textures/uranus.jpg',
                type: 'uranus',
                color: '#4fc3f7',
                emissive: '#0288d1',
                roughness: 0.5
            },
            { 
                url: '/textures/neptune.jpg',
                type: 'neptune',
                color: '#1a3a70',
                emissive: '#0d1f3d',
                roughness: 0.5
            },
            { 
                url: '/textures/pluto.jpg',
                type: 'pluto',
                color: '#b5a597',
                emissive: '#8b7d71',
                roughness: 1.0
            }
        ];

        // 创建知识点行星（数据驱动）
        console.log('创建行星，知识点数量:', knowledgePoints.length);
        
        const planets = knowledgePoints.map((kp, index) => {
            const size = 6 + Math.random() * 4;
            const textureConfig = planetTextures[index % planetTextures.length];

            const geometry = new THREE.SphereGeometry(size, 64, 64);
            
            // 加载纹理（带fallback）
            const texture = textureLoader.load(
                textureConfig.url,
                undefined,
                undefined,
                () => {
                    // 纹理加载失败时使用纯色
                    planet.material.map = null;
                    planet.material.color = new THREE.Color(textureConfig.color);
                    planet.material.needsUpdate = true;
                }
            );
            
            const material = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.8, // 统一粗糙度，模拟真实岩石/气体表面
                metalness: 0.0, // 非金属
                emissive: new THREE.Color(textureConfig.emissive),
                emissiveIntensity: 0.05 // 极低自发光，主要靠恒星光照，模拟真实行星
            });

            const planet = new THREE.Mesh(geometry, material);
            
            // 计算位置（球形分布 - 黄金螺旋算法）
            // 使用 Fibonacci Sphere 算法保证初始分布均匀，避免重叠
            const phi = Math.acos(1 - 2 * (index + 0.5) / knowledgePoints.length); // 极角 0 -> PI
            const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 0.5); // 黄金角螺旋
            
            const r = 90 + Math.random() * 90; // 半径范围 90-180，形成厚球壳
            
            // 球坐标转笛卡尔坐标 (Y轴向上)
            const posX = r * Math.sin(phi) * Math.cos(theta);
            const posY = r * Math.cos(phi);
            const posZ = r * Math.sin(phi) * Math.sin(theta);
            
            planet.position.x = posX;
            planet.position.y = posY;
            planet.position.z = posZ;

            // 完整的userData（数据驱动）
            planet.userData = {
                id: kp._id,
                title: kp.title,
                content: kp.content,
                category: kp.category,
                size: size,
                rotationSpeed: 0.005 + Math.random() * 0.01,
                originalColor: new THREE.Color(textureConfig.color),
                textureConfig: textureConfig,
                hasTexture: true
            };

            galaxyGroup.add(planet); // 添加到旋转组
            return planet;
        });
        
        console.log('所有行星已添加到场景，总数:', planets.length);
        console.log('场景中的子对象数量:', scene.children.length);

        // 使用d3-force-3d预计算最优位置
        const forceData = planets.map((planet, i) => {
            const pos = planet.position;
            console.log(`行星${i}初始位置:`, { x: pos.x, y: pos.y, z: pos.z });
            return {
                id: planet.userData.id,
                index: i,
                x: pos.x,
                y: pos.y,
                z: pos.z,
                radius: planet.userData.size * 2  // 关键修复：直接存储碰撞半径
            };
        });

        // 准备连接线数据（基于标签的智能连接策略）
        const linkData = [];
        const addedLinks = new Set(); // 避免重复连接
        
        // 辅助函数：添加连接
        const addLink = (i, j) => {
            if (i === j) return;
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (!addedLinks.has(key)) {
                linkData.push({ source: i, target: j });
                addedLinks.add(key);
            }
        };
        
        // 策略1：如果后端有 related_points，优先使用（显式关系）
        knowledgePoints.forEach((kp, i) => {
            if (kp.related_points && Array.isArray(kp.related_points)) {
                kp.related_points.forEach(relatedId => {
                    const targetIndex = knowledgePoints.findIndex(p => p._id === relatedId);
                    if (targetIndex !== -1) {
                        addLink(i, targetIndex);
                    }
                });
            }
        });
        
        // 策略2：基于标签的连接（核心策略）
        knowledgePoints.forEach((kp1, i) => {
            const tags1 = kp1.tags || [];
            if (tags1.length === 0) return;
            
            knowledgePoints.forEach((kp2, j) => {
                if (i >= j) return; // 避免重复和自连接
                
                const tags2 = kp2.tags || [];
                // 计算共同标签
                const commonTags = tags1.filter(tag => tags2.includes(tag));
                
                // 有共同标签就建立连接
                if (commonTags.length > 0) {
                    addLink(i, j);
                }
            });
        });
        
        // 策略3：(已移除) 同分类补充连接 -> 仅保留严格的标签/关系连接
        // if (linkData.length < knowledgePoints.length * 0.5) { ... }
        
        // 构建邻接表，用于快速查找
        const adjacency = new Array(knowledgePoints.length).fill(0).map(() => []);
        linkData.forEach((link, linkIdx) => {
            adjacency[link.source].push({ nodeIdx: link.target, linkIdx });
            adjacency[link.target].push({ nodeIdx: link.source, linkIdx });
        });

        console.log('连接线数量:', linkData.length);
        console.log('连接策略: 严格基于标签匹配与显式关系');

        // 径向约束力（扩大最大半径）
        function radialForce() {
            const maxRadius = 180; // 原80，现180
            const strength = 0.1;
            
            return () => {
                forceData.forEach(d => {
                    const r = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
                    if (r > maxRadius) {
                        const scale = (maxRadius / r) * strength;
                        d.vx += (0 - d.x) * scale;
                        d.vy += (0 - d.y) * scale;
                        d.vz += (0 - d.z) * scale;
                    }
                });
            };
        }

        // 力导向模拟（调整为更稀疏的布局）
        const simulation = d3.forceSimulation(forceData)
            .numDimensions(3)
            .force('charge', d3.forceManyBody().strength(-120)) // 增强排斥力，让行星更分散
            .force('center', d3.forceCenter(0, 0, 0).strength(0.08)) // 减弱中心引力
            .force('collision', d3.forceCollide().radius(d => d.radius * 2).strength(1.0)) // 加大碰撞半径
            .force('radial', radialForce()) // 添加径向约束
            .alphaDecay(0.02)
            .velocityDecay(0.6)
            .stop();
        
        // 如果有连接线，添加link力（需要转换为节点对象引用）
        if (linkData.length > 0) {
            // 将索引转换为实际节点对象引用
            const linkRefs = linkData.map(link => ({
                source: forceData[link.source],
                target: forceData[link.target]
            }));
            
            simulation.force('link', d3.forceLink(linkRefs)
                .distance(80)  // 原40，现在80，让连线更长
                .strength(0.3)  // 减弱连线强度，避免拉得太紧
            );
        }

        console.log('力导向模拟开始前，检查第一个节点:', forceData[0]);
        
        // 预运行100次达到稳定
        for (let i = 0; i < 100; i++) {
            simulation.tick();
            if (i === 0) {
                console.log('第1次tick后，第一个节点:', forceData[0]);
            }
        }
        
        console.log('100次tick后，第一个节点:', forceData[0]);

        // 应用优化后的位置
        forceData.forEach((d, i) => {
            if (isNaN(d.x) || isNaN(d.y) || isNaN(d.z)) {
                console.error(`节点${i}位置为NaN:`, d);
                // 恢复为初始位置
                d.x = planets[i].position.x;
                d.y = planets[i].position.y;
                d.z = planets[i].position.z;
            }
            planets[i].position.set(d.x, d.y, d.z);
        });
        
        console.log('力导向后的行星位置范围:');
        const distances = forceData.map(d => Math.sqrt(d.x*d.x + d.y*d.y + d.z*d.z));
        console.log('最小距离:', Math.min(...distances).toFixed(2));
        console.log('最大距离:', Math.max(...distances).toFixed(2));
        console.log('平均距离:', (distances.reduce((a,b)=>a+b)/distances.length).toFixed(2));

        // 计算每条连接的基础密度与全局缩放，满足实例总预算
        const linkMetrics = linkData.map(l => {
            const a = planets[l.source].position;
            const b = planets[l.target].position;
            const d = a.distanceTo(b);
            // 粒子数量更少更精简
            const base = Math.max(20, Math.min(80, Math.floor(d * 0.5)));
            return { l, d, base };
        });
        const sumBase = linkMetrics.reduce((acc, m) => acc + m.base, 0) || 1;
        let globalCountScale = Math.min(1, instanceBudget / sumBase);
        globalCountScale = Math.max(globalCountScale, 0.25);

        // 使用 InstancedMesh 生成“陨石带”
        const asteroidTrails = linkMetrics.map(m => createAsteroidTrail(m.l.source, m.l.target));
        // 记录每条 stream 的原始 count
        asteroidTrails.forEach(mesh => { mesh.userData.drawCountBase = mesh.userData.count; });
        // 首次应用全局缩放
        asteroidTrails.forEach(mesh => { mesh.count = Math.max(1, Math.floor(mesh.userData.drawCountBase * globalCountScale)); });

        // 鼠标交互：Raycaster
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let selectedPlanet = null;

        function onMouseMove(event) {
            const rect = currentMount.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            // 射线检测
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(planets);

            if (intersects.length > 0) {
                const object = intersects[0].object;
                // 找到对应的索引（我们可以从 userData 或 planets 数组反查，但这里 planets 是按索引顺序的）
                // 为了稳健，我们在 planets 生成时应该确保存储了 index，虽然 userData 里有 id，但没存 index
                // 让我们假设 planets 数组顺序没变。更好的方式是在 userData 里存 index
                let idx = planets.indexOf(object);
                
                if (idx !== -1) {
                    // 如果已经在悬停这个节点，就不重复计算
                    if (hoverState.current?.nodeIdx !== idx) {
                        const neighbors = new Set(adjacency[idx].map(n => n.nodeIdx));
                        const links = new Set(adjacency[idx].map(n => n.linkIdx));
                        
                        hoverState.current = {
                            nodeIdx: idx,
                            neighbors: neighbors,
                            links: links
                        };
                        document.body.style.cursor = 'pointer';
                    }
                }
            } else {
                if (hoverState.current !== null) {
                    hoverState.current = null;
                    document.body.style.cursor = 'default';
                }
            }
        }

        function onMouseClick() {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(planets);

            if (intersects.length > 0) {
                const clickedObject = intersects[0].object;
                
                // 恢复之前选中的
                if (selectedPlanet) {
                    selectedPlanet.material.emissive.copy(new THREE.Color(selectedPlanet.userData.textureConfig.emissive));
                    selectedPlanet.material.emissiveIntensity = 0.2;
                    selectedPlanet.scale.setScalar(1);
                }

                // 高亮新选中的（增强自发光）
                selectedPlanet = clickedObject;
                selectedPlanet.material.emissive.set(0xffaa00);
                selectedPlanet.material.emissiveIntensity = 0.8;
                selectedPlanet.scale.setScalar(1.5);

                // 显示详情
                setSelectedNodeData(selectedPlanet.userData);
            } else {
                // 点击空白取消选中
                if (selectedPlanet) {
                    selectedPlanet.material.emissive.copy(new THREE.Color(selectedPlanet.userData.textureConfig.emissive));
                    selectedPlanet.material.emissiveIntensity = 0.2;
                    selectedPlanet.scale.setScalar(1);
                    selectedPlanet = null;
                    setSelectedNodeData(null);
                }
            }
        }

        currentMount.addEventListener('mousemove', onMouseMove);
        currentMount.addEventListener('click', onMouseClick);

        // 动画循环
        const clock = new THREE.Clock();
        let fpsAccum = 0, fpsFrames = 0, fpsWindow = 0;
        let drawScale = globalCountScale; // 从全局缩放起步，随后随 FPS 微调
        function animate() {
            requestAnimationFrame(animate);
            const delta = clock.getDelta();
            const fps = 1 / Math.max(1e-4, delta);
            fpsAccum += fps; fpsFrames += 1; fpsWindow += delta;
            if (fpsWindow >= 1.0) {
                const avg = fpsAccum / fpsFrames;
                if (avg < 48) drawScale = Math.max(0.3, drawScale * 0.9);
                else if (avg > 58) drawScale = Math.min(1.0, drawScale * 1.05);
                fpsAccum = 0; fpsFrames = 0; fpsWindow = 0;
            }

            // 地球自转
            earth.rotation.y += 0.05 * delta;
            
            // 星系公转（整体缓慢旋转）
            galaxyGroup.rotation.y += 0.025 * delta; // 约40秒一圈
            
            // 计算星系的全局变换矩阵（用于将世界坐标转为屏幕坐标）
            galaxyGroup.updateMatrixWorld();
            const galaxyMatrix = galaxyGroup.matrixWorld;

            // ---------------------------------------------------
            // 视觉状态更新 (Hover Effects)
            // ---------------------------------------------------
            const hover = hoverState.current;

            // 1. 更新行星 (Planets)
            planets.forEach((planet, i) => {
                planet.rotation.y += planet.userData.rotationSpeed;
                
                // 基础状态
                let targetScale = 1.0;
                let targetEmissiveInt = 0.05; // 默认无/弱自发光，还原真实感
                let targetOpacity = 1.0;
                
                if (hover) {
                    if (i === hover.nodeIdx) {
                        // 当前悬停目标：放大，高亮发光
                        targetScale = 1.8;
                        targetEmissiveInt = 1.5; // 悬停时才发光
                    } else if (hover.neighbors.has(i)) {
                        // 邻居节点：稍微放大，微光
                        targetScale = 1.3;
                        targetEmissiveInt = 0.5;
                    } else {
                        // 其他无关节点：变暗，变小
                        targetScale = 0.6; // 稍微变小
                        targetEmissiveInt = 0.1;
                        targetOpacity = 0.3; // 视觉上变暗
                    }
                } else if (selectedPlanet && planet === selectedPlanet) {
                     // 保持选中状态的高亮
                     targetScale = 1.5;
                     targetEmissiveInt = 0.8;
                }

                // 平滑过渡 (Lerp)
                planet.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
                
                // 材质属性更新
                planet.material.emissiveIntensity += (targetEmissiveInt - planet.material.emissiveIntensity) * 0.1;
                
                // 透明度模拟 (StandardMaterial 不直接支持 alpha 渐变除非开启 transparent，
                // 但我们可以通过修改 color 或 emissive 来模拟变暗)
                // 这里我们主要靠 emissive 和 color 的变暗来模拟“隐身”
                if (hover && !hover.neighbors.has(i) && i !== hover.nodeIdx) {
                    // 变灰暗
                    planet.material.color.lerp(new THREE.Color(0x333333), 0.1);
                } else {
                    // 恢复原色
                    planet.material.color.lerp(planet.userData.originalColor, 0.1);
                }

                // 2. 更新标签位置与样式 (UI Labels)
                const label = labelsRef.current[i];
                if (label) {
                    // 获取行星的世界坐标 (考虑 galaxyGroup 的旋转)
                    // 必须克隆位置，否则会修改原始位置
                    const worldPos = planet.position.clone().applyMatrix4(galaxyMatrix);
                    
                    // 投影到屏幕坐标
                    worldPos.project(camera);
                    
                    // 转换为 CSS 坐标
                    const x = (worldPos.x * .5 + .5) * currentMount.clientWidth;
                    const y = (worldPos.y * -.5 + .5) * currentMount.clientHeight;

                    // 只有在相机前面的才显示 (z < 1)
                    if (worldPos.z < 1) {
                        label.style.display = 'block';
                        label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
                        
                        // 标签样式根据 Hover 状态变化
                        if (hover) {
                            if (i === hover.nodeIdx) {
                                label.style.opacity = 1;
                                label.style.fontSize = '16px';
                                label.style.color = '#fff';
                                label.style.zIndex = 100;
                                label.style.textShadow = '0 0 10px #00ccff';
                            } else if (hover.neighbors.has(i)) {
                                label.style.opacity = 0.8;
                                label.style.fontSize = '12px';
                                label.style.color = '#ccc';
                                label.style.zIndex = 50;
                                label.style.textShadow = 'none';
                            } else {
                                label.style.opacity = 0.1; // 几乎隐藏无关标签
                                label.style.zIndex = 1;
                                label.style.textShadow = 'none';
                            }
                        } else {
                            // 默认状态
                            label.style.opacity = 0.6;
                            label.style.fontSize = '12px';
                            label.style.color = '#aaa';
                            label.style.zIndex = 10;
                            label.style.textShadow = 'none';
                        }
                    } else {
                        label.style.display = 'none';
                    }
                }
            });

            // 3. 更新陨石带 (Asteroid Trails)
            const elapsed = clock.getElapsedTime();
            asteroidTrails.forEach((mesh, idx) => {
                const ud = mesh.userData;
                
                // 连线可见性判断
                let isVisible = true;
                let speedMultiplier = 1.0;

                if (hover) {
                    if (hover.links.has(idx)) {
                        isVisible = true;
                        speedMultiplier = 4.0; // 关联连线加速流动！
                    } else {
                        isVisible = false; // 隐藏无关连线
                    }
                }

                // 平滑控制可见性 (通过缩放实现消失效果，比直接 visible=false 更平滑)
                // 或者简单点，直接设置 count = 0 或 count = normal
                
                if (!isVisible) {
                     // 逐渐减少 count 模拟消失，或者直接隐藏
                     mesh.visible = false;
                } else {
                     mesh.visible = true;
                }
                
                if (!mesh.visible) return;

                // 视距裁剪
                const cam = camera.position;
                const fromP = planets[ud.fromIdx].position;
                const toP = planets[ud.toIdx].position;
                const far = 750;
                const nearScale = (cam.distanceTo(fromP) > far && cam.distanceTo(toP) > far) ? 0.1 : 1.0;
                mesh.count = Math.max(0, Math.floor(ud.drawCountBase * drawScale * nearScale));

                for (let i = 0; i < mesh.count; i++) {
                    const t = (ud.baseT[i] + elapsed * ud.speed[i] * speedMultiplier) % 1; // 应用速度倍率
                    
                    // 1. 计算曲线位置和切线
                    // LineCurve3 也有 getPointAt 和 getTangentAt
                    ud.curve.getPointAt(t, ud.tmpPos);
                    ud.curve.getTangentAt(t, ud.tangent).normalize();
                    
                    // 2. 构建局部坐标系 (Frenet Frame 简化版)
                    // 如果切线接近 Y 轴，就用 X 轴做参考，否则用 Y 轴
                    const refAxis = Math.abs(ud.tangent.dot(ud.up)) > 0.9 ? ud.axisX : ud.up;
                    ud.binormal.crossVectors(ud.tangent, refAxis).normalize();
                    ud.normal.crossVectors(ud.binormal, ud.tangent).normalize();
                    
                    // 3. 应用管状偏移 (Asteroid Belt Width)
                    const angle = ud.offsetAngle[i]; // 保持角度不变，或者慢慢旋转也行
                    const r = ud.offsetRadius[i];
                    
                    // offset = normal * cos(ang) * r + binormal * sin(ang) * r
                    const offN = ud.normal.clone().multiplyScalar(Math.cos(angle) * r);
                    const offB = ud.binormal.clone().multiplyScalar(Math.sin(angle) * r);
                    ud.tmpPos.add(offN).add(offB);

                    // 4. 自旋 (Tumbling)
                    const rotSpeed = ud.rotSpeed[i];
                    const axis = new THREE.Vector3(ud.rotAxis[i*3], ud.rotAxis[i*3+1], ud.rotAxis[i*3+2]).normalize();
                    ud.tmpQuat.setFromAxisAngle(axis, elapsed * rotSpeed + i); // +i 增加初始相位随机性

                    // 5. 非均匀缩放 (Non-uniform Scaling)
                    ud.tmpScale.set(ud.scale3D[i*3], ud.scale3D[i*3+1], ud.scale3D[i*3+2]);
                    
                    // 组合矩阵
                    ud.tmpMatrix.compose(ud.tmpPos, ud.tmpQuat, ud.tmpScale);
                    mesh.setMatrixAt(i, ud.tmpMatrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
            });
            
            /* 移除旧的交互逻辑，避免冲突
            // 悬停检测
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(planets);
            ...
            */

            controls.update();
            renderer.render(scene, camera);
        }

        animate();

        // 窗口自适应
        const handleResize = () => {
            const w = currentMount.clientWidth;
            const h = currentMount.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };

        window.addEventListener('resize', handleResize);

        // 清理
        return () => {
            window.removeEventListener('resize', handleResize);
            currentMount.removeEventListener('mousemove', onMouseMove);
            currentMount.removeEventListener('click', onMouseClick);
            document.body.style.cursor = 'default';
            
            // 释放所有几何体和材质
            planets.forEach(p => {
                p.geometry.dispose();
                p.material.dispose();
            });

            // 移除并释放陨石带实例
            if (typeof asteroidTrails !== 'undefined') {
                asteroidTrails.forEach(trail => {
                    galaxyGroup.remove(trail);
                    if (trail.instanceMatrix) trail.instanceMatrix.dispose && trail.instanceMatrix.dispose();
                });
            }
            rockGeometry.dispose();
            rockMaterial.dispose();

            earth.geometry.dispose();
            earth.material.dispose();
            atmosphere.geometry.dispose();
            atmosphere.material.dispose();
            innerGlow.geometry.dispose();
            innerGlow.material.dispose();
            
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }
            renderer.dispose();
            controls.dispose();
        };
    }, [knowledgePoints]);

    if (loading) {
        return (
            <div style={{
                width: '100vw', height: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(to bottom, #000511, #000000)',
                color: '#fff', fontSize: '20px'
            }}>
                <div style={{
                    padding: '25px 45px', borderRadius: '12px',
                    border: '2px solid #00ccff',
                    boxShadow: '0 0 30px rgba(0,204,255,0.5)'
                }}>
                    🌌 正在构建知识宇宙...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                width: '100vw', height: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#000', color: '#ff4444', fontSize: '18px'
            }}>
                <div style={{
                    padding: '25px', borderRadius: '10px',
                    border: '2px solid #ff4444'
                }}>
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
            <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
            
            {/* 连线模式提示信息 */}
            
            {/* 3D 场景中的标签层 */}
            <div 
                ref={labelsContainerRef}
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    width: '100%', height: '100%',
                    pointerEvents: 'none', // 确保不阻挡鼠标点击 canvas
                    overflow: 'hidden'
                }}
            >
                {knowledgePoints.map((kp, i) => (
                    <div
                        key={kp._id || i}
                        ref={el => labelsRef.current[i] = el}
                        style={{
                            position: 'absolute',
                            top: 0, left: 0,
                            color: '#aaa',
                            fontSize: '12px',
                            fontFamily: 'Arial, sans-serif',
                            whiteSpace: 'nowrap',
                            userSelect: 'none',
                            pointerEvents: 'none',
                            transition: 'opacity 0.2s, color 0.2s, font-size 0.2s',
                            textShadow: '0 0 2px black',
                            opacity: 0, // 初始不可见，由 animate 控制
                            willChange: 'transform, opacity'
                        }}
                    >
                        {kp.title}
                    </div>
                ))}
            </div>

                <div className="controls-group" style={{
                    display: 'flex',
                    gap: '20px',
                    alignItems: 'center',
                    position: 'absolute',
                    bottom: '30px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 10
                }}>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(5px)',
                        padding: '10px 30px',
                        borderRadius: '50px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '13px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        display: 'flex',
                        gap: '20px',
                        boxShadow: '0 5px 20px rgba(0,0,0,0.2)'
                    }}>
                        <span>🖱️ 左键旋转</span>
                        <span>🖱️ 右键平移</span>
                        <span>🔍 滚轮缩放</span>
                        <span>👆 点击星球</span>
                    </div>
                </div>
            
            {/* 详情卡片 */}
            {selectedNodeData && (
                <div style={{
                    position: 'fixed', right: '25px', bottom: '25px',
                    width: '350px', maxHeight: '500px',
                    background: 'rgba(0,5,17,0.95)', backdropFilter: 'blur(15px)',
                    color: 'white', padding: '25px', borderRadius: '15px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.8), 0 0 30px rgba(0,204,255,0.6)',
                    border: '2px solid rgba(0,204,255,0.7)',
                    overflow: 'auto', zIndex: 1000,
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '22px', color: '#00ccff' }}>
                            🪐 {selectedNodeData.title}
                        </h3>
                        <button
                            onClick={() => setSelectedNodeData(null)}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                color: '#fff',
                                cursor: 'pointer',
                                borderRadius: '50%',
                                width: '30px',
                                height: '30px',
                                fontSize: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            ✕
                        </button>
                    </div>
                    <div 
                        style={{ lineHeight: '1.8', color: '#ccc', fontSize: '15px' }}
                        dangerouslySetInnerHTML={{ 
                            __html: DOMPurify.sanitize(selectedNodeData.content || '暂无内容') 
                        }} 
                    />
                    {selectedNodeData.category && (
                        <div style={{
                            marginTop: '15px',
                            padding: '8px 15px',
                            background: 'rgba(0,204,255,0.1)',
                            border: '1px solid rgba(0,204,255,0.3)',
                            borderRadius: '8px',
                            fontSize: '13px',
                            color: '#00ccff'
                        }}>
                            📂 分类: {selectedNodeData.category}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default KnowledgeUniversePage;
