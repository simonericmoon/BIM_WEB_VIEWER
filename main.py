from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
from pathlib import Path
import socket
import ssl

# Create SSL context
ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
ssl_context.load_cert_chain('certificate.pem', 'private_key.pem')

app = FastAPI()

# Configure CORS to allow access from any device on the network
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://*",  # Allow HTTPS connections
        "http://*"    # Allow HTTP connections
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Create storage directory if it doesn't exist
STORAGE_DIR = Path("ifc_storage")
STORAGE_DIR.mkdir(exist_ok=True)
DEFAULT_IFC_PATH = STORAGE_DIR / "default.ifc"

def get_local_ip():
    """Get the local IP address of the machine"""
    try:
        # Create a socket connection to determine the local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

@app.get("/")
async def root():
    """Root endpoint that shows server information"""
    local_ip = get_local_ip()
    return {
        "message": "IFC File Server",
        "endpoints": {
            "upload": f"https://{local_ip}:8000/upload-default-ifc/",
            "download": f"https://{local_ip}:8000/default-ifc/",
        },
        "status": "default.ifc exists" if DEFAULT_IFC_PATH.exists() else "No default IFC file"
    }

@app.post("/upload-default-ifc/")
async def upload_default_ifc(file: UploadFile = File(...)):
    """Upload an IFC file to the server"""
    if not file.filename.lower().endswith('.ifc'):
        raise HTTPException(status_code=400, detail="File must be an IFC file")
    
    try:
        # Ensure the storage directory exists
        STORAGE_DIR.mkdir(exist_ok=True)
        
        # Save the file
        with open(DEFAULT_IFC_PATH, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        local_ip = get_local_ip()
        return {
            "message": "Default IFC file uploaded successfully",
            "access_url": f"https://{local_ip}:8000/default-ifc/"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@app.post("/flush-default-ifc/")
async def flush_default_ifc():
    """Delete the default IFC file from the server"""
    try:
        if DEFAULT_IFC_PATH.exists():
            os.remove(DEFAULT_IFC_PATH)
            # Verify the file is actually deleted
            if DEFAULT_IFC_PATH.exists():
                raise HTTPException(status_code=500, detail="Failed to delete file")
            return {"message": "Default IFC file deleted successfully"}
        return {"message": "No default IFC file exists"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")
        
@app.get("/default-ifc/")
async def get_default_ifc():
    """Download the default IFC file"""
    if not DEFAULT_IFC_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="No default IFC file found. Please upload one first."
        )
    try:
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
        return FileResponse(
            path=DEFAULT_IFC_PATH,
            media_type="application/octet-stream",
            filename="default.ifc",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error accessing file: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    
    # Get the local IP address
    local_ip = get_local_ip()
    print(f"\nServer Information:")
    print(f"Local IP Address: http://{local_ip}:8000")
    print(f"Upload endpoint: http://{local_ip}:8000/upload-default-ifc/")
    print(f"Download endpoint: http://{local_ip}:8000/default-ifc/")
    print("\nUse these URLs to access the server from other devices on your network")
    
    # Run the server on all network interfaces
    uvicorn.run(app, host="0.0.0.0", port=8000, ssl_certfile='certificate.pem', ssl_keyfile='private_key.pem')