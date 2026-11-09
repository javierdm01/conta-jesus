import tempfile
from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel

app = FastAPI()
model = WhisperModel("small", device="cpu", compute_type="int8")  # se descarga una vez al volumen /models

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), prompt: str = Form("")):
    with tempfile.NamedTemporaryFile() as f:
        f.write(await file.read()); f.flush()
        segs, _ = model.transcribe(f.name, language="es", beam_size=1, vad_filter=True,
            initial_prompt=("Apunta horas, gasto, trabajo, cliente, proveedor. Clientes: " + prompt)[:600])
        return {"text": " ".join(s.text.strip() for s in segs)}
