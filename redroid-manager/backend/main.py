from fastapi import FastAPI, HTTPException, status, Depends, Response, APIRouter, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import timedelta
import docker
import os
import io
import tarfile
import tempfile
import asyncio
from functools import partial

from .database import get_db, engine, Base
from .models import User, UserDevice
from .auth import get_password_hash, verify_password, create_access_token, get_current_user

# โหลดค่าจาก .env (ถ้ามี)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = FastAPI(title="Redroid Farm Manager API")

# Image ที่ใช้สร้าง container ใหม่ (override ได้ด้วย env)
REDROID_IMAGE = os.getenv("REDROID_IMAGE", "redroid/redroid:11.0.0-latest")

# สร้าง APIRouter สำหรับทุกเส้นทางที่ขึ้นต้นด้วย /api
api_router = APIRouter(prefix="/api")

# Setup CORS
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:8000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Docker client เพื่อสั่งงาน container โดยตรง
try:
    client = docker.from_env()
except Exception as e:
    client = None
    print(f"Error initializing Docker client: {e}")

# ============================================================
# Dependency: ตรวจสอบว่า current user มี role เป็น admin
# ============================================================
def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ADMIN_ONLY: Insufficient permissions"
        )
    return current_user

# NOTE: เอา include_router ออกจากที่นี่ก่อน
# จะ include หลังจาก static files setup เพื่อให้แน่ใจว่า API routes ถูก register ก่อน catch-all

# ============================================================
# Pydantic Schemas
# ============================================================
class DeviceCreate(BaseModel):
    name: str
    port: int

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"

class UserUpdate(BaseModel):
    # อนุญาตให้ส่งมาแค่บางฟิลด์ได้
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None

class ChangePasswordSelf(BaseModel):
    # schema สำหรับ user เปลี่ยน password ตัวเอง
    current_password: str
    new_password: str

class DeviceAssignment(BaseModel):
    device_name: str

# ============================================================
# Startup: สร้าง table และ default admin user
# ============================================================
@app.on_event("startup")
def on_startup():
    try:
        Base.metadata.create_all(bind=engine)
        db = next(get_db())
        admin = db.query(User).filter(User.username == "root").first()
        if not admin:
            hashed_pw = get_password_hash("root")
            # default admin ต้อง role=admin เสมอ
            new_admin = User(username="root", hashed_password=hashed_pw, role="admin", is_active=True)
            db.add(new_admin)
            db.commit()
            print("Default admin user created (root/root)")
    except Exception as e:
        print(f"Database initialization failed: {e}")

# ============================================================
# Auth
# ============================================================
@api_router.post("/login")
def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )
    
    # สร้าง token ให้มีอายุ 7 วันเท่ากับ cookie
    expires_delta = timedelta(days=7)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=expires_delta
    )
    
    # SEC-004: ส่ง JWT ผ่าน HttpOnly Cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=60 * 24 * 7 * 60,
        expires=60 * 24 * 7 * 60,
        samesite="lax",
        secure=False 
    )
    
    return {"status": "success", "username": user.username, "role": user.role}

@api_router.post("/logout")
@api_router.get("/logout") # รองรับ GET เผื่อกรณีมีการ redirect หรือเรียกผ่าน browser
def logout(response: Response):
    """ลบ HttpOnly Cookie เพื่อทำการ logout"""
    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    return {"status": "success", "message": "Logged out successfully"}

@api_router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """ดึงข้อมูล user ปัจจุบัน"""
    return {
        "status": "success", 
        "data": {
            "username": current_user.username,
            "role": current_user.role
        }
    }

# ============================================================
# User Management (admin only)
# ============================================================
@api_router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin)
):
    """ดึงรายการ users ทั้งหมด — เฉพาะ admin"""
    users = db.query(User).all()
    return {
        "status": "success",
        "data": [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "is_active": u.is_active
            }
            for u in users
        ]
    }

@api_router.post("/users", status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin)
):
    """สร้าง user ใหม่ — เฉพาะ admin"""
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail=f"Username '{payload.username}' already exists")

    if payload.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")

    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    new_user = User(
        username=payload.username,
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"status": "success", "message": f"User '{payload.username}' created", "id": new_user.id}

