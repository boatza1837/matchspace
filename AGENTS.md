# Workspace Rules & Guidelines

## Workflow & Git / Deploy Policy
- **Auto Git Push**: ทุกครั้งหลังทำงานหรือแก้ไขโค้ดเสร็จสิ้น ให้ทำการตรวจสอบไฟล์ที่เปลี่ยนแปลง ทำการ commit ด้วยข้อความที่สื่อความหมายชัดเจน และสั่ง `git push origin main` ขึ้น GitHub ทันทีเสมอโดยไม่ต้องรอให้ผู้ใช้สั่งซ้ำ
- **Auto Railway Deploy**: หลังจาก git push สำเร็จ ให้ทำการ Deploy ขึ้น Railway ทันทีเสมอโดยใช้คำสั่ง `npx.cmd @railway/cli up --detach -y` เพื่อให้ production บน Railway พร้อมใช้งานตลอดเวลาทุกรอบการทำงานโดยไม่ต้องให้ผู้ใช้ร้องขอ
