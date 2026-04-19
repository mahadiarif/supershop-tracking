import subprocess
import time
import os
import signal
import sys
import threading

def start_process(cmd, cwd=None, name="Process"):
    print(f"Starting {name}...")
    # Hide window for sub-processes in EXE mode
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        return subprocess.Popen(cmd, cwd=cwd, shell=True, startupinfo=startupinfo)
    return subprocess.Popen(cmd, cwd=cwd, shell=True)

def run_services():
    # Detect current directory (EXE compatible)
    if getattr(sys, 'frozen', False):
        base_path = os.path.dirname(sys.executable)
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Start MediaMTX
    mtx_dir = os.path.join(base_path, "mediamtx_bin")
    if not os.path.exists(mtx_dir):
        mtx_dir = base_path # Fallback to root
        
    mtx = start_process("mediamtx.exe", cwd=mtx_dir, name="MediaMTX Server")
    
    # 2. Wait a bit
    time.sleep(2)
    
    # 3. Start Backend
    backend_env = os.path.join(base_path, "backend", "venv", "Scripts", "python.exe")
    if not os.path.exists(backend_env):
        backend_env = "python"
    backend = start_process(f'"{backend_env}" run_backend.py', name="API Backend")
    
    # 4. Start Worker
    worker_dir = os.path.join(base_path, "python_worker")
    worker_env = os.path.join(worker_dir, "venv", "Scripts", "python.exe")
    if not os.path.exists(worker_env):
        worker_env = "python"
    worker = start_process(f'"{worker_env}" main.py', cwd=worker_dir, name="AI Tracking Worker")
    
    return [mtx, backend, worker]

if __name__ == "__main__":
    print("========================================")
    print("   SUPERSHOP AI TRACKING SYSTEM")
    print("========================================")
    
    processes = run_services()
    
    # Delay for backend to warm up
    time.sleep(4)
    
    try:
        import webview
        print("Launching Dedicated Desktop Window...")
        window = webview.create_window(
            'Supershop AI Tracking Dashboard', 
            'http://127.0.0.1:8001',
            width=1400,
            height=900,
            min_size=(1024, 768),
            background_color='#06111d'
        )
        
        def on_closed():
            print("\nWindow closed. Stopping services...")
            for proc in processes:
                try:
                    if sys.platform == "win32":
                        subprocess.call(['taskkill', '/F', '/T', '/PID', str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except:
                    pass
            os._exit(0)

        window.events.closed += on_closed
        webview.start()
        
    except Exception as e:
        print(f"Webview failed: {e}")
        import webbrowser
        print("Opening in default browser instead...")
        webbrowser.open("http://localhost:8001")
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nStopping services...")
            for proc in processes:
                try:
                    if sys.platform == "win32":
                        subprocess.call(['taskkill', '/F', '/T', '/PID', str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except:
                    pass
