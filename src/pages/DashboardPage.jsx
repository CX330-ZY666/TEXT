// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';

function DashboardPage() {
  const [knowledgePoints, setKnowledgePoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchKnowledgePoints = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/knowledge-points');
        setKnowledgePoints(response.data || []);
      } catch (err) {
        setError('获取知识点失败');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchKnowledgePoints();
  }, []);

  // 当列表变化时初始化并触发 Mermaid 渲染（渲染在自定义代码块里）
  useEffect(() => {
    try {
      mermaid.initialize({ startOnLoad: true, theme: 'default' });
      mermaid.contentLoaded();
    } catch (e) {
      // 不中断页面
      console.warn('Mermaid 初始化失败: ', e?.message);
    }
  }, [knowledgePoints]);

  const handleDelete = async (id) => {
    if (!window.confirm('你确定要删除这个知识点吗？')) return;
    try {
      console.log('发起删除请求:', `/knowledge-points/${id}`);
      const res = await apiClient.delete(`/knowledge-points/${id}`);
      console.log('删除成功，响应:', res?.status, res?.data);
      setKnowledgePoints((prev) => prev.filter((kp) => kp._id !== id));
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      console.error('删除失败:', status, data || err?.message);
      if (status === 401 || status === 403) {
        alert('没有权限或未登录，请先登录再试');
      } else if (status === 404) {
        alert('该知识点不存在或已被删除');
      } else {
        alert(`删除失败：${data?.msg || data?.error || err?.message || '未知错误'}`);
      }
    }
  };

  if (loading) return <p>加载中...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h1>我的知识点</h1>
      <Link to="/kp/new">
        <button>+ 新建知识点</button>
      </Link>

      <div style={{ marginTop: '20px' }}>
        {knowledgePoints.length === 0 ? (
          <p>你还没有任何知识点，快去创建一个吧！</p>
        ) : (
          <ul>
            {knowledgePoints.map((kp) => (
              <li key={kp._id} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
                <h2>{kp.title}</h2>
                <div className="markdown-content" style={{ background: '#f9f9f9', padding: '10px', borderRadius: '5px' }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeSanitize, rehypeKatex]}
                    components={{
                      code({ inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!inline && match && match[1] === 'mermaid') {
                          // 让 mermaid 接管渲染，内容放入占位 div，由 mermaid.contentLoaded() 处理
                          return (
                            <div className="mermaid" {...props}>
                              {String(children).replace(/\n$/, '')}
                            </div>
                          );
                        }
                        return <code className={className} {...props}>{children}</code>;
                      }
                    }}
                  >
                    {kp.content || ''}
                  </ReactMarkdown>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
                  <Link to={`/kp/edit/${kp._id}`}><button>编辑</button></Link>
                  <button onClick={() => handleDelete(kp._id)} style={{ background: 'red', color: '#fff' }}>删除</button>
                  <Link to={`/feynman/${kp._id}`}><button>开始复述</button></Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;