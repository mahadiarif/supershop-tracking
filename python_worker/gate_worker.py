# python_worker/gate_worker.py
from __future__ import annotations

import base64
import os
import signal
import threading
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

WORKER_DIR = Path(__file__).resolve().parent
ROOT_DIR = WORKER_DIR.parent
load_dotenv(ROOT_DIR / '.env')
load_dotenv(WORKER_DIR / '.env')

os.environ.setdefault(
    'OPENCV_FFMPEG_CAPTURE_OPTIONS',
    'rtsp_transport;tcp|stimeout;5000000|max_delay;500000|buffer_size;1048576',
)
os.environ.setdefault('OPENCV_VIDEOIO_PRIORITY_MSMF', '0')

import cv2
import httpx
import torch
from ultralytics import YOLO

FASTAPI_URL = os.getenv('FASTAPI_URL', 'http://127.0.0.1:8001').rstrip('/')
CAMERA_SOURCE = os.getenv('CAMERA_SOURCE', '0')
CAMERA_ID = os.getenv('CAMERA_ID', 'camera_1')
MODEL_PATH = os.getenv('YOLO_MODEL', 'yolov8n.pt')
CONF = float(os.getenv('CONFIDENCE', '0.15'))
TRACKER_CFG = os.getenv('YOLO_TRACKER', 'bytetrack.yaml')
HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', '5'))
AUTO_RESOLVE_SOURCE = str(CAMERA_SOURCE).strip().upper() in {'AUTO', 'BACKEND', 'DEFAULT'}
MODEL_CANDIDATES = [MODEL_PATH, 'yolov8n.pt', 'yolo26n.pt']
FRAME_FLUSH_COUNT = int(os.getenv('FRAME_FLUSH_COUNT', '3'))
INFERENCE_IMG_SIZE = int(os.getenv('INFERENCE_IMG_SIZE', '416'))
PROCESS_EVERY_NTH_FRAME = max(1, int(os.getenv('PROCESS_EVERY_NTH_FRAME', '3')))
JPEG_QUALITY = max(35, min(85, int(os.getenv('JPEG_QUALITY', '55'))))
ALLOWED_CLASSES = {
    item.strip().lower()
    for item in os.getenv(
        'ALLOWED_CLASSES',
        'ALL',
    ).split(',')
    if item.strip()
}

_DETECTION_ALL_MODE = ('ALL' in {c.upper() for c in ALLOWED_CLASSES})
STOP_EVENT = threading.Event()
STATE_LOCK = threading.Lock()
WORKER_STATUS = 'active'
CLIENT = httpx.Client(timeout=httpx.Timeout(5.0, connect=2.0))
CARRIED_OBJECT_CLASSES = {'cart', 'basket', 'backpack', 'handbag', 'suitcase', 'bottle', 'cell phone'}


def _log(level: str, message: str) -> None:
    print(f'[{level}] {message}', flush=True)


def _set_status(status: str) -> None:
    global WORKER_STATUS
    with STATE_LOCK:
        WORKER_STATUS = status


def _get_status() -> str:
    with STATE_LOCK:
        return WORKER_STATUS


def _resolve_model_path(path_value: str) -> str:
    candidate = Path(path_value)
    if candidate.is_file():
        return str(candidate)
    for path in [
        WORKER_DIR / path_value,
        WORKER_DIR / candidate.name,
        WORKER_DIR / 'yolo26n.pt',
        WORKER_DIR / 'yolov8n.pt',
        ROOT_DIR / 'models' / candidate.name,
    ]:
        if path.is_file():
            return str(path)
    return path_value


_DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'


class CameraStream:
    """Helper class to read frames in a separate thread to avoid buffer lag."""
    def __init__(self, source):
        self.source = int(source) if str(source).isdigit() else source
        self.cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        try:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        self.frame = None
        self.stopped = False
        self.lock = threading.Lock()
        self.thread = None

    def start(self):
        self.thread = threading.Thread(target=self.update, args=(), daemon=True)
        self.thread.start()
        return self

    def update(self):
        while not self.stopped:
            if not self.cap.isOpened():
                time.sleep(0.5)
                continue
            grabbed, frame = self.cap.read()
            if not grabbed:
                time.sleep(0.1)
                continue
            with self.lock:
                self.frame = frame

    def read(self):
        with self.lock:
            return self.frame

    def stop(self):
        self.stopped = True
        if self.thread:
            self.thread.join(timeout=1.0)
        try:
            self.cap.release()
        except Exception:
            pass

    def is_opened(self):
        return self.cap.isOpened()


