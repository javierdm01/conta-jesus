import io, wave
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
import numpy as np
from kokoro_onnx import Kokoro
from piper import PiperVoice

app = FastAPI()
# id de voz -> (modelo, speaker_id). Sharvard tiene dos hablantes.
VOICES = {"davefx": ("davefx", None), "sharvard-0": ("sharvard", 0), "sharvard-1": ("sharvard", 1), "claude": ("claude", None), "ald": ("ald", None)}
_loaded = {}

def load(model):
    if model not in _loaded:
        _loaded[model] = PiperVoice.load(f"/app/{model}.onnx", config_path=f"/app/{model}.onnx.json")
    return _loaded[model]

load("davefx")  # la voz por defecto queda lista al arrancar; las demás se cargan en su primer uso

class Req(BaseModel):
    text: str
    voice: str = "davefx"
    speed: float = 1.0

KOKORO = {"k-dora": "ef_dora", "k-alex": "em_alex", "k-santa": "em_santa"}
_kokoro = None

def kokoro():
    global _kokoro
    if _kokoro is None:
        _kokoro = Kokoro("/app/kokoro.onnx", "/app/kokoro-voices.bin")
    return _kokoro

# La voz por defecto del asistente es Kokoro (k-dora): se carga y calienta al arrancar, no con la primera frase (3,5 s de espera).
kokoro().create("Hola.", voice="ef_dora", speed=1.0, lang="es")

@app.get("/health")
def health():
    return {"ok": True, "voices": list(KOKORO) + list(VOICES)}

@app.post("/speak")
def speak(r: Req):
    print(f"speak voice={r.voice} speed={r.speed}", flush=True)
    if r.voice in KOKORO:
        samples, rate = kokoro().create(r.text[:600], voice=KOKORO[r.voice], speed=min(max(r.speed, 0.6), 1.6), lang="es")
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
            w.writeframes((np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes())
        return Response(buf.getvalue(), media_type="audio/wav")
    model, speaker = VOICES.get(r.voice, VOICES["davefx"])
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        load(model).synthesize(r.text[:600], w, speaker_id=speaker, length_scale=1 / min(max(r.speed, 0.6), 1.6))
    return Response(buf.getvalue(), media_type="audio/wav")
