# Redroid Farm Manager

เว็บแอปสำหรับจัดการฟาร์ม Redroid (Android in Docker) ทำหน้าที่เป็น Web Dashboard ตรงพอร์ต `8000` แทนที่ `ws-scrcpy` (ซึ่งถูกย้ายไปพอร์ต `8001` แทน)

## ความสามารถ
- แสดงรายการ Redroid ทั้งหมดที่ทำงานอยู่
- กดสร้างเครื่องใหม่พร้อมเชื่อมต่อ ADB อัตโนมัติ
- กดลบเครื่อง
- ดูหน้าจอและควบคุมผ่านเว็บ (ฝัง ws-scrcpy ไว้ตรงกลางจอ)

## วิธีการนำไปติดตั้งบน VPS

1. นำโฟลเดอร์ `redroid-manager` ทั้งหมดนี้ไปไว้บน VPS ของคุณ
2. ให้แน่ใจว่า VPS ของคุณมี **Docker** และ **Docker Compose** ติดตั้งอยู่
3. รันคำสั่งต่อไปนี้เพื่อสร้างและรันระบบ:

```bash
docker-compose up -d --build
```

### เปลี่ยน Image ของ Redroid (เช่น ใช้ `redroid-script`)
โปรเจกต์นี้ไม่ได้รัน Redroid ผ่าน `docker-compose.yml` โดยตรง แต่สร้าง container ผ่าน Docker API ใน backend ดังนั้นถ้าต้องการใช้ image อื่น (เช่น image ที่ `redroid-script` สร้างจาก `redroid/redroid`) ให้ตั้งค่า env ชื่อ `REDROID_IMAGE`

- **ตัวอย่าง**: ตั้งเป็น image ที่คุณสร้างไว้ เช่น `redroid/redroid:11.0.0-gapps-ndk-magisk-widevine`
- **วิธีตั้งค่า**: ใส่ในไฟล์ `.env` ที่อยู่ข้าง `docker-compose.yml`

```bash
REDROID_IMAGE=redroid/redroid:11.0.0-latest
```

รายละเอียดการสร้าง image แบบเติม Gapps/Magisk/libndk ฯลฯ ดูได้ที่ [ayasa520/redroid-script](https://github.com/ayasa520/redroid-script)

### การตั้งค่าการแสดงผล
หากตอนเข้าไปใช้งานแล้วหน้าจอใน Dashboard ไม่ขึ้น:
- ลองเข้าไปที่ `http://<IP_ของ_VPS>:8001` เพื่อเช็คว่า `ws-scrcpy` ทำงานปกติหรือไม่
- ระบบจะพยายามเชื่อมต่อ ADB (`adb connect`) ให้ทุกครั้งหลังสร้างเครื่องใหม่ แต่ถ้าหากเน็ตเวิร์กของ docker เพิ่งขึ้น คุณอาจจะต้องกดปุ่ม `Connect ADB` ที่หน้า Dashboard อีกครั้ง

## การพัฒนาต่อยอด (Development)

ถ้าอยากแก้โค้ดเพิ่มเติมในเครื่อง:
1. ฝั่ง Backend: `cd backend` และรัน `uvicorn main:app --reload`
2. ฝั่ง Frontend: `cd frontend` และรัน `npm install` ตามด้วย `npm run dev`
