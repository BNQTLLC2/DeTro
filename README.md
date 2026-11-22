# Quản lý phòng trọ

Web để chủ trọ nhập số điện/nước hàng tháng cho từng phòng, tự tính hóa đơn (tiền phòng + điện + nước + rác + các phí khác) và **công bố** cho người thuê xem qua một link riêng.

- **Chủ trọ**: đăng nhập bằng một mật khẩu, nhập số từng phòng (điện và nước lưu riêng, có thể nhập vào hai ngày khác nhau), công bố từng phòng hoặc tất cả, đánh dấu đã thu, gửi link qua Zalo/SMS.
- **Người thuê**: mở link riêng của phòng (`/p/<mã dài khó đoán>`), không cần đăng nhập. Chỉ thấy các tháng đã công bố, có điện/nước giải thích dễ hiểu, biểu đồ 6 tháng và mã QR chuyển khoản.
- Next.js (App Router) + TypeScript + Tailwind CSS, database Neon Postgres.

## Deploy lên Vercel

1. Đưa thư mục này lên một repo GitHub (`git init`, `git add .`, `git commit`, rồi push).
2. Vào vercel.com → **Add New… → Project** → chọn repo vừa tạo → **Deploy** (chưa cần cấu hình gì ở bước này, lần đầu có thể báo lỗi thiếu database, bình thường).
3. Trong project trên Vercel: tab **Storage** → **Create Database** → chọn **Neon** (Postgres) → kết nối vào project. Vercel tự thêm biến `DATABASE_URL`.
4. Tab **Settings → Environment Variables**, thêm:
   - `ADMIN_PASSWORD`: mật khẩu đăng nhập của chủ trọ (đặt dài, khó đoán).
   - `SESSION_SECRET`: chuỗi ngẫu nhiên để ký phiên đăng nhập (tạo bằng `openssl rand -hex 32`).
5. Tab **Deployments** → **Redeploy** bản mới nhất.
6. Mở địa chỉ Vercel cấp (dạng `ten-du-an.vercel.app`), đăng nhập, rồi:
   - **Cài đặt**: nhập giá điện, định mức và giá nước, thông tin ngân hàng (mã VietQR như `VCB`, `MB`, `TCB`).
   - **Phòng**: sửa 9 phòng (tên, giá thuê, người thuê, số điện thoại, số người ở, ngày chốt, số điện/nước ban đầu, mức rác riêng từng phòng).
   - **Nhập số**: nhập điện, nước từng phòng → **Công bố** → gửi link cho người thuê.

Các bảng database và dữ liệu khởi tạo (9 phòng trống, phí rác và wifi) được tạo tự động ở lần mở web đầu tiên, không cần chạy lệnh migration.

## Chạy thử trên máy

```bash
npm install
cp .env.example .env.local   # đặt ADMIN_PASSWORD (có thể để trống DATABASE_URL)
npm run dev
```

Không có `DATABASE_URL` thì dev dùng Postgres chạy ngay trong Node (PGlite), dữ liệu lưu ở thư mục `.data/`. Bản production (Vercel) bắt buộc có `DATABASE_URL`.

```bash
npm run typecheck   # kiểm tra kiểu
npm test            # test tính tiền và toàn bộ luồng với Postgres thật
```

## Thanh toán qua SePay (tự xác nhận đã đóng tiền)

Trang người thuê có mã VietQR (đã điền sẵn số tiền còn thiếu và nội dung chuyển khoản) cùng nút **Tải mã QR về máy**.
Khi người thuê chuyển khoản, SePay gọi webhook và hóa đơn tự chuyển sang "Đã đóng tiền".

1. Vào **Cài đặt** của web: nhập ngân hàng (mã như `MBBANK`, `VCB`...), số tài khoản, tên chủ tài khoản và **Tiền tố mã thanh toán** (mặc định `TRO`).
2. Tại my.sepay.vn: kết nối tài khoản ngân hàng, vào *Cấu hình công ty > Cấu trúc mã thanh toán* đặt tiền tố **giống hệt** tiền tố ở bước 1.
3. Tại SePay, tạo webhook: sự kiện **Có tiền vào**, URL `https://<tên-miền-của-bạn>/api/sepay`, kiểu chứng thực **API Key**, đặt một khóa bí mật.
4. Trên Vercel thêm biến môi trường `SEPAY_API_KEY` bằng đúng khóa đó, rồi Redeploy.

Cách hoạt động: nội dung chuyển khoản dạng `TRO<mã hóa đơn>`; tiền về đủ thì tự đánh dấu đã đóng, thiếu thì hiện số còn lại và QR cập nhật theo.
Giao dịch không khớp hóa đơn nào được liệt kê ở trang Tổng quan. Mỗi giao dịch SePay chỉ được ghi một lần (chống gọi trùng).
Lưu ý: một số ngân hàng (ví dụ VietinBank) có thể không cho tùy biến nội dung chuyển khoản, khi đó cần đối chiếu thủ công ở mục "tiền về chưa khớp".

## Quy tắc tính tiền

- **Điện** = (số cuối − số đầu) × giá điện/kWh.
- **Nước** theo số người: định mức = số người × m³ giá rẻ mỗi người. Phần trong định mức tính giá rẻ, phần vượt tính giá cao.
- **Phí khác** (rác, wifi, gửi xe...): thêm/bớt trong Cài đặt; mỗi phòng bật/tắt và đặt mức riêng ở mục Phòng. Phí bằng 0 không hiện.
- **Khoản phát sinh** theo tháng, cho phép số âm để giảm trừ.
- Số đầu kỳ tự lấy từ số cuối kỳ trước. Hóa đơn lưu bản chụp giá, nên đổi giá sau này không làm đổi hóa đơn đã công bố.
- Sửa số hoặc khoản phát sinh của hóa đơn đã công bố thì hóa đơn tự về "chưa công bố" để bạn kiểm tra rồi công bố lại.

## Bảo mật

- Mọi trang và mọi thao tác ghi của chủ trọ đều kiểm tra phiên đăng nhập (cookie httpOnly có chữ ký).
- Đăng nhập sai 5 lần trong 15 phút từ một địa chỉ IP sẽ bị khóa tạm.
- Link người thuê là mã ngẫu nhiên 128 bit, chỉ đọc, không cho công cụ tìm kiếm lập chỉ mục. Khi người thuê trả phòng hoặc đổi người, bấm **Tạo lại link** ở mục Phòng để link cũ không dùng được nữa.

## Gửi link qua Zalo / SMS

Nút "Gửi qua Zalo" sao chép sẵn tin nhắn rồi mở khung chat Zalo của số điện thoại đã lưu (`https://zalo.me/84<số bỏ số 0 đầu>`), bạn dán và gửi. Cần số đó có Zalo và cho phép tìm bằng số điện thoại. Nút "Gửi SMS" mở ứng dụng nhắn tin với nội dung điền sẵn.

## Cài lên màn hình điện thoại (PWA)

Mở web trên Chrome Android → menu → **Thêm vào màn hình chính**. Web mở toàn màn hình như một app.
