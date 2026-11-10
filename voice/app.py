import os, tempfile
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel

app = FastAPI()
# "small" acierta mejor los nombres; WHISPER_MODEL=base es ~2 veces más rápido. Se descarga una vez al volumen /models.
model = WhisperModel(os.getenv("WHISPER_MODEL", "small"), device="cpu", compute_type="int8", cpu_threads=min(os.cpu_count() or 4, 8))
model.transcribe(np.zeros(16000, dtype="float32"), language="es", beam_size=1)  # calentamiento: la primera frase real ya no paga la carga

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), prompt: str = Form("")):
    with tempfile.NamedTemporaryFile() as f:
        f.write(await file.read()); f.flush()
        segs, _ = model.transcribe(f.name, language="es", beam_size=1, vad_filter=True, without_timestamps=True,
            condition_on_previous_text=False, vad_parameters={"min_silence_duration_ms": 300},
            initial_prompt=("Apunta horas, gasto, trabajo, cliente, proveedor. Clientes: " + prompt)[:600])
        return {"text": " ".join(s.text.strip() for s in segs)}
