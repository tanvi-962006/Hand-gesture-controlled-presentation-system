"""
gesture_pipeline.py - Computer Vision & Gesture Recognition Pipeline for AeroSense AI

This module handles:
1. Mathematical calculation of Euclidean distances and joint angles from 21 hand landmarks.
2. Single-hand and Two-hand spatial gesture classification (Pinch Draw, Air Eraser, Two-hand Zoom, 3D Grab).
3. Text and speaker notes extraction from PDF and PPTX presentations.
4. Presentation session analytics and pacing metrics.

No Transformers / No LLMs - Pure Computer Vision & Geometric Math.
Author: AeroSense AI Team
"""

import math
import time
from typing import Dict, List, Any, Optional, Tuple


class HandGestureClassifier:
    """
    Classifies 21 3D hand landmarks into presentation and spatial air-canvas gestures
    using Euclidean distance ratios, fingertip angle kinematics, and confidence estimation.
    """

    WRIST = 0
    THUMB_CMC = 1
    THUMB_MCP = 2
    THUMB_IP = 3
    THUMB_TIP = 4

    INDEX_MCP = 5
    INDEX_PIP = 6
    INDEX_DIP = 7
    INDEX_TIP = 8

    MIDDLE_MCP = 9
    MIDDLE_PIP = 10
    MIDDLE_DIP = 11
    MIDDLE_TIP = 12

    RING_MCP = 13
    RING_PIP = 14
    RING_DIP = 15
    RING_TIP = 16

    PINKY_MCP = 17
    PINKY_PIP = 18
    PINKY_DIP = 19
    PINKY_TIP = 20

    @staticmethod
    def euclidean_distance(p1: Dict[str, float], p2: Dict[str, float]) -> float:
        """Calculates 2D/3D Euclidean distance: d = sqrt((x2 - x1)^2 + (y2 - y1)^2 + (z2 - z1)^2)"""
        dx = p1.get('x', 0) - p2.get('x', 0)
        dy = p1.get('y', 0) - p2.get('y', 0)
        dz = p1.get('z', 0) - p2.get('z', 0)
        return math.sqrt(dx * dx + dy * dy + dz * dz)

    @classmethod
    def is_finger_extended(cls, landmarks: List[Dict[str, float]], tip_idx: int, pip_idx: int, mcp_idx: int) -> bool:
        """Robust scale-invariant check to determine if a finger is extended."""
        wrist = landmarks[cls.WRIST]
        tip = landmarks[tip_idx]
        pip = landmarks[pip_idx]
        mcp = landmarks[mcp_idx]

        dist_tip_wrist = cls.euclidean_distance(tip, wrist)
        dist_pip_wrist = cls.euclidean_distance(pip, wrist)
        dist_mcp_wrist = cls.euclidean_distance(mcp, wrist)
        dist_tip_mcp = cls.euclidean_distance(tip, mcp)
        dist_pip_mcp = cls.euclidean_distance(pip, mcp)

        return (dist_tip_wrist > dist_pip_wrist * 1.04 and dist_tip_mcp > dist_pip_mcp * 1.08) or (dist_tip_wrist > dist_mcp_wrist * 1.25)

    @classmethod
    def classify(cls, landmarks: List[Dict[str, float]], motion_history: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Classifies 21 hand landmarks into spatial gestures with scale-invariant geometry."""
        if not landmarks or len(landmarks) < 21:
            return {
                "gesture": "NONE",
                "label": "No Hand Detected",
                "icon": "🖐",
                "confidence": 0.0,
                "triggered": False
            }

        wrist = landmarks[cls.WRIST]
        thumb_tip = landmarks[cls.THUMB_TIP]
        index_mcp = landmarks[cls.INDEX_MCP]
        index_pip = landmarks[cls.INDEX_PIP]
        index_tip = landmarks[cls.INDEX_TIP]
        middle_mcp = landmarks[cls.MIDDLE_MCP]
        middle_pip = landmarks[cls.MIDDLE_PIP]
        middle_tip = landmarks[cls.MIDDLE_TIP]
        ring_mcp = landmarks[cls.RING_MCP]
        ring_pip = landmarks[cls.RING_PIP]
        ring_tip = landmarks[cls.RING_TIP]
        pinky_mcp = landmarks[cls.PINKY_MCP]
        pinky_pip = landmarks[cls.PINKY_PIP]
        pinky_tip = landmarks[cls.PINKY_TIP]

        palm_center_x = (wrist.get('x', 0) + index_mcp.get('x', 0) + pinky_mcp.get('x', 0)) / 3.0
        palm_center_y = (wrist.get('y', 0) + index_mcp.get('y', 0) + pinky_mcp.get('y', 0)) / 3.0

        # Scale normalization relative to hand size
        hand_scale = max(0.10, cls.euclidean_distance(wrist, middle_mcp))
        norm_pinch_dist = cls.euclidean_distance(thumb_tip, index_tip) / hand_scale

        index_open = cls.is_finger_extended(landmarks, cls.INDEX_TIP, cls.INDEX_PIP, cls.INDEX_MCP)
        middle_open = cls.is_finger_extended(landmarks, cls.MIDDLE_TIP, cls.MIDDLE_PIP, cls.MIDDLE_MCP)
        ring_open = cls.is_finger_extended(landmarks, cls.RING_TIP, cls.RING_PIP, cls.RING_MCP)
        pinky_open = cls.is_finger_extended(landmarks, cls.PINKY_TIP, cls.PINKY_PIP, cls.PINKY_MCP)

        open_count = sum([1 for f in [index_open, middle_open, ring_open, pinky_open] if f])
        
        # True Thumbs-Up requires thumb pointing strictly upward against gravity,
        # with thumb tip significantly higher than IP, MCP, and index MCP joints
        thumb_ip = landmarks[cls.THUMB_IP]
        thumb_mcp = landmarks[cls.THUMB_MCP]
        is_thumbs_up = (
            (open_count == 0) and
            (thumb_tip.get('y', 0) < thumb_ip.get('y', 0) - 0.03) and
            (thumb_ip.get('y', 0) < thumb_mcp.get('y', 0) - 0.03) and
            (thumb_tip.get('y', 0) < index_mcp.get('y', 0) - 0.08)
        )

        # ── 1. CLOSED FIST (✊) -> Air Eraser / Auto Clear ──
        if open_count == 0 and not is_thumbs_up:
            return {
                "gesture": "FIST",
                "label": "Air Eraser / Auto-Clear ✊",
                "icon": "✊",
                "confidence": 0.98,
                "position": {"x": 1.0 - palm_center_x, "y": palm_center_y},
                "triggered": True
            }

        # ── 2. PINCH AIR DRAWING (👌) ──
        # Thumb touching Index Tip (Normalized pinch distance < 0.40)
        if norm_pinch_dist < 0.40:
            draw_x = (thumb_tip.get('x', 0) + index_tip.get('x', 0)) / 2.0
            draw_y = (thumb_tip.get('y', 0) + index_tip.get('y', 0)) / 2.0
            return {
                "gesture": "DRAW",
                "label": "Air Pen Drawing (Pinch 👌)",
                "icon": "✏️",
                "confidence": 0.98,
                "position": {"x": 1.0 - draw_x, "y": draw_y},
                "triggered": False
            }

        # ── 3. THUMBS UP REACTION (👍) ──
        if is_thumbs_up:
            return {
                "gesture": "THUMBS_UP",
                "label": "Audience Reaction! 🔥",
                "icon": "👍",
                "confidence": 0.95,
                "triggered": True
            }

        # ── 4. VICTORY V-SIGN (✌️) -> Confetti & Shape Snapping ──
        if index_open and middle_open and not ring_open and not pinky_open:
            dist_tips = cls.euclidean_distance(index_tip, middle_tip)
            if dist_tips > 0.035:
                return {
                    "gesture": "VICTORY",
                    "label": "Celebration & Shape Snap! 🎉",
                    "icon": "✌️",
                    "confidence": 0.96,
                    "triggered": True
                }

        # ── 5. INDEX POINTING -> Red Laser Pointer (Index ☝) ──
        if index_open and norm_pinch_dist > 0.35 and not (middle_open and ring_open and pinky_open):
            return {
                "gesture": "LASER",
                "label": "Red Laser Pointer (Index ☝)",
                "icon": "🔴",
                "confidence": 0.99,
                "position": {"x": 1.0 - index_tip.get('x', 0), "y": index_tip.get('y', 0)},
                "triggered": False
            }

        # ── 6. OPEN PALM (🖐) -> 3D Orbit / Hover ──
        if open_count >= 3:
            return {
                "gesture": "PALM",
                "label": "Open Palm (3D Orbit / Hover)",
                "icon": "🖐",
                "confidence": 0.98,
                "position": {"x": 1.0 - palm_center_x, "y": palm_center_y},
                "triggered": False
            }

        return {
            "gesture": "NEUTRAL",
            "label": "Tracking Hand...",
            "icon": "🖐",
            "confidence": 0.70,
            "triggered": False
        }


class PresentationAnalyticsTracker:
    """Monitors live presentation & spatial workspace metrics."""

    def __init__(self):
        self.session_start_time = time.time()
        self.current_slide_index = 0
        self.slide_durations: Dict[int, float] = {}
        self.last_slide_enter_time = time.time()
        self.gesture_counts = {
            "NEXT_SLIDE": 0,
            "PREV_SLIDE": 0,
            "LASER": 0,
            "DRAW": 0,
            "VICTORY": 0,
            "THUMBS_UP": 0,
            "FIST": 0
        }
        self.total_actions = 0

    def record_slide_change(self, new_slide_index: int):
        now = time.time()
        elapsed = now - self.last_slide_enter_time
        self.slide_durations[self.current_slide_index] = self.slide_durations.get(self.current_slide_index, 0.0) + elapsed
        self.current_slide_index = new_slide_index
        self.last_slide_enter_time = now

    def record_gesture(self, gesture_name: str):
        if gesture_name in self.gesture_counts:
            self.gesture_counts[gesture_name] += 1
            self.total_actions += 1

    def get_summary(self, total_slides: int) -> Dict[str, Any]:
        now = time.time()
        current_elapsed = now - self.last_slide_enter_time
        self.slide_durations[self.current_slide_index] = self.slide_durations.get(self.current_slide_index, 0.0) + current_elapsed
        self.last_slide_enter_time = now

        total_time = now - self.session_start_time
        formatted_total_time = f"{int(total_time // 60):02d}:{int(total_time % 60):02d}"

        slides_breakdown = []
        for idx in range(total_slides):
            secs = self.slide_durations.get(idx, 0.0)
            mins = int(secs // 60)
            s = int(secs % 60)
            slides_breakdown.append({
                "slide_number": idx + 1,
                "seconds": round(secs, 1),
                "formatted": f"{mins:02d}:{s:02d}",
                "percentage": round((secs / max(total_time, 1.0)) * 100, 1)
            })

        avg_time_per_slide = total_time / max(total_slides, 1)
        
        if avg_time_per_slide < 30:
            pacing_grade = "⚡ Fast Paced (< 30s / slide)"
            pacing_status = "warning"
        elif avg_time_per_slide <= 120:
            pacing_grade = "🎯 Optimal Pacing (1 - 2 mins / slide)"
            pacing_status = "good"
        else:
            pacing_grade = "⏳ In-Depth / Slow Paced (> 2 mins / slide)"
            pacing_status = "info"

        return {
            "total_duration_seconds": round(total_time, 1),
            "formatted_duration": formatted_total_time,
            "total_slides": total_slides,
            "avg_seconds_per_slide": round(avg_time_per_slide, 1),
            "pacing_grade": pacing_grade,
            "pacing_status": pacing_status,
            "gesture_counts": self.gesture_counts,
            "total_gestures": self.total_actions,
            "slides_breakdown": slides_breakdown
        }

    def reset(self):
        self.session_start_time = time.time()
        self.last_slide_enter_time = time.time()
        self.current_slide_index = 0
        self.slide_durations = {}
        for k in self.gesture_counts:
            self.gesture_counts[k] = 0
        self.total_actions = 0
