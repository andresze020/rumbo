'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const noopSubscribe = () => () => {}

/** Avoids a hydration mismatch: the server always "sees" no SpeechRecognition support. */
function useSpeechRecognitionSupported() {
  return useSyncExternalStore(
    noopSubscribe,
    () => getSpeechRecognitionConstructor() !== null,
    () => false
  )
}

export function VoiceNoteComposer({
  onSubmit,
  onCancel,
}: {
  onSubmit: (transcript: string) => void
  onCancel: () => void
}) {
  const [transcript, setTranscript] = useState('')
  const [recording, setRecording] = useState(false)
  const supported = useSpeechRecognitionSupported()
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  function startRecording() {
    const Recognition = getSpeechRecognitionConstructor()
    if (!Recognition) return

    const recognition = new Recognition()
    recognition.lang = navigator.language || 'es-ES'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (text) {
        setTranscript((current) => (current ? `${current} ${text}` : text))
      }
    }
    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)

    recognitionRef.current = recognition
    setRecording(true)
    recognition.start()
  }

  function stopRecording() {
    recognitionRef.current?.stop()
    setRecording(false)
  }

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-card/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Voice note</p>

      {supported ? (
        <Button
          type="button"
          variant={recording ? 'destructive' : 'outline'}
          size="sm"
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? '⏹ Stop recording' : '🎤 Start recording'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Voice transcription isn&apos;t supported in this browser — type your note instead.
        </p>
      )}

      <Textarea
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder="e.g. “Spent 25 dollars on groceries at Walmart yesterday”"
        rows={3}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!transcript.trim()}
          onClick={() => onSubmit(transcript.trim())}
        >
          Extract transaction
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
