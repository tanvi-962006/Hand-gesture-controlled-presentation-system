/**
 * App.js - AeroSense AI Spatial Studio Main Controller
 * 
 * Manages 3 Integrated Spatial Workspaces:
 * 1. Air Whiteboard (Freehand mid-air drawing + AI Geometric Shape Snapping + Air Eraser)
 * 2. Spatial Deck Presenter (PyMuPDF vector slides + Spotlight + Teleprompter Notes)
 * 3. 3D Spatial Model Inspector (Three.js WebGL rendering with hand orbit manipulation)
 */

// Web Audio API Synthesizer
class SoundFX {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
    }

    playSwoosh() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const freqs = [659.25, 987.77];
        
        freqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + (i * 0.03));
            
            gain.gain.setValueAtTime(0.001, now + (i * 0.03));
            gain.gain.linearRampToValueAtTime(0.07, now + (i * 0.03) + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + (i * 0.03) + 0.24);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + (i * 0.03));
            osc.stop(now + (i * 0.03) + 0.26);
        });
    }

    playPop() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    playSnap() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const notes = [587.33, 880.00, 1174.66]; // D5, A5, D6 crystal snap
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;

            const startTime = this.ctx.currentTime + (idx * 0.04);
            gain.gain.setValueAtTime(0.1, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.22);
        });
    }

    playCelebration() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const startTime = this.ctx.currentTime + (idx * 0.07);
            gain.gain.setValueAtTime(0.12, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.35);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const soundFx = new SoundFX();

    // ── Global State ──
    let activeMode = 'whiteboard'; // 'whiteboard', 'deck', 'model3d'
    let activeTool = 'pen'; // 'pen', 'shape', 'eraser', 'spotlight'
    let currentDrawColor = '#ff4d6d';
    let currentBrushSize = 6;
    let currentStrokePoints = [];
    let isDrawingStroke = false;
    let lastHandDrawPos = null;
    let previousPalmPos = null;

    let isSpotlightActive = false;
    let spotlightRadius = 140;
    let isVoiceActive = false;
    let voiceRecognition = null;
    let isNotesDrawerOpen = true;
    let currentGridIndex = 0;
    const gridStyles = ['grid-pattern', 'dots-pattern', 'plain-pattern'];
    const gridNames = ['Grid', 'Dots', 'Dark'];

    let presentationState = {
        id: 'demo',
        title: 'AeroSense AI — Spatial Computing & Presentation Deck',
        slides: [],
        notes: [],
        current_index: 0,
        total_slides: 0
    };

    let gestureEngine = null;
    let toastTimeout = null;

    // Three.js 3D Model State
    var threeScene = null;
    var threeCamera = null;
    var threeRenderer = null;
    var activeMesh = null;
    var isThreeInitialized = false;
    var is3DAutoRotate = true;
    var is3DWireframe = false;
    var rainbowHue = 0;
    var lastLaserPos = null;

    // ── DOM Elements ──
    const viewportContainer = document.getElementById('viewportContainer');
    const whiteboardLayer = document.getElementById('whiteboardLayer');
    const whiteboardCanvas = document.getElementById('whiteboardCanvas');
    const deckLayer = document.getElementById('deckLayer');
    const model3dLayer = document.getElementById('model3dLayer');
    const drawingCanvas = document.getElementById('drawingCanvas');
    const laserTrailCanvas = document.getElementById('laserTrailCanvas');
    const particlesContainer = document.getElementById('particlesContainer');
    const filmstripContainer = document.getElementById('filmstripContainer');

    const modeWhiteboardBtn = document.getElementById('modeWhiteboardBtn');
    const modeDeckBtn = document.getElementById('modeDeckBtn');
    const mode3DBtn = document.getElementById('mode3DBtn');

    const drawingToolsCard = document.getElementById('drawingToolsCard');
    const modelSelectCard = document.getElementById('modelSelectCard');
    const activeModeBadge = document.getElementById('activeModeBadge');

    const slideImage = document.getElementById('slideImage');
    const spotlightOverlay = document.getElementById('spotlightOverlay');
    const laserDot = document.getElementById('laserDot');
    const eraserCircle = document.getElementById('eraserCircle');
    const arHandTracker = document.getElementById('arHandTracker');
    const arTrackerIcon = document.getElementById('arTrackerIcon');
    const arTrackerLabel = document.getElementById('arTrackerLabel');

    const toggle3DAutoRotateBtn = document.getElementById('toggle3DAutoRotateBtn');
    const toggle3DWireframeBtn = document.getElementById('toggle3DWireframeBtn');
    const reset3DViewBtn = document.getElementById('reset3DViewBtn');

    let lastSpatialEraserPos = null;
    const thumbnailsBar = document.getElementById('thumbnailsBar');
    const presTitle = document.getElementById('presTitle');
    const presentationProgressBar = document.getElementById('presentationProgressBar');

    const toggleCamBtn = document.getElementById('toggleCamBtn');
    const camBtnText = document.getElementById('camBtnText');
    const pipStatusDot = document.getElementById('pipStatusDot');
    const camStatusBadge = document.getElementById('camStatusBadge');
    const hudIcon = document.getElementById('hudIcon');
    const hudGestureName = document.getElementById('hudGestureName');
    const confidenceBadge = document.getElementById('confidenceBadge');

    const webcamVideo = document.getElementById('webcamVideo');
    const handCanvas = document.getElementById('handCanvas');
    const camStartOverlay = document.getElementById('camStartOverlay');
    const sidebarCamToggleBtn = document.getElementById('sidebarCamToggleBtn');
    const sidebarCamText = document.getElementById('sidebarCamText');
    const camViewportBox = document.getElementById('camViewportBox');
    const actionToast = document.getElementById('actionToast');
    const toastMsg = document.getElementById('toastMsg');

    const notesDrawer = document.getElementById('notesDrawer');
    const speakerNotesText = document.getElementById('speakerNotesText');
    const collapseNotesBtn = document.getElementById('collapseNotesBtn');

    const prevSlideBtn = document.getElementById('prevSlideBtn');
    const nextSlideBtn = document.getElementById('nextSlideBtn');
    const voiceControlBtn = document.getElementById('voiceControlBtn');
    const voiceMicIcon = document.getElementById('voiceMicIcon');
    const voiceIndicator = document.getElementById('voiceIndicator');
    const voiceStatusText = document.getElementById('voiceStatusText');

    const clearCanvasBtn = document.getElementById('clearCanvasBtn');
    const saveSlideBtn = document.getElementById('saveSlideBtn');
    const toggleCanvasGridBtn = document.getElementById('toggleCanvasGridBtn');
    const gridStyleName = document.getElementById('gridStyleName');

    const soundFxBtn = document.getElementById('soundFxBtn');
    const soundFxText = document.getElementById('soundFxText');
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    // Modals
    const uploadModalBtn = document.getElementById('uploadModalBtn');
    const analyticsModalBtn = document.getElementById('analyticsModalBtn');
    const settingsModalBtn = document.getElementById('settingsModalBtn');
    const helpModalBtn = document.getElementById('helpModalBtn');

    const uploadModal = document.getElementById('uploadModal');
    const analyticsModal = document.getElementById('analyticsModal');
    const settingsModal = document.getElementById('settingsModal');
    const helpModal = document.getElementById('helpModal');

    const closeUploadModalBtn = document.getElementById('closeUploadModalBtn');
    const closeAnalyticsModalBtn = document.getElementById('closeAnalyticsModalBtn');
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    const closeHelpModalBtn = document.getElementById('closeHelpModalBtn');

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadStatusText = document.getElementById('uploadStatusText');

    const engineSelect = document.getElementById('engineSelect');
    const cooldownSlider = document.getElementById('cooldownSlider');
    const cooldownValDisplay = document.getElementById('cooldownValDisplay');
    const spotlightSlider = document.getElementById('spotlightSlider');
    const spotlightRadiusDisplay = document.getElementById('spotlightRadiusDisplay');

    // ── 1. Setup Canvas Contexts & Resizing ──
    const wbCtx = whiteboardCanvas ? whiteboardCanvas.getContext('2d') : null;
    const drawCtx = drawingCanvas ? drawingCanvas.getContext('2d') : null;
    const laserTrailCtx = laserTrailCanvas ? laserTrailCanvas.getContext('2d') : null;

    function resizeAllCanvases() {
        if (!viewportContainer) return;
        const w = viewportContainer.clientWidth;
        const h = viewportContainer.clientHeight;

        if (whiteboardCanvas) {
            const tempImg = wbCtx ? wbCtx.getImageData(0, 0, whiteboardCanvas.width || 1, whiteboardCanvas.height || 1) : null;
            whiteboardCanvas.width = w;
            whiteboardCanvas.height = h;
            if (tempImg && wbCtx) wbCtx.putImageData(tempImg, 0, 0);
        }

        if (drawingCanvas) {
            drawingCanvas.width = w;
            drawingCanvas.height = h;
        }

        if (laserTrailCanvas) {
            laserTrailCanvas.width = w;
            laserTrailCanvas.height = h;
        }

        try {
            if (typeof threeRenderer !== 'undefined' && threeRenderer && typeof threeCamera !== 'undefined' && threeCamera) {
                threeCamera.aspect = w / h;
                threeCamera.updateProjectionMatrix();
                threeRenderer.setSize(w, h);
            }
        } catch (e) {}
    }
    resizeAllCanvases();
    window.addEventListener('resize', resizeAllCanvases);

    // Continuous Laser Trail Fade Loop
    function renderLaserTrailFade() {
        if (laserTrailCtx && laserTrailCanvas) {
            laserTrailCtx.save();
            laserTrailCtx.globalCompositeOperation = 'destination-out';
            laserTrailCtx.fillStyle = 'rgba(0, 0, 0, 0.16)';
            laserTrailCtx.fillRect(0, 0, laserTrailCanvas.width, laserTrailCanvas.height);
            laserTrailCtx.restore();
        }
        requestAnimationFrame(renderLaserTrailFade);
    }
    requestAnimationFrame(renderLaserTrailFade);

    // ── 2. Mode Switching Logic ──
    function setStudioMode(mode) {
        activeMode = mode;
        if (gestureEngine) gestureEngine.setActiveMode(mode);
        console.log('Switched to Studio Mode:', mode);

        // Update Nav Buttons
        [modeWhiteboardBtn, modeDeckBtn, mode3DBtn].forEach(btn => {
            if (btn) btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
        });

        // Layer Visibility
        if (whiteboardLayer) whiteboardLayer.style.display = (mode === 'whiteboard') ? 'block' : 'none';
        if (deckLayer) deckLayer.style.display = (mode === 'deck') ? 'block' : 'none';
        if (model3dLayer) model3dLayer.style.display = (mode === 'model3d') ? 'block' : 'none';
        if (filmstripContainer) filmstripContainer.style.display = (mode === 'deck') ? 'flex' : 'none';
        if (notesDrawer) notesDrawer.style.display = (mode === 'deck') ? 'block' : 'none';

        // Sidebar card visibility
        if (drawingToolsCard) drawingToolsCard.style.display = (mode !== 'model3d') ? 'block' : 'none';
        if (modelSelectCard) modelSelectCard.style.display = (mode === 'model3d') ? 'block' : 'none';

        // Arrows visibility
        if (prevSlideBtn) prevSlideBtn.style.display = (mode === 'deck') ? 'flex' : 'none';
        if (nextSlideBtn) nextSlideBtn.style.display = (mode === 'deck') ? 'flex' : 'none';

        // In 3D Mode or Deck Mode, reset laser dot display
        if (mode === 'model3d') {
            if (laserDot) laserDot.style.display = 'none';
            initThreeJS();
            if (threeRenderer && viewportContainer) {
                const w = viewportContainer.clientWidth;
                const h = viewportContainer.clientHeight;
                if (threeCamera) {
                    threeCamera.aspect = w / h;
                    threeCamera.updateProjectionMatrix();
                }
                threeRenderer.setSize(w, h);
            }
        }

        if (activeModeBadge) {
            if (mode === 'whiteboard') activeModeBadge.textContent = 'Air Whiteboard';
            else if (mode === 'deck') activeModeBadge.textContent = 'Spatial Deck';
            else activeModeBadge.textContent = '3D Inspector';
        }

        showActionToast(
            mode === 'whiteboard' ? '🖌️ Air Whiteboard Active' :
            mode === 'deck' ? '📄 Spatial Deck Active' : '🌐 3D Model Inspector Active'
        );
    }

    if (modeWhiteboardBtn) modeWhiteboardBtn.addEventListener('click', () => setStudioMode('whiteboard'));
    if (modeDeckBtn) modeDeckBtn.addEventListener('click', () => setStudioMode('deck'));
    if (mode3DBtn) mode3DBtn.addEventListener('click', () => setStudioMode('model3d'));

    // ── 3. Spatial Tool Dock Handlers ──
    const toolBtns = document.querySelectorAll('.tool-btn');
    toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTool = btn.getAttribute('data-tool') || 'pen';
            if (gestureEngine) gestureEngine.setActiveTool(activeTool);

            if (activeTool === 'spotlight') {
                isSpotlightActive = true;
                if (spotlightOverlay) {
                    spotlightOverlay.style.display = 'block';
                    updateSpotlightMask(50, 50);
                }
                if (laserDot) laserDot.style.display = 'none';
            } else if (activeTool === 'laser') {
                isSpotlightActive = false;
                if (spotlightOverlay) spotlightOverlay.style.display = 'none';
                if (laserDot) {
                    laserDot.style.display = 'block';
                    laserDot.style.left = '50%';
                    laserDot.style.top = '50%';
                }
            } else {
                isSpotlightActive = false;
                if (spotlightOverlay) spotlightOverlay.style.display = 'none';
                if (laserDot && (!gestureEngine || !gestureEngine.isTracking)) {
                    laserDot.style.display = 'none';
                }
            }

            showActionToast(`Tool: ${btn.textContent.trim()}`);
        });
    });

    // Palette & Size
    const swatches = document.querySelectorAll('.swatch');
    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            swatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            currentDrawColor = swatch.getAttribute('data-color') || '#ff4d6d';
        });
    });

    const sizeChips = document.querySelectorAll('.size-chip');
    sizeChips.forEach(chip => {
        chip.addEventListener('click', () => {
            sizeChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentBrushSize = parseInt(chip.getAttribute('data-size')) || 6;
        });
    });

    // Toggle Canvas Grid Pattern
    if (toggleCanvasGridBtn) {
        toggleCanvasGridBtn.addEventListener('click', () => {
            currentGridIndex = (currentGridIndex + 1) % gridStyles.length;
            if (whiteboardLayer) {
                gridStyles.forEach(s => whiteboardLayer.classList.remove(s));
                whiteboardLayer.classList.add(gridStyles[currentGridIndex]);
            }
            if (gridStyleName) gridStyleName.textContent = gridNames[currentGridIndex];
            showActionToast(`Grid: ${gridNames[currentGridIndex]}`);
        });
    }

    // Clear Canvas
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
            if (wbCtx && whiteboardCanvas) wbCtx.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height);
            if (drawCtx && drawingCanvas) drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            showActionToast('🗑️ Cleared Canvas Notes');
        });
    }

    function spawnSparkleParticle(x, y, color = '#ffd166', emojis = ['✨', '⭐', '💫', '🌟']) {
        if (!particlesContainer) return;
        const el = document.createElement('div');
        el.className = 'sparkle-particle';
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.color = color;
        particlesContainer.appendChild(el);
        setTimeout(() => el.remove(), 850);
    }

    // ── 4. Drawing & AI Geometric Shape Snapping Engine ──
    function drawStrokeSegment(targetCtx, p1, p2, color, size, isEraser = false) {
        if (!targetCtx) return;
        targetCtx.save();
        if (isEraser || activeTool === 'eraser') {
            targetCtx.globalCompositeOperation = 'destination-out';
            targetCtx.beginPath();
            targetCtx.arc(p2.x, p2.y, size * 3.0, 0, Math.PI * 2);
            targetCtx.fill();
        } else {
            targetCtx.globalCompositeOperation = 'source-over';

            let strokeColor = color;
            let glowColor = color;
            let strokeWidth = size;

            if (activeTool === 'rainbow') {
                rainbowHue = (rainbowHue + 3) % 360;
                strokeColor = `hsl(${rainbowHue}, 100%, 65%)`;
                glowColor = strokeColor;
            } else if (activeTool === 'sparkler') {
                strokeColor = '#fff5c0';
                glowColor = '#ffd166';
                strokeWidth = Math.max(4, size * 0.9);
                if (Math.random() < 0.4) {
                    spawnSparkleParticle(p2.x, p2.y, '#ffd166');
                }
            }

            targetCtx.beginPath();
            targetCtx.moveTo(p1.x, p1.y);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            targetCtx.quadraticCurveTo(p1.x, p1.y, midX, midY);
            targetCtx.lineTo(p2.x, p2.y);
            targetCtx.strokeStyle = strokeColor;
            targetCtx.lineWidth = strokeWidth;
            targetCtx.lineCap = 'round';
            targetCtx.lineJoin = 'round';
            targetCtx.shadowColor = glowColor;
            targetCtx.shadowBlur = Math.max(8, strokeWidth * 2.2);
            targetCtx.stroke();
        }
        targetCtx.restore();
    }

    // Canvas snapshot before stroke starts, so rough drawings can be cleanly replaced by snapped shapes
    let preStrokeSnapshot = null;

    function savePreStrokeSnapshot() {
        const targetCanvas = (activeMode === 'whiteboard') ? whiteboardCanvas : drawingCanvas;
        const targetCtx = (activeMode === 'whiteboard') ? wbCtx : drawCtx;
        if (targetCanvas && targetCtx) {
            try {
                preStrokeSnapshot = targetCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
            } catch (e) {
                preStrokeSnapshot = null;
            }
        }
    }

    function restorePreStrokeSnapshot() {
        const targetCanvas = (activeMode === 'whiteboard') ? whiteboardCanvas : drawingCanvas;
        const targetCtx = (activeMode === 'whiteboard') ? wbCtx : drawCtx;
        if (targetCanvas && targetCtx && preStrokeSnapshot) {
            try {
                targetCtx.putImageData(preStrokeSnapshot, 0, 0);
            } catch (e) {}
        }
    }

    // Snap freehand air stroke into clean geometric vector shape via pure geometric Python API
    async function snapCurrentStroke(points) {
        if (!points || points.length < 8) return;
        try {
            const res = await fetch('/api/recognize_shape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: points })
            });
            const data = await res.json();
            if (data.status === 'success' && data.shape) {
                const shape = data.shape;
                const targetCtx = (activeMode === 'whiteboard') ? wbCtx : drawCtx;
                if (!targetCtx || shape.type === 'freehand') return;

                // Replace rough hand-drawn stroke with clean vector geometry
                restorePreStrokeSnapshot();

                if (shape.type === 'circle') {
                    targetCtx.save();
                    targetCtx.beginPath();
                    targetCtx.arc(shape.center.x, shape.center.y, shape.radius, 0, Math.PI * 2);
                    targetCtx.strokeStyle = currentDrawColor;
                    targetCtx.lineWidth = currentBrushSize;
                    targetCtx.shadowColor = currentDrawColor;
                    targetCtx.shadowBlur = 14;
                    targetCtx.stroke();
                    targetCtx.restore();
                    soundFx.playSnap();
                    showActionToast('📐 Snapped to Circle!');
                } else if (shape.type === 'rectangle') {
                    targetCtx.save();
                    targetCtx.beginPath();
                    if (targetCtx.roundRect) {
                        targetCtx.roundRect(shape.x, shape.y, shape.width, shape.height, 8);
                    } else {
                        targetCtx.rect(shape.x, shape.y, shape.width, shape.height);
                    }
                    targetCtx.strokeStyle = currentDrawColor;
                    targetCtx.lineWidth = currentBrushSize;
                    targetCtx.shadowColor = currentDrawColor;
                    targetCtx.shadowBlur = 14;
                    targetCtx.stroke();
                    targetCtx.restore();
                    soundFx.playSnap();
                    showActionToast('📐 Snapped to Rectangle!');
                } else if (shape.type === 'triangle') {
                    targetCtx.save();
                    targetCtx.beginPath();
                    targetCtx.moveTo(shape.p1.x, shape.p1.y);
                    targetCtx.lineTo(shape.p2.x, shape.p2.y);
                    targetCtx.lineTo(shape.p3.x, shape.p3.y);
                    targetCtx.closePath();
                    targetCtx.strokeStyle = currentDrawColor;
                    targetCtx.lineWidth = currentBrushSize;
                    targetCtx.shadowColor = currentDrawColor;
                    targetCtx.shadowBlur = 14;
                    targetCtx.stroke();
                    targetCtx.restore();
                    soundFx.playSnap();
                    showActionToast('📐 Snapped to Triangle!');
                } else if (shape.type === 'line') {
                    targetCtx.save();
                    targetCtx.beginPath();
                    targetCtx.moveTo(shape.start.x, shape.start.y);
                    targetCtx.lineTo(shape.end.x, shape.end.y);
                    targetCtx.strokeStyle = currentDrawColor;
                    targetCtx.lineWidth = currentBrushSize;
                    targetCtx.shadowColor = currentDrawColor;
                    targetCtx.shadowBlur = 14;
                    targetCtx.stroke();
                    targetCtx.restore();
                    soundFx.playSnap();
                    showActionToast('📐 Snapped to Line!');
                }
            }
        } catch (e) {
            console.error('Shape recognition error:', e);
        }
    }

    // ── Mouse & Touch Drawing Support for Whiteboard ──
    let isMouseDownDrawing = false;
    let mouseLastPos = null;

    function getCanvasPos(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function handlePointerStart(e) {
        if (activeTool === 'laser' || activeTool === 'spotlight') return;
        const targetCanvas = (activeMode === 'whiteboard') ? whiteboardCanvas : drawingCanvas;
        if (!targetCanvas) return;
        savePreStrokeSnapshot();
        isMouseDownDrawing = true;
        mouseLastPos = getCanvasPos(e, targetCanvas);
        currentStrokePoints = [mouseLastPos];
    }

    function handlePointerMove(e) {
        // Track mouse laser dot if Laser tool is active
        if (activeTool === 'laser' && laserDot && viewportContainer) {
            const rect = viewportContainer.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
                const px = ((clientX - rect.left) / rect.width) * 100;
                const py = ((clientY - rect.top) / rect.height) * 100;
                laserDot.style.display = 'block';
                laserDot.style.left = `${px}%`;
                laserDot.style.top = `${py}%`;
            }
        }

        if (!isMouseDownDrawing) return;
        const targetCanvas = (activeMode === 'whiteboard') ? whiteboardCanvas : drawingCanvas;
        const targetCtx = (activeMode === 'whiteboard') ? wbCtx : drawCtx;
        if (!targetCanvas || !targetCtx) return;

        const currPos = getCanvasPos(e, targetCanvas);
        currentStrokePoints.push(currPos);

        if (mouseLastPos) {
            drawStrokeSegment(targetCtx, mouseLastPos, currPos, currentDrawColor, currentBrushSize, activeTool === 'eraser');
        }
        mouseLastPos = currPos;
    }

    function handlePointerEnd() {
        if (!isMouseDownDrawing) return;
        isMouseDownDrawing = false;
        if (currentStrokePoints.length > 8 && activeTool === 'shape') {
            snapCurrentStroke(currentStrokePoints);
        }
        currentStrokePoints = [];
        mouseLastPos = null;
    }

    [whiteboardCanvas, drawingCanvas].filter(Boolean).forEach(c => {
        c.addEventListener('mousedown', handlePointerStart);
        c.addEventListener('touchstart', (e) => { e.preventDefault(); handlePointerStart(e); }, { passive: false });
    });

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerEnd);
    window.addEventListener('touchmove', (e) => { if (isMouseDownDrawing) e.preventDefault(); handlePointerMove(e); }, { passive: false });
    window.addEventListener('touchend', handlePointerEnd);

    // ── 5. Three.js 3D Spatial Model Inspector ──
    function initThreeJS() {
        if (isThreeInitialized || !window.THREE) return;
        const container = document.getElementById('threejsContainer');
        if (!container) return;

        const width = viewportContainer.clientWidth || window.innerWidth;
        const height = viewportContainer.clientHeight || window.innerHeight;

        threeScene = new THREE.Scene();
        threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        threeCamera.position.set(0, 0, 8);

        threeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        threeRenderer.setSize(width, height);
        threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.innerHTML = '';
        container.appendChild(threeRenderer.domElement);

        // High-Quality Balanced Studio Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
        threeScene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.2);
        dirLight1.position.set(5, 10, 7);
        threeScene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0x00f0ff, 1.8);
        dirLight2.position.set(-5, -5, 5);
        threeScene.add(dirLight2);

        const pointLight = new THREE.PointLight(0xa855f7, 2.0, 50);
        pointLight.position.set(0, 5, 5);
        threeScene.add(pointLight);

        load3DModel('polyhedron');
        isThreeInitialized = true;

        // Continuous rendering loop with smooth rotation
        function animate3D() {
            requestAnimationFrame(animate3D);
            if (activeMesh && activeMode === 'model3d' && is3DAutoRotate) {
                activeMesh.rotation.y += 0.006;
            }
            if (threeRenderer && threeScene && threeCamera) {
                threeRenderer.render(threeScene, threeCamera);
            }
        }
        animate3D();
    }

    function load3DModel(modelType) {
        if (!threeScene || !window.THREE) return;
        if (activeMesh) {
            threeScene.remove(activeMesh);
            activeMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
        }

        const group = new THREE.Group();
        const modelTitle = document.getElementById('modelTitleDisplay');

        if (modelType === 'polyhedron') {
            const geo = new THREE.IcosahedronGeometry(2.4, 1);
            const mat = new THREE.MeshStandardMaterial({
                color: 0x8b5cf6,
                roughness: 0.15,
                metalness: 0.65,
                emissive: 0x2e1065,
                wireframe: is3DWireframe
            });
            group.add(new THREE.Mesh(geo, mat));
            if (modelTitle) modelTitle.textContent = 'Geometric Icosahedron Solid';
        } else if (modelType === 'dna') {
            const count = 36;
            for (let i = 0; i < count; i++) {
                const angle = i * 0.35;
                const y = (i - count / 2) * 0.18;
                const r = 1.6;
                const x1 = Math.cos(angle) * r;
                const z1 = Math.sin(angle) * r;
                const x2 = Math.cos(angle + Math.PI) * r;
                const z2 = Math.sin(angle + Math.PI) * r;

                const sphereGeo = new THREE.SphereGeometry(0.16, 16, 16);
                const mat1 = new THREE.MeshStandardMaterial({ color: 0x00bbf9, roughness: 0.2, emissive: 0x0369a1, wireframe: is3DWireframe });
                const mat2 = new THREE.MeshStandardMaterial({ color: 0xff0055, roughness: 0.2, emissive: 0x881337, wireframe: is3DWireframe });

                const s1 = new THREE.Mesh(sphereGeo, mat1);
                s1.position.set(x1, y, z1);
                const s2 = new THREE.Mesh(sphereGeo, mat2);
                s2.position.set(x2, y, z2);
                group.add(s1);
                group.add(s2);

                const rungGeo = new THREE.CylinderGeometry(0.04, 0.04, r * 2, 8);
                const rungMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, wireframe: is3DWireframe });
                const rung = new THREE.Mesh(rungGeo, rungMat);
                rung.position.set(0, y, 0);
                rung.rotation.z = Math.PI / 2;
                rung.rotation.y = -angle;
                group.add(rung);
            }
            if (modelTitle) modelTitle.textContent = 'Biomolecular DNA Double Helix';
        } else if (modelType === 'molecule') {
            const centerGeo = new THREE.SphereGeometry(0.65, 24, 24);
            const centerMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.6, roughness: 0.25, emissive: 0x3b0764, wireframe: is3DWireframe });
            group.add(new THREE.Mesh(centerGeo, centerMat));

            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const atomGeo = new THREE.SphereGeometry(0.38, 16, 16);
                const atomMat = new THREE.MeshStandardMaterial({ color: (i % 2 === 0) ? 0x06d6a0 : 0x00bbf9, roughness: 0.25, wireframe: is3DWireframe });
                const atom = new THREE.Mesh(atomGeo, atomMat);
                atom.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0);
                group.add(atom);

                const bondGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8);
                const bondMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.4, wireframe: is3DWireframe });
                const bond = new THREE.Mesh(bondGeo, bondMat);
                bond.position.set(Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0);
                bond.rotation.z = a - Math.PI / 2;
                group.add(bond);
            }
            if (modelTitle) modelTitle.textContent = 'Molecular Resonance Complex';
        } else if (modelType === 'torus') {
            const geo = new THREE.TorusKnotGeometry(1.6, 0.45, 100, 16);
            const mat = new THREE.MeshStandardMaterial({ color: 0x00bbf9, roughness: 0.2, metalness: 0.7, emissive: 0x082f49, wireframe: is3DWireframe });
            group.add(new THREE.Mesh(geo, mat));
            if (modelTitle) modelTitle.textContent = 'Quantum Torus Manifold';
        }

        activeMesh = group;
        threeScene.add(activeMesh);
    }

    const modelBtns = document.querySelectorAll('.model-btn');
    modelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const modelType = btn.getAttribute('data-model') || 'polyhedron';
            load3DModel(modelType);
            soundFx.playPop();
        });
    });

    if (toggle3DAutoRotateBtn) {
        toggle3DAutoRotateBtn.addEventListener('click', () => {
            is3DAutoRotate = !is3DAutoRotate;
            toggle3DAutoRotateBtn.classList.toggle('active', is3DAutoRotate);
            showActionToast(is3DAutoRotate ? '🔄 Auto-Spin Resumed' : '⏸️ Auto-Spin Paused');
        });
    }

    if (toggle3DWireframeBtn) {
        toggle3DWireframeBtn.addEventListener('click', () => {
            is3DWireframe = !is3DWireframe;
            toggle3DWireframeBtn.classList.toggle('active', is3DWireframe);
            if (activeMesh) {
                activeMesh.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.wireframe = is3DWireframe;
                        child.material.needsUpdate = true;
                    }
                });
            }
            showActionToast(is3DWireframe ? '🕸️ Wireframe Active' : '🔷 Solid Model Active');
        });
    }

    if (reset3DViewBtn) {
        reset3DViewBtn.addEventListener('click', () => {
            if (threeCamera) {
                threeCamera.position.set(0, 0, 8);
                threeCamera.lookAt(0, 0, 0);
            }
            if (activeMesh) activeMesh.rotation.set(0, 0, 0);
            showActionToast('🎯 Centered 3D View');
        });
    }

    // Direct Mouse & Touch Orbit Controls for 3D Container
    let isOrbitDragging = false;
    let orbitLastPos = { x: 0, y: 0 };
    const threeContainer = document.getElementById('threejsContainer');
    if (threeContainer) {
        threeContainer.addEventListener('mousedown', (e) => {
            if (activeMode !== 'model3d') return;
            isOrbitDragging = true;
            orbitLastPos = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mousemove', (e) => {
            if (isOrbitDragging && activeMode === 'model3d' && activeMesh) {
                const dx = e.clientX - orbitLastPos.x;
                const dy = e.clientY - orbitLastPos.y;
                activeMesh.rotation.y += dx * 0.008;
                activeMesh.rotation.x += dy * 0.008;
                orbitLastPos = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mouseup', () => {
            isOrbitDragging = false;
        });

        threeContainer.addEventListener('wheel', (e) => {
            if (activeMode !== 'model3d' || !threeCamera) return;
            e.preventDefault();
            threeCamera.position.z = Math.max(3.0, Math.min(16.0, threeCamera.position.z + e.deltaY * 0.005));
        }, { passive: false });

        threeContainer.addEventListener('touchstart', (e) => {
            if (activeMode !== 'model3d' || e.touches.length !== 1) return;
            isOrbitDragging = true;
            orbitLastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });

        window.addEventListener('touchmove', (e) => {
            if (isOrbitDragging && activeMode === 'model3d' && activeMesh && e.touches.length === 1) {
                const dx = e.touches[0].clientX - orbitLastPos.x;
                const dy = e.touches[0].clientY - orbitLastPos.y;
                activeMesh.rotation.y += dx * 0.008;
                activeMesh.rotation.x += dy * 0.008;
                orbitLastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        });

        window.addEventListener('touchend', () => {
            isOrbitDragging = false;
        });
    }

    // ── 6. Gesture Engine Callbacks ──
    if (window.GestureEngine) {
        gestureEngine = new GestureEngine({
            videoElement: webcamVideo,
            canvasElement: handCanvas,
            onGestureDetected: (data) => handleGestureDetected(data),
            onLaserMove: (data) => handleLaserMove(data),
            onDrawMove: (data) => handleSpatialDrawMove(data),
            onEraserMove: (data) => handleSpatialEraserMove(data),
            onSpatialRotate: (data) => handleSpatialRotate(data),
            onSpotlightMove: (data) => handleSpotlightMove(data),
            onTwoHandZoom: (data) => handleTwoHandZoom(data),
            onCanvasClear: () => handleClearAllCanvas()
        });

        // Camera starts OFF by default
        if (camStatusBadge) {
            camStatusBadge.textContent = 'Camera Off';
            camStatusBadge.style.color = 'var(--text-muted)';
        }
        if (camStartOverlay) {
            camStartOverlay.classList.remove('hidden');
        }
    }

    function handleClearAllCanvas() {
        if (wbCtx && whiteboardCanvas) {
            wbCtx.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height);
        }
        if (drawCtx && drawingCanvas) {
            drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        }
        if (laserTrailCtx && laserTrailCanvas) {
            laserTrailCtx.clearRect(0, 0, laserTrailCanvas.width, laserTrailCanvas.height);
        }
        currentStrokePoints = [];
        lastHandDrawPos = null;
        lastSpatialEraserPos = null;
        isDrawingStroke = false;
        preStrokeSnapshot = null;
        if (eraserCircle) eraserCircle.style.display = 'none';
        if (arHandTracker) arHandTracker.style.display = 'none';
        soundFx.playSwoosh();
        showActionToast('🧹 ✨ Auto-Cleared Canvas Notes!');
    }

    function handleGestureDetected(data) {
        if (hudIcon) hudIcon.textContent = data.icon || '🖐';
        if (hudGestureName) hudGestureName.textContent = data.label || 'Neutral';
        if (confidenceBadge) confidenceBadge.textContent = `${Math.round((data.confidence || 0.95) * 100)}%`;

        if (data.triggered) {
            if (data.gesture === 'CLEAR_CANVAS') {
                handleClearAllCanvas();
            } else if (data.gesture === 'NEXT_SLIDE' && activeMode === 'deck') {
                if (laserDot) laserDot.style.display = 'none';
                lastLaserPos = null;
                if (laserTrailCtx && laserTrailCanvas) laserTrailCtx.clearRect(0, 0, laserTrailCanvas.width, laserTrailCanvas.height);
                navigateSlide('next');
                showActionToast('👉 Next Slide');
            } else if (data.gesture === 'PREV_SLIDE' && activeMode === 'deck') {
                if (laserDot) laserDot.style.display = 'none';
                lastLaserPos = null;
                if (laserTrailCtx && laserTrailCanvas) laserTrailCtx.clearRect(0, 0, laserTrailCanvas.width, laserTrailCanvas.height);
                navigateSlide('prev');
                showActionToast('👈 Previous Slide');
            } else if (data.gesture === 'VICTORY') {
                if (window.confetti) window.confetti({ particleCount: 100, spread: 80 });
                soundFx.playCelebration();
                showActionToast('✌️ Celebration! 🎉');

                // If user was drawing a shape, snap it into a clean vector shape
                if (currentStrokePoints.length > 8) {
                    snapCurrentStroke(currentStrokePoints);
                    currentStrokePoints = [];
                    isDrawingStroke = false;
                }
            } else if (data.gesture === 'THUMBS_UP') {
                spawnFloatingParticles('👍', 5);
                spawnFloatingParticles('🔥', 4);
                soundFx.playPop();
                showActionToast('👍 Awesome Reaction!');
            }
        }
    }

    function handleLaserMove(data) {
        if (!laserDot) return;
        if (activeMode === 'model3d') {
            laserDot.style.display = 'none';
            lastLaserPos = null;
            return;
        }
        if (data.active) {
            laserDot.style.display = 'flex';
            const px = Math.max(1, Math.min(99, data.x * 100));
            const py = Math.max(1, Math.min(99, data.y * 100));
            laserDot.style.left = `${px}%`;
            laserDot.style.top = `${py}%`;

            // Draw clean fading presentation red laser beam trail
            if (laserTrailCtx && laserTrailCanvas) {
                const cx = (px / 100) * laserTrailCanvas.width;
                const cy = (py / 100) * laserTrailCanvas.height;
                if (lastLaserPos) {
                    laserTrailCtx.save();
                    laserTrailCtx.beginPath();
                    laserTrailCtx.moveTo(lastLaserPos.x, lastLaserPos.y);
                    laserTrailCtx.lineTo(cx, cy);
                    laserTrailCtx.strokeStyle = '#ff0033';
                    laserTrailCtx.lineWidth = 3.5;
                    laserTrailCtx.lineCap = 'round';
                    laserTrailCtx.shadowColor = '#ff0033';
                    laserTrailCtx.shadowBlur = 12;
                    laserTrailCtx.stroke();
                    laserTrailCtx.restore();
                }
                lastLaserPos = { x: cx, y: cy };
            }

            if (arHandTracker) {
                arHandTracker.style.display = 'flex';
                arHandTracker.style.left = `${px}%`;
                arHandTracker.style.top = `${py}%`;
                if (arTrackerIcon) arTrackerIcon.textContent = '🔴';
                if (arTrackerLabel) arTrackerLabel.textContent = 'Laser Pointer';
            }
        } else {
            laserDot.style.display = 'none';
            lastLaserPos = null;
            if (arHandTracker && activeTool === 'laser') arHandTracker.style.display = 'none';
        }
    }

    function handleSpatialDrawMove(data) {
        if (activeMode === 'model3d') return;

        const targetCtx = (activeMode === 'whiteboard') ? wbCtx : drawCtx;
        const targetCanvas = (activeMode === 'whiteboard') ? whiteboardCanvas : drawingCanvas;
        if (!targetCtx || !targetCanvas) return;

        if (eraserCircle) eraserCircle.style.display = 'none';

        if (data.active) {
            const currPos = { x: data.x * targetCanvas.width, y: data.y * targetCanvas.height };

            if (arHandTracker) {
                arHandTracker.style.display = 'flex';
                arHandTracker.style.left = `${Math.max(2, Math.min(98, data.x * 100))}%`;
                arHandTracker.style.top = `${Math.max(2, Math.min(98, data.y * 100))}%`;
                if (arTrackerIcon) arTrackerIcon.textContent = (activeTool === 'rainbow') ? '🌈' : (activeTool === 'sparkler') ? '✨' : (activeTool === 'shape') ? '📐' : '✏️';
                if (arTrackerLabel) arTrackerLabel.textContent = (activeTool === 'rainbow') ? 'Rainbow Flow' : (activeTool === 'sparkler') ? 'Star Sparkler' : (activeTool === 'shape') ? 'Shape AI' : 'Neon Ink';
            }

            // Save clean canvas before first stroke point starts
            if (!isDrawingStroke) {
                savePreStrokeSnapshot();
                isDrawingStroke = true;
                currentStrokePoints = [currPos];
            } else {
                currentStrokePoints.push(currPos);
            }

            if (lastHandDrawPos) {
                drawStrokeSegment(targetCtx, lastHandDrawPos, currPos, currentDrawColor, currentBrushSize, activeTool === 'eraser');
            }
            lastHandDrawPos = currPos;
        } else {
            if (arHandTracker) arHandTracker.style.display = 'none';
            if (isDrawingStroke && currentStrokePoints.length > 8 && (activeTool === 'shape' || activeTool === 'pen')) {
                if (activeTool === 'shape') {
                    snapCurrentStroke(currentStrokePoints);
                }
            }
            currentStrokePoints = [];
            lastHandDrawPos = null;
            isDrawingStroke = false;
        }
    }

    function handleSpatialEraserMove(data) {
        if (!data.active) {
            if (eraserCircle) eraserCircle.style.display = 'none';
            if (arHandTracker) arHandTracker.style.display = 'none';
            lastSpatialEraserPos = null;
            return;
        }

        const targetCanvas = (activeMode === 'whiteboard') ? whiteboardCanvas : drawingCanvas;
        if (!targetCanvas) return;

        const currPos = { x: data.x * targetCanvas.width, y: data.y * targetCanvas.height };

        if (eraserCircle) {
            eraserCircle.style.display = 'flex';
            eraserCircle.style.left = `${Math.max(2, Math.min(98, data.x * 100))}%`;
            eraserCircle.style.top = `${Math.max(2, Math.min(98, data.y * 100))}%`;
        }

        if (arHandTracker) {
            arHandTracker.style.display = 'flex';
            arHandTracker.style.left = `${Math.max(2, Math.min(98, data.x * 100))}%`;
            arHandTracker.style.top = `${Math.max(2, Math.min(98, data.y * 100))}%`;
            if (arTrackerIcon) arTrackerIcon.textContent = '✊';
            if (arTrackerLabel) arTrackerLabel.textContent = 'Air Eraser';
        }

        const contextsToErase = [wbCtx, drawCtx].filter(Boolean);
        contextsToErase.forEach(ctx => {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';

            if (lastSpatialEraserPos) {
                ctx.beginPath();
                ctx.moveTo(lastSpatialEraserPos.x, lastSpatialEraserPos.y);
                ctx.lineTo(currPos.x, currPos.y);
                ctx.lineWidth = 130;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.arc(currPos.x, currPos.y, 65, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        if (Math.random() < 0.25) {
            spawnSparkleParticle(currPos.x, currPos.y, '#ff4d6d', ['💨', '✨']);
        }

        lastSpatialEraserPos = currPos;
    }

    function handleSpatialRotate(data) {
        if (activeMode === 'model3d' && activeMesh && data.active) {
            if (previousPalmPos) {
                const deltaX = data.x - previousPalmPos.x;
                const deltaY = data.y - previousPalmPos.y;
                activeMesh.rotation.y += deltaX * 4.5;
                activeMesh.rotation.x += deltaY * 4.5;
            }
            previousPalmPos = { x: data.x, y: data.y };
        } else {
            previousPalmPos = null;
        }
    }

    function handleTwoHandZoom(data) {
        if (activeMode === 'model3d' && threeCamera) {
            threeCamera.position.z = Math.max(3.0, Math.min(16.0, threeCamera.position.z - data.zoomFactor));
            showActionToast(`🌐 3D Zoom: ${Math.round((8 / threeCamera.position.z) * 100)}%`);
        }
    }

    function handleSpotlightMove(data) {
        if (isSpotlightActive && data.active) {
            updateSpotlightMask(data.x * 100, data.y * 100);
        }
    }

    function updateSpotlightMask(percentX, percentY) {
        if (!spotlightOverlay || !isSpotlightActive) return;
        spotlightOverlay.style.background = `radial-gradient(circle ${spotlightRadius}px at ${percentX}% ${percentY}%, transparent 0%, rgba(4, 4, 10, 0.88) 100%)`;
    }

    // ── 7. Slide Presentation Controller ──
    fetchSlides();

    async function fetchSlides() {
        try {
            const res = await fetch('/api/slides');
            const data = await res.json();
            if (data.status === 'success' && data.presentation) {
                presentationState = data.presentation;
                renderPresentation();
            }
        } catch (err) {
            console.error('Error fetching slides:', err);
        }
    }

    function renderPresentation() {
        if (!presentationState.slides || presentationState.slides.length === 0) return;
        const currentIdx = presentationState.current_index;
        const total = presentationState.total_slides;
        const currentSlideUrl = presentationState.slides[currentIdx];

        if (presTitle) presTitle.textContent = presentationState.title || 'Presentation';
        if (presentationProgressBar) presentationProgressBar.style.width = `${((currentIdx + 1) / total) * 100}%`;

        if (slideImage) {
            slideImage.classList.add('changing');
            setTimeout(() => {
                slideImage.src = currentSlideUrl;
                slideImage.classList.remove('changing');
            }, 80);
        }

        if (speakerNotesText) {
            speakerNotesText.textContent = (presentationState.notes && presentationState.notes[currentIdx])
                ? presentationState.notes[currentIdx]
                : `Key talking points for Slide ${currentIdx + 1}.`;
        }

        renderThumbnails();
    }

    function renderThumbnails() {
        if (!thumbnailsBar) return;
        thumbnailsBar.innerHTML = '';
        presentationState.slides.forEach((url, idx) => {
            const card = document.createElement('div');
            card.className = `thumb-card ${idx === presentationState.current_index ? 'active' : ''}`;
            card.innerHTML = `<img src="${url}" alt="Slide ${idx + 1}"><span class="thumb-number">${idx + 1}</span>`;
            card.addEventListener('click', () => navigateSlide('goto', idx));
            thumbnailsBar.appendChild(card);
        });
    }

    async function navigateSlide(action, targetIdx = null) {
        try {
            const res = await fetch('/api/navigate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action, index: targetIdx })
            });
            const data = await res.json();
            if (data.status === 'success' && data.presentation) {
                presentationState = data.presentation;
                renderPresentation();
                soundFx.playSwoosh();
            }
        } catch (err) {
            console.error('Navigation error:', err);
        }
    }

    if (prevSlideBtn) prevSlideBtn.addEventListener('click', () => navigateSlide('prev'));
    if (nextSlideBtn) nextSlideBtn.addEventListener('click', () => navigateSlide('next'));

    // ── 8. Camera & Gesture Simulator Toggle Logic ──
    async function toggleCameraState() {
        if (!gestureEngine) return;

        if (!gestureEngine.isTracking) {
            // Attempt to start physical webcam
            if (camStatusBadge) {
                camStatusBadge.textContent = 'Connecting...';
                camStatusBadge.style.color = 'var(--cyan)';
            }
            
            const startPromise = gestureEngine.start();
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), 6000));
            const started = await Promise.race([startPromise, timeoutPromise]);

            if (started !== false) {
                if (camBtnText) camBtnText.textContent = 'Stop Camera';
                if (sidebarCamText) sidebarCamText.textContent = 'Turn Off Camera';
                if (toggleCamBtn) toggleCamBtn.classList.add('chip-danger');
                if (sidebarCamToggleBtn) sidebarCamToggleBtn.classList.add('cam-active');
                if (camStartOverlay) camStartOverlay.classList.add('hidden');
                if (pipStatusDot) {
                    pipStatusDot.classList.remove('dot-off');
                    pipStatusDot.classList.add('active');
                }
                if (camStatusBadge) {
                    camStatusBadge.textContent = 'Webcam Live';
                    camStatusBadge.style.color = 'var(--emerald)';
                }
                showActionToast('📹 Camera Tracking Started');
            } else {
                // Camera failed or denied
                if (camStatusBadge) {
                    camStatusBadge.textContent = 'Camera Off';
                    camStatusBadge.style.color = 'var(--text-muted)';
                }
                if (camStartOverlay) camStartOverlay.classList.remove('hidden');
                showActionToast('⚠️ Camera access unavailable or denied');
            }
        } else {
            // Stop Camera
            gestureEngine.stop();
            if (camBtnText) camBtnText.textContent = 'Start Camera';
            if (sidebarCamText) sidebarCamText.textContent = 'Turn On Camera';
            if (toggleCamBtn) toggleCamBtn.classList.remove('chip-danger');
            if (sidebarCamToggleBtn) sidebarCamToggleBtn.classList.remove('cam-active');
            if (camStartOverlay) camStartOverlay.classList.remove('hidden');
            if (pipStatusDot) {
                pipStatusDot.classList.remove('active');
                pipStatusDot.classList.add('dot-off');
            }
            if (camStatusBadge) {
                camStatusBadge.textContent = 'Camera Off';
                camStatusBadge.style.color = 'var(--text-muted)';
            }
            showActionToast('📹 Camera Turned Off');
        }
    }

    if (toggleCamBtn) toggleCamBtn.addEventListener('click', toggleCameraState);
    if (sidebarCamToggleBtn) sidebarCamToggleBtn.addEventListener('click', toggleCameraState);
    if (camViewportBox) camViewportBox.addEventListener('click', () => {
        if (gestureEngine && !gestureEngine.isTracking) toggleCameraState();
    });

    // ── 9. Voice AI (Dual Engine: Web Speech API + Server WAV Recognizer + Web Audio Visualizer) ──
    let voiceRestartTimer = null;
    let lastVoiceCommandTime = 0;
    let voiceAudioCtx = null;
    let voiceAnalyser = null;
    let voiceMicStream = null;
    let voiceProcessor = null;
    let voiceAnimFrame = null;
    let voiceAudioBuffer = [];
    let isSpeakingDetected = false;
    let silenceFrameCount = 0;

    function speakVoiceFeedback(text) {
        if (!('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.05;
            utterance.pitch = 1.0;
            utterance.volume = 0.9;
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.log("SpeechSynthesis notice:", e);
        }
    }

    function floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    function encodeWAV(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);
        floatTo16BitPCM(view, 44, samples);
        return new Blob([view], { type: 'audio/wav' });
    }

    function downsampleBuffer(buffer, inputSampleRate, targetSampleRate = 16000) {
        if (inputSampleRate === targetSampleRate) return buffer;
        const ratio = inputSampleRate / targetSampleRate;
        const newLength = Math.round(buffer.length / ratio);
        const result = new Float32Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;
        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
            let accum = 0, count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = count > 0 ? accum / count : buffer[offsetBuffer];
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    }

    async function sendVoiceAudioToServer(samples, sampleRate) {
        if (!samples || samples.length < sampleRate * 0.3) return; // Min 0.3s
        try {
            const resampled = downsampleBuffer(samples, sampleRate, 16000);
            const wavBlob = encodeWAV(resampled, 16000);
            const formData = new FormData();
            formData.append('audio', wavBlob, 'voice_command.wav');

            const res = await fetch('/api/voice_command', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status === 'success' && data.action) {
                executeVoiceAction(data.action, data.message, data.transcript);
            }
        } catch (err) {
            console.warn('Server voice recognizer notice:', err);
        }
    }

    async function startLiveMicVisualizer() {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                // Request full hardware auto-gain and far-field speech constraints
                voiceMicStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        autoGainControl: true,
                        noiseSuppression: true,
                        echoCancellation: true,
                        channelCount: 1
                    }
                });

                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                voiceAudioCtx = new AudioContextClass();
                const source = voiceAudioCtx.createMediaStreamSource(voiceMicStream);
                
                // Digital Gain Booster Node (4.5x hardware signal amplification)
                const voiceGainNode = voiceAudioCtx.createGain();
                voiceGainNode.gain.value = 4.5;
                source.connect(voiceGainNode);

                voiceAnalyser = voiceAudioCtx.createAnalyser();
                voiceAnalyser.fftSize = 64;
                voiceGainNode.connect(voiceAnalyser);

                // Script processor for local server-side audio capture fallback (Muted destination to avoid echo loop)
                const bufferSize = 4096;
                voiceProcessor = voiceAudioCtx.createScriptProcessor(bufferSize, 1, 1);
                voiceGainNode.connect(voiceProcessor);
                const voiceMuteNode = voiceAudioCtx.createGain();
                voiceMuteNode.gain.value = 0; // Zero volume to speakers to prevent mic acoustic feedback
                voiceProcessor.connect(voiceMuteNode);
                voiceMuteNode.connect(voiceAudioCtx.destination);

                voiceAudioBuffer = [];
                isSpeakingDetected = false;
                silenceFrameCount = 0;

                voiceProcessor.onaudioprocess = (e) => {
                    if (!isVoiceActive) return;
                    const inputData = e.inputBuffer.getChannelData(0);
                    
                    if (isSpeakingDetected) {
                        voiceAudioBuffer.push(new Float32Array(inputData));
                        if (voiceAudioBuffer.length > 25) { // Fast ~2s max
                            finishAndSendRecording();
                        }
                    }
                };

                const dataArray = new Uint8Array(voiceAnalyser.frequencyBinCount);
                const eqBars = document.querySelectorAll('.eq-bar');

                const checkVolume = () => {
                    if (!isVoiceActive || !voiceAnalyser) return;
                    voiceAnalyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                    const avg = sum / dataArray.length;
                    const level = Math.min(100, Math.round((avg / 85) * 100));

                    eqBars.forEach((bar, idx) => {
                        const h = Math.max(18, Math.min(100, level * (0.9 + idx * 0.4)));
                        bar.style.height = `${h}%`;
                        bar.style.animation = 'none';
                    });

                    if (level > 5) { // Sensitive far-field detection threshold
                        isSpeakingDetected = true;
                        silenceFrameCount = 0;
                        if (voiceStatusText && !voiceStatusText.textContent.includes('Heard') && !voiceStatusText.textContent.includes('Executed')) {
                            voiceStatusText.textContent = '🎙️ Hearing Voice...';
                        }
                    } else if (isSpeakingDetected) {
                        silenceFrameCount++;
                        if (silenceFrameCount > 10) { // Fast ~0.30s silence for instant response
                            finishAndSendRecording();
                        }
                    }

                    voiceAnimFrame = requestAnimationFrame(checkVolume);
                };

                function finishAndSendRecording() {
                    if (voiceAudioBuffer.length >= 2) {
                        let totalLength = 0;
                        voiceAudioBuffer.forEach(b => totalLength += b.length);
                        const merged = new Float32Array(totalLength);
                        let offset = 0;
                        voiceAudioBuffer.forEach(b => {
                            merged.set(b, offset);
                            offset += b.length;
                        });
                        sendVoiceAudioToServer(merged, voiceAudioCtx.sampleRate);
                    }
                    voiceAudioBuffer = [];
                    isSpeakingDetected = false;
                    silenceFrameCount = 0;
                }

                checkVolume();
            }
        } catch (err) {
            console.warn('Microphone stream visualizer notice:', err);
        }
    }

    function stopLiveMicVisualizer() {
        if (voiceAnimFrame) cancelAnimationFrame(voiceAnimFrame);
        if (voiceProcessor) {
            try { voiceProcessor.disconnect(); } catch (e) {}
            voiceProcessor = null;
        }
        if (voiceMicStream) {
            voiceMicStream.getTracks().forEach(t => t.stop());
            voiceMicStream = null;
        }
        if (voiceAudioCtx) {
            try { voiceAudioCtx.close(); } catch (e) {}
            voiceAudioCtx = null;
        }
    }

    if (voiceControlBtn) {
        voiceControlBtn.addEventListener('click', async () => {
            if (!isVoiceActive) {
                isVoiceActive = true;
                voiceControlBtn.classList.add('active-pill');
                if (voiceMicIcon) voiceMicIcon.textContent = '🔴';
                if (voiceIndicator) voiceIndicator.style.display = 'flex';
                if (voiceStatusText) voiceStatusText.textContent = '🎙️ Listening... Say "Next", "Laser", "3D", "Clear"';
                
                await startLiveMicVisualizer();
                startVoiceRecognition();
                speakVoiceFeedback("Voice Assistant Active");
                showActionToast('🎙️ Voice Assistant Activated');
            } else {
                isVoiceActive = false;
                voiceControlBtn.classList.remove('active-pill');
                if (voiceMicIcon) voiceMicIcon.textContent = '🎙️';
                if (voiceIndicator) voiceIndicator.style.display = 'none';
                
                stopLiveMicVisualizer();
                stopVoiceRecognition();
                speakVoiceFeedback("Voice Assistant Deactivated");
                showActionToast('🔇 Voice Assistant Deactivated');
            }
        });
    }

    function startVoiceRecognition() {
        if (!isVoiceActive) return;
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) return;

        if (voiceRecognition) {
            try { voiceRecognition.abort(); } catch (e) {}
            voiceRecognition = null;
        }

        try {
            voiceRecognition = new SpeechRec();
            voiceRecognition.continuous = true;
            voiceRecognition.interimResults = true;
            voiceRecognition.lang = 'en-IN'; // Optimized for Indian English & Hindi accent
            voiceRecognition.maxAlternatives = 3;

            voiceRecognition.onstart = () => {
                if (isVoiceActive && voiceStatusText) {
                    voiceStatusText.textContent = '🎙️ Listening... Say "Next", "Laser", "3D", "Clear"';
                }
            };

            voiceRecognition.onresult = (event) => {
                let currentSpeech = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    for (let j = 0; j < event.results[i].length; ++j) {
                        currentSpeech += ' ' + event.results[i][j].transcript;
                    }
                }
                const cleaned = currentSpeech.trim().toLowerCase();
                if (cleaned) {
                    if (voiceStatusText) {
                        voiceStatusText.textContent = `🎙️ Heard: "${cleaned.split(' ').slice(-3).join(' ')}"`;
                    }
                    executeVoiceCommand(cleaned);
                }
            };

            voiceRecognition.onerror = (event) => {
                console.warn('Browser SpeechRecognition notice:', event.error);
            };

            voiceRecognition.onend = () => {
                if (isVoiceActive) {
                    if (voiceRestartTimer) clearTimeout(voiceRestartTimer);
                    voiceRestartTimer = setTimeout(() => {
                        if (isVoiceActive) {
                            try {
                                if (voiceRecognition) voiceRecognition.start();
                                else startVoiceRecognition();
                            } catch (e) {
                                startVoiceRecognition();
                            }
                        }
                    }, 50); // Instant 50ms restart
                }
            };

            voiceRecognition.start();
        } catch (err) {
            console.error('SpeechRecognition launch error:', err);
        }
    }

    function stopVoiceRecognition() {
        if (voiceRestartTimer) clearTimeout(voiceRestartTimer);
        if (voiceRecognition) {
            try { voiceRecognition.stop(); } catch (e) {}
            voiceRecognition = null;
        }
    }

    // Connect Quick Voice Command Chips
    document.querySelectorAll('.v-cmd-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            const cmd = chip.getAttribute('data-cmd');
            if (cmd) {
                executeVoiceCommand(cmd);
            }
        });
    });

    function executeVoiceAction(action, label, transcript = '') {
        const now = Date.now();
        if (now - lastVoiceCommandTime < 650) return;
        lastVoiceCommandTime = now;

        if (action === 'next_slide') {
            if (activeMode !== 'deck') setStudioMode('deck');
            navigateSlide('next');
        } else if (action === 'prev_slide') {
            if (activeMode !== 'deck') setStudioMode('deck');
            navigateSlide('prev');
        } else if (action === 'whiteboard') {
            setStudioMode('whiteboard');
        } else if (action === 'deck') {
            setStudioMode('deck');
        } else if (action === 'model3d') {
            setStudioMode('model3d');
            initThreeJS();
        } else if (action === 'laser') {
            const btn = document.getElementById('toolLaserBtn');
            if (btn) btn.click();
        } else if (action === 'rainbow') {
            const btn = document.getElementById('toolRainbowBtn');
            if (btn) btn.click();
        } else if (action === 'sparkler') {
            const btn = document.getElementById('toolSparklerBtn');
            if (btn) btn.click();
        } else if (action === 'shape') {
            const btn = document.getElementById('toolShapeSnapperBtn');
            if (btn) btn.click();
        } else if (action === 'spotlight') {
            const btn = document.getElementById('toolSpotlightBtn');
            if (btn) btn.click();
        } else if (action === 'eraser') {
            const btn = document.getElementById('toolEraserBtn');
            if (btn) btn.click();
        } else if (action === 'pen') {
            const btn = document.getElementById('toolPenBtn');
            if (btn) btn.click();
        } else if (action === 'clear') {
            handleClearAllCanvas();
        } else if (action === 'camera_on') {
            if (gestureEngine && !gestureEngine.isTracking) toggleCameraState();
        } else if (action === 'camera_off') {
            if (gestureEngine && gestureEngine.isTracking) toggleCameraState();
        } else if (action === 'spin') {
            const btn = document.getElementById('btnAutoSpin');
            if (btn) btn.click();
        } else if (action === 'wireframe') {
            const btn = document.getElementById('btnWireframe');
            if (btn) btn.click();
        } else if (action === 'center') {
            const btn = document.getElementById('btnCenterModel');
            if (btn) btn.click();
        } else if (action === 'fullscreen') {
            if (fullscreenBtn) fullscreenBtn.click();
        }

        showActionToast(`🎙️ ${label}`);
        speakVoiceFeedback(label);
        if (voiceStatusText) {
            voiceStatusText.textContent = `✅ Executed: "${label}"`;
        }
    }

    function executeVoiceCommand(speech) {
        const now = Date.now();
        if (now - lastVoiceCommandTime < 600) return; // Command cooldown

        let matched = false;
        let feedbackMsg = '';
        let action = null;
        const s = speech.toLowerCase();

        // 1. Slide Navigation (Phonetic: next, nex, nest, necks, nxt, max, aage, agla, forward, right, chalo)
        if (/(next|nex|nest|necks|nxt|aage|agla|forward|right|chalo|next page|go next)/i.test(s)) {
            action = 'next_slide';
            feedbackMsg = 'Next Slide';
            matched = true;
        } else if (/(back|bac|pack|beck|bag|piche|peeche|previous|prev|left|wapas|pichla|go back)/i.test(s)) {
            action = 'prev_slide';
            feedbackMsg = 'Previous Slide';
            matched = true;
        }
        // 2. Studio Modes
        else if (/(whiteboard|white board|board|bord|broad|canvas|draw mode|drawing|likho)/i.test(s)) {
            action = 'whiteboard';
            feedbackMsg = 'Switched to Air Whiteboard';
            matched = true;
        } else if (/(presentation|deck|slides|slide mode|ppt)/i.test(s)) {
            action = 'deck';
            feedbackMsg = 'Switched to Spatial Deck';
            matched = true;
        } else if (/(model|3d|3-d|three d|three-d|cube|inspector|hologram|spatial)/i.test(s)) {
            action = 'model3d';
            feedbackMsg = 'Switched to 3D Spatial Inspector';
            matched = true;
        }
        // 3. Creative Tools
        else if (/(laser|lazer|leser|lezer|lejar|layer|leather|pointer|point|red dot|red laser)/i.test(s)) {
            action = 'laser';
            feedbackMsg = 'Laser Pointer Active';
            matched = true;
        } else if (/(rainbow|color|colour|color pen)/i.test(s)) {
            action = 'rainbow';
            feedbackMsg = 'Rainbow Pen Active';
            matched = true;
        } else if (/(sparkler|sparkle|spark|magic|magic pen)/i.test(s)) {
            action = 'sparkler';
            feedbackMsg = 'Sparkler Brush Active';
            matched = true;
        } else if (/(shape|shapes|geometry|circle|square|triangle)/i.test(s)) {
            action = 'shape';
            feedbackMsg = 'Shape AI Active';
            matched = true;
        } else if (/(spotlight|spot light|spot|torch|focus|beam)/i.test(s)) {
            action = 'spotlight';
            feedbackMsg = 'Spotlight Beam Active';
            matched = true;
        } else if (/(eraser|erase|rubber|mitao)/i.test(s)) {
            action = 'eraser';
            feedbackMsg = 'Air Eraser Active';
            matched = true;
        } else if (/(pen|pencil|marker|draw|write|likho)/i.test(s)) {
            action = 'pen';
            feedbackMsg = 'Neon Pen Active';
            matched = true;
        }
        // 4. Actions & Controls
        else if (/(clear|clean|cler|clea|saaf|saf|delete|remove all|clear all|reset canvas)/i.test(s)) {
            action = 'clear';
            feedbackMsg = 'Canvas Cleared';
            matched = true;
        } else if (/(fullscreen|full screen|maximize)/i.test(s)) {
            action = 'fullscreen';
            feedbackMsg = 'Toggled Fullscreen';
            matched = true;
        } else if (/(camera on|start camera|turn on camera|open camera)/i.test(s)) {
            action = 'camera_on';
            feedbackMsg = 'Camera Started';
            matched = true;
        } else if (/(camera off|stop camera|turn off camera|close camera)/i.test(s)) {
            action = 'camera_off';
            feedbackMsg = 'Camera Stopped';
            matched = true;
        } else if (/(spin|rotate|ghumo|auto spin)/i.test(s)) {
            action = 'spin';
            feedbackMsg = 'Auto Spin Toggled';
            matched = true;
        } else if (/(wireframe|mesh|skeleton)/i.test(s)) {
            action = 'wireframe';
            feedbackMsg = 'Wireframe Toggled';
            matched = true;
        } else if (/(center|center model|reset 3d|reset model)/i.test(s)) {
            action = 'center';
            feedbackMsg = '3D Model Centered';
            matched = true;
        }

        if (matched && action) {
            executeVoiceAction(action, feedbackMsg, speech);
        }
    }

    // ── 10. Save Artifact Image ──
    if (saveSlideBtn) {
        saveSlideBtn.addEventListener('click', () => {
            const expCanvas = document.createElement('canvas');
            expCanvas.width = 1920;
            expCanvas.height = 1080;
            const expCtx = expCanvas.getContext('2d');

            if (activeMode === 'whiteboard' && whiteboardCanvas) {
                expCtx.fillStyle = '#06060f';
                expCtx.fillRect(0, 0, 1920, 1080);
                expCtx.drawImage(whiteboardCanvas, 0, 0, 1920, 1080);
                downloadCanvasImage(expCanvas, 'AeroSense_Whiteboard_Notes.png');
            } else if (activeMode === 'deck' && slideImage) {
                const baseImg = new Image();
                baseImg.crossOrigin = "anonymous";
                baseImg.src = slideImage.src;
                baseImg.onload = () => {
                    expCtx.drawImage(baseImg, 0, 0, 1920, 1080);
                    if (drawingCanvas) expCtx.drawImage(drawingCanvas, 0, 0, 1920, 1080);
                    downloadCanvasImage(expCanvas, `AeroSense_Slide_${presentationState.current_index + 1}_annotated.png`);
                };
            }
        });
    }

    function downloadCanvasImage(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showActionToast('💾 Downloaded Image!');
    }

    // ── 11. Modals & Settings ──
    if (uploadModalBtn) uploadModalBtn.addEventListener('click', () => uploadModal.style.display = 'flex');
    if (closeUploadModalBtn) closeUploadModalBtn.addEventListener('click', () => uploadModal.style.display = 'none');

    if (analyticsModalBtn) analyticsModalBtn.addEventListener('click', async () => {
        await fetchAnalytics();
        if (analyticsModal) analyticsModal.style.display = 'flex';
    });
    if (closeAnalyticsModalBtn) closeAnalyticsModalBtn.addEventListener('click', () => analyticsModal.style.display = 'none');

    if (settingsModalBtn) settingsModalBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
    if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', () => settingsModal.style.display = 'none');

    if (helpModalBtn) helpModalBtn.addEventListener('click', () => helpModal.style.display = 'flex');
    if (closeHelpModalBtn) closeHelpModalBtn.addEventListener('click', () => helpModal.style.display = 'none');

    window.addEventListener('click', (e) => {
        if (e.target === uploadModal) uploadModal.style.display = 'none';
        if (e.target === analyticsModal) analyticsModal.style.display = 'none';
        if (e.target === settingsModal) settingsModal.style.display = 'none';
        if (e.target === helpModal) helpModal.style.display = 'none';
    });

    async function fetchAnalytics() {
        try {
            const res = await fetch('/api/analytics');
            const data = await res.json();
            if (data.status === 'success' && data.analytics) {
                const a = data.analytics;
                document.getElementById('analyticsTotalTime').textContent = a.formatted_duration || '00:00';
                document.getElementById('analyticsAvgTime').textContent = `${a.avg_seconds_per_slide}s`;
                document.getElementById('analyticsTotalGestures').textContent = a.total_gestures || '0';
                const pacingEl = document.getElementById('analyticsPacing');
                pacingEl.textContent = a.pacing_grade || 'Optimal';
                pacingEl.className = `stat-val pacing-pill ${a.pacing_status || ''}`;

                const tbody = document.getElementById('analyticsTableBody');
                if (tbody && a.slides_breakdown) {
                    tbody.innerHTML = '';
                    a.slides_breakdown.forEach(s => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td><strong>Slide ${s.slide_number}</strong></td><td>${s.formatted} (${s.seconds}s)</td><td>${s.percentage}%</td><td><div class="table-progress-bar"><div class="table-progress-fill" style="width:${Math.min(100, s.percentage * 2.5)}%;"></div></div></td>`;
                        tbody.appendChild(tr);
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    if (engineSelect) {
        engineSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            if (gestureEngine) gestureEngine.setEngineMode(mode);
            showActionToast(`Engine: ${mode === 'python' ? 'Python REST AI' : 'Browser WASM'}`);
        });
    }

    if (cooldownSlider) {
        cooldownSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (cooldownValDisplay) cooldownValDisplay.textContent = `${val}ms`;
            if (gestureEngine) gestureEngine.setCooldown(val);
        });
    }

    if (spotlightSlider) {
        spotlightSlider.addEventListener('input', (e) => {
            spotlightRadius = parseInt(e.target.value);
            if (spotlightRadiusDisplay) spotlightRadiusDisplay.textContent = `${spotlightRadius}px`;
            if (isSpotlightActive) updateSpotlightMask(50, 50);
        });
    }

    // Reaction particles
    const reactionBtns = document.querySelectorAll('.reaction-btn');
    reactionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.getAttribute('data-emoji') || '🔥';
            spawnFloatingParticles(emoji, 6);
            soundFx.playPop();
        });
    });

    function spawnFloatingParticles(emoji, count = 5) {
        const pCont = document.getElementById('particlesContainer');
        if (!pCont) return;
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'floating-particle';
            p.textContent = emoji;
            p.style.left = `${15 + Math.random() * 70}%`;
            p.style.bottom = `${5 + Math.random() * 15}%`;
            pCont.appendChild(p);
            setTimeout(() => p.remove(), 2200);
        }
    }

    function showActionToast(msg) {
        if (!actionToast || !toastMsg) return;
        toastMsg.textContent = msg;
        actionToast.style.display = 'block';
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            if (actionToast) actionToast.style.display = 'none';
        }, 1100);
    }

    // Sound toggle
    if (soundFxBtn) {
        soundFxBtn.addEventListener('click', () => {
            soundFx.enabled = !soundFx.enabled;
            if (soundFxText) soundFxText.textContent = soundFx.enabled ? '🔊' : '🔇';
        });
    }

    // Fullscreen
    if (fullscreenBtn && viewportContainer) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                if (viewportContainer.requestFullscreen) viewportContainer.requestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });
    }

    // ── 12. Presentation File Upload (PDF & PPTX) ──
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }

    if (dropzone) {
        dropzone.addEventListener('click', (e) => {
            if (e.target !== fileInput && !e.target.classList.contains('btn-browse')) {
                if (fileInput) fileInput.click();
            }
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--v-bright)';
            dropzone.style.background = 'rgba(139, 92, 246, 0.12)';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = '';
            dropzone.style.background = '';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '';
            dropzone.style.background = '';
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });
    }

    async function handleFileUpload(file) {
        if (!file) return;
        const validExtensions = ['.pdf', '.pptx', '.ppt'];
        const fileName = file.name.toLowerCase();
        const isValid = validExtensions.some(ext => fileName.endsWith(ext));

        if (!isValid) {
            alert('Please upload a valid PowerPoint (.pptx) or PDF (.pdf) file.');
            return;
        }

        if (uploadStatus) uploadStatus.style.display = 'flex';
        if (uploadStatusText) uploadStatusText.textContent = `Processing "${file.name}" into vector slides & notes… Please wait.`;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.status === 'success' && data.presentation) {
                presentationState = data.presentation;
                setStudioMode('deck');
                renderPresentation();
                if (uploadModal) uploadModal.style.display = 'none';
                soundFx.playCelebration();
                showActionToast(`📄 Loaded ${data.presentation.total_slides} Slides!`);
            } else {
                if (uploadStatusText) uploadStatusText.textContent = `❌ ${data.message || 'Upload failed.'}`;
            }
        } catch (err) {
            console.error('File upload error:', err);
            if (uploadStatusText) uploadStatusText.textContent = `❌ Connection error: ${err.message}`;
        } finally {
            if (fileInput) fileInput.value = '';
            setTimeout(() => {
                if (uploadStatus && uploadModal && uploadModal.style.display === 'none') {
                    uploadStatus.style.display = 'none';
                }
            }, 3500);
        }
    }

    // Keyboard Shortcuts for Rapid Control
    document.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.key === '1') setStudioMode('whiteboard');
        else if (e.key === '2') setStudioMode('deck');
        else if (e.key === '3') { setStudioMode('model3d'); initThreeJS(); }
        else if (e.key === 'ArrowRight' || e.key === ' ') {
            if (activeMode === 'deck') navigateSlide('next');
        } else if (e.key === 'ArrowLeft') {
            if (activeMode === 'deck') navigateSlide('prev');
        } else if (e.key === 'f' || e.key === 'F') {
            if (fullscreenBtn) fullscreenBtn.click();
        } else if (e.key === 'c' || e.key === 'C') {
            handleClearAllCanvas();
        } else if (e.key === 'l' || e.key === 'L') {
            const btn = document.getElementById('toolLaserBtn');
            if (btn) btn.click();
        } else if (e.key === 'e' || e.key === 'E') {
            const btn = document.getElementById('toolEraserBtn');
            if (btn) btn.click();
        } else if (e.key === 'p' || e.key === 'P') {
            const btn = document.getElementById('toolPenBtn');
            if (btn) btn.click();
        }
    });
});
