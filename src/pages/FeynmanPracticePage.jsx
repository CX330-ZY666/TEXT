// src/pages/FeynmanPracticePage.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import apiClient from '../api/axios';
import VoiceRecorder from '../components/VoiceRecorder';
import './FeynmanPracticePage.css';

function FeynmanPracticePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  // 知识点数据
  const [knowledgePoint, setKnowledgePoint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 对话状态
  const [inputMode, setInputMode] = useState('text'); // 'text' | 'voice'
  const [userInput, setUserInput] = useState('');
  const [conversations, setConversations] = useState([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');

  // 语音转写中间状态
  const [voiceTranscribedText, setVoiceTranscribedText] = useState('');

  // 薄弱点
  const [weakPoints, setWeakPoints] = useState([]);
  const [showWeakPointInput, setShowWeakPointInput] = useState(false);
  const [newWeakPoint, setNewWeakPoint] = useState('');

  // 练习总结
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState(null);

  // 获取知识点数据
  useEffect(() => {
    const fetchKnowledgePoint = async () => {
      try {
        const response = await apiClient.get(`/knowledge-points/${id}`);
        setKnowledgePoint(response.data);
        
        // 添加AI的欢迎消息
        setConversations([{
          role: 'ai',
          content: `你好！我是小问 👋 我听说你想给我讲讲「${response.data.title}」？我完全不懂这个，请用最简单的话给我解释一下吧！`,
          timestamp: new Date()
        }]);
      } catch (err) {
        console.error('获取知识点失败:', err);
        setError('加载知识点失败');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchKnowledgePoint();
    }
  }, [id]);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations]);

  // 发送讲解内容
  const handleSendExplanation = async () => {
    if (!userInput.trim() || isAiThinking) return;

    const userMessage = {
      role: 'user',
      content: userInput.trim(),
      timestamp: new Date()
    };

    // 添加用户消息
    setConversations(prev => [...prev, userMessage]);
    setUserInput('');
    setIsAiThinking(true);
    setAiError('');

    try {
      // 调用AI学生提问API
      const response = await apiClient.post('/feynman-practice/ask', {
        knowledgePointId: id,
        userExplanation: userMessage.content,
        conversationHistory: conversations
      });

      // 添加AI回复
      const aiMessage = {
        role: 'ai',
        content: response.data.question,
        timestamp: new Date()
      };
      setConversations(prev => [...prev, aiMessage]);

    } catch (err) {
      console.error('AI回复失败:', err);
      setAiError(err.response?.data?.msg || 'AI学生暂时无法回应，请稍后重试');
    } finally {
      setIsAiThinking(false);
    }
  };

  // 语音转写完成回调 - 不自动追加，等待用户确认
  const handleVoiceTranscribe = (text) => {
    // 不做任何操作，让用户通过 onTextChange 查看结果后手动添加
  };

  // 语音转写文本变化回调
  const handleVoiceTextChange = (text) => {
    setVoiceTranscribedText(text || '');
  };

  // 将转写结果添加到输入框
  const handleAddTranscribedText = () => {
    if (voiceTranscribedText && !voiceTranscribedText.startsWith('转录失败')) {
      setUserInput(prev => prev ? prev + ' ' + voiceTranscribedText : voiceTranscribedText);
      setVoiceTranscribedText('');
    }
  };

  // 添加薄弱点
  const handleAddWeakPoint = async () => {
    if (!newWeakPoint.trim()) return;

    const weakPoint = {
      content: newWeakPoint.trim(),
      resolved: false,
      createdAt: new Date()
    };

    setWeakPoints(prev => [...prev, weakPoint]);
    setNewWeakPoint('');
    setShowWeakPointInput(false);

    // 保存到后端
    try {
      await apiClient.post('/feynman-practice/save-weak-point', {
        knowledgePointId: id,
        weakPoint: weakPoint.content
      });
    } catch (err) {
      console.error('保存薄弱点失败:', err);
    }
  };

  // 标记薄弱点为已解决
  const handleResolveWeakPoint = (index) => {
    setWeakPoints(prev => prev.map((wp, i) => 
      i === index ? { ...wp, resolved: !wp.resolved } : wp
    ));
  };

  // 结束练习，显示总结
  const handleEndPractice = async () => {
    try {
      const response = await apiClient.post('/feynman-practice/summary', {
        knowledgePointId: id,
        conversationHistory: conversations
      });
      setSummary(response.data);
      setShowSummary(true);
    } catch (err) {
      console.error('获取总结失败:', err);
      // 即使失败也显示基本总结
      const userCount = conversations.filter(c => c.role === 'user').length;
      const aiCount = conversations.filter(c => c.role === 'ai').length;
      setSummary({
        summary: `本次练习你讲解了 ${userCount} 次，AI学生提出了 ${aiCount - 1} 个问题。`,
        questionCount: aiCount - 1,
        suggestions: ['继续加油！']
      });
      setShowSummary(true);
    }
  };

  // 快速标记当前AI问题为薄弱点
  const handleMarkAsWeak = () => {
    const lastAiMessage = [...conversations].reverse().find(c => c.role === 'ai');
    if (lastAiMessage) {
      const weakContent = `关于「${knowledgePoint.title}」的问题: ${lastAiMessage.content.substring(0, 50)}...`;
      setNewWeakPoint(weakContent);
      setShowWeakPointInput(true);
    }
  };

  if (loading) {
    return (
      <div className="feynman-practice-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !knowledgePoint) {
    return (
      <div className="feynman-practice-container">
        <div className="practice-header">
          <Link to="/" className="back-btn">← 返回主页</Link>
        </div>
        <div className="error-message">{error || '知识点不存在'}</div>
      </div>
    );
  }

  return (
    <div className="feynman-practice-container">
      {/* 页面头部 */}
      <div className="practice-header">
        <h1>🎓 费曼练习</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="end-practice-btn" onClick={handleEndPractice}>
            📊 结束练习
          </button>
          <Link to="/" className="back-btn">← 返回主页</Link>
        </div>
      </div>

      {/* 知识点信息 */}
      <div className="kp-info-card">
        <h2>📖 {knowledgePoint.title}</h2>
        <p>用自己的话向AI学生"小问"讲解这个概念，看看能不能讲清楚！</p>
      </div>

      {/* 主内容区 */}
      <div className="practice-main">
        {/* 左侧：讲解输入区 */}
        <div className="practice-panel">
          <div className="panel-title">
            <span>📝</span> 你的讲解
          </div>

          <div className="explanation-input">
            {/* 输入模式切换 */}
            <div className="input-mode-toggle">
              <button 
                className={`mode-btn ${inputMode === 'text' ? 'active' : ''}`}
                onClick={() => setInputMode('text')}
              >
                ⌨️ 文字输入
              </button>
              <button 
                className={`mode-btn ${inputMode === 'voice' ? 'active' : ''}`}
                onClick={() => setInputMode('voice')}
              >
                🎤 语音输入
              </button>
            </div>

            {/* 文字输入区 */}
            <div className="text-input-area">
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="假设小问完全不懂这个概念，你会怎么给他解释？&#10;&#10;试着用简单的语言、生活中的例子来讲解..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    handleSendExplanation();
                  }
                }}
              />
            </div>

            {/* 语音输入区 */}
            {inputMode === 'voice' && (
              <div className="voice-input-area">
                <VoiceRecorder 
                  onTranscribeComplete={handleVoiceTranscribe}
                  relatedId={id}
                  transcribedText={voiceTranscribedText}
                  onTextChange={handleVoiceTextChange}
                />
                {voiceTranscribedText && !voiceTranscribedText.startsWith('转录失败') && (
                  <button 
                    className="add-transcribed-btn"
                    onClick={handleAddTranscribedText}
                    style={{
                      marginTop: '10px',
                      padding: '10px 20px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      width: '100%'
                    }}
                  >
                    ✔️ 将转写结果添加到输入框
                  </button>
                )}
              </div>
            )}

            {/* 发送按钮 */}
            <button 
              className="send-btn"
              onClick={handleSendExplanation}
              disabled={!userInput.trim() || isAiThinking}
            >
              {isAiThinking ? '🤔 小问正在思考...' : '📤 发送讲解 (Ctrl+Enter)'}
            </button>

            {aiError && <div className="error-message">{aiError}</div>}
          </div>
        </div>

        {/* 右侧：AI对话区 */}
        <div className="practice-panel">
          <div className="panel-title">
            <span>🤖</span> AI学生"小问"
          </div>

          <div className="conversation-area">
            <div className="messages-list">
              {conversations.length === 0 ? (
                <div className="welcome-message">
                  <div className="emoji">👋</div>
                  <h3>准备好了吗？</h3>
                  <p>在左侧输入你的讲解，小问会认真听并提出问题~</p>
                </div>
              ) : (
                conversations.map((msg, index) => (
                  <div key={index} className={`message ${msg.role}`}>
                    <div className="message-sender">
                      {msg.role === 'user' ? '👤 你' : '🤖 小问'}
                    </div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))
              )}

              {isAiThinking && (
                <div className="ai-typing">
                  <span>🤖 小问正在思考</span>
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* 快速标记薄弱点 */}
            {conversations.length > 1 && !isAiThinking && (
              <button className="mark-weak-btn" onClick={handleMarkAsWeak}>
                ❓ 这个问题我答不上来，标记为薄弱点
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 薄弱点记录区域 */}
      {(weakPoints.length > 0 || showWeakPointInput) && (
        <div className="weak-points-section">
          <div className="weak-points-header">
            <h3>💡 薄弱点记录</h3>
            {!showWeakPointInput && (
              <button 
                className="weak-point-btn"
                onClick={() => setShowWeakPointInput(true)}
              >
                + 手动添加
              </button>
            )}
          </div>

          {showWeakPointInput && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <input
                type="text"
                value={newWeakPoint}
                onChange={(e) => setNewWeakPoint(e.target.value)}
                placeholder="输入你不确定的概念..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  color: '#fff'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddWeakPoint();
                }}
              />
              <button className="weak-point-btn" onClick={handleAddWeakPoint}>
                添加
              </button>
              <button 
                className="weak-point-btn" 
                onClick={() => {
                  setShowWeakPointInput(false);
                  setNewWeakPoint('');
                }}
              >
                取消
              </button>
            </div>
          )}

          <div className="weak-points-list">
            {weakPoints.map((wp, index) => (
              <div 
                key={index} 
                className={`weak-point-item ${wp.resolved ? 'resolved' : ''}`}
              >
                <span>{wp.resolved ? '✅' : '❓'}</span>
                <span className="weak-point-content">{wp.content}</span>
                <div className="weak-point-actions">
                  <button 
                    className={`weak-point-btn ${wp.resolved ? '' : 'resolve'}`}
                    onClick={() => handleResolveWeakPoint(index)}
                  >
                    {wp.resolved ? '撤销' : '我搞懂了'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 练习总结弹窗 */}
      {showSummary && summary && (
        <div className="summary-modal-overlay" onClick={() => setShowSummary(false)}>
          <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
            <h2>🎉 练习完成！</h2>
            
            <div className="summary-stats">
              <div className="stat-item">
                <div className="stat-value">
                  {conversations.filter(c => c.role === 'user').length}
                </div>
                <div className="stat-label">次讲解</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{summary.questionCount || 0}</div>
                <div className="stat-label">个追问</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{weakPoints.length}</div>
                <div className="stat-label">个薄弱点</div>
              </div>
            </div>

            <p style={{ color: '#ccc', marginBottom: '20px' }}>{summary.summary}</p>

            {summary.suggestions && summary.suggestions.length > 0 && (
              <div className="summary-suggestions">
                <h4>💡 学习建议</h4>
                <ul>
                  {summary.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            <button 
              className="close-summary-btn"
              onClick={() => navigate('/')}
            >
              返回主页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FeynmanPracticePage;
