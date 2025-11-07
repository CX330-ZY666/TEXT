// src/pages/KnowledgePointFormPage.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/axios';
import LocalVoiceRecorder from '../components/LocalVoiceRecorder';

function KnowledgePointFormPage() {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState(''); // content现在将存储HTML
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(id);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

    // 编辑模式加载已有数据
    useEffect(() => {
        if (!isEditing) return;
        const fetchKp = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await apiClient.get(`/knowledge-points/${id}`);
                const kp = res.data;
                setTitle(kp?.title || '');
                setContent(kp?.content || '');
            } catch (e) {
                console.error('加载知识点失败', e);
                setError('加载知识点失败');
            } finally {
                setLoading(false);
            }
        };
        fetchKp();
    }, [id, isEditing]);

    const handleVoiceTranscribeComplete = (text) => {
        // 将转录的文本追加到 content 中
        if (text && !text.startsWith('转录失败')) {
            setContent((prev) => (prev ? prev + '\n' + text : text));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // 注意：content现在是HTML，后端需要能处理HTML
        const kpData = { title, content };
        try {
            setLoading(true);
            setError('');
            if (isEditing) {
                await apiClient.put(`/knowledge-points/${id}`, kpData);
            } else {
                await apiClient.post('/knowledge-points', kpData);
            }
            navigate('/');
        } catch (error) {
            console.error('保存知识点失败', error);
            setError(error?.response?.data?.msg || '保存知识点失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>{isEditing ? '编辑知识点' : '新建知识点'}</h1>
            {loading && <p>加载中...</p>}
            {!!error && <p style={{ color: 'red' }}>{error}</p>}
            <form onSubmit={handleSubmit}>
                <div>
                    <label>标题:</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', padding: '8px' }} />
                </div>
                <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                    <label>内容:</label>
                    {!isEditing && (
                      <button 
                        type="button" 
                        onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                        style={{ marginLeft: '1rem', background: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' }}
                      >
                        {showVoiceRecorder ? '隐藏语音输入' : '🎙️ 添加语音'}
                      </button>
                    )}
                    {!isEditing && showVoiceRecorder && (
                        <div style={{ marginTop: '1rem' }}>
                            <LocalVoiceRecorder onTranscribeComplete={handleVoiceTranscribeComplete} />
                        </div>
                    )}
                    {/* 临时使用原生textarea以绕过 React 19 与 react-quill 的依赖冲突 */}
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      style={{ width: '100%', height: '300px', padding: '8px', fontFamily: 'inherit', marginTop: '0.5rem' }}
                      placeholder="在这里输入内容，你也可以使用上方的语音输入为内容添加声音转录的文本。"
                    />
                </div>
                <button type="submit" style={{ marginTop: '1rem' }}>{isEditing ? '更新' : '创建'}</button>
            </form>
        </div>
    );
}
export default KnowledgePointFormPage;