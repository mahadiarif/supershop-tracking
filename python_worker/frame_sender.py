import os
import time
import threading
import signal
import base64
import queue
from pathlib import Path
from dotenv import load_dotenv
import cv2
import requests

# Load .env from parent dir first, then worker dir
load_dotenv(Path(__file__).parent.parent / '.env')
load_dotenv(Path(__file__).parent / '.env')

# Constants from env
FASTAPI_URL = os.getenv('FASTAPI_URL', 'http://localhost:8001').rstrip('/')
CAMERA_SOURCE = os.getenv('CAMERA_SOURCE', '0')
CAMERA_ID = os.getenv('CAMERA_ID', 'camera_1')
HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', '5'))
PROCESS_EVERY_NTH_FRAME = int(os.getenv('PROCESS_EVERY_NTH_FRAME', '3'))
JPEG_QUALITY = int(os.getenv('JPEG_QUALITY', '55'))
FRAME_WIDTH = int(os.getenv('FRAME_WIDTH', '640'))
FRAME_HEIGHT = int(os.getenv('FRAME_HEIGHT', '480'))

STOP_EVENT = threading.Event()

def log(level, msg=None):
    if msg is None:
        msg = level
        level = "INFO"
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")

class CameraStream(threading.Thread):
    def __init__(self, source):
        super().__init__(name="CameraStream", daemon=True)
        self.source = source
        self.cap = cv2.VideoCapture(self.source)
        
        # Set dimensions if possible
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
        
        self.frame = None
        self.lock = threading.Lock()
        self.stopped = False

    def run(self):
        while not self.stopped:
            ret, frame = self.cap.read()
            if not ret:
                log("ERROR", "Failed to read from camera")
                self.stopped = True
                break
            
            with self.lock:
                self.frame = frame

    def read(self):
        with self.lock:
            return self.frame.copy() if self.frame is not None else None

    def stop(self):
        self.stopped = True
        if self.cap:
            self.cap.release()

    def is_opened(self):
        return self.cap.isOpened() if self.cap else False

class FrameSender:
    def __init__(self):
        self.queue = queue.Queue(maxsize=2)
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def submit(self, frame):
        try:
            if self.queue.full():
                try:
                    self.queue.get_nowait()
                except queue.Empty:
                    pass
            self.queue.put_nowait(frame)
        except Exception as e:
            log("ERROR", f"Queue submit error: {e}")

    def _run(self):
        while not STOP_EVENT.is_set():
            try:
                frame = self.queue.get(timeout=1.0)
            except queue.Empty:
                continue

            try:
                # Encode frame
                ok, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                if not ok:
                    log("ERROR", "JPEG encoding failed")
                    continue

                frame_b64 = base64.b64encode(buf).decode()
                payload = {
                    'camera_id': CAMERA_ID,
                    'frame': frame_b64,
                    'frame_width': frame.shape[1],
                    'frame_height': frame.shape[0],
                }

                # POST to VPS with retry
                url = f"{FASTAPI_URL}/api/worker/frame"
                
                # Log the URL once to verify
                static_var = getattr(self, '_logged_url', False)
                if not static_var:
                    log("INFO", f"Sending frames to: {url}")
                    self._logged_url = True

                success = False
                for attempt in range(3):
                    try:
                        resp = requests.post(url, json=payload, timeout=5)
                        if resp.status_code == 200:
                            success = True
                            break
                        else:
                            log("WARN", f"POST failed ({resp.status_code}): {resp.text}")
                    except Exception as e:
                        log("WARN", f"POST attempt {attempt+1} failed: {e}")
                    time.sleep(0.5)
                
                if success:
                    log("DEBUG", f"Frame sent successfully")
                else:
                    log("ERROR", "Failed to send frame after 3 attempts")

            except Exception as e:
                log("ERROR", f"Sender loop error: {e}")

def heartbeat_loop():
    url = f"{FASTAPI_URL}/api/worker/heartbeat"
    while not STOP_EVENT.is_set():
        try:
            payload = {'camera_id': CAMERA_ID, 'status': 'active'}
            requests.post(url, json=payload, timeout=3)
        except Exception as e:
            log("WARN", f"Heartbeat failed: {e}")
        
        # Wait for interval, checking STOP_EVENT
        for _ in range(HEARTBEAT_INTERVAL):
            if STOP_EVENT.is_set():
                break
            time.sleep(1)

def main():
    def signal_handler(sig, frame):
        log("INFO", "Shutdown signal received")
        STOP_EVENT.set()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    log("INFO", f"System Info: Camera={CAMERA_SOURCE}, VPS={FASTAPI_URL}")
    
    source = int(CAMERA_SOURCE) if CAMERA_SOURCE.isdigit() else CAMERA_SOURCE
    
    stream = CameraStream(source)
    stream.start()
    log("INFO", "Camera stream started")
    
    sender = FrameSender()
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    
    frame_index = 0
    MAX_RECONNECT = 10
    reconnect_count = 0
    
    log("INFO", "Starting frame capture loop...")
    
    try:
        while not STOP_EVENT.is_set():
            if not stream.is_opened() or stream.stopped:
                reconnect_count += 1
                if reconnect_count > MAX_RECONNECT:
                    log("ERROR", "Max reconnects reached, exiting")
                    break
                
                log("WARN", f"Camera lost, reconnecting {reconnect_count}/{MAX_RECONNECT}")
                stream.stop()
                time.sleep(5)
                stream = CameraStream(source)
                stream.start()
                continue
            
            reconnect_count = 0
            frame = stream.read()
            if frame is None:
                time.sleep(0.01)
                continue
            
            frame_index += 1
            if frame_index % PROCESS_EVERY_NTH_FRAME != 0:
                continue
            
            sender.submit(frame)
            time.sleep(0.001)
    finally:
        stream.stop()
        STOP_EVENT.set()
        log("INFO", "frame_sender stopped")

if __name__ == '__main__':
    main()
