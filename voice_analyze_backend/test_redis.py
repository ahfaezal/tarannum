import os
from dotenv import load_dotenv
import redis

load_dotenv()

redis_url = os.getenv("REDIS_URL")
if not redis_url:
    print("❌ REDIS_URL not set")
    exit(1)


try:
    r = redis.from_url(redis_url)
    r.ping()
    print("✅ Redis connection successful!")
    print(f"   URL: {redis_url.split('@')[1] if '@' in redis_url else 'hidden'}")
except Exception as e:
    print(f"❌ Redis connection failed: {e}")