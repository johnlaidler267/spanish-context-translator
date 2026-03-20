"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Mic } from "lucide-react"
import { transcribeAudioWithGroq } from "@/lib/translate"

type MicPhase = "idle" | "recording" | "transcribing"

function pickRecorderMime(): { mime: string; ext: string } {
  const candidates: { mime: string; ext: string }[] = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) {
      return c
    }
  }
  return { mime: "", ext: "webm" }
}

function vibrateShort() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(12)
    } catch {
      /* ignore */
    }
  }
}

function useSilenceStop(
  stream: MediaStream | null,
  enabled: boolean,
  onSilence: () => void,
) {
  const onSilenceRef = useRef(onSilence)
  onSilenceRef.current = onSilence

  useEffect(() => {
    if (!stream || !enabled) return

    const AudioCtx =
      typeof window !== "undefined" &&
      (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.5
    src.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const SILENCE_MS = 2500
    const THRESH = 8
    let lastLoud = performance.now()
    let raf: number | null = null
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = data[i]! - 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      const now = performance.now()
      if (rms > THRESH) lastLoud = now
      else if (now - lastLoud > SILENCE_MS) {
        onSilenceRef.current()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    lastLoud = performance.now()
    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      if (raf != null) cancelAnimationFrame(raf)
      src.disconnect()
      ctx.close().catch(() => {})
    }
  }, [stream, enabled])
}

interface VoiceInputButtonProps {
  apiKey: string | undefined
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceInputButton({
  apiKey,
  onTranscript,
  disabled,
}: VoiceInputButtonProps) {
  const [phase, setPhase] = useState<MicPhase>("idle")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const isRecordingRef = useRef(false)

  const clearFeedbackSoon = useCallback((msg: string) => {
    setFeedback(msg)
    window.setTimeout(() => setFeedback(null), 2800)
  }, [])

  const stopRecordingInternal = useCallback(() => {
    isRecordingRef.current = false
    const rec = recorderRef.current
    if (rec && rec.state === "recording") {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
    /* Tracks stop in rec.onstop — don’t cut the stream before the encoder finishes */
    setActiveStream(null)
    setPhase((p) => (p === "recording" ? "transcribing" : p))
  }, [])

  const onSilenceStop = useCallback(() => {
    if (!isRecordingRef.current) return
    vibrateShort()
    stopRecordingInternal()
  }, [stopRecordingInternal])

  useSilenceStop(activeStream, phase === "recording", onSilenceStop)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      const rec = recorderRef.current
      if (rec && rec.state === "recording") {
        try {
          rec.stop()
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (!apiKey || disabled) return
    setFeedback(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setActiveStream(stream)
      const { mime, ext } = pickRecorderMime()
      chunksRef.current = []
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorderRef.current = rec
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        })
        chunksRef.current = []
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        recorderRef.current = null
        setActiveStream(null)

        if (blob.size < 800) {
          setPhase("idle")
          clearFeedbackSoon("No speech detected")
          return
        }

        setPhase("transcribing")
        try {
          const text = await transcribeAudioWithGroq(
            apiKey,
            blob,
            `recording.${ext}`,
          )
          if (!text.trim()) {
            clearFeedbackSoon("No speech detected")
          } else {
            onTranscript(text)
          }
        } catch {
          clearFeedbackSoon("Couldn’t transcribe — try again")
        } finally {
          setPhase("idle")
        }
      }
      isRecordingRef.current = true
      rec.start(100)
      setPhase("recording")
      vibrateShort()
    } catch (e) {
      const err = e as { name?: string }
      isRecordingRef.current = false
      setActiveStream(null)
      if (err.name === "NotAllowedError" || err.name === "NotFoundError") {
        clearFeedbackSoon("Microphone access denied")
      } else {
        clearFeedbackSoon("Couldn’t use microphone")
      }
      setPhase("idle")
    }
  }, [apiKey, disabled, onTranscript, clearFeedbackSoon])

  const toggle = useCallback(() => {
    if (disabled || !apiKey) return
    if (phase === "transcribing") return
    if (phase === "recording") {
      vibrateShort()
      stopRecordingInternal()
      return
    }
    void startRecording()
  }, [apiKey, disabled, phase, startRecording, stopRecordingInternal])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      toggle()
    }
  }

  const isRecording = phase === "recording"
  const isBusy = phase === "transcribing"
  const ariaLabel =
    phase === "recording"
      ? "Stop voice input"
      : isBusy
        ? "Transcribing…"
        : "Start voice input"

  return (
    <div className="voice-input-wrap">
      <button
        type="button"
        className={`voice-mic-btn${isRecording ? " voice-mic-btn--recording" : ""}${isBusy ? " voice-mic-btn--busy" : ""}`}
        aria-label={ariaLabel}
        aria-pressed={isRecording}
        title={isRecording ? "Listening…" : undefined}
        disabled={disabled || !apiKey || isBusy}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        {isBusy ? (
          <Loader2 className="voice-mic-icon voice-mic-icon--spin" aria-hidden />
        ) : (
          <Mic className="voice-mic-icon" aria-hidden />
        )}
        {isRecording && <span className="voice-mic-glow" aria-hidden />}
      </button>
      {feedback && (
        <span className="voice-input-feedback" role="status" aria-live="polite">
          {feedback}
        </span>
      )}
    </div>
  )
}
