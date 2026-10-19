package com.cardashboard

import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class TTSModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var tts: TextToSpeech? = null
    private var isReady = false

    override fun getName(): String = "TTSModule"

    init {
        tts = TextToSpeech(reactContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(Locale("es", "ES")) ?: -1
                isReady = result >= 0  // Cualquier valor >= 0 es idioma válido
                tts?.setSpeechRate(0.92f)
                tts?.setPitch(1.0f)
            }
        }
    }

    @ReactMethod
    fun speak(text: String) {
        if (isReady) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "carnova_utterance")
        }
    }

    @ReactMethod
    fun stop() {
        tts?.stop()
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
