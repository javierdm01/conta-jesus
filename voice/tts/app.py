import io, wave
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from piper import PiperVoice

app = FastAPI()
voice = PiperVoice.load("/app/voz.onnx", config_path="/app/voz.onnx.json")

class Req(BaseModel):
    text: str

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/speak")
def speak(r: Req):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice.synthesize(r.text[:600], w)
    return Response(buf.getvalue(), media_type="audio/wav")
