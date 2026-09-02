# ✨ AeroSense AI — Next-Gen Spatial Computing & AI Studio

**AeroSense AI** is an interactive **Spatial Computing & Multi-Modal Studio** powered by **Python (Flask, OpenCV, PyMuPDF, python-pptx)** and **MediaPipe Computer Vision**. It transforms your workspace into an intelligent, touchless environment with 3 distinct operational modes: **Spatial Air Whiteboard with Geometric Shape Snapping**, **Interactive 3D Diagram Inspector**, and **Multi-Modal Presentation Studio**.

---

## 🌟 3 Core Operational Workspaces

### 🖌️ Mode 1: Spatial Air-Canvas & Smart AI Whiteboard
- **Touchless Air Writing**: Pinch your thumb and index finger to write formulas, draw sketches, and take notes in mid-air.
- **AI Geometric Shape Snapping**: Draw a rough circle, rectangle, or line in the air, and our pure geometric AI engine instantly snaps it into a clean, crisp vector shape!
- **Air Eraser**: Make a closed fist to activate the spatial eraser and wipe annotations in real time.
- **Canvas Styles**: Switch between **Cyber Grid**, **Dot Matrix**, and **Deep Void** backgrounds.
- **Export Artifacts**: Download high-resolution PNG images of your whiteboard drawings with one click.

### 🌐 Mode 2: Interactive 3D Spatial Model Inspector
- **Real-Time 3D WebGL Rendering**: Powered by Three.js with zero heavy dependencies.
- **Interactive Models**: Inspect **Geometric Polyhedrons**, **Biomolecular DNA Double Helices**, **Molecular Resonance Complexes**, and **Quantum Torus Manifolds**.
- **Spatial Hand Orbit Manipulation**: Move your open palm in front of the camera to rotate and inspect 3D objects in mid-air from any angle!

### 📄 Mode 3: Spatial Deck Presenter & Teleprompter
- **Touchless Slide Navigation**: Swipe right/left or point to advance presentation slides.
- **Virtual Laser Pointer**: Point your index finger to cast a glowing red laser dot with exponential anti-jitter smoothing.
- **Presentation Spotlight Focus**: Projects a soft circular beam over where you point to highlight key diagrams while dimming the background.
- **Automated Speaker Notes Teleprompter**: Extracts text and speaker notes from uploaded PDF and PowerPoint files (`.pdf` / `.pptx`).
- **Session Pacing Analytics**: Tracks dwell time per slide and grades your presentation pacing (*Optimal*, *Fast*, *Slow*).

---

## 🖐 Spatial Hand Gestures Cheatsheet

| Gesture | Icon | Mode | Action Description |
| :--- | :---: | :---: | :--- |
| **Pinch Thumb & Index** | 👌 | Whiteboard / Deck | **Air Draw / Write** (Draws smooth neon ink in mid-air) |
| **Shape Tool + Draw** | 📐 | Whiteboard | **AI Shape Snapping** (Snaps rough loops into Circles / Rectangles / Lines) |
| **Closed Fist** | ✊ | All Modes | **Air Eraser** (Wipes drawn strokes in real time) |
| **Open Palm Movement** | 🖐 | 3D Inspector | **3D Orbit Rotation** (Rotates 3D models spatially) |
| **Point / Swipe Right** | 👉 | Deck Mode | **Next Slide** (Advances to the next presentation slide) |
| **Point / Swipe Left** | 👈 | Deck Mode | **Previous Slide** (Returns to previous presentation slide) |
| **Index Finger Up** | ☝ | Deck Mode | **Virtual Laser Pointer** (Sub-pixel glowing laser dot) |
| **Spotlight Tool** | 🔦 | Deck Mode | **Spotlight Focus** (Illuminates focal area, dims background) |
| **Victory V-Sign** | ✌️ | All Modes | **Celebration Confetti Blast** 🎉 |

---

## 🎙️ Hands-Free Voice Commands

| Voice Command | Action Triggered |
| :--- | :--- |
| `"Whiteboard"` | Switch to Air Whiteboard mode |
| `"Presentation"` / `"Deck"` | Switch to Spatial Deck Presenter mode |
| `"Model"` / `"3D"` | Switch to 3D Spatial Model Inspector mode |
| `"Next"` / `"Forward"` | Advance to next presentation slide |
| `"Back"` / `"Previous"` | Return to previous presentation slide |
| `"Clear"` | Clear active workspace canvas |

---

## 📁 Project Structure

```text
Python-project/
├── app.py                      # Flask backend, slide parser & REST APIs
├── shape_recognizer.py         # Geometric AI shape classification engine (Circles, Rects, Lines)
├── gesture_pipeline.py         # Spatial gesture kinematics & PresentationAnalyticsTracker
├── PROJECT_EXPLANATION_GUIDE.md # Complete Oral Viva & Code Explanation Guide for Teachers
├── requirements.txt            # Python dependencies (Flask, PyMuPDF, python-pptx, Pillow, etc.)
├── README.md                   # Project overview and documentation
├── templates/
│   └── index.html              # VisionOS-inspired Spatial Studio UI & 3D WebGL viewport
└── static/
    ├── css/
    │   └── style.css           # Glassmorphic dark cyberpunk spatial computing design
    ├── js/
    │   ├── gesture_engine.js   # Multi-hand 3D spatial tracking & dual-engine controller
    │   └── app.js              # Three.js 3D models, shape snapping & studio controller
    ├── slides/
    │   └── demo/               # Default 5-slide out-of-the-box presentation deck
    └── uploads/                # Folder for user-uploaded PDF and PPTX files
```

---

## 🛠️ Installation & Setup

Make sure you have **Python 3.8+** installed.

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the application
python app.py
```

Open your browser and navigate to:
```text
http://127.0.0.1:5000
```

---

## 🎓 Viva Reference Guide

For a complete breakdown of:
- **System Architecture & 3-Mode Workflow**
- **Euclidean Distance & Radial Variance Geometric Formulas**
- **Top 10 Viva Questions & Model Answers for Evaluation**

👉 Open **[PROJECT_EXPLANATION_GUIDE.md](PROJECT_EXPLANATION_GUIDE.md)**!

---

## 📜 License
MIT License. Open source and free for educational and research use.
