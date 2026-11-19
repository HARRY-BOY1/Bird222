// تسجيل رسالة صوتية: start() يرجع {stop, cancel}
export async function startRecording() {
  if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error("المتصفح لا يدعم التسجيل الصوتي");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [], t0 = Date.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  rec.start();
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => { release(); const type = (rec.mimeType || mime || "audio/webm").split(";")[0]; resolve({ blob: new Blob(chunks, { type }), ms: Date.now() - t0 }); };
      rec.stop();
    }),
    cancel: () => { rec.onstop = release; rec.stop(); }
  };
}
