import { createSignal, onCleanup } from "solid-js"

// 检测是否在 Tauri 环境中
const isTauri = typeof window !== "undefined" && "__TAURI__" in window

// 动态获取 Tauri fetch（仅在桌面环境可用）
async function getFetch(): Promise<typeof fetch> {
  if (isTauri) {
    try {
      // 使用 dynamic import 避免 TypeScript 编译错误
      const plugin = await import("@tauri-apps/plugin-http")
      return plugin.fetch
    } catch {
      console.warn("[ASR] Tauri HTTP plugin not available, using native fetch")
    }
  }
  return fetch
}

// ASR 配置（写死在代码中）
const ASR_CONFIG = {
  apiKey: "sk-e003b373ca1c4eeaaefd78c6c709405a",
  apiUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  model: "qwen-audio-turbo-latest",
}

// 将 Blob 转换为 base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // 移除 data:xxx;base64, 前缀，只保留 base64 数据
      const base64 = result.split(",")[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ASR API 调用（使用 Tauri HTTP 插件绕过 CORS）
async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    // 将音频转换为 base64
    const base64Audio = await blobToBase64(audioBlob)

    // 构建请求体（原生 DashScope API 格式）
    const requestBody = {
      model: ASR_CONFIG.model,
      input: {
        messages: [
          {
            role: "system",
            content: [{ text: "You are a helpful assistant." }],
          },
          {
            role: "user",
            content: [
              { audio: `data:;base64,${base64Audio}` },
              { text: "这段音频在说什么?" },
            ],
          },
        ],
      },
    }

    console.log("[ASR] 发送请求...", { model: ASR_CONFIG.model, audioSize: audioBlob.size, isTauri })

    // 获取合适的 fetch 函数（Tauri 环境使用插件绕过 CORS）
    const fetchFn = await getFetch()

    const response = await fetchFn(ASR_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ASR_CONFIG.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    console.log("[ASR] 响应状态:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[ASR] 错误响应:", errorText)
      throw new Error(`ASR 请求失败: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("[ASR] 响应数据:", data)

    // 提取响应内容
    // 格式：output.choices[0].message.content[0].text
    const content = data.output?.choices?.[0]?.message?.content?.[0]?.text
    if (!content) {
      console.error("[ASR] 响应格式异常:", data)
      throw new Error("ASR 响应格式异常")
    }

    console.log("[ASR] 识别结果:", content)
    return content
  } catch (error) {
    console.error("[ASR] 请求错误:", error)
    throw error
  }
}

export interface AsrRecorderOptions {
  onTranscribe?: (text: string) => void
  onError?: (error: Error) => void
}

export function createAsrRecorder(opts?: AsrRecorderOptions) {
  const [isRecording, setIsRecording] = createSignal(false)
  const [isTranscribing, setIsTranscribing] = createSignal(false)

  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let stream: MediaStream | null = null

  const startRecording = async () => {
    if (isRecording() || isTranscribing()) {
      return false
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunks = []

      mediaRecorder = new MediaRecorder(stream)

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" })

        // 停止所有音频轨道
        if (stream) {
          stream.getTracks().forEach((track) => track.stop())
          stream = null
        }

        setIsTranscribing(true)

        try {
          const text = await transcribeAudio(audioBlob)
          if (text && opts?.onTranscribe) {
            opts.onTranscribe(text)
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error("识别失败")
          if (opts?.onError) {
            opts.onError(err)
          }
        } finally {
          setIsTranscribing(false)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      return true
    } catch (error) {
      console.error("录音失败:", error)
      const err = error instanceof Error ? error : new Error("无法访问麦克风")
      if (opts?.onError) {
        opts.onError(err)
      }
      return false
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop()
      setIsRecording(false)
    }
  }

  const toggleRecording = async () => {
    if (isRecording()) {
      stopRecording()
      return true
    }
    return await startRecording()
  }

  const cleanup = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop()
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      stream = null
    }
  }

  onCleanup(cleanup)

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    toggleRecording,
    cleanup,
  }
}
