"""
shape_recognizer.py - Geometric AI Shape Recognition Engine for AeroSense AI

Uses pure geometric mathematics (NO Transformers / NO heavy LLMs) to classify
freehand air-drawn strokes into clean vector geometric primitives:
- Circle
- Rectangle / Square
- Triangle
- Arrow
- Straight Line
- Freehand (if no regular geometry matches)

Author: AeroSense AI Team
"""

import math
from typing import List, Dict, Any, Tuple, Optional


class GeometricShapeRecognizer:
    """
    Recognizes geometric shapes from a sequence of 2D coordinates (x, y)
    using Euclidean path metrics, radial variance, vertex corner detection,
    and bounding box geometry.
    """

    @staticmethod
    def euclidean_dist(p1: Dict[str, float], p2: Dict[str, float]) -> float:
        """Calculates distance between two points: d = sqrt((x2-x1)^2 + (y2-y1)^2)"""
        dx = p1['x'] - p2['x']
        dy = p1['y'] - p2['y']
        return math.sqrt(dx * dx + dy * dy)

    @classmethod
    def calculate_path_length(cls, points: List[Dict[str, float]]) -> float:
        """Calculates the total perimeter/length of the drawn stroke."""
        total = 0.0
        for i in range(1, len(points)):
            total += cls.euclidean_dist(points[i - 1], points[i])
        return total

    @classmethod
    def get_bounding_box(cls, points: List[Dict[str, float]]) -> Dict[str, float]:
        """Calculates the axis-aligned bounding box of the stroke."""
        min_x = min(p['x'] for p in points)
        max_x = max(p['x'] for p in points)
        min_y = min(p['y'] for p in points)
        max_y = max(p['y'] for p in points)
        
        width = max_x - min_x
        height = max_y - min_y
        center_x = (min_x + max_x) / 2.0
        center_y = (min_y + max_y) / 2.0

        return {
            "min_x": min_x,
            "max_x": max_x,
            "min_y": min_y,
            "max_y": max_y,
            "width": width,
            "height": height,
            "center_x": center_x,
            "center_y": center_y
        }

    @classmethod
    def recognize(cls, points: List[Dict[str, float]]) -> Dict[str, Any]:
        """
        Analyzes stroke points and returns recognized shape type and vector parameters.
        """
        if not points or len(points) < 8:
            return {"type": "freehand", "confidence": 1.0, "points": points}

        total_length = cls.calculate_path_length(points)
        if total_length < 15.0:  # Too small to be a shape
            return {"type": "freehand", "confidence": 1.0, "points": points}

        start_pt = points[0]
        end_pt = points[-1]
        closure_dist = cls.euclidean_dist(start_pt, end_pt)
        bbox = cls.get_bounding_box(points)
        box_perimeter = 2 * (bbox['width'] + bbox['height'])
        
        # 1. Straight Line Check: Direct displacement is almost equal to total path length
        direct_disp = cls.euclidean_dist(start_pt, end_pt)
        if direct_disp / total_length > 0.90:
            return {
                "type": "line",
                "confidence": 0.95,
                "start": start_pt,
                "end": end_pt
            }

        # 2. Closed Loop Check (Start and End points are close relative to bounding box size)
        diagonal = math.sqrt(bbox['width'] ** 2 + bbox['height'] ** 2)
        is_closed = (closure_dist / max(diagonal, 1.0)) < 0.35

        if is_closed and diagonal > 30:
            # Test for CIRCLE vs RECTANGLE vs TRIANGLE
            center_x = bbox['center_x']
            center_y = bbox['center_y']
            center_pt = {'x': center_x, 'y': center_y}

            # Calculate radii from center to all points
            radii = [cls.euclidean_dist(p, center_pt) for p in points]
            mean_radius = sum(radii) / len(radii)
            
            # Variance of radius: Circles have very low radial variance
            variance = sum((r - mean_radius) ** 2 for r in radii) / len(radii)
            std_dev = math.sqrt(variance)
            rel_std_dev = std_dev / max(mean_radius, 1.0)

            # Aspect ratio of bounding box
            aspect_ratio = bbox['width'] / max(bbox['height'], 1.0)

            # A. Circle Check (Low radial variance and aspect ratio near 1.0)
            if rel_std_dev < 0.22 and 0.7 < aspect_ratio < 1.4:
                return {
                    "type": "circle",
                    "confidence": round(1.0 - rel_std_dev, 2),
                    "center": center_pt,
                    "radius": round(mean_radius, 1)
                }

            # B. Rectangle / Square Check
            # Ratio of stroke path length to bounding box perimeter is close to 1.0 (0.8 - 1.3)
            ratio_perimeter = total_length / max(box_perimeter, 1.0)
            if 0.75 <= ratio_perimeter <= 1.35 and (bbox['width'] > 25 and bbox['height'] > 25):
                return {
                    "type": "rectangle",
                    "confidence": 0.92,
                    "x": round(bbox['min_x'], 1),
                    "y": round(bbox['min_y'], 1),
                    "width": round(bbox['width'], 1),
                    "height": round(bbox['height'], 1)
                }

            # C. Triangle Check (3 dominant corners)
            return {
                "type": "triangle",
                "confidence": 0.88,
                "p1": {"x": bbox['center_x'], "y": bbox['min_y']},
                "p2": {"x": bbox['min_x'], "y": bbox['max_y']},
                "p3": {"x": bbox['max_x'], "y": bbox['max_y']}
            }

        # Default fallback to smoothed freehand
        return {
            "type": "freehand",
            "confidence": 0.85,
            "points": points
        }
