/**
 * MediaPipe Spatial Hand Gesture Recognition Engine for AeroSense AI Studio
 * Pure Geometric Computer Vision & Kinematics (NO Transformers / NO LLMs)
 * 
 * Gestures:
 * 1. ☝ Index Pointing / 👌 Pinch -> Air Pen (Smooth Drawing / Tool Active)
 * 2. ✊ Closed Fist -> Air Eraser (Real-Time Scrub) + Auto-Clear on Hold
 * 3. 🖐 Open Palm -> Neutral Hover / 3D Orbit Manipulator (NO Drawing)
 * 4. ✌️ Victory V-Sign -> AI Shape Snapping & Celebration Blast 🎉
 * 5. 👉 / 👈 Horizontal Pointing & Swipe -> Slide Navigation (Next / Prev Slide)
 * 6. 👍 Thumbs Up -> Audience Reaction Emoji
 * 7. 👐 Two Hands -> Distance Spatial Zoom
 */

class GestureEngine {
    constructor(config = {}) {
        this.videoElement = config.videoElement;
        this.canvasElement = config.canvasElement;
        this.canvasCtx = this.canvasElement ? this.canvasElement.getContext('2d') : null;
        
        // Callbacks
        this.onGestureDetected = config.onGestureDetected || (() => {});
        this.onLaserMove = config.onLaserMove || (() => {});
        this.onDrawMove = config.onDrawMove || (() => {});
        this.onEraserMove = config.onEraserMove || (() => {});
        this.onSpatialRotate = config.onSpatialRotate || (() => {});
        this.onSpotlightMove = config.onSpotlightMove || (() => {});
        this.onTwoHandZoom = config.onTwoHandZoom || (() => {});
        this.onCanvasClear = config.onCanvasClear || (() => {});

        // Settings
        this.cooldownMs = config.cooldownMs || 600;
        this.lastGestureTime = 0;
        this.isTracking = false;
        this.currentGesture = 'NONE';
        this.engineMode = 'browser';
        this.activeTool = 'pen'; // 'pen', 'shape', 'laser', 'eraser', 'spotlight'
        this.activeMode = 'whiteboard'; // 'whiteboard', 'deck', 'model3d'

        // Smooth coordinates (Adaptive low-pass smoothing)
        this.smoothDrawPos = null;
        this.smoothLaserPos = null;
        this.smoothEraserPos = null;
        this.smoothPalmPos = null;

        // Auto-Clear Fist timer
        this.fistStartTime = 0;
        this.fistCleared = false;

        // Slide vs Laser Mutual Exclusion Timers
        this.laserMuteUntil = 0;
        this.laserConsecutiveFrames = 0;

        // 21-Joint Landmark Temporal Stabilizer (Eliminates skeleton twitch & mapping movement)
        this.smoothedLandmarks = null;
        this.smoothedSecondaryLandmarks = null;
        this.stableGesture = 'NONE';
        this.gestureVoteHistory = [];

        // Motion history for swipe
        this.motionHistory = [];
        this.maxHistorySize = 12;
        this.prevHandDistance = null;

        this.hands = null;
        this.camera = null;
        this.stream = null;
        this.animFrameId = null;
        this.isVirtualMode = false;
        this.virtualPose = 'PALM';
        this.virtualPos = { x: 0.5, y: 0.5 };
    }

    setCooldown(ms) {
        this.cooldownMs = Math.max(200, ms);
    }

    setActiveTool(tool) {
        this.activeTool = tool || 'pen';
    }

    setActiveMode(mode) {
        this.activeMode = mode || 'whiteboard';
    }

    setEngineMode(mode) {
        this.engineMode = (mode === 'python') ? 'python' : 'browser';
    }