@api_router.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """แก้ไข role / password / สถานะของ user — เฉพาะ admin"""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is not None:
        if payload.role not in ("admin", "viewer"):
            raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")
        if target.id == admin.id and payload.role != "admin":
            raise HTTPException(status_code=400, detail="Cannot demote yourself")
        target.role = payload.role

    if payload.password is not None:
        if len(payload.password) < 4:
            raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
        target.hashed_password = get_password_hash(payload.password)

    if payload.is_active is not None:
        if target.id == admin.id and not payload.is_active:
            raise HTTPException(status_code=400, detail="Cannot disable yourself")
        target.is_active = payload.is_active

    db.commit()
    return {"status": "success", "message": f"User '{target.username}' updated"}

@api_router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """ลบ user — เฉพาะ admin และห้ามลบตัวเอง"""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    db.delete(target)
    db.query(UserDevice).filter(UserDevice.user_id == user_id).delete()
    db.commit()
    return {"status": "success", "message": f"User '{target.username}' deleted"}

@api_router.get("/users/{user_id}/assignments")
def list_user_assignments(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin)
):
    """ดูรายการเครื่องที่ User คนนี้ได้รับสิทธิ์"""
    assignments = db.query(UserDevice).filter(UserDevice.user_id == user_id).all()
    return {"status": "success", "data": [a.device_name for a in assignments]}

@api_router.post("/users/{user_id}/assignments")
def assign_device(
    user_id: int,
    payload: DeviceAssignment,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin)
):
    """มอบสิทธิ์การเข้าถึงเครื่องให้ User"""
    existing = db.query(UserDevice).filter(
        UserDevice.user_id == user_id, 
        UserDevice.device_name == payload.device_name
    ).first()
    if existing:
        return {"status": "success", "message": "Already assigned"}
    
    new_assign = UserDevice(user_id=user_id, device_name=payload.device_name)
    db.add(new_assign)
    db.commit()
    return {"status": "success", "message": f"Assigned '{payload.device_name}' to user"}

@api_router.delete("/users/{user_id}/assignments/{device_name}")
def unassign_device(
    user_id: int,
    device_name: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin)
):
    """ยกเลิกสิทธิ์การเข้าถึงเครื่อง"""
    db.query(UserDevice).filter(
        UserDevice.user_id == user_id, 
        UserDevice.device_name == device_name
    ).delete()
    db.commit()
    return {"status": "success", "message": "Unassigned"}

