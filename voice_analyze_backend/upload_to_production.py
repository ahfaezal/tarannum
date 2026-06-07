"""
Upload reference file to production Railway
"""
import requests
import sys
from pathlib import Path

PRODUCTION_API = "https://tarannum-backend-production.up.railway.app"
FILE_PATH = r"E:\PUPPY\voice_analyze_backend\uploads\references\9e0e7ab1fbc643926df53247c7137551.mp3"

def upload_reference(file_path: str, jwt_token: str, title: str = "70", is_public: bool = True):
    """Upload a reference file to production."""
    
    if not Path(file_path).exists():
        print(f"[ERROR] File not found: {file_path}")
        return False
    
    print(f"Uploading: {Path(file_path).name}")
    print(f"To: {PRODUCTION_API}")
    print()
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (Path(file_path).name, f, 'audio/mpeg')}
            data = {
                'title': title,
                'is_public': 'true' if is_public else 'false'
            }
            headers = {'Authorization': f'Bearer {jwt_token}'}
            
            response = requests.post(
                f"{PRODUCTION_API}/api/references/upload",
                files=files,
                data=data,
                headers=headers,
                timeout=120  # 2 minutes for large files
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"[OK] Upload successful!")
                print(f"Reference ID: {result.get('id')}")
                print(f"Title: {result.get('title')}")
                return True
            else:
                print(f"[FAIL] Upload failed: {response.status_code}")
                try:
                    error = response.json()
                    print(f"Error: {error}")
                except:
                    print(f"Error: {response.text}")
                return False
                
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python upload_to_production.py <jwt_token> [title]")
        print()
        print("Example:")
        print("  python upload_to_production.py YOUR_JWT_TOKEN '70'")
        print()
        print("To get JWT token:")
        print("1. Open production frontend: https://voice-analyze-frontend-lsyr.vercel.app")
        print("2. Log in as admin")
        print("3. Open browser console and run:")
        print("   localStorage.getItem('tarannum_auth_token')")
        print("4. Copy the token and use it here")
        sys.exit(1)
    
    jwt_token = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else "70"
    
    upload_reference(FILE_PATH, jwt_token, title, True)