    generateVirtualLandmarks(normX = 0.5, normY = 0.5, pose = 'PALM') {
        const lm = [];
        for (let i = 0; i < 21; i++) lm.push({ x: normX, y: normY, z: 0.0 });

        const x = Math.max(0.15, Math.min(0.85, normX));
        const y = Math.max(0.15, Math.min(0.85, normY));

        lm[0] = { x: x, y: Math.min(0.95, y + 0.28), z: 0.0 }; // Wrist
        
        // MCP Base joints
        lm[1] = { x: x - 0.06, y: y + 0.20, z: 0.0 };
        lm[2] = { x: x - 0.10, y: y + 0.14, z: 0.0 };
        lm[3] = { x: x - 0.12, y: y + 0.08, z: 0.0 };

        lm[5] = { x: x - 0.04, y: y + 0.08, z: 0.0 }; // Index MCP
        lm[9] = { x: x, y: y + 0.06, z: 0.0 };        // Middle MCP
        lm[13] = { x: x + 0.04, y: y + 0.08, z: 0.0 };// Ring MCP
        lm[17] = { x: x + 0.08, y: y + 0.12, z: 0.0 };// Pinky MCP

        if (pose === 'DRAW') {
            // Pinch pose: Index open, Thumb TOUCHING index tip
            lm[8] = { x: x, y: y - 0.10, z: 0.0 };        // Index tip
            lm[7] = { x: x - 0.01, y: y - 0.04, z: 0.0 }; // Index dip
            lm[6] = { x: x - 0.02, y: y + 0.02, z: 0.0 }; // Index pip

            lm[4] = { x: x - 0.005, y: y - 0.095, z: 0.0 }; // Thumb tip pinch TOUCHING index

            // Middle, Ring, Pinky folded
            lm[10] = { x: x, y: y + 0.11, z: 0.0 };
            lm[11] = { x: x, y: y + 0.14, z: 0.0 };
            lm[12] = { x: x, y: y + 0.17, z: 0.0 };

            lm[14] = { x: x + 0.04, y: y + 0.12, z: 0.0 };
            lm[15] = { x: x + 0.04, y: y + 0.15, z: 0.0 };
            lm[16] = { x: x + 0.04, y: y + 0.17, z: 0.0 };

            lm[18] = { x: x + 0.08, y: y + 0.14, z: 0.0 };
            lm[19] = { x: x + 0.08, y: y + 0.16, z: 0.0 };
            lm[20] = { x: x + 0.08, y: y + 0.18, z: 0.0 };
        } else if (pose === 'LASER') {
            // Index pointing up ALONE, Thumb folded down away
            lm[8] = { x: x, y: y - 0.12, z: 0.0 };
            lm[7] = { x: x - 0.01, y: y - 0.04, z: 0.0 };
            lm[6] = { x: x - 0.02, y: y + 0.02, z: 0.0 };

            lm[4] = { x: x - 0.08, y: y + 0.06, z: 0.0 };

            // Middle, Ring, Pinky folded
            lm[10] = { x: x, y: y + 0.11, z: 0.0 };
            lm[11] = { x: x, y: y + 0.14, z: 0.0 };
            lm[12] = { x: x, y: y + 0.17, z: 0.0 };

            lm[14] = { x: x + 0.04, y: y + 0.12, z: 0.0 };
            lm[15] = { x: x + 0.04, y: y + 0.15, z: 0.0 };
            lm[16] = { x: x + 0.04, y: y + 0.17, z: 0.0 };

            lm[18] = { x: x + 0.08, y: y + 0.14, z: 0.0 };
            lm[19] = { x: x + 0.08, y: y + 0.16, z: 0.0 };
            lm[20] = { x: x + 0.08, y: y + 0.18, z: 0.0 };
        } else if (pose === 'FIST') {
            // All fingers folded into palm
            lm[4] = { x: x - 0.02, y: y + 0.11, z: 0.0 };
            
            lm[6] = { x: x - 0.04, y: y + 0.11, z: 0.0 };
            lm[7] = { x: x - 0.04, y: y + 0.13, z: 0.0 };
            lm[8] = { x: x - 0.04, y: y + 0.15, z: 0.0 };

            lm[10] = { x: x, y: y + 0.10, z: 0.0 };
            lm[11] = { x: x, y: y + 0.12, z: 0.0 };
            lm[12] = { x: x, y: y + 0.15, z: 0.0 };

            lm[14] = { x: x + 0.04, y: y + 0.11, z: 0.0 };
            lm[15] = { x: x + 0.04, y: y + 0.13, z: 0.0 };
            lm[16] = { x: x + 0.04, y: y + 0.15, z: 0.0 };

            lm[18] = { x: x + 0.08, y: y + 0.13, z: 0.0 };
            lm[19] = { x: x + 0.08, y: y + 0.15, z: 0.0 };
            lm[20] = { x: x + 0.08, y: y + 0.17, z: 0.0 };
        } else if (pose === 'VICTORY') {
            // Index & Middle open
            lm[6] = { x: x - 0.04, y: y + 0.02, z: 0.0 };
            lm[7] = { x: x - 0.06, y: y - 0.06, z: 0.0 };
            lm[8] = { x: x - 0.08, y: y - 0.14, z: 0.0 };

            lm[10] = { x: x + 0.02, y: y + 0.01, z: 0.0 };
            lm[11] = { x: x + 0.05, y: y - 0.06, z: 0.0 };
            lm[12] = { x: x + 0.07, y: y - 0.14, z: 0.0 };

            lm[4] = { x: x - 0.02, y: y + 0.11, z: 0.0 };
            lm[16] = { x: x + 0.04, y: y + 0.15, z: 0.0 };
            lm[20] = { x: x + 0.08, y: y + 0.17, z: 0.0 };
        } else {
            // Open Palm (🖐)
            lm[4] = { x: x - 0.14, y: y + 0.02, z: 0.0 };

            lm[6] = { x: x - 0.05, y: y + 0.01, z: 0.0 };
            lm[7] = { x: x - 0.06, y: y - 0.07, z: 0.0 };
            lm[8] = { x: x - 0.07, y: y - 0.15, z: 0.0 };

            lm[10] = { x: x, y: y - 0.01, z: 0.0 };
            lm[11] = { x: x, y: y - 0.09, z: 0.0 };
            lm[12] = { x: x, y: y - 0.18, z: 0.0 };

            lm[14] = { x: x + 0.05, y: y + 0.01, z: 0.0 };
            lm[15] = { x: x + 0.06, y: y - 0.07, z: 0.0 };
            lm[16] = { x: x + 0.07, y: y - 0.15, z: 0.0 };

            lm[18] = { x: x + 0.09, y: y + 0.04, z: 0.0 };
            lm[19] = { x: x + 0.11, y: y - 0.03, z: 0.0 };
            lm[20] = { x: x + 0.12, y: y - 0.11, z: 0.0 };
        }

        return lm;
    }

    startVirtualMode() {
        this.isVirtualMode = true;
        this.isTracking = true;
        this.syncCanvasDimensions();

        const renderVirtualLoop = () => {
            if (!this.isVirtualMode || !this.isTracking) return;
            const lm = this.generateVirtualLandmarks(this.virtualPos.x, this.virtualPos.y, this.virtualPose);
            this.processResults({ multiHandLandmarks: [lm] });
            this.animFrameId = requestAnimationFrame(renderVirtualLoop);
        };

        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        this.animFrameId = requestAnimationFrame(renderVirtualLoop);
    }

    setVirtualHandPose(pose, x = null, y = null) {
        this.virtualPose = pose;
        if (x !== null && y !== null) {
            this.virtualPos = { x, y };
        }
    }

    async init() {
        this.syncCanvasDimensions();

        // Wait for window.Hands if scripts are loading
        let attempts = 0;
        while (!window.Hands && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (window.Hands && !this.hands) {
            try {
                this.hands = new window.Hands({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
                });

                this.hands.setOptions({
                    maxNumHands: 2,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.50,
                    minTrackingConfidence: 0.50
                });

                this.hands.onResults((results) => this.processResults(results));
                console.log("MediaPipe Hands initialized successfully.");
            } catch (err) {
                console.error("Error initializing MediaPipe Hands:", err);
            }
        }
        return true;
    }

    syncCanvasDimensions() {
        if (this.canvasElement && this.videoElement) {
            const w = this.videoElement.videoWidth || 640;
            const h = this.videoElement.videoHeight || 480;
            if (this.canvasElement.width !== w || this.canvasElement.height !== h) {
                this.canvasElement.width = w;
                this.canvasElement.height = h;
            }
        }
    }

    async start() {
        if (!this.hands) await this.init();
        this.isTracking = true;
        this.motionHistory = [];
        this.prevHandDistance = null;
        this.fistStartTime = 0;
        this.fistCleared = false;

        try {
            // Direct getUserMedia stream for reliable cross-browser performance
            let mediaStream = null;
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
                    audio: false
                });
            } catch (strictErr) {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
            }

