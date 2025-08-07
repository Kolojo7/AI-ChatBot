from pathlib import Path
import io
import speech_recognition as sr
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

recognizer = sr.Recognizer()
microphone = sr.Microphone()

MODEL_PATH = Path(__file__).resolve().parent / "model"  # Relative path to 'model' folder
SILENCE_TIMEOUT = 5  # seconds of silence before auto stop
PHRASE_LIMIT = 15    # max length of a phrase in seconds

@app.post("/transcribe")
async def transcribe_speech():
    """Listen from the microphone and return recognized text."""
    with microphone as source:
        recognizer.adjust_for_ambient_noise(source)
        try:
            audio = recognizer.listen(source, timeout=SILENCE_TIMEOUT, phrase_time_limit=PHRASE_LIMIT)
            text = recognizer.recognize_vosk(audio, model_path=str(MODEL_PATH))
        except sr.WaitTimeoutError:
            text = ""
        except Exception:
            text = ""
    return {"text": text}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
