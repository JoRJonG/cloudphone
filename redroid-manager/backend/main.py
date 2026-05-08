from fastapi import FastAPI, HTTPException, status, Depends, Response, APIRouter, UploadFile, File, BackgroundTasks, WebSocket, WebSocketDisconnect
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
import subprocess
import sys
import time
from functools import partial

from .database import get_db, engine, Base, SessionLocal
from .models import User, UserDevice
from .auth import get_password_hash, verify_password, create_access_token, get_current_user, should_use_secure_cookie

# โหลดค่าจาก .env (ถ้ามี)
try:
    # pyrefly: ignore [missing-import]
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
    android_version: Optional[str] = "11.0.0"
    features: Optional[List[str]] = [] # gapps, magisk, ndk, widevine

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
    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
        admin = db.query(User).filter(User.role == "admin").first()
        if not admin:
            bootstrap_username = os.getenv("INITIAL_ADMIN_USERNAME")
            bootstrap_password = os.getenv("INITIAL_ADMIN_PASSWORD")
            if not bootstrap_username or not bootstrap_password:
                raise RuntimeError(
                    "No admin user found. Set INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD before first startup."
                )
            if len(bootstrap_password) < 12:
                raise RuntimeError("INITIAL_ADMIN_PASSWORD must be at least 12 characters")
            new_admin = User(
                username=bootstrap_username,
                hashed_password=get_password_hash(bootstrap_password),
                role="admin",
                is_active=True,
            )
            db.add(new_admin)
            db.commit()
            print(f"Bootstrap admin user created ({bootstrap_username})")
    except Exception as e:
        print(f"Database initialization failed: {e}")
        raise
    finally:
        db.close()

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
        secure=should_use_secure_cookie()
    )
    
    return {"status": "success", "username": user.username, "role": user.role}

@api_router.post("/logout")
@api_router.get("/logout") # รองรับ GET เผื่อกรณีมีการ redirect หรือเรียกผ่าน browser
def logout(response: Response):
    """ลบ HttpOnly Cookie เพื่อทำการ logout"""
    response.delete_cookie(key="access_token", httponly=True, samesite="lax", secure=should_use_secure_cookie())
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

SYSTEM_KEYWORDS = [
    "redroid-manager", "ws-scrcpy", "mariadb", "mysql",
    "nginx", "postgres", "redis", "mongo"
]


def get_allowed_device_names(db: Session, current_user: User):
    if current_user.role == "admin":
        return None
    assignments = db.query(UserDevice).filter(UserDevice.user_id == current_user.id).all()
    return {a.device_name for a in assignments}


def is_managed_redroid_container(container):
    image_name = container.attrs.get("Config", {}).get("Image", "")
    is_system = any(kw in container.name.lower() for kw in SYSTEM_KEYWORDS)
    is_system = is_system or any(kw in image_name.lower() for kw in ["ws-scrcpy", "mariadb", "nginx"])
    if is_system:
        return False
    return "redroid" in image_name.lower()


def get_container_ip(container):
    networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
    if not networks:
        return ""
    return list(networks.values())[0].get("IPAddress", "")


def get_container_port(container):
    ports = container.ports
    if "5555/tcp" in ports and ports["5555/tcp"]:
        return ports["5555/tcp"][0].get("HostPort")
    return None


def get_ws_scrcpy_container(include_stopped=False):
    containers = client.containers.list(all=include_stopped)
    return next((c for c in containers if "ws-scrcpy" in c.name), None)


def get_adb_devices(ws_scrcpy_container):
    if not ws_scrcpy_container or ws_scrcpy_container.status != "running":
        return {}, ""

    exit_code, output = ws_scrcpy_container.exec_run("adb devices")
    raw_output = (output or b"").decode("utf-8", errors="replace").strip()
    if exit_code != 0:
        return {}, raw_output

    devices = {}
    for line in raw_output.splitlines():
        clean_line = line.strip()
        if not clean_line or clean_line.lower().startswith("list of devices"):
            continue
        if "\t" not in clean_line:
            continue
        serial, state = clean_line.split("\t", 1)
        devices[serial.strip()] = state.strip()
    return devices, raw_output


