import os
import tkinter as tk
from tkinter import filedialog
from faster_whisper import WhisperModel

root = tk.Tk()
root.withdraw()
videos = filedialog.askopenfilenames(
    title="Select videos (Ctrl+A to select all in a folder)",
    filetypes=[("Video/Audio", "*.mp4 *.mkv *.mov *.avi *.webm *.mp3 *.wav *.m4a")],
)
if not videos:
    raise SystemExit("No files selected.")

model = WhisperModel("base.en", compute_type="int8")  # loads once, reused for all

for n, video in enumerate(videos, 1):
    print(f"\n[{n}/{len(videos)}] {os.path.basename(video)}")
    out = os.path.splitext(video)[0] + ".txt"
    if os.path.exists(out):
        print("   already done, skipping")
        continue
    try:
        segments, info = model.transcribe(video, language="en", vad_filter=True)
        with open(out, "w", encoding="utf-8") as f:
            for seg in segments:
                f.write(seg.text.strip() + "\n")
                print(f"\r   {seg.end / info.duration * 100:5.1f}%", end="", flush=True)
        print("\n   saved:", out)
    except Exception as e:
        print("   FAILED:", e)

print("\nAll done.")