def _load_model() -> tuple[YOLO, str]:
    tried: set[str] = set()
    for candidate in MODEL_CANDIDATES:
        if not candidate or candidate in tried:
            continue
        tried.add(candidate)
        resolved = _resolve_model_path(candidate)
        try:
            _log('INFO', f'Loading YOLO model: {resolved}')
            model = YOLO(resolved)
            _log('INFO', f'Model loaded successfully: {resolved}')
            return model, resolved
        except Exception as exc:
            _log('ERROR', f'Failed to load model {resolved}: {exc}')
    raise RuntimeError('Unable to load any YOLO model candidate.')


def _normalize_camera_key(value: str | None) -> str:
    return str(value or '').strip().lower().replace('_', '').replace(' ', '')


def _fetch_camera_entry(camera_key: str) -> dict[str, Any] | None:
    try:
        response = CLIENT.get(f'{FASTAPI_URL}/api/cameras')
        response.raise_for_status()
        cameras = response.json() or []
    except Exception as exc:
        _log('ERROR', f'Failed to fetch cameras from backend: {exc}')
        return None

    target = _normalize_camera_key(camera_key)
    for camera in cameras:
        mediamtx_path = _normalize_camera_key(camera.get('mediamtx_path'))
        name = _normalize_camera_key(camera.get('name'))
        camera_id = _normalize_camera_key(camera.get('id'))
        if target in {mediamtx_path, name, camera_id} or target == mediamtx_path or target == name:
            return camera
    return None


def _resolve_source_from_backend(camera_key: str) -> str | None:
    camera = _fetch_camera_entry(camera_key)
    if not camera:
        return None
    if camera.get('web_enabled') is False:
        _log('INFO', f"Camera '{camera_key}' is disabled for web, skipping worker stream.")
        return None
    rtsp_url = camera.get('rtsp_url')
    if rtsp_url:
        _log('INFO', f"Resolved camera source for '{camera_key}' from backend: {camera.get('name') or camera.get('mediamtx_path')}")
        return str(rtsp_url)
    return None

def _fetch_active_camera_id() -> str | None:
    try:
        response = CLIENT.get(f'{FASTAPI_URL}/api/system/active-tracking')
        if response.status_code == 200:
            return response.json().get('camera_id')
    except Exception:
        pass
    return None


def _post(path: str, payload: dict[str, Any]) -> bool:
    url = f'{FASTAPI_URL}{path}'
    for attempt in range(3):
        try:
            response = CLIENT.post(url, json=payload)
            if 200 <= response.status_code < 300:
                return True
            _log('ERROR', f'POST {path} failed with {response.status_code}')
        except Exception as exc:
            _log('ERROR', f'POST {path} attempt {attempt + 1} failed: {exc}')
        time.sleep(0.5 + attempt * 0.5)
    return False


def _heartbeat_loop() -> None:
    while not STOP_EVENT.is_set():
        status = _get_status()
        _post('/api/worker/heartbeat', {'status': status, 'camera_id': CAMERA_ID})
        _log('POST', f'heartbeat={status}')
        STOP_EVENT.wait(HEARTBEAT_INTERVAL)


def _open_camera(source: str):
    camera_source = int(source) if source.isdigit() else source
    _log('INFO', f'Opening camera source: {camera_source}')
    cap = cv2.VideoCapture(camera_source, cv2.CAP_FFMPEG)
    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:
        pass
    return cap


def _refresh_camera_source(camera_key: str, current_source: str | None) -> str | None:
    if not AUTO_RESOLVE_SOURCE:
        return current_source or CAMERA_SOURCE
    return _resolve_source_from_backend(camera_key)


def _parse_boxes(model: YOLO, results, frame, frame_width: int, frame_height: int) -> list[dict[str, Any]]:
    detections: list[dict[str, Any]] = []
    if not results:
        return detections
    result = results[0]
    boxes = getattr(result, 'boxes', None)
    if boxes is None:
        return detections
    names = getattr(result, 'names', {}) or model.names
    for box in boxes:
        try:
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            conf = float(box.conf[0]) if box.conf is not None else 0.0
            cls = int(box.cls[0]) if box.cls is not None else 0
            class_name = str(names.get(cls, 'object')).lower()
            track_id = int(box.id[0]) if getattr(box, 'id', None) is not None else 0
        except Exception as exc:
            _log('ERROR', f'Failed to parse detection: {exc}')
            continue
        if conf < CONF:
            continue
        if not _DETECTION_ALL_MODE and ALLOWED_CLASSES and class_name not in ALLOWED_CLASSES:
            continue

        # Create thumbnail snapshot
        snapshot_b64 = None
        try:
            # Crop with padding
            pad = 5
            cy1, cy2 = max(0, y1-pad), min(frame_height, y2+pad)
            cx1, cx2 = max(0, x1-pad), min(frame_width, x2+pad)
            crop = frame[cy1:cy2, cx1:cx2]
            if crop.size > 0:
                # Resize for bandwidth efficiency
                crop_resized = cv2.resize(crop, (96, 96)) if crop.shape[0] > 96 else crop
                _, buf = cv2.imencode('.jpg', crop_resized, [cv2.IMWRITE_JPEG_QUALITY, 50])
                snapshot_b64 = base64.b64encode(buf).decode('utf-8')
        except Exception:
            pass

        detections.append({
            'track_id': track_id,
            'class_name': class_name,
            'confidence': round(conf, 2),
            'bbox': {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2},
            'snapshot': snapshot_b64,
            'frame_width': frame_width,
            'frame_height': frame_height,
        })
    return detections


