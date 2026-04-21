import threading
from ultralytics import YOLO
import cv2
import numpy as np
import base64
import os
from pathlib import Path

_model = None
_model_lock = threading.Lock()
_tracker_state = {}  # persist tracking across frames per camera

# Adjust path to find model in backend or root
YOLO_MODEL = os.getenv('YOLO_MODEL', 'yolov8n.pt')
YOLO_TRACKER = os.getenv('YOLO_TRACKER', 'bytetrack.yaml')
CONFIDENCE = float(os.getenv('CONFIDENCE', '0.35'))
INFERENCE_IMG_SIZE = int(os.getenv('INFERENCE_IMG_SIZE', '320'))
YOLO_DEVICE = os.getenv('YOLO_DEVICE', 'cpu')

def get_model() -> YOLO:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = YOLO(YOLO_MODEL)
                try:
                    _model.fuse()
                except Exception:
                    pass
    return _model

CARRIED_CLASSES = {
    'backpack', 'handbag', 'suitcase', 'cell phone',
    'bottle', 'cup', 'book', 'laptop', 'umbrella',
    'scissors', 'knife', 'fork', 'bag', 'basket', 'cart'
}

def decode_frame(frame_b64: str, frame_width: int, frame_height: int):
    '''Decode base64 JPEG to numpy array'''
    try:
        # Handle data URI if present
        if ',' in frame_b64:
            frame_b64 = frame_b64.split(',')[1]
        img_bytes = base64.b64decode(frame_b64)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode frame")
        return frame
    except Exception as e:
        raise ValueError(f"Frame decoding failed: {e}")

def run_inference(camera_id: str, frame_b64: str,
                  frame_width: int, frame_height: int) -> dict:
    '''
    Main inference function.
    Returns detection results dict ready for /api/detection
    '''
    frame = decode_frame(frame_b64, frame_width, frame_height)
    model = get_model()
    
    with _model_lock:
        results = model.track(
            frame,
            persist=True,
            conf=CONFIDENCE,
            tracker=YOLO_TRACKER,
            imgsz=INFERENCE_IMG_SIZE,
            verbose=False,
            device=YOLO_DEVICE,
        )
    
    detections = _parse_detections(model, results, frame,
                                    frame_width, frame_height)
    detections = _attach_carry_metadata(detections)
    annotated_frame = _annotate_frame(frame, detections)
    annotated_b64 = _encode_frame(annotated_frame)
    
    total_persons = sum(
        1 for d in detections if d['class_name'] == 'person'
    )
    
    return {
        'camera_id':     camera_id,
        'frame':         annotated_b64,
        'frame_width':   frame_width,
        'frame_height':  frame_height,
        'detections':    detections,
        'total_persons': total_persons,
        'total_objects': len(detections),
        'worker_status': 'active',
    }

def _parse_detections(model, results, frame, fw, fh) -> list:
    detections = []
    if not results: return detections
    result = results[0]
    boxes = getattr(result, 'boxes', None)
    if boxes is None: return detections
    names = getattr(result, 'names', {}) or model.names
    
    for box in boxes:
        try:
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            conf = float(box.conf[0])
            cls = int(box.cls[0])
            class_name = str(names.get(cls, 'object')).lower()
            track_id = int(box.id[0]) if getattr(box, 'id', None) is not None else 0
        except Exception:
            continue
        
        if conf < CONFIDENCE: continue
        
        # Snapshot thumbnail
        snapshot_b64 = None
        try:
            pad = 5
            crop = frame[max(0, y1-pad):min(fh, y2+pad),
                         max(0, x1-pad):min(fw, x2+pad)]
            if crop.size > 0:
                h, w = crop.shape[:2]
                if h > 96 or w > 96:
                    scale = 96 / max(h, w)
                    crop_r = cv2.resize(crop, (0, 0), fx=scale, fy=scale)
                else:
                    crop_r = crop
                _, buf = cv2.imencode('.jpg', crop_r,
                                      [cv2.IMWRITE_JPEG_QUALITY, 50])
                snapshot_b64 = base64.b64encode(buf).decode()
        except Exception:
            pass
        
        detections.append({
            'track_id':    track_id,
            'class_name':  class_name,
            'confidence':  round(conf, 2),
            'bbox':        {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2},
            'snapshot':    snapshot_b64,
            'frame_width': fw,
            'frame_height': fh,
        })
    return detections

def _attach_carry_metadata(detections: list) -> list:
    persons = [d for d in detections if d['class_name'] == 'person']
    items = [d for d in detections
             if d['class_name'] in CARRIED_CLASSES]
    
    for p in persons:
        p['carrying_objects'] = []
        p['is_carrying'] = False
    
    for item in items:
        bbox = item.get('bbox', {})
        icx = (bbox.get('x1', 0) + bbox.get('x2', 0)) / 2
        icy = (bbox.get('y1', 0) + bbox.get('y2', 0)) / 2
        iw  = max(1.0, bbox.get('x2', 0) - bbox.get('x1', 0))
        ih  = max(1.0, bbox.get('y2', 0) - bbox.get('y1', 0))
        
        best_person = None
        best_score = None
        for p in persons:
            pb = p.get('bbox', {})
            px1, py1, px2, py2 = (pb.get('x1', 0), pb.get('y1', 0),
                                  pb.get('x2', 0), pb.get('y2', 0))
            pcx = (px1 + px2) / 2
            pcy = (py1 + py2) / 2
            ok_h = px1 - iw*0.6 <= icx <= px2 + iw*0.6
            ok_v = py1 - ih*0.8 <= icy <= py2 + ih*0.6
            if not (ok_h and ok_v): continue
            score = abs(icx - pcx) + abs(icy - pcy) * 0.45
            if best_score is None or score < best_score:
                best_score = score
                best_person = p
        
        item['carried_by_track_id'] = (best_person.get('track_id')
                                        if best_person else None)
        item['is_carried'] = best_person is not None
        if best_person:
            best_person['is_carrying'] = True
            best_person['carrying_objects'].append(item['class_name'])
    
    for p in persons:
        carrying = p.get('carrying_objects', [])
        if carrying:
            p['carry_summary'] = ', '.join(carrying[:3])
    
    return detections

def _annotate_frame(frame, detections) -> any:
    annotated = frame.copy()
    for det in detections:
        bbox = det.get('bbox', {})
        x1, y1, x2, y2 = (int(bbox.get('x1', 0)), int(bbox.get('y1', 0)),
                          int(bbox.get('x2', 0)), int(bbox.get('y2', 0)))
        cn   = str(det.get('class_name', ''))
        conf = float(det.get('confidence', 0))
        tid  = det.get('track_id', 0)
        color = (0, 255, 0) if cn == 'person' else (0, 165, 255)
        if det.get('is_carrying') or det.get('is_carried'):
            color = (255, 191, 0)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f'#{tid} {cn} {conf:.0%}'
        if cn == 'person' and det.get('carry_summary'):
            label = f'{label} [{det["carry_summary"]}]'
        cv2.putText(annotated, label, (x1, max(18, y1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2,
                    cv2.LINE_AA)
    return annotated

def _encode_frame(frame) -> str | None:
    ok, buf = cv2.imencode('.jpg', frame,
                [cv2.IMWRITE_JPEG_QUALITY, 55])
    if not ok: return None
    return base64.b64encode(buf.tobytes()).decode()