def build_device_payload(container, ws_scrcpy_running, adb_devices):
    image_name = container.attrs.get("Config", {}).get("Image", "")
    container_ip = get_container_ip(container)
    adb_serial = f"{container_ip}:5555" if container_ip else None
    adb_state = adb_devices.get(adb_serial, "disconnected") if adb_serial else "disconnected"
    is_running = container.status == "running"
    has_ip = bool(container_ip)
    adb_connected = adb_state == "device"
    stream_ready = is_running and has_ip and adb_connected and ws_scrcpy_running

    if not is_running:
        runtime_stage = "stopped"
    elif not has_ip:
        runtime_stage = "booting"
    elif adb_connected and ws_scrcpy_running:
        runtime_stage = "stream_ready"
    elif adb_connected:
        runtime_stage = "adb_connected"
    else:
        runtime_stage = "running"

    status_labels = {
        "stopped": "Stopped",
        "booting": "Booting",
        "running": "Running",
        "adb_connected": "ADB Connected",
        "stream_ready": "Stream Ready",
    }

    available_actions = []
    if is_running:
        available_actions.extend(["stop", "restart", "connect"])
    else:
        available_actions.append("start")
    available_actions.append("delete")
    if is_running:
        available_actions.append("install_apk")

    return {
        "id": container.id[:12],
        "name": container.name,
        "status": container.status,
        "runtime_stage": runtime_stage,
        "status_label": status_labels.get(runtime_stage, container.status.title()),
        "port": get_container_port(container),
        "ip": container_ip,
        "image": image_name,
        "adb_serial": adb_serial,
        "adb_state": adb_state,
        "started_at": container.attrs.get("State", {}).get("StartedAt"),
        "available_actions": available_actions,
        "checks": {
            "container_running": is_running,
            "has_ip": has_ip,
            "adb_connected": adb_connected,
            "ws_scrcpy_running": ws_scrcpy_running,
            "stream_ready": stream_ready,
        }
    }


def get_device_by_id(device_id: str):
    container = client.containers.get(device_id)
    if not is_managed_redroid_container(container):
        raise HTTPException(status_code=404, detail="Device not found")
    return container


def ensure_device_access(db: Session, current_user: User, container):
    if current_user.role == "admin":
        return
    has_permission = db.query(UserDevice).filter(
        UserDevice.user_id == current_user.id,
        UserDevice.device_name == container.name
    ).first()
    if not has_permission:
        raise HTTPException(status_code=403, detail="ACCESS_DENIED")


@api_router.get("/devices")
def get_devices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """ดึงรายการ Redroid containers"""
    if not client:
        return {"status": "error", "message": "Docker client not connected"}

    allowed_names = get_allowed_device_names(db, current_user)
    devices = []
    try:
        ws_scrcpy = get_ws_scrcpy_container(include_stopped=True)
        ws_scrcpy_running = bool(ws_scrcpy and ws_scrcpy.status == "running")
        adb_devices, _ = get_adb_devices(ws_scrcpy)
        containers = client.containers.list(all=True)

        for container in containers:
            if allowed_names is not None and container.name not in allowed_names:
                continue
            if not is_managed_redroid_container(container):
                continue

            try:
                devices.append(build_device_payload(container, ws_scrcpy_running, adb_devices))
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
        
        container = get_device_by_id(device_id)
        target_ip = get_container_ip(container)

        if not target_ip:
            return

        # ค้นหา ws-scrcpy container
        ws_scrcpy = get_ws_scrcpy_container()
        if ws_scrcpy:
            # พยายามต่อ ADB (อาจจะลองซ้ำ 2 ครั้งเผื่อเครื่องยังไม่พร้อม)
            for _ in range(2):
                exit_code, output = ws_scrcpy.exec_run(f"adb connect {target_ip}:5555")
                message = (output or b"").decode("utf-8", errors="replace").lower()
                if exit_code == 0 and ("connected to" in message or "already connected to" in message):
                    print(f"AUTO_CONNECT: Success for {target_ip}")
                    break
                await asyncio.sleep(5)
                
    except Exception as e:
        print(f"AUTO_CONNECT: Failed for {device_id} - {e}")