@api_router.put("/users/me/password")
def change_own_password(
    payload: ChangePasswordSelf,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """user เปลี่ยน password ตัวเอง"""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")

    current_user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    return {"status": "success", "message": "Password changed successfully"}

@api_router.get("/devices")
def get_devices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """ดึงรายการ Redroid containers"""
    if not client:
        return {"status": "error", "message": "Docker client not connected"}

    allowed_names = []
    if current_user.role != "admin":
        assignments = db.query(UserDevice).filter(UserDevice.user_id == current_user.id).all()
        allowed_names = [a.device_name for a in assignments]

    devices = []
    try:
        containers = client.containers.list(all=True)
        
        # รายชื่อ keyword ที่บ่งบอกว่าเป็น container ของระบบจัดการ ไม่ใช่ Android
        SYSTEM_KEYWORDS = [
            "redroid-manager", "ws-scrcpy", "mariadb", "mysql",
            "nginx", "postgres", "redis", "mongo"
        ]
        
        for c in containers:
            if current_user.role != "admin" and c.name not in allowed_names:
                continue
                
            try:
                image_name = c.attrs.get('Config', {}).get('Image', '')
                
                # ข้าม container ระบบ — เช็คทั้ง image name และ container name
                is_system = any(kw in c.name.lower() for kw in SYSTEM_KEYWORDS)
                is_system = is_system or any(kw in image_name.lower() for kw in ["ws-scrcpy", "mariadb", "nginx"])
                if is_system:
                    continue

                # เป็น Android container ถ้า image มีคำว่า redroid
                if 'redroid' not in image_name.lower():
                    continue

                ports = c.ports
                adb_port = None
                if '5555/tcp' in ports and ports['5555/tcp']:
                    adb_port = ports['5555/tcp'][0]['HostPort']

                container_ip = ""
                networks = c.attrs.get('NetworkSettings', {}).get('Networks', {})
                if networks:
                    container_ip = list(networks.values())[0].get('IPAddress', '')

                devices.append({
                    "id": c.id[:12],
                    "name": c.name,
                    "status": c.status,
                    "port": adb_port,
                    "ip": container_ip,
                    "image": image_name
                })
            except Exception:
                continue

        return {"status": "success", "data": devices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# Helper: Auto connect logic
# ============================================================
async def auto_connect_new_device(device_id: str):
    """ฟังก์ชันทำงานในพื้นหลังเพื่อรอให้ Android พร้อมและสั่ง ADB connect อัตโนมัติ"""
    if not client:
        return
        
    try:
        # รอประมาณ 10 วินาทีเพื่อให้ Android บูต ADB Daemon ขึ้นมา
        await asyncio.sleep(10)
        
        container = client.containers.get(device_id)
        networks = container.attrs.get('NetworkSettings', {}).get('Networks', {})
        target_ip = None
        if networks:
            target_ip = list(networks.values())[0].get('IPAddress')
            
        if not target_ip:
            return

        # ค้นหา ws-scrcpy container
        ws_scrcpy = next((c for c in client.containers.list() if 'ws-scrcpy' in c.name), None)
        if ws_scrcpy:
            # พยายามต่อ ADB (อาจจะลองซ้ำ 2 ครั้งเผื่อเครื่องยังไม่พร้อม)
            for _ in range(2):
                exit_code, output = ws_scrcpy.exec_run(f"adb connect {target_ip}:5555")
                if exit_code == 0 and b"connected to" in output:
                    print(f"AUTO_CONNECT: Success for {target_ip}")
                    break
                await asyncio.sleep(5)
                
    except Exception as e:
        print(f"AUTO_CONNECT: Failed for {device_id} - {e}")

@api_router.post("/devices")
def create_device(device: DeviceCreate, background_tasks: BackgroundTasks, current_user: User = Depends(require_admin)):
    """สร้าง Redroid container ใหม่"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        existing = [c for c in client.containers.list(all=True) if c.name == device.name]
        if existing:
            raise HTTPException(status_code=400, detail=f"Container name '{device.name}' already exists")

        container = client.containers.run(
            REDROID_IMAGE,
            command=["androidboot.redroid_gpu_mode=guest", "qemu=1", "androidboot.use_memfd=1"],
            name=device.name,
            ports={'5555/tcp': device.port},
            network="redroid-manager_redroid_net",
            privileged=True,
            detach=True,
            tty=True,
            stdin_open=True,
            volumes={
                '/dev/binderfs': {'bind': '/dev/binderfs', 'mode': 'rw'}
            }
        )
        
        # เพิ่ม background task เพื่อสั่ง connect อัตโนมัติ
        background_tasks.add_task(auto_connect_new_device, container.id)
        
        return {"status": "success", "message": f"Device '{device.name}' created and auto-connecting", "id": container.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/devices/{device_id}")
def delete_device(device_id: str, current_user: User = Depends(require_admin)):
    """ลบ Redroid container"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        container = client.containers.get(device_id)
        
        # ป้องกันการลบ container หลักของระบบ
        if "redroid-manager" in container.name or "ws-scrcpy" in container.name or "mariadb" in container.name:
            raise HTTPException(status_code=403, detail="SYSTEM_CONTAINER: ไม่สามารถลบ container ของระบบได้")
            
        container.stop()
        container.remove()
        return {"status": "success", "message": f"Device {device_id} deleted"}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Device not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/devices/{device_id}/connect")
def connect_ws_scrcpy(
    device_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """เชื่อมต่อ ADB ผ่าน ws-scrcpy"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        target_container = client.containers.get(device_id)
        if current_user.role != "admin":
            has_permission = db.query(UserDevice).filter(
                UserDevice.user_id == current_user.id,
                UserDevice.device_name == target_container.name
            ).first()
            if not has_permission:
                raise HTTPException(status_code=403, detail="ACCESS_DENIED")

        target_ip = None
        networks = target_container.attrs['NetworkSettings']['Networks']
        if networks:
            target_ip = list(networks.values())[0]['IPAddress']

        if not target_ip:
            raise HTTPException(status_code=400, detail="Could not determine container IP")

        ws_scrcpy = next((c for c in client.containers.list() if 'ws-scrcpy' in c.name), None)
        if not ws_scrcpy:
            raise HTTPException(status_code=404, detail="ws-scrcpy container not found")

        exit_code, output = ws_scrcpy.exec_run(f"adb connect {target_ip}:5555")
        return {"status": "success", "message": output.decode('utf-8')}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/devices/{device_id}/install-apk")
async def install_apk(
    device_id: str,
    apk_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """อัปโหลดและติดตั้ง APK โดยตรงบน Redroid container ผ่าน pm install (ไม่ต้องใช้ ws-scrcpy)"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    if not apk_file.filename.lower().endswith('.apk'):
        raise HTTPException(status_code=400, detail="File must be an .apk file")

    try:
        target_container = client.containers.get(device_id)

        # ตรวจสอบว่า container กำลัง running
        if target_container.status != "running":
            raise HTTPException(status_code=400, detail="Device is not running")

        # ตรวจสอบ permission สำหรับ non-admin
        if current_user.role != "admin":
            has_permission = db.query(UserDevice).filter(
                UserDevice.user_id == current_user.id,
                UserDevice.device_name == target_container.name
            ).first()
            if not has_permission:
                raise HTTPException(status_code=403, detail="ACCESS_DENIED")

        # อ่านไฟล์ APK
        apk_data = await apk_file.read()
        if len(apk_data) == 0:
            raise HTTPException(status_code=400, detail="APK file is empty")

        safe_filename = "install_target.apk"
        remote_dir  = "/data/local/tmp"
        remote_path = f"{remote_dir}/{safe_filename}"

        loop = asyncio.get_event_loop()

        def _do_install():
            # 1. Copy APK เข้า Redroid container โดยตรง
            tar_stream = io.BytesIO()
            with tarfile.open(fileobj=tar_stream, mode='w') as tar:
                info = tarfile.TarInfo(name=safe_filename)
                info.size = len(apk_data)
                tar.addfile(info, io.BytesIO(apk_data))
            tar_stream.seek(0)
            target_container.put_archive(remote_dir, tar_stream)

            # 2. รัน pm install ตรงใน Redroid container (Android Package Manager)
            exit_code, output = target_container.exec_run(
                f"pm install -r {remote_path}",
                socket=False, demux=False
            )

            # 3. ลบไฟล์ temp
            target_container.exec_run(f"rm -f {remote_path}")

            return exit_code, output

        # รันบน thread pool เพื่อไม่บล็อก async event loop
        exit_code, output = await loop.run_in_executor(None, _do_install)

        result_text = (output or b"").decode('utf-8', errors='replace').strip()

        if exit_code != 0 or "Failure" in result_text:
            raise HTTPException(
                status_code=500,
                detail=f"pm install failed: {result_text}"
            )

        return {
            "status": "success",
            "message": result_text or "APK installed successfully"
        }

    except HTTPException:
        raise
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Device not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Register API routes ก่อน static files เสมอ เพื่อป้องกัน catch-all ดักจับ API requests
app.include_router(api_router)

frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    # Mount static assets (js, css, images) ด้วย path เฉพาะเจาะจง
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        # ปฏิเสธทุก path ที่ขึ้นต้นด้วย "api" — ควรถูก handle โดย api_router แล้ว
        # ถ้ายังมาถึงที่นี่ได้แสดงว่า endpoint นั้นไม่มีอยู่จริง
        clean_path = full_path.lstrip("/")
        if clean_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API route not found")

        # ถ้าเป็น static file ที่มีอยู่จริงให้ serve ตรงๆ
        path_to_file = os.path.join(frontend_dist, full_path)
        if os.path.isfile(path_to_file):
            return FileResponse(path_to_file)

        # fallback → ส่ง index.html ให้ React Router จัดการ (SPA routing)
        return FileResponse(os.path.join(frontend_dist, "index.html"))

if __name__ == "__main__":
    import uvicorn
    # SEC-010: ปรับ reload ตาม environment
    is_dev = os.getenv("ENVIRONMENT") == "development"
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=is_dev)
