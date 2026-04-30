from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import os

# ใช้ SQLite — เก็บไฟล์ใน /app/data/ ซึ่ง mount เป็น Docker volume
# เพื่อให้ข้อมูลไม่หายเมื่อ rebuild หรือ restart container
DATA_DIR = os.getenv("DATA_DIR", "/app/data")
os.makedirs(DATA_DIR, exist_ok=True)  # สร้าง directory ถ้ายังไม่มี (กรณีรันบนเครื่อง local ตรงๆ)
DATABASE_URL = f"sqlite:///{DATA_DIR}/redroid.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # จำเป็นสำหรับ SQLite + FastAPI (multi-thread)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