# ============================================================
# Helper: Image Building (redroid-script)
# ============================================================
def get_or_build_custom_image(android_version: str, features: List[str]):
    """เรียกใช้ redroid-script เพื่อ build image ตามฟีเจอร์ที่ต้องการ"""
    if not features:
        return f"redroid/redroid:{android_version}-latest"

    # กรองเฉพาะฟีเจอร์ที่รองรับ
    valid_features = [f for f in features if f in ["gapps", "magisk", "ndk", "widevine", "litegapps", "mindthegapps", "houdini"]]
    if not valid_features:
        return f"redroid/redroid:{android_version}-latest"

    # สร้างชื่อ image tag ตามมาตรฐานของ script (เรียงตามลำดับที่ script ทำงาน)
    # ลำดับใน redroid.py: android -> gapps -> ndk -> houdini -> magisk -> widevine
    tags = [android_version]
    if "gapps" in valid_features: tags.append("gapps")
    if "litegapps" in valid_features: tags.append("litegapps")
    if "mindthegapps" in valid_features: tags.append("mindthegapps")
    if "ndk" in valid_features: tags.append("ndk")
    if "houdini" in valid_features: tags.append("houdini")
    if "magisk" in valid_features: tags.append("magisk")
    if "widevine" in valid_features: tags.append("widevine")
    
    new_tag = "_".join(tags)
    new_image_name = f"redroid/redroid:{new_tag}"

    # ตรวจสอบว่ามี image อยู่แล้วหรือไม่
    try:
        client.images.get(new_image_name)
        print(f"IMAGE_EXISTS: {new_image_name}")
        return new_image_name
    except docker.errors.ImageNotFound:
        print(f"BUILDING_IMAGE: {new_image_name}...")

    # เตรียม arguments สำหรับ script
    script_path = os.path.join(os.path.dirname(__file__), "redroid_script", "redroid.py")
    cmd = [sys.executable, script_path, "-a", android_version]
    
    if "gapps" in valid_features: cmd.append("-g")
    if "magisk" in valid_features: cmd.append("-m")
    if "ndk" in valid_features: cmd.append("-n")
    if "widevine" in valid_features: cmd.append("-w")
    if "litegapps" in valid_features: cmd.append("-lg")
    if "mindthegapps" in valid_features: cmd.append("-mtg")
    if "houdini" in valid_features: cmd.append("-i")

    # ตั้งค่า environment เพื่อให้ script ไม่พังเรื่อง USER/home
    env = os.environ.copy()
    if "USER" not in env: env["USER"] = "root"
    if "HOME" not in env: env["HOME"] = "/root"

    try:
        # รัน build script
        # หมายเหตุ: script นี้จะสร้าง Dockerfile และรัน docker build ใน directory ที่มันอยู่
        process = subprocess.run(
            cmd, 
            cwd=os.path.dirname(script_path),
            env=env,
            capture_output=True,
            text=True
        )
        
        # Log output เพื่อการตรวจสอบ
        if process.stdout:
            print(f"BUILD_STDOUT: {process.stdout}")
        if process.stderr:
            print(f"BUILD_STDERR: {process.stderr}")

        if process.returncode != 0:
            raise Exception(f"Script returned non-zero code {process.returncode}: {process.stderr}")
        
        # ตรวจสอบอีกครั้งว่า image ถูกสร้างขึ้นจริงหรือไม่
        try:
            client.images.get(new_image_name)
            print(f"BUILD_SUCCESS: {new_image_name}")
            return new_image_name
        except docker.errors.ImageNotFound:
            raise Exception(f"Script finished but image '{new_image_name}' was not found in Docker. Output: {process.stdout}")

    except Exception as e:
        print(f"BUILD_EXCEPTION: {e}")
        raise e

