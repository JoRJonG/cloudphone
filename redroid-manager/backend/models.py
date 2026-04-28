from sqlalchemy import Column, Integer, String, Boolean
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(100))
    # role มีสองระดับ: admin (ทำได้ทุกอย่าง) และ viewer (ดูอย่างเดียว)
    role = Column(String(20), default="viewer")
    # is_active ใช้สำหรับ disable user โดยไม่ต้องลบออกจาก DB
    is_active = Column(Boolean, default=True)

class UserDevice(Base):
    """Table สำหรับเก็บว่า User คนไหนมีสิทธิ์เข้าถึงเครื่อง (container) ชื่ออะไรบ้าง"""
    __tablename__ = "user_devices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    device_name = Column(String(100), index=True)
