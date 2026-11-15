# เว็บที่ส่งออกจาก Lumen

โปรเจกต์ **Vite + React + TypeScript** (ไฟล์ `.tsx` / `.ts`)

## เริ่มต้น

```bash
bun install
bun run dev
```

เปิดเบราว์เซอร์ตามที่ Vite แสดง (ปกติ `http://localhost:5173`).

## สร้างไฟล์สำหรับขึ้นโฮสต์

```bash
bun run build
```

ผลลัพธ์อยู่ที่โฟลเดอร์ `dist/`.

## โครงสร้างสั้นๆ

- `src/data/site.json` — ข้อมูลหน้าและโหนดจากตัวสร้างเว็บ
- `src/lib/render-node.tsx` — เรนเดอร์โหนดเป็น React (TypeScript)
- `src/App.tsx` — เส้นทางหลายหน้าด้วย React Router
- `public/assets/` — รูปภาพ
- `src/lib/wb-db-*.ts` — Form↔DB (stub ในเครื่อง หรือ Supabase เมื่อตั้งค่า env)

## ต่อกับ Supabase (Phase C)

1. ใน Lumen: โหมดฐานข้อมูล → **ส่งออก .sql** แล้วรันใน Supabase SQL Editor
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ URL + anon key
3. ตั้ง `VITE_WB_DB_BACKEND=supabase`
4. แก้ `supabase-policies.example.sql` แล้วรันใน SQL Editor (ไฟล์สคีมาเปิด RLS ไว้แล้ว แต่ยังไม่มี policy)

ล็อกอิน/สมัครใช้ Supabase Auth (อีเมล+รหัสผ่าน) — ตาราง `users` ในสคีมาเป็นโปรไฟล์ ไม่เก็บรหัสผ่านเอง  
รายละเอียด: เอกสาร `docs/SUPABASE.md` ในรีโป Lumen

ใช้ `npm` หรือ `pnpm` แทน bun ได้เช่นกัน