            this.stream = mediaStream;
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();

            this.syncCanvasDimensions();

            let isProcessing = false;
            const processVideoFrame = async () => {
                if (!this.isTracking) return;
                this.syncCanvasDimensions();
                if (this.hands && this.videoElement.readyState >= 2 && !isProcessing) {
                    isProcessing = true;
                    try {
                        await this.hands.send({ image: this.videoElement });
                    } catch (e) {}
                    isProcessing = false;
                }
                if (this.isTracking) {
                    this.animFrameId = requestAnimationFrame(processVideoFrame);
                }
            };

            this.animFrameId = requestAnimationFrame(processVideoFrame);
            return true;
        } catch (err) {
            console.error("Camera start failed:", err);
            this.isTracking = false;
            return false;
        }
    }

    stop() {
        this.isTracking = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        if (this.camera) {
            try { this.camera.stop(); } catch (e) {}
            this.camera = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                try { track.stop(); } catch (e) {}
            });
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        if (this.canvasCtx && this.canvasElement) {
            this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }
        this.smoothDrawPos = null;
        this.smoothLaserPos = null;
        this.smoothEraserPos = null;
        this.smoothPalmPos = null;
        this.fistStartTime = 0;
        this.fistCleared = false;
    }

    // Temporal low-pass filter across all 21 hand joints to lock skeleton in place
    smoothLandmarkSet(rawLandmarks, prevSmooth) {
        if (!rawLandmarks || rawLandmarks.length < 21) return rawLandmarks;
        if (!prevSmooth || prevSmooth.length !== 21) {
            return rawLandmarks.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
        }

        const out = [];
        for (let i = 0; i < 21; i++) {
            const raw = rawLandmarks[i];
            const prev = prevSmooth[i];
            const dist = Math.hypot(raw.x - prev.x, raw.y - prev.y);
            
            // Adaptive smoothing: heavy smoothing when hand is still (alpha 0.20) to kill 100% jitter; responsive when hand moves (alpha 0.60)
            const alpha = dist > 0.04 ? 0.60 : (dist < 0.003 ? 0.08 : 0.22);
            
            out.push({
                x: prev.x + (raw.x - prev.x) * alpha,
                y: prev.y + (raw.y - prev.y) * alpha,
                z: (prev.z || 0) + ((raw.z || 0) - (prev.z || 0)) * alpha
            });
        }
        return out;
    }

    processResults(results) {
        if (!this.canvasCtx || !this.canvasElement) return;

        const ctx = this.canvasCtx;
        const w = this.canvasElement.width;
        const h = this.canvasElement.height;

        ctx.save();
        ctx.clearRect(0, 0, w, h);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            // Apply 21-joint temporal stabilization to lock skeleton lines
            this.smoothedLandmarks = this.smoothLandmarkSet(results.multiHandLandmarks[0], this.smoothedLandmarks);
            
            // Render rock-solid smoothed skeleton on camera feed
            this.drawHandSkeleton(this.smoothedLandmarks, ctx, w, h);

            if (results.multiHandLandmarks.length >= 2) {
                this.smoothedSecondaryLandmarks = this.smoothLandmarkSet(results.multiHandLandmarks[1], this.smoothedSecondaryLandmarks);
                this.drawHandSkeleton(this.smoothedSecondaryLandmarks, ctx, w, h);
                this.processTwoHandZoom(this.smoothedLandmarks, this.smoothedSecondaryLandmarks);
            } else {
                this.smoothedSecondaryLandmarks = null;
                this.prevHandDistance = null;
            }

            if (this.engineMode === 'python') {
                this.classifyWithPythonEngine(this.smoothedLandmarks);
            } else {
                this.classifyGesture(this.smoothedLandmarks);
            }
        } else {
            this.smoothedLandmarks = null;
            this.smoothedSecondaryLandmarks = null;
            this.smoothDrawPos = null;
            this.smoothLaserPos = null;
            this.smoothEraserPos = null;
            this.smoothPalmPos = null;
            this.fistStartTime = 0;
            this.fistCleared = false;
            this.onGestureDetected({ gesture: 'NONE', label: 'Looking for hand…', icon: '🖐', confidence: 0 });
            this.onLaserMove({ active: false });
            this.onDrawMove({ active: false });
            this.onEraserMove({ active: false });
            this.onSpotlightMove({ active: false });
            this.onSpatialRotate({ active: false });
        }

        ctx.restore();
    }

    // Direct robust hand skeleton renderer (Bold High-Visibility Cyber Lines)
    drawHandSkeleton(landmarks, ctx, w, h) {
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],       // Index
            [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
            [9, 13], [13, 14], [14, 15], [15, 16],// Ring
            [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
            [0, 17]                               // Palm Base
        ];

        // Draw bold glowing bone lines
        ctx.save();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;

        for (const [startIdx, endIdx] of connections) {
            const p1 = landmarks[startIdx];
            const p2 = landmarks[endIdx];
            if (p1 && p2) {
                ctx.beginPath();
                ctx.moveTo(p1.x * w, p1.y * h);
                ctx.lineTo(p2.x * w, p2.y * h);
                ctx.stroke();
            }
        }
        ctx.restore();

        // Draw bold joint nodes
        for (let i = 0; i < landmarks.length; i++) {
            const p = landmarks[i];
            const isTip = (i === 4 || i === 8 || i === 12 || i === 16 || i === 20);
            ctx.beginPath();
            ctx.arc(p.x * w, p.y * h, isTip ? 7.0 : 4.5, 0, Math.PI * 2);
            ctx.fillStyle = isTip ? '#ff0033' : '#00f0ff';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8;
            ctx.stroke();
        }
    }

    dist(p1, p2) {
        const dx = (p1.x || 0) - (p2.x || 0);
        const dy = (p1.y || 0) - (p2.y || 0);
        const dz = (p1.z || 0) - (p2.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    isFingerOpen(landmarks, tipIdx, pipIdx, mcpIdx) {
        const wrist = landmarks[0];
        const tip = landmarks[tipIdx];
        const pip = landmarks[pipIdx];
        const mcp = landmarks[mcpIdx];

        const distTipWrist = this.dist(tip, wrist);
        const distPipWrist = this.dist(pip, wrist);
        const distTipMcp = this.dist(tip, mcp);
        const distPipMcp = this.dist(pip, mcp);

        return (distTipWrist > distPipWrist * 1.08 && distTipMcp > distPipMcp * 1.10);
    }

    emitStableGesture(gestureObj) {
        this.gestureVoteHistory.push(gestureObj.gesture);
        if (this.gestureVoteHistory.length > 5) {
            this.gestureVoteHistory.shift();
        }

        // Count votes in the sliding window
        const counts = {};
        for (const g of this.gestureVoteHistory) {
            counts[g] = (counts[g] || 0) + 1;
        }

        let winner = this.stableGesture;
        for (const [g, count] of Object.entries(counts)) {
            if (count >= 3) {
                winner = g;
                break;
            }
        }

        this.stableGesture = winner;
        this.onGestureDetected({
            gesture: this.stableGesture,
            label: gestureObj.label,
            icon: gestureObj.icon,
            confidence: gestureObj.confidence
        });
    }

    processTwoHandZoom(hand1, hand2) {
        const center1 = {
            x: (hand1[0].x + hand1[5].x + hand1[17].x) / 3,
            y: (hand1[0].y + hand1[5].y + hand1[17].y) / 3
        };
        const center2 = {
            x: (hand2[0].x + hand2[5].x + hand2[17].x) / 3,
            y: (hand2[0].y + hand2[5].y + hand2[17].y) / 3
        };

        const currentDist = Math.hypot(center1.x - center2.x, center1.y - center2.y);

        if (this.prevHandDistance !== null) {
            const delta = currentDist - this.prevHandDistance;
            if (Math.abs(delta) > 0.008) {
                this.onTwoHandZoom({
                    distance: currentDist,
                    delta: delta,
                    zoomFactor: delta * 8.0
                });
            }
        }
        this.prevHandDistance = currentDist;
    }

    async classifyWithPythonEngine(landmarks) {
        try {
            const res = await fetch('/api/process_frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ landmarks: landmarks })
            });
            const data = await res.json();
            if (data.status === 'success' && data.result) {
                const r = data.result;
                this.onGestureDetected({
                    gesture: r.gesture,
                    label: `[Python AI] ${r.label}`,
                    icon: r.icon,
                    confidence: r.confidence,
                    triggered: r.triggered
                });

                if (r.gesture === 'DRAW' && r.position) {
                    this.onDrawMove({ active: true, x: r.position.x, y: r.position.y });
                    this.onLaserMove({ active: false });
                    this.onEraserMove({ active: false });
                } else if (r.gesture === 'FIST') {
                    if (r.position) {
                        this.onEraserMove({ active: true, x: r.position.x, y: r.position.y });
                    }
                    this.onDrawMove({ active: false });
                    this.onLaserMove({ active: false });
                } else if (r.gesture === 'LASER' && r.position) {
                    this.onLaserMove({ active: true, x: r.position.x, y: r.position.y });
                    this.onDrawMove({ active: false });
                    this.onEraserMove({ active: false });
                } else if (r.gesture === 'PALM' && r.position) {
                    this.onSpatialRotate({ active: true, x: r.position.x, y: r.position.y });
                    this.onDrawMove({ active: false });
                    this.onLaserMove({ active: false });
                    this.onEraserMove({ active: false });
                }
            }
        } catch (err) {
            this.classifyGesture(landmarks);
        }
    }

    classifyGesture(landmarks) {
        const now = Date.now();
        
        const wrist = landmarks[0];
        const thumbTip = landmarks[4];
        const indexMcp = landmarks[5];
        const indexPip = landmarks[6];
        const indexTip = landmarks[8];
        const middleMcp = landmarks[9];
        const middlePip = landmarks[10];
        const middleTip = landmarks[12];
        const ringMcp = landmarks[13];
        const ringPip = landmarks[14];
        const ringTip = landmarks[16];
        const pinkyMcp = landmarks[17];
        const pinkyPip = landmarks[18];
        const pinkyTip = landmarks[20];

        // Palm Center
        const palmCenter = {
            x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
            y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3
        };

        this.motionHistory.push({ x: palmCenter.x, y: palmCenter.y, time: now });
        if (this.motionHistory.length > this.maxHistorySize) {
            this.motionHistory.shift();
        }

        // Scale-invariant hand normalization (wrist to middle MCP base)
        const handScale = Math.max(0.10, this.dist(wrist, middleMcp));
        const normPinchDist = this.dist(thumbTip, indexTip) / handScale;

        // Individual finger extension (Scale-invariant Euclidean kinematics)
        const isIndexOpen = this.isFingerOpen(landmarks, 8, 6, 5);
        const isMiddleOpen = this.isFingerOpen(landmarks, 12, 10, 9);
        const isRingOpen = this.isFingerOpen(landmarks, 16, 14, 13);
        const isPinkyOpen = this.isFingerOpen(landmarks, 20, 18, 17);

        const openFingerCount = [isIndexOpen, isMiddleOpen, isRingOpen, isPinkyOpen].filter(Boolean).length;
        const canTriggerAction = (now - this.lastGestureTime >= this.cooldownMs);

        let currentVelocityX = 0;
        if (this.motionHistory.length >= 2) {
            const last = this.motionHistory[this.motionHistory.length - 1];
            const prev = this.motionHistory[this.motionHistory.length - 2];
            const dt = (last.time - prev.time) / 1000;
            if (dt > 0.01) {
                currentVelocityX = (last.x - prev.x) / dt;
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // PRIORITY 1: 3D SPATIAL MODEL INSPECTOR MODE (Mode 3 - Pure 3D Hologram)
        // ═══════════════════════════════════════════════════════════════════════════
        if (this.activeMode === 'model3d') {
            this.smoothDrawPos = null;
            this.smoothLaserPos = null;
            this.smoothEraserPos = null;
            this.onDrawMove({ active: false });
            this.onLaserMove({ active: false });
            this.onEraserMove({ active: false });
            this.onSpotlightMove({ active: false });

            const rawX = 1 - palmCenter.x;
            const rawY = palmCenter.y;

            if (!this.smoothPalmPos) {
                this.smoothPalmPos = { x: rawX, y: rawY };
            } else {
                this.smoothPalmPos.x = this.smoothPalmPos.x * 0.18 + rawX * 0.82;
                this.smoothPalmPos.y = this.smoothPalmPos.y * 0.18 + rawY * 0.82;
            }

            this.onSpatialRotate({ active: true, x: this.smoothPalmPos.x, y: this.smoothPalmPos.y });
            this.onGestureDetected({
                gesture: 'PALM',
                label: '3D Hologram Spatial Orbit 🌐',
                icon: '🌐',
                confidence: 0.99
            });
            return;
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // PRIORITY 2: SLIDE NAVIGATION IN PRESENTATION DECK MODE (Mode 2)
        // ═══════════════════════════════════════════════════════════════════════════
        if (this.activeMode === 'deck') {
            // A. Check rapid hand motion swipe across webcam
            if (this.motionHistory.length >= 4) {
                const firstPos = this.motionHistory[0];
                const lastPos = this.motionHistory[this.motionHistory.length - 1];
                const deltaX = lastPos.x - firstPos.x;
                const deltaTime = lastPos.time - firstPos.time;

                if (deltaTime >= 60 && deltaTime <= 420 && Math.abs(deltaX) > 0.08) {
                    const velocityX = deltaX / (deltaTime / 1000);
                    if (velocityX < -0.38 && canTriggerAction) {
                        this.laserMuteUntil = now + 650;
                        this.laserConsecutiveFrames = 0;
                        this.onLaserMove({ active: false });
                        this.onDrawMove({ active: false });
                        this.smoothLaserPos = null;
                        this.triggerGesture('NEXT_SLIDE', 'Next Slide (Swipe Right 👉)', '👉', 0.98);
                        return;
                    } else if (velocityX > 0.38 && canTriggerAction) {
                        this.laserMuteUntil = now + 650;
                        this.laserConsecutiveFrames = 0;
                        this.onLaserMove({ active: false });
                        this.onDrawMove({ active: false });
                        this.smoothLaserPos = null;
                        this.triggerGesture('PREV_SLIDE', 'Previous Slide (Swipe Left 👈)', '👈', 0.98);
                        return;
                    }
                }
            }

            // B. Check intentional horizontal finger pointing (tilted > 45° sideways)
            if (isIndexOpen && normPinchDist > 0.35) {
                const indexVecX = indexTip.x - indexMcp.x;
                const indexVecY = indexTip.y - indexMcp.y;

                if (Math.abs(indexVecX) > Math.abs(indexVecY) * 1.2) {
                    if (indexVecX < -0.10 && canTriggerAction) {
                        this.laserMuteUntil = now + 650;
                        this.laserConsecutiveFrames = 0;
                        this.onLaserMove({ active: false });
                        this.onDrawMove({ active: false });
                        this.smoothLaserPos = null;
                        this.triggerGesture('NEXT_SLIDE', 'Next Slide (Point Right 👉)', '👉', 0.96);
                        return;
                    } else if (indexVecX > 0.10 && canTriggerAction) {
                        this.laserMuteUntil = now + 650;
                        this.laserConsecutiveFrames = 0;
                        this.onLaserMove({ active: false });
                        this.onDrawMove({ active: false });
                        this.smoothLaserPos = null;
                        this.triggerGesture('PREV_SLIDE', 'Previous Slide (Point Left 👈)', '👈', 0.96);
                        return;
                    }
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // PRIORITY 3: TOOL-SPECIFIC OVERRIDES (When user explicitly chooses a tool)
        // ═══════════════════════════════════════════════════════════════════════════

        // ── A. ERASER TOOL ACTIVE ──
        if (this.activeTool === 'eraser') {
            this.smoothDrawPos = null;
            this.smoothLaserPos = null;
            this.onDrawMove({ active: false });
            this.onLaserMove({ active: false });
            this.onSpotlightMove({ active: false });

            const activePt = (openFingerCount === 0) ? palmCenter : (normPinchDist < 0.42 ? { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 } : (isIndexOpen ? indexTip : palmCenter));
            const rawEraserX = 1 - activePt.x;
            const rawEraserY = activePt.y;

            if (!this.smoothEraserPos) {
                this.smoothEraserPos = { x: rawEraserX, y: rawEraserY };
            } else {
                this.smoothEraserPos.x = this.smoothEraserPos.x * 0.20 + rawEraserX * 0.80;
                this.smoothEraserPos.y = this.smoothEraserPos.y * 0.20 + rawEraserY * 0.80;
            }

            this.onEraserMove({ active: true, x: this.smoothEraserPos.x, y: this.smoothEraserPos.y });

            if (openFingerCount === 0) {
                if (this.fistStartTime === 0) {
                    this.fistStartTime = now;
                } else if (now - this.fistStartTime > 350 && !this.fistCleared) {
                    this.fistCleared = true;
                    this.triggerGesture('CLEAR_CANVAS', '✨ Cleared Canvas Notes!', '🧹', 0.99);
                    this.onCanvasClear();
                }
                this.onGestureDetected({
                    gesture: 'ERASER',
                    label: this.fistCleared ? '✨ Canvas Cleared! (Fist ✊)' : 'Air Eraser (Fist ✊)',
                    icon: '🧹',
                    confidence: 0.99
                });
            } else {
                this.fistStartTime = 0;
                this.fistCleared = false;
                this.onGestureDetected({
                    gesture: 'ERASER',
                    label: 'Air Eraser Scrubbing 🧹',
                    icon: '🧹',
                    confidence: 0.98
                });
            }
            return;
        }

        // ── B. LASER TOOL ACTIVE ──
        if (this.activeTool === 'laser') {
            this.smoothDrawPos = null;
            this.smoothEraserPos = null;
            this.onDrawMove({ active: false });
            this.onEraserMove({ active: false });
            this.onSpotlightMove({ active: false });

            if (openFingerCount === 0) {
                if (this.fistStartTime === 0) {
                    this.fistStartTime = now;
                } else if (now - this.fistStartTime > 350 && !this.fistCleared) {
                    this.fistCleared = true;
                    this.triggerGesture('CLEAR_CANVAS', '✨ Cleared Canvas Notes!', '🧹', 0.99);
                    this.onCanvasClear();
                    return;
                }
            } else {
                this.fistStartTime = 0;
                this.fistCleared = false;
            }

            const targetPt = isIndexOpen ? indexTip : (normPinchDist < 0.42 ? { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 } : indexMcp);
            const rawLaserX = 1 - targetPt.x;
            const rawLaserY = targetPt.y;

            if (!this.smoothLaserPos) {
                this.smoothLaserPos = { x: rawLaserX, y: rawLaserY };
            } else {
                const dx = rawLaserX - this.smoothLaserPos.x;
                const dy = rawLaserY - this.smoothLaserPos.y;
                const dist = Math.hypot(dx, dy);
                // Adaptive one-euro style filter: heavy smoothing for micro-jitter, responsive for large sweeps
                const alpha = dist > 0.06 ? 0.42 : (dist < 0.004 ? 0.04 : 0.20);
                this.smoothLaserPos.x += dx * alpha;
                this.smoothLaserPos.y += dy * alpha;
            }

            this.onLaserMove({ active: true, x: this.smoothLaserPos.x, y: this.smoothLaserPos.y });
            this.onGestureDetected({
                gesture: 'LASER',
                label: 'Red Laser Pointer (Index ☝)',
                icon: '🔴',
                confidence: 0.99
            });
            return;
        }

        // ── C. SPOTLIGHT TOOL ACTIVE ──
        if (this.activeTool === 'spotlight') {
            this.smoothDrawPos = null;
            this.smoothEraserPos = null;
            this.onDrawMove({ active: false });
            this.onEraserMove({ active: false });
            this.onLaserMove({ active: false });

            const targetPt = isIndexOpen ? indexTip : palmCenter;
            const rawSpotX = 1 - targetPt.x;
            const rawSpotY = targetPt.y;

            if (!this.smoothLaserPos) {
                this.smoothLaserPos = { x: rawSpotX, y: rawSpotY };
            } else {
                this.smoothLaserPos.x = this.smoothLaserPos.x * 0.20 + rawSpotX * 0.80;
                this.smoothLaserPos.y = this.smoothLaserPos.y * 0.20 + rawSpotY * 0.80;
            }

            this.onSpotlightMove({ active: true, x: this.smoothLaserPos.x, y: this.smoothLaserPos.y });
            this.onGestureDetected({
                gesture: 'SPOTLIGHT',
                label: 'Spotlight Focus Beam 🔦',
                icon: '🔦',
                confidence: 0.98
            });
            return;
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // PRIORITY 4: UNIVERSAL GESTURES (For Pen, Rainbow, Sparkler, Shape tools)
        // ═══════════════════════════════════════════════════════════════════════════

        // ── 1. CLOSED FIST (✊) -> REAL-TIME ERASER & AUTO-CLEAR ──
        if (openFingerCount === 0) {
            const thumbIp = landmarks[3];
            const thumbMcp = landmarks[2];
            const isStrictThumbsUp = (thumbTip.y < thumbIp.y - 0.03) && (thumbIp.y < thumbMcp.y - 0.03) && (thumbTip.y < indexMcp.y - 0.08);

            if (isStrictThumbsUp) {
                this.onLaserMove({ active: false });
                this.onDrawMove({ active: false });
                this.onEraserMove({ active: false });
                if (canTriggerAction) {
                    this.triggerGesture('THUMBS_UP', 'Audience Reaction! 🔥', '👍', 0.95);
                } else {
                    this.onGestureDetected({ gesture: 'THUMBS_UP', label: 'Audience Reaction! 👍', icon: '👍', confidence: 0.95 });
                }
                return;
            }

            this.smoothDrawPos = null;
            this.smoothLaserPos = null;
            this.onDrawMove({ active: false });
            this.onLaserMove({ active: false });
            this.onSpotlightMove({ active: false });

            const rawEraserX = 1 - palmCenter.x;
            const rawEraserY = palmCenter.y;

            if (!this.smoothEraserPos) {
                this.smoothEraserPos = { x: rawEraserX, y: rawEraserY };
            } else {
                this.smoothEraserPos.x = this.smoothEraserPos.x * 0.20 + rawEraserX * 0.80;
                this.smoothEraserPos.y = this.smoothEraserPos.y * 0.20 + rawEraserY * 0.80;
            }

            this.onEraserMove({ active: true, x: this.smoothEraserPos.x, y: this.smoothEraserPos.y });

            if (this.fistStartTime === 0) {
                this.fistStartTime = now;
            } else if (now - this.fistStartTime > 350 && !this.fistCleared) {
                this.fistCleared = true;
                this.triggerGesture('CLEAR_CANVAS', '✨ Auto-Cleared All Notes!', '🧹', 0.99);
                this.onCanvasClear();
            }

            this.emitStableGesture({
                gesture: 'FIST',
                label: this.fistCleared ? '✨ Canvas Cleared! (Fist ✊)' : 'Air Eraser (Closed Fist ✊)',
                icon: '✊',
                confidence: 0.98
            });
            return;
        } else {
            this.fistStartTime = 0;
            this.fistCleared = false;
            this.smoothEraserPos = null;
            this.onEraserMove({ active: false });
        }

        // ── 2. VICTORY V-SIGN (✌️) -> SHAPE SNAPPING & CONFETTI ──
        if (isIndexOpen && isMiddleOpen && !isRingOpen && !isPinkyOpen) {
            const tipDist = this.dist(indexTip, middleTip);
            if (tipDist > 0.030) {
                this.onLaserMove({ active: false });
                this.onSpotlightMove({ active: false });
                this.onDrawMove({ active: false });
                this.onEraserMove({ active: false });

                if (canTriggerAction) {
                    this.triggerGesture('VICTORY', 'Celebration & Shape Snap! 🎉', '✌️', 0.96);
                } else {
                    this.emitStableGesture({ gesture: 'VICTORY', label: 'Shape Snap & Confetti! ✌️', icon: '✌️', confidence: 0.96 });
                }
                return;
            }
        }

        // ── 3. PINCH AIR DRAWING (👌) -> WRITING & DRAWING ──
        if (normPinchDist < 0.38) {
            const activePoint = {
                x: (thumbTip.x + indexTip.x) / 2,
                y: (thumbTip.y + indexTip.y) / 2
            };
            const rawX = 1 - activePoint.x;
            const rawY = activePoint.y;

            if (!this.smoothDrawPos) {
                this.smoothDrawPos = { x: rawX, y: rawY };
            } else {
                this.smoothDrawPos.x = this.smoothDrawPos.x * 0.18 + rawX * 0.82;
                this.smoothDrawPos.y = this.smoothDrawPos.y * 0.18 + rawY * 0.82;
            }

            this.onDrawMove({ active: true, x: this.smoothDrawPos.x, y: this.smoothDrawPos.y });
            this.onLaserMove({ active: false });
            this.onSpotlightMove({ active: false });
            this.onEraserMove({ active: false });

            this.emitStableGesture({
                gesture: 'DRAW',
                label: (this.activeTool === 'rainbow') ? 'Rainbow Flow Pen (👌)' : (this.activeTool === 'sparkler') ? 'Star Sparkler Brush (👌)' : (this.activeTool === 'shape') ? 'Shape AI Draw (👌)' : 'Neon Air Pen (👌)',
                icon: (this.activeTool === 'rainbow') ? '🌈' : (this.activeTool === 'sparkler') ? '✨' : (this.activeTool === 'shape') ? '📐' : '✏️',
                confidence: 0.98
            });
            return;
        } else {
            this.smoothDrawPos = null;
            this.onDrawMove({ active: false });
        }

        // ── 4. INDEX POINTING (☝) -> VIRTUAL RED LASER POINTER (🔴) ──
        if (isIndexOpen && (!isRingOpen || this.dist(indexTip, wrist) > this.dist(ringTip, wrist) * 1.15)) {
            // Mutual exclusion: If during slide flip cooldown or hand is moving in a swipe wave, MUTE laser!
            if (now < this.laserMuteUntil || Math.abs(currentVelocityX) > 0.28) {
                this.laserConsecutiveFrames = 0;
                this.smoothLaserPos = null;
                this.onLaserMove({ active: false });
                return;
            }

            this.laserConsecutiveFrames++;
            if (this.laserConsecutiveFrames < 2) {
                // Brief confirmation frame to ensure deliberate pointing
                return;
            }

            const rawX = 1 - indexTip.x;
            const rawY = indexTip.y;

            if (!this.smoothLaserPos) {
                this.smoothLaserPos = { x: rawX, y: rawY };
            } else {
                const dx = rawX - this.smoothLaserPos.x;
                const dy = rawY - this.smoothLaserPos.y;
                const dist = Math.hypot(dx, dy);
                const alpha = dist > 0.06 ? 0.42 : (dist < 0.004 ? 0.04 : 0.20);
                this.smoothLaserPos.x += dx * alpha;
                this.smoothLaserPos.y += dy * alpha;
            }

            // Project Virtual Red Laser Pointer
            this.onLaserMove({ active: true, x: this.smoothLaserPos.x, y: this.smoothLaserPos.y });
            this.onDrawMove({ active: false });
            this.onSpotlightMove({ active: false });
            this.onEraserMove({ active: false });

            this.emitStableGesture({
                gesture: 'LASER',
                label: 'Red Laser Pointer (Index ☝)',
                icon: '🔴',
                confidence: 0.99
            });
            return;
        } else {
            this.laserConsecutiveFrames = 0;
            this.smoothLaserPos = null;
            this.onLaserMove({ active: false });
        }

        // ── 5. OPEN PALM (🖐) -> NEUTRAL HOVER ──
        if (openFingerCount >= 3) {
            this.onDrawMove({ active: false });
            this.onLaserMove({ active: false });
            this.onSpotlightMove({ active: false });
            this.onEraserMove({ active: false });

            this.emitStableGesture({
                gesture: 'PALM',
                label: 'Open Palm (Hover 🖐)',
                icon: '🖐',
                confidence: 0.98
            });
            return;
        } else {
            this.smoothPalmPos = null;
            this.onSpatialRotate({ active: false });
        }

        // Neutral Hand in View
        this.onLaserMove({ active: false });
        this.onDrawMove({ active: false });
        this.onEraserMove({ active: false });
        this.onSpotlightMove({ active: false });
        this.onSpatialRotate({ active: false });

        this.onGestureDetected({
            gesture: 'NEUTRAL',
            label: 'Tracking Hand...',
            icon: '🖐',
            confidence: 0.75
        });
    }

    triggerGesture(gesture, label, icon, confidence = 0.9) {
        this.lastGestureTime = Date.now();
        this.motionHistory = [];
        this.onGestureDetected({ gesture, label, icon, confidence, triggered: true });

        fetch('/api/analytics/log_gesture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gesture: gesture })
        }).catch(() => {});
    }

    // ── Virtual Spatial Hand Gesture Simulator (Click to test with zero camera) ──
    simulateGesture(gestureType) {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        this.syncCanvasDimensions();

        const baseLandmarks = () => {
            const list = [];
            for (let i = 0; i < 21; i++) list.push({ x: 0.5, y: 0.5, z: 0.0 });
            return list;
        };

        const landmarks = baseLandmarks();
        landmarks[0] = { x: 0.5, y: 0.85, z: 0.0 }; // wrist
        landmarks[5] = { x: 0.42, y: 0.60, z: 0.0 }; // index mcp
        landmarks[9] = { x: 0.50, y: 0.58, z: 0.0 }; // middle mcp
        landmarks[13] = { x: 0.58, y: 0.60, z: 0.0 }; // ring mcp
        landmarks[17] = { x: 0.66, y: 0.64, z: 0.0 }; // pinky mcp

        const finishSimulation = () => {
            if (this.animFrameId) {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }
            this.isTracking = false;
            this.isVirtualMode = false;
            this.smoothDrawPos = null;
            this.smoothLaserPos = null;
            this.smoothPalmPos = null;
            this.smoothEraserPos = null;
            this.onLaserMove({ active: false });
            this.onDrawMove({ active: false });
            this.onSpotlightMove({ active: false });
            this.onEraserMove({ active: false });
            this.onSpatialRotate({ active: false });
            if (this.canvasCtx && this.canvasElement) {
                this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            }
            this.onGestureDetected({
                gesture: 'NONE',
                label: 'Camera Off',
                icon: '📷',
                confidence: 0
            });
        };

        if (gestureType === 'DRAW' || gestureType === 'RAINBOW' || gestureType === 'SPARKLER') {
            const originalTool = this.activeTool;
            if (gestureType === 'RAINBOW') this.activeTool = 'rainbow';
            if (gestureType === 'SPARKLER') this.activeTool = 'sparkler';
            if (gestureType === 'DRAW') this.activeTool = 'pen';

            let frame = 0;
            const totalFrames = 45;
            const drawInterval = setInterval(() => {
                const t = (frame / totalFrames) * Math.PI * 2;
                const drawX = 0.5 + 0.24 * Math.sin(t);
                const drawY = 0.46 + 0.14 * Math.sin(2 * t);
                
                landmarks[8] = { x: drawX, y: drawY, z: 0.0 };
                landmarks[6] = { x: drawX + 0.02, y: drawY + 0.08, z: 0.0 };
                landmarks[4] = { x: drawX + 0.005, y: drawY + 0.005, z: 0.0 };
                landmarks[12] = { x: 0.52, y: 0.68, z: 0.0 };
                landmarks[16] = { x: 0.60, y: 0.68, z: 0.0 };
                landmarks[20] = { x: 0.68, y: 0.70, z: 0.0 };

                this.processResults({ multiHandLandmarks: [landmarks] });
                frame++;
                if (frame >= totalFrames) {
                    clearInterval(drawInterval);
                    this.activeTool = originalTool;
                    setTimeout(finishSimulation, 400);
                }
            }, 30);
        } else if (gestureType === 'FIST') {
            for (const tip of [8, 12, 16, 20]) landmarks[tip] = { x: 0.5, y: 0.68, z: 0.0 };
            for (const pip of [6, 10, 14, 18]) landmarks[pip] = { x: 0.5, y: 0.58, z: 0.0 };
            landmarks[4] = { x: 0.38, y: 0.62, z: 0.0 };
            
            this.processResults({ multiHandLandmarks: [landmarks] });
            this.triggerGesture('CLEAR_CANVAS', '✨ Vortex Cleared All Notes!', '🧹', 0.99);
            this.onCanvasClear();
            setTimeout(finishSimulation, 500);
        } else if (gestureType === 'PALM') {
            landmarks[8] = { x: 0.40, y: 0.25, z: 0.0 };
            landmarks[6] = { x: 0.41, y: 0.45, z: 0.0 };
            landmarks[12] = { x: 0.50, y: 0.20, z: 0.0 };
            landmarks[10] = { x: 0.50, y: 0.42, z: 0.0 };
            landmarks[16] = { x: 0.60, y: 0.25, z: 0.0 };
            landmarks[14] = { x: 0.59, y: 0.45, z: 0.0 };
            landmarks[20] = { x: 0.70, y: 0.35, z: 0.0 };
            landmarks[18] = { x: 0.68, y: 0.50, z: 0.0 };
            landmarks[4] = { x: 0.30, y: 0.50, z: 0.0 };

            let orbitFrame = 0;
            const orbitInt = setInterval(() => {
                const shiftX = Math.sin(orbitFrame * 0.2) * 0.2;
                landmarks[0].x = 0.5 + shiftX;
                landmarks[5].x = 0.42 + shiftX;
                this.processResults({ multiHandLandmarks: [landmarks] });
                orbitFrame++;
                if (orbitFrame > 30) {
                    clearInterval(orbitInt);
                    setTimeout(finishSimulation, 300);
                }
            }, 45);
        } else if (gestureType === 'VICTORY') {
            landmarks[8] = { x: 0.42, y: 0.25, z: 0.0 };
            landmarks[6] = { x: 0.42, y: 0.45, z: 0.0 };
            landmarks[12] = { x: 0.58, y: 0.25, z: 0.0 };
            landmarks[10] = { x: 0.54, y: 0.45, z: 0.0 };
            landmarks[16] = { x: 0.58, y: 0.68, z: 0.0 };
            landmarks[20] = { x: 0.66, y: 0.68, z: 0.0 };
            landmarks[4] = { x: 0.45, y: 0.65, z: 0.0 };

            this.processResults({ multiHandLandmarks: [landmarks] });
            setTimeout(finishSimulation, 1000);
        } else if (gestureType === 'LASER') {
            const originalTool = this.activeTool;
            this.activeTool = 'laser';
            for (const tip of [12, 16, 20]) landmarks[tip] = { x: 0.55, y: 0.68, z: 0.0 };
            landmarks[4] = { x: 0.38, y: 0.65, z: 0.0 };

            let laserFrame = 0;
            const laserInterval = setInterval(() => {
                const angle = (laserFrame / 35) * Math.PI * 2;
                const laserX = 0.5 + 0.25 * Math.cos(angle);
                const laserY = 0.45 + 0.18 * Math.sin(angle);
                
                landmarks[8] = { x: laserX, y: laserY, z: 0.0 };
                landmarks[6] = { x: laserX + 0.02, y: laserY + 0.10, z: 0.0 };

                this.processResults({ multiHandLandmarks: [landmarks] });
                laserFrame++;
                if (laserFrame >= 35) {
                    clearInterval(laserInterval);
                    this.activeTool = originalTool;
                    setTimeout(finishSimulation, 400);
                }
            }, 30);
        } else if (gestureType === 'NEXT_SLIDE') {
            landmarks[8] = { x: 0.25, y: 0.60, z: 0.0 };
            landmarks[6] = { x: 0.36, y: 0.60, z: 0.0 };
            for (const tip of [12, 16, 20]) landmarks[tip] = { x: 0.55, y: 0.68, z: 0.0 };
            landmarks[4] = { x: 0.45, y: 0.65, z: 0.0 };

            this.processResults({ multiHandLandmarks: [landmarks] });
            setTimeout(finishSimulation, 800);
        } else if (gestureType === 'PREV_SLIDE') {
            landmarks[8] = { x: 0.75, y: 0.60, z: 0.0 };
            landmarks[6] = { x: 0.64, y: 0.60, z: 0.0 };
            for (const tip of [12, 16, 20]) landmarks[tip] = { x: 0.45, y: 0.68, z: 0.0 };
            landmarks[4] = { x: 0.45, y: 0.65, z: 0.0 };

            this.processResults({ multiHandLandmarks: [landmarks] });
            setTimeout(finishSimulation, 800);
        }
    }
}

window.GestureEngine = GestureEngine;

