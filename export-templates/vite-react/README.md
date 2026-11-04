# เว็บที่ส่งออกจาก Web Builder

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

ใช้ `npm` หรือ `pnpm` แทน bun ได้เช่นกัน
