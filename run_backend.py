import uvicorn
from backend.main import app
import sys
import os

# Add current directory to path so backend module is found
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