@api_router.post("/devices")
def create_device(device: DeviceCreate, background_tasks: BackgroundTasks, current_user: User = Depends(require_admin)):
    """สร้าง Redroid container ใหม่ (รองรับการ build image อัตโนมัติ)"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        existing = [c for c in client.containers.list(all=True) if c.name == device.name]
        if existing:
            raise HTTPException(status_code=400, detail=f"Container name '{device.name}' already exists")

        # 1. จัดเตรียม Image
        try:
            target_image = get_or_build_custom_image(device.android_version, device.features)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Image preparation failed: {str(e)}")

        # 2. จัดเตรียม Boot arguments และ ro.* properties
        # properties พื้นฐาน
        boot_args = ["androidboot.redroid_gpu_mode=guest", "qemu=1", "androidboot.use_memfd=1"]
        
        # เพิ่ม properties สำหรับ ARM translation ถ้ามีการเลือก NDK
        if "ndk" in device.features:
            boot_args.extend([
                "ro.product.cpu.abilist=x86_64,arm64-v8a,x86,armeabi-v7a,armeabi",
                "ro.product.cpu.abilist64=x86_64,arm64-v8a",
                "ro.product.cpu.abilist32=x86,armeabi-v7a,armeabi",
                "ro.dalvik.vm.isa.arm=x86",
                "ro.dalvik.vm.isa.arm64=x86_64",
                "ro.enable.native.bridge.exec=1",
                "ro.vendor.enable.native.bridge.exec=1",
                "ro.vendor.enable.native.bridge.exec64=1",
                "ro.dalvik.vm.native.bridge=libndk_translation.so",
                "ro.ndk_translation.version=0.2.3"
            ])

        container = client.containers.run(
            target_image,
            command=boot_args,
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
        
        return {"status": "success", "message": f"Device '{device.name}' created using {target_image}", "id": container.id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/devices/{device_id}/start")
def start_device(device_id: str, background_tasks: BackgroundTasks, current_user: User = Depends(require_admin)):
    """Start a stopped Redroid container"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        container = get_device_by_id(device_id)
        if container.status == "running":
            return {"status": "success", "message": f"Device {container.name} is already running"}

        container.start()
        background_tasks.add_task(auto_connect_new_device, container.id)
        return {"status": "success", "message": f"Device {container.name} started"}
    except HTTPException:
        raise
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Device not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/devices/{device_id}/stop")
def stop_device(device_id: str, current_user: User = Depends(require_admin)):
    """Stop a running Redroid container"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        container = get_device_by_id(device_id)
        if container.status != "running":
            return {"status": "success", "message": f"Device {container.name} is already stopped"}

        container.stop()
        return {"status": "success", "message": f"Device {container.name} stopped"}
    except HTTPException:
        raise
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Device not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/devices/{device_id}/restart")
def restart_device(device_id: str, background_tasks: BackgroundTasks, current_user: User = Depends(require_admin)):
    """Restart a Redroid container"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        container = get_device_by_id(device_id)
        container.restart(timeout=10)
        background_tasks.add_task(auto_connect_new_device, container.id)
        return {"status": "success", "message": f"Device {container.name} restarted"}
    except HTTPException:
        raise
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Device not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/devices/{device_id}")
def delete_device(device_id: str, current_user: User = Depends(require_admin)):
    """ลบ Redroid container"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        container = get_device_by_id(device_id)
        
        # ป้องกันการลบ container หลักของระบบ
        if "redroid-manager" in container.name or "ws-scrcpy" in container.name or "mariadb" in container.name:
            raise HTTPException(status_code=403, detail="SYSTEM_CONTAINER: ไม่สามารถลบ container ของระบบได้")
            
        container.stop()
        container.remove()
        return {"status": "success", "message": f"Device {device_id} deleted"}
    except HTTPException:
        raise
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Device not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/devices/{device_id}/diagnostics")
def get_device_diagnostics(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return health checks and recent logs for a device"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        container = get_device_by_id(device_id)
        ensure_device_access(db, current_user, container)

        ws_scrcpy = get_ws_scrcpy_container(include_stopped=True)
        ws_scrcpy_running = bool(ws_scrcpy and ws_scrcpy.status == "running")
        adb_devices, adb_raw_output = get_adb_devices(ws_scrcpy)
        payload = build_device_payload(container, ws_scrcpy_running, adb_devices)
        container_logs = (container.logs(tail=80) or b"").decode("utf-8", errors="replace")

        ws_logs = ""
        if ws_scrcpy:
            ws_logs = (ws_scrcpy.logs(tail=20) or b"").decode("utf-8", errors="replace")

        return {
            "status": "success",
            "data": {
                "device": payload,
                "checks": payload["checks"],
                "adb_raw_output": adb_raw_output,
                "container_logs": container_logs,
                "ws_scrcpy_running": ws_scrcpy_running,
                "ws_scrcpy_logs": ws_logs,
            }
        }
    except HTTPException:
        raise
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
        target_container = get_device_by_id(device_id)
        ensure_device_access(db, current_user, target_container)

        if target_container.status != "running":
            raise HTTPException(status_code=400, detail="Device is not running")

        target_ip = get_container_ip(target_container)

        if not target_ip:
            raise HTTPException(status_code=400, detail="Could not determine container IP")

        ws_scrcpy = get_ws_scrcpy_container()
        if not ws_scrcpy:
            raise HTTPException(status_code=404, detail="ws-scrcpy container not found")

        exit_code, output = ws_scrcpy.exec_run(f"adb connect {target_ip}:5555")
        message = (output or b"").decode("utf-8", errors="replace")
        if exit_code != 0 and "already connected to" not in message.lower():
            raise HTTPException(status_code=502, detail=message or "ADB connect failed")
        return {"status": "success", "message": message}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Thumbnail / Snapshot cache
# ============================================================
# in-memory cache: device_id -> (jpeg_bytes, timestamp)
_thumbnail_cache: dict = {}
THUMBNAIL_TTL = 3.0  # �Թҷ� � ��ͧ�ѹ hammer �ҡ client ���µ��

@api_router.get("/devices/{device_id}/thumbnail")
async def get_device_thumbnail(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """�׹ JPEG snapshot �ͧ˹�Ҩ� Redroid container ��ҹ adb screencap
    ������Ѻ Preview Wall � �ҡ��� iframe �ҡ"""
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not connected")

    try:
        container = get_device_by_id(device_id)
        ensure_device_access(db, current_user, container)

        if container.status != "running":
            raise HTTPException(status_code=503, detail="Device not running")

        # ��Ǩ cache ��͹
        cached = _thumbnail_cache.get(device_id)
        if cached:
            jpeg_bytes, cached_at = cached
            if time.monotonic() - cached_at < THUMBNAIL_TTL:
                return Response(
                    content=jpeg_bytes,
                    media_type="image/jpeg",
                    headers={"Cache-Control": f"max-age={int(THUMBNAIL_TTL)}"}
                )

        # �֧ IP �ͧ container
        container_ip = get_container_ip(container)
        if not container_ip:
            raise HTTPException(status_code=503, detail="Device has no IP yet")

        adb_serial = f"{container_ip}:5555"

        # �ѹ adb screencap ��ҹ ws-scrcpy container
        ws_scrcpy = get_ws_scrcpy_container()
        if not ws_scrcpy or ws_scrcpy.status != "running":
            raise HTTPException(status_code=503, detail="ws-scrcpy not running")

        loop = asyncio.get_event_loop()

        def _capture():
            exit_code, raw = ws_scrcpy.exec_run(
                f"adb -s {adb_serial} exec-out screencap -p",
                demux=False
            )
            if exit_code != 0 or not raw:
                return None
            return raw

        png_bytes = await loop.run_in_executor(None, _capture)
        if not png_bytes or len(png_bytes) < 100:
            raise HTTPException(status_code=503, detail="screencap failed or device not ready")

        # �ŧ PNG  JPEG ���� Pillow ����Ŵ size
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(png_bytes))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=70, optimize=True)
            jpeg_bytes = buf.getvalue()
        except Exception:
            # ��� Pillow �ѧ �� PNG ��Ѻ�᷹
            jpeg_bytes = png_bytes

        # �ѹ�֡ cache
        _thumbnail_cache[device_id] = (jpeg_bytes, time.monotonic())

        return Response(
            content=jpeg_bytes,
            media_type="image/jpeg",
            headers={"Cache-Control": f"max-age={int(THUMBNAIL_TTL)}"}
        )

    except HTTPException:
        raise
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Device not found")
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
        target_container = get_device_by_id(device_id)

        # ตรวจสอบว่า container กำลัง running
        if target_container.status != "running":
            raise HTTPException(status_code=400, detail="Device is not running")

        # ตรวจสอบ permission สำหรับ non-admin
        ensure_device_access(db, current_user, target_container)

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



# ============================================================
# WebSocket Proxy: /api/stream/ → ws://ws-scrcpy:8000/
# Forward query string ทั้งหมดไปด้วย (action, udid, remote)
# เพื่อให้ ws-scrcpy รู้ว่าต้องการ stream ไปที่ device ใด
# ============================================================
import websockets

@app.websocket("/api/stream/")
async def ws_scrcpy_proxy(websocket: WebSocket):
    """Proxy WebSocket ไปยัง ws-scrcpy พร้อม forward query string"""
    # รับ query string จาก client (เช่น ?action=proxy-adb&udid=...&remote=tcp:8886)
    query_string = websocket.scope.get("query_string", b"").decode("utf-8")
    upstream_url = "ws://ws-scrcpy:8000/"
    if query_string:
        upstream_url = f"ws://ws-scrcpy:8000/?{query_string}"

    await websocket.accept()
    client_info = websocket.client
    print(f"[WS-PROXY] Client: {client_info} → Upstream: {upstream_url}")

    try:
        async with websockets.connect(upstream_url) as upstream:
            print(f"[WS-PROXY] Connected to upstream: {upstream_url}")

            async def client_to_upstream():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await upstream.send(data)
                except (WebSocketDisconnect, Exception):
                    pass

            async def upstream_to_client():
                try:
                    async for message in upstream:
                        if isinstance(message, bytes):
                            await websocket.send_bytes(message)
                        else:
                            await websocket.send_text(message)
                except Exception as e:
                    print(f"[WS-PROXY] upstream_to_client error: {e}")

            await asyncio.gather(
                client_to_upstream(),
                upstream_to_client(),
                return_exceptions=True
            )
    except Exception as e:
        print(f"[WS-PROXY] Connection error: {e}")
    finally:
        print(f"[WS-PROXY] Session closed for {client_info}")
        try:
            await websocket.close()
        except Exception:
            pass

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ============================================================
# HTTP Reverse Proxy: /api/stream/{path} → http://ws-scrcpy:8000/{path}
# Serve ws-scrcpy UI ผ่าน backend เพื่อไม่ต้องเปิด port 8001 สู่ public
# ทุก request ต้องผ่าน authentication ของ backend ก่อน
# ============================================================
@api_router.get("/stream/{file_path:path}")
async def proxy_scrcpy_file(
    file_path: str,
    current_user: User = Depends(get_current_user)
):
    """Proxy ws-scrcpy static files (ต้อง login ก่อน)"""
    import httpx
    upstream = f"http://ws-scrcpy:8000/{file_path}"
    try:
        async with httpx.AsyncClient() as http:
            resp = await http.get(upstream, follow_redirects=True)
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/octet-stream"),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ws-scrcpy unavailable: {e}")

@api_router.get("/stream")
async def proxy_scrcpy_index(current_user: User = Depends(get_current_user)):
    """Proxy ws-scrcpy index page พร้อม rewrite relative asset paths (ต้อง login ก่อน)"""
    import httpx
    import re
    try:
        async with httpx.AsyncClient() as http:
            resp = await http.get("http://ws-scrcpy:8000/", follow_redirects=True)

        html = resp.content.decode("utf-8", errors="replace")

        # Rewrite relative asset URLs ให้ชี้ผ่าน /api/stream/
        # เช่น href="main.css" → href="/api/stream/main.css"
        # เช่น src="bundle.js" → src="/api/stream/bundle.js"
        def rewrite_attr(m):
            attr, val = m.group(1), m.group(2)
            # ข้ามถ้าเป็น absolute URL หรือ data URI หรือ hash
            if val.startswith(('http://', 'https://', '//', 'data:', '#')):
                return m.group(0)
            # ข้าม path ที่ขึ้นต้นด้วย / แล้ว (absolute path)
            if val.startswith('/'):
                return f'{attr}="/api/stream{val}"'
            return f'{attr}="/api/stream/{val}"'

        html = re.sub(r'((?:href|src)=")([^"]*)"', rewrite_attr, html)

        return Response(
            content=html.encode("utf-8"),
            status_code=resp.status_code,
            media_type="text/html; charset=utf-8",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ws-scrcpy unavailable: {e}")

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
