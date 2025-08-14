# from pathlib import Path
# import io
# import speech_recognition as sr
# from fastapi import FastAPI, UploadFile, File
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import JSONResponse

# app = FastAPI()
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# recognizer = sr.Recognizer()
# microphone = sr.Microphone()

# MODEL_PATH = Path(__file__).resolve().parent / "model"  # Relative path to 'model' folder
# SILENCE_TIMEOUT = 5  # seconds of silence before auto stop
# PHRASE_LIMIT = 15    # max length of a phrase in seconds

# @app.post("/transcribe")
# async def transcribe_speech():
#     """Listen from the microphone and return recognized text."""
#     with microphone as source:
#         recognizer.adjust_for_ambient_noise(source)
#         try:
#             audio = recognizer.listen(source, timeout=SILENCE_TIMEOUT, phrase_time_limit=PHRASE_LIMIT)
#             text = recognizer.recognize_vosk(audio, model_path=str(MODEL_PATH))
#         except sr.WaitTimeoutError:
#             text = ""
#         except Exception:
#             text = ""
#     return {"text": text}

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host="0.0.0.0", port=8000)


from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sounddevice as sd
import queue
import json
from vosk import Model, KaldiRecognizer

# ------------------ Config ------------------ #
MODEL_DIR = Path(__file__).parent / "model" / "vosk-model-small-en-us-0.15"
LOG_FILE = Path(__file__).resolve().parent / "transcriptions.log"
SAMPLE_RATE = 16000  # required by vosk
PHRASE_LIMIT = 15  # seconds

# ------------------ App Init ------------------ #
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ Vosk Model Load ------------------ #
try:
    model = Model(str(MODEL_DIR))
    print("✅ Vosk model loaded successfully.")
except Exception as exc:
    print(f"❌ Failed to load Vosk model: {exc}")
    model = None

# ------------------ Transcription ------------------ #
@app.post("/transcribe")
async def transcribe_speech():
    if model is None:
        return {"text": "[Error: Vosk model not loaded]"}

    audio_queue = queue.Queue()

    def callback(indata, frames, time, status):
        if status:
            print(status)
        audio_queue.put(bytes(indata))

    rec = KaldiRecognizer(model, SAMPLE_RATE)
    try:
        with sd.RawInputStream(samplerate=SAMPLE_RATE, blocksize=8000, dtype='int16',
                               channels=1, callback=callback):
            print("🎙️ Listening...")
            result_text = ""
            timeout_counter = 0
            while timeout_counter < PHRASE_LIMIT:
                data = audio_queue.get()
                if rec.AcceptWaveform(data):
                    result = json.loads(rec.Result())
                    result_text = result.get("text", "")
                    break
                timeout_counter += 0.25  # approximate increment
    except Exception as e:
        result_text = f"[Error: {str(e)}]"

    # Log transcription
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(result_text + "\n")

    return {"text": result_text or "[Timeout]"}

# ------------------ Run the Server ------------------ #
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
