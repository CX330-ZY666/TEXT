// src/pages/FeynmanRecordPage.jsx
import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import apiClient from '../api/axios';

// 异步下载 RecordRTC
const getRecordRTC = async () => {
  try {
    const RecordRTC = (await import('recordrtc')).default;
    return RecordRTC;
  } catch (err) {
    console.error('RecordRTC 加载失败:', err);
    throw new Error('RecordRTC 加载失败：' + err.message);
  }
};

function FeynmanRecordPage() {
  const { id } = useParams();
  const [kpTitle, setKpTitle] = useState('');
  const [transcribedText, setTranscribedText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [seconds, setSeconds] = useState(0);

  const timerRef = useRef(null);
  const volumeRef = useRef(0);
  const [volume, setVolume] = useState(0);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    const fetchKpTitle = async () => {
      try {
        const response = await apiClient.get(`/knowledge-points/${id}`);
        setKpTitle(response.data?.title || '');
      } catch (err) {
        console.warn('加载知识点标题失败:', err);
        setLoadError('加载知识点标题失败');
      }
    };
    fetchKpTitle();
  }, [id]);

  /** 上传 Blob 到后端进行语音识别 */
  const uploadBlob = async (audioBlob) => {
    setIsUploading(true);
    setTranscribedText('');
    try {
      const mime = audioBlob.type || 'audio/wav';
      const audioFile = new File([audioBlob], `feynman-record-${id}.wav`, { type: mime });

      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('knowledgePointId', id);
      formData.append('durationSeconds', String(seconds));
      formData.append('mimeType', mime);
      const url = '/audio/transcribe';

      const response = await apiClient.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const result =
        response.data?.result ||
        response.data?.text ||
        response.data?.transcription ||
        response.data?.DisplayText ||
        response.data?.results?.[0]?.alternatives?.[0]?.transcript ||
        '';
      const msg = response.data?.msg || response.data?.message || '';
      setTranscribedText(result || msg || '转录结果为空，请稍后重试。');
    } catch (error) {
      const errorMsg =
        error?.response?.data?.msg ||
        error?.response?.data?.error ||
        error?.message ||
        '转录失败，请重试。';
      setTranscribedText(`转录失败: ${errorMsg}`);
    } finally {
      setIsUploading(false);
    }
  };

  /** 状态与录音控制 */
  const [status, setStatus] = useState('idle');
  const recorderRef = useRef(null);
  const [mediaBlobUrl, setMediaBlobUrl] = useState('');

  // 计时器
  useEffect(() => {
    if (status === 'recording') {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  /** 设置音量监听（使用已有的 stream） */
  const setupVolumeMeter = (stream) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(1, rms * 3);
        volumeRef.current = level;
        setVolume(level);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('音量监听初始化失败:', e?.message);
    }
  };

  const teardownVolumeMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    setVolume(0);
  };
  /** 修正版：开始录音（合并 getUserMedia，仅调用一次） */
  const handleStart = async () => {
    setSaveMsg('');
    setSeconds(0);
    try {
      // 此时动态加载 RecordRTC
      const RecordRTC = await getRecordRTC();
      if (!RecordRTC) {
        throw new Error('RecordRTC 模块暑未加载');
      }

      // 唯一一次 getUserMedia 调用
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      
      // 配置音量监听（使用为获取的 stream）
      setupVolumeMeter(stream);
      
      // 创建并开始录音
      const recorder = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
      });
      recorderRef.current = recorder;
      recorder.startRecording();
      setStatus('recording');
    } catch (e) {
      console.error('无法开始录音:', e);
      teardownVolumeMeter();
    }
  };

  /** 停止录音 */
  const handleStop = () => {
    teardownVolumeMeter();
    if (!recorderRef.current) return;
    const recorder = recorderRef.current;
    recorder.stopRecording(async () => {
      try {
        const blob = recorder.getBlob();
        const url = URL.createObjectURL(blob);
        setMediaBlobUrl(url);
        setStatus('idle');
        await uploadBlob(blob);
      } catch (e) {
        console.error('停止录音失败:', e);
      } finally {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        recorderRef.current = null;
      }
    });
  };

  const handlePause = () => {
    if (!recorderRef.current) return;
    try {
      recorderRef.current.pauseRecording();
      setStatus('paused');
    } catch (e) {
      console.warn('暂停失败:', e);
    }
  };

  const handleResume = () => {
    if (!recorderRef.current) return;
    try {
      recorderRef.current.resumeRecording();
      setStatus('recording');
    } catch (e) {
      console.warn('继续失败:', e);
    }
  };

  const saveAttempt = async () => {
    if (!transcribedText) return;
    try {
      setIsSaving(true);
      setSaveMsg('');
      await apiClient.post('/feynman-attempts', {
        knowledgePointId: id,
        text: transcribedText,
        durationSeconds: seconds,
      });
      setSaveMsg('已保存复述。');
    } catch (e) {
      setSaveMsg(`保存失败：${e?.response?.data?.msg || e?.message || '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <h1>复述知识点: {kpTitle}</h1>
      {!!loadError && <p style={{ color: 'red' }}>{loadError}</p>}
      <p>录音状态: {status}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={handleStart} disabled={status === 'recording'}>
          开始录音
        </button>
        <button onClick={handleStop} disabled={status !== 'recording' && status !== 'paused'}>
          停止录音
        </button>
        <button onClick={handlePause} disabled={status !== 'recording'}>
          暂停
        </button>
        <button onClick={handleResume} disabled={status !== 'paused'}>
          继续
        </button>
        <span style={{ color: '#555' }}>
          计时：{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
        </span>

        {/* 音量条 */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 24, padding: '0 6px', background: '#f2f2f2', borderRadius: 6 }}>
          {Array.from({ length: 16 }).map((_, i) => {
            const jitter = (Math.random() - 0.5) * 0.15;
            const lvl = Math.max(0, Math.min(1, volume + jitter));
            const h = 4 + Math.round(lvl * 20 * ((i + 4) / 20));
            const color = status === 'recording' ? (lvl > 0.75 ? '#e74c3c' : lvl > 0.4 ? '#f39c12' : '#2ecc71') : '#bbb';
            return <div key={i} style={{ width: 6, height: h, background: color, borderRadius: 2, transition: 'height 80ms linear' }} />;
          })}
        </div>
      </div>

      {mediaBlobUrl && (
        <div style={{ marginBottom: 12 }}>
          <audio src={mediaBlobUrl} controls />
        </div>
      )}

      <h2>AI 转录结果</h2>
      {isUploading && <p style={{ color: '#666' }}>正在上传并转录，请稍候...</p>}
      <div style={{ border: '1px solid #ccc', padding: '1rem', minHeight: '100px', background: '#fafafa', borderRadius: '4px' }}>
        {transcribedText ? (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{transcribedText}</p>
        ) : (
          <p style={{ margin: 0, color: '#999', fontStyle: 'italic' }}>暂无转录结果，请先录音并停止。</p>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={saveAttempt} disabled={!transcribedText || isSaving}>
          {isSaving ? '保存中...' : '保存复述'}
        </button>
        {!!saveMsg && <span style={{ color: saveMsg.startsWith('保存失败') ? 'red' : '#0a5' }}>{saveMsg}</span>}
      </div>
    </div>
  );
}

export default FeynmanRecordPage;