def _bbox_center(bbox: dict[str, Any]) -> tuple[float, float]:
    return (
        (float(bbox.get('x1', 0)) + float(bbox.get('x2', 0))) / 2.0,
        (float(bbox.get('y1', 0)) + float(bbox.get('y2', 0))) / 2.0,
    )


def _attach_carry_metadata(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    persons = [item for item in detections if item.get('class_name') == 'person']
    carry_items = [item for item in detections if item.get('class_name') in CARRIED_OBJECT_CLASSES]

    for person in persons:
        person['carrying_objects'] = []
        person['is_carrying'] = False

    for item in carry_items:
        bbox = item.get('bbox') or {}
        item_center_x, item_center_y = _bbox_center(bbox)
        item_width = max(1.0, float(bbox.get('x2', 0)) - float(bbox.get('x1', 0)))
        item_height = max(1.0, float(bbox.get('y2', 0)) - float(bbox.get('y1', 0)))

        best_person = None
        best_score = None
        for person in persons:
            person_bbox = person.get('bbox') or {}
            px1 = float(person_bbox.get('x1', 0))
            py1 = float(person_bbox.get('y1', 0))
            px2 = float(person_bbox.get('x2', 0))
            py2 = float(person_bbox.get('y2', 0))
            person_center_x, person_center_y = _bbox_center(person_bbox)

            horizontal_gap = abs(item_center_x - person_center_x)
            vertical_gap = abs(item_center_y - person_center_y)
            overlaps_horizontally = px1 - item_width * 0.6 <= item_center_x <= px2 + item_width * 0.6
            near_body_band = py1 - item_height * 0.8 <= item_center_y <= py2 + item_height * 0.6
            if not (overlaps_horizontally and near_body_band):
                continue

            score = horizontal_gap + vertical_gap * 0.45
            if best_score is None or score < best_score:
                best_score = score
                best_person = person

        item['carried_by_track_id'] = best_person.get('track_id') if best_person else None
        item['is_carried'] = best_person is not None
        if best_person:
            best_person['is_carrying'] = True
            best_person['carrying_objects'].append(item.get('class_name'))

    for person in persons:
        carrying = person.get('carrying_objects') or []
        if carrying:
            person['carry_summary'] = ', '.join(carrying[:3])

    return detections


def _annotate_frame(frame, detections: list[dict[str, Any]]):
    annotated = frame.copy()
    for det in detections:
        bbox = det.get('bbox') or {}
        x1 = int(bbox.get('x1', 0))
        y1 = int(bbox.get('y1', 0))
        x2 = int(bbox.get('x2', 0))
        y2 = int(bbox.get('y2', 0))
        class_name = str(det.get('class_name', 'object'))
        confidence = float(det.get('confidence', 0.0))
        track_id = det.get('track_id', 0)
        color = (0, 255, 0) if class_name == 'person' else (0, 165, 255)
        if det.get('is_carrying') or det.get('is_carried'):
            color = (255, 191, 0)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f'#{track_id} {class_name} {confidence:.0%}'
        if class_name == 'person' and det.get('carry_summary'):
            label = f'{label} [{det["carry_summary"]}]'
        if det.get('carried_by_track_id') is not None:
            label = f'{label} -> #{det["carried_by_track_id"]}'
        cv2.putText(annotated, label, (x1, max(18, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)
    return annotated


def _encode_frame(frame) -> str | None:
    ok, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        return None
    return base64.b64encode(buffer.tobytes()).decode('utf-8')


def _build_payload(detections: list[dict[str, Any]], frame_b64: str | None, frame_width: int, frame_height: int) -> dict[str, Any]:
    total_persons = sum(1 for item in detections if str(item.get('class_name')) == 'person')
    return {
        'camera_id': CAMERA_ID,
        'frame': frame_b64,
        'frame_width': frame_width,
        'frame_height': frame_height,
        'detections': detections,
        'total_persons': total_persons,
        'total_objects': len(detections),
        'worker_status': _get_status(),
    }


def _shutdown(signum, _frame):
    _log('INFO', f'Signal received: {signum}')
    STOP_EVENT.set()


def main() -> None:
    global CAMERA_ID, TRACKER_CFG, CONF, INFERENCE_IMG_SIZE, PROCESS_EVERY_NTH_FRAME
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    _log('INFO', f'Using device: {_DEVICE}')
    model, active_model_path = _load_model()
    
    # Optimization: Warm up the model
    dummy = torch.zeros((1, 3, INFERENCE_IMG_SIZE, INFERENCE_IMG_SIZE)).to(_DEVICE)
    try:
        model(dummy)
    except Exception:
        pass

    consecutive_empty_frames = 0
    frame_index = 0

    is_dynamic = (CAMERA_ID.upper() in {'DYNAMIC', 'AUTO'})
    active_cid = CAMERA_ID
    last_sync_time = 0

    camera_source: str | None = None
    if not is_dynamic:
        camera_source = CAMERA_SOURCE if not AUTO_RESOLVE_SOURCE else _resolve_source_from_backend(CAMERA_ID)
        if camera_source is None and AUTO_RESOLVE_SOURCE:
            _log('INFO', f"Camera '{CAMERA_ID}' is not enabled for web. Worker will stay idle.")
    else:
        _log('INFO', "Dynamic worker started. Waiting for dashboard selection...")

    stream: CameraStream | None = None
    if camera_source:
        stream = CameraStream(camera_source).start()
        _log('INFO', f'Stream thread started for: {camera_source}')

    threading.Thread(target=_heartbeat_loop, daemon=True).start()

    try:
        while not STOP_EVENT.is_set():
            # Sync dynamic camera target
            if is_dynamic and time.time() - last_sync_time > 3:
                last_sync_time = time.time()
                target_cid = _fetch_active_camera_id()
                if target_cid and target_cid != active_cid:
                    _log('INFO', f"Switching dynamic worker to camera: {target_cid}")
                    active_cid = target_cid
                    if stream:
                        stream.stop()
                    stream = None
                    camera_source = None
                    CAMERA_ID = target_cid

            if not camera_source:
                camera_source = _refresh_camera_source(CAMERA_ID, None)
                if not camera_source:
                    _set_status('idle')
                    time.sleep(1)
                    continue
                stream = CameraStream(camera_source).start()
                continue

            if not stream or not stream.is_opened():
                _log('WARN', 'Stream not active, retrying...')
                time.sleep(1)
                camera_source = _refresh_camera_source(CAMERA_ID, camera_source)
                if camera_source:
                    stream = CameraStream(camera_source).start()
                continue

            frame = stream.read()
            if frame is None:
                time.sleep(0.01)
                continue

            frame_index += 1
            if frame_index % PROCESS_EVERY_NTH_FRAME != 0:
                continue

            frame_h, frame_w = frame.shape[:2]
            try:
                # Create a local copy to ensure thread safety during annotation
                current_frame = frame.copy()
                results = model.track(
                    current_frame,
                    persist=True,
                    conf=CONF,
                    tracker=TRACKER_CFG,
                    imgsz=INFERENCE_IMG_SIZE,
                    verbose=False,
                    device=_DEVICE
                )
                detections = _parse_boxes(model, results, current_frame, frame_w, frame_h)
            except Exception as exc:
                _set_status('error')
                _log('ERROR', f'YOLO tracking failed: {exc}')
                time.sleep(0.5)
                continue

            detections = _attach_carry_metadata(detections)
            if not detections:
                consecutive_empty_frames += 1
            else:
                consecutive_empty_frames = 0

            if consecutive_empty_frames >= 50 and active_model_path != str(_resolve_model_path('yolov8n.pt')):
                try:
                    fallback_path = _resolve_model_path('yolov8n.pt')
                    _log('WARN', f'No detections for 50 frames, switching model to: {fallback_path}')
                    model = YOLO(fallback_path)
                    active_model_path = fallback_path
                    consecutive_empty_frames = 0
                except Exception as exc:
                    _log('ERROR', f'Fallback model switch failed: {exc}')

            annotated_frame = _annotate_frame(current_frame, detections)
            frame_b64 = _encode_frame(annotated_frame)
            payload = _build_payload(detections, frame_b64, frame_w, frame_h)

            _log('DETECT', f'{len(detections)} objects found')
            if _post('/api/detection', payload):
                _set_status('active')
            
            time.sleep(0.005)

    except Exception as exc:
        _set_status('error')
        _log('ERROR', f'Worker crashed: {exc}')
    finally:
        if stream:
            stream.stop()
        try:
            _post('/api/worker/heartbeat', {'status': 'idle', 'camera_id': CAMERA_ID})
        except Exception:
            pass
        CLIENT.close()
        STOP_EVENT.set()


if __name__ == '__main__':
    main()
()
