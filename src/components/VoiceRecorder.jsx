// src/components/VoiceRecorder.jsx
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

/**
 * VoiceRecorder 组件
 * 提供语音录制、播放、转文字功能
 * @param {Function} onTranscribeComplete - 转文字完成后的回调 (text) => void
 * @param {string} relatedId - 关联的知识点 ID（用于上传）
 */
function VoiceRecorder({ onTranscribeComplete, relatedId }) {
  const [status, setStatus] = useState('idle'); // idle, recording, paused
  const [seconds, setSeconds] = useState(0);
  const [transcribedText, setTranscribedText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [volume, setVolume] = useState(0);
  const [mediaBlobUrl, setMediaBlobUrl] = useState('');

  const timerRef = useRef(null);
  const recorderRef = useRef(null);
  const volumeRef = useRef(0);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);

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

  // 设置音量监听（使用已有的 stream）
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
    } catch (err) {
      console.warn('音量监听初始化失败:', err?.message);
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

  // 上传 Blob 进行语音识别
  const uploadBlob = async (audioBlob) => {
    setIsUploading(true);
    setTranscribedText('');
    try {
      const mime = audioBlob.type || 'audio/wav';
      const audioFile = new File([audioBlob], `voice-record-${relatedId}.wav`, { type: mime });

      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('knowledgePointId', relatedId);
      formData.append('durationSeconds', String(seconds));
      formData.append('mimeType', mime);

      const response = await apiClient.post('/audio/transcribe', formData, {
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
      const text = result || msg || '转录结果为空，请稍后重试。';
      setTranscribedText(text);
      if (onTranscribeComplete) {
        onTranscribeComplete(text);
      }
    } catch (error) {
      const errorMsg =
        error?.response?.data?.msg ||
        error?.response?.data?.error ||
        error?.message ||
        '转录失败，请重试。';
      const text = `转录失败: ${errorMsg}`;
      setTranscribedText(text);
      if (onTranscribeComplete) {
        onTranscribeComplete(text);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleStart = async () => {
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
      
      const recorder = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
      });
      recorderRef.current = recorder;
      recorder.startRecording();
      setStatus('recording');
    } catch (err) {
      console.error('无法开始录音:', err);
      teardownVolumeMeter();
    }
  };

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
      } catch (err) {
        console.error('停止录音失败:', err);
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
    } catch (err) {
      console.warn('暂停失败:', err);
    }
  };

  const handleResume = () => {
    if (!recorderRef.current) return;
    try {
      recorderRef.current.resumeRecording();
      setStatus('recording');
    } catch (err) {
      console.warn('继续失败:', err);
    }
  };

  const handleClear = () => {
    setTranscribedText('');
    setMediaBlobUrl('');
    setSeconds(0);
  };

  return (
    <div style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '6px', background: '#f9f9f9' }}>
      <h3>语音输入</h3>

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
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 24, padding: '0 6px', background: '#e8e8e8', borderRadius: 6 }}>
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
          <label>录音回放：</label>
          <audio src={mediaBlobUrl} controls style={{ width: '100%' }} />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label>转文字结果：</label>
        {isUploading && <p style={{ color: '#666', fontSize: '0.9rem' }}>正在上传并转录，请稍候...</p>}
        <textarea
          value={transcribedText}
          onChange={(e) => setTranscribedText(e.target.value)}
          style={{ width: '100%', height: '100px', padding: '8px', fontFamily: 'inherit', border: '1px solid #ccc', borderRadius: '4px' }}
          placeholder="转录结果将显示在这里，你也可以手动编辑"
        />
      </div>

      <button onClick={handleClear} style={{ background: '#999', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' }}>
        清空录音
      </button>
    </div>
  );
}

export default VoiceRecorder;
