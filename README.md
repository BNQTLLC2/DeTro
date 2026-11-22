# Quản lý phòng trọ

Web để chủ trọ nhập số điện/nước hàng tháng cho từng phòng, tự tính hóa đơn (tiền phòng + điện + nước + rác + các phí khác) và **công bố** cho người thuê xem qua một link riêng.

- **Chủ trọ**: đăng nhập bằng một mật khẩu, nhập số từng phòng (điện và nước lưu riêng, có thể nhập vào hai ngày khác nhau), công bố từng phòng hoặc tất cả, đánh dấu đã thu, gửi link qua Zalo.
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

1. Trên Vercel đặt biến môi trường tài khoản nhận tiền: `BANK_CODE` (mã VietQR như `MB`, `VCB`, `TCB`, `ACB`, `BIDV`, `VPB`, `VBA`), `BANK_ACCOUNT` (số tài khoản), `BANK_HOLDER` (tên chủ tài khoản).
2. Tại my.sepay.vn: kết nối tài khoản ngân hàng, vào *Cấu hình công ty > Cấu trúc mã thanh toán* đặt tiền tố (mặc định `TRO`). Nếu dùng tiền tố khác, đặt biến môi trường `SEPAY_PREFIX` cho trùng.
3. Tại SePay, tạo webhook: sự kiện **Có tiền vào**, URL `https://<tên-miền-của-bạn>/api/sepay`, kiểu chứng thực **API Key**, đặt một khóa bí mật.
4. Trên Vercel thêm biến môi trường `SEPAY_API_KEY` bằng đúng khóa đó (và `SEPAY_PREFIX` nếu đổi tiền tố), rồi Redeploy. Tài khoản ngân hàng và SePay chỉ cấu hình bằng biến môi trường, không có trong trang Cài đặt.

Cách hoạt động: nội dung chuyển khoản dạng `TRO<mã hóa đơn>`; tiền về đủ thì tự đánh dấu đã đóng, thiếu thì hiện số còn lại và QR cập nhật theo.
Giao dịch không khớp hóa đơn nào được liệt kê ở trang Tổng quan. Mỗi giao dịch SePay chỉ được ghi một lần (chống gọi trùng).
Lưu ý: một số ngân hàng (ví dụ VietinBank) có thể không cho tùy biến nội dung chuyển khoản, khi đó cần đối chiếu thủ công ở mục "tiền về chưa khớp".

## Giấu trang đăng nhập (tùy chọn)

Đặt biến môi trường `ADMIN_LOGIN_PATH` là một chuỗi khó đoán (6-64 ký tự a-z, 0-9, `-`, `_`), ví dụ `vao-tro-k7x2`, rồi Redeploy.
Từ đó trang đăng nhập chỉ mở ở `https://<tên-miền>/vao-tro-k7x2`; `/login`, trang chủ và `/admin` (khi chưa đăng nhập) đều chuyển hướng tới https://www.youtube.com/watch?v=dQw4w9WgXcQ (đổi bằng biến `HIDDEN_REDIRECT_URL`).
Hãy lưu đường dẫn này vào bookmark. Quên thì xem lại biến `ADMIN_LOGIN_PATH` trên Vercel.

## Quy tắc tính tiền

- **Điện** = (số cuối − số đầu) × giá điện/kWh.
- **Nước** theo số người: định mức = số người × số khối nước định mức cho mỗi người. Phần trong định mức tính giá rẻ, phần vượt tính giá cao.
- **Hai đợt thu riêng**:
  - *Tiền trọ* thu vào ngày vào ở của từng phòng (thu sau: tiền trọ kỳ 15/10 – 14/11 thu ngày 15/11). Công bố riêng, không cần số điện nước. Mã chuyển khoản dạng `TIỀNTỐ_PHÒNG_TIENTRO_MM/YYYY`.
  - *Chi phí khác* (điện, nước, phí, phát sinh) thu một ngày cố định hằng tháng, đặt ở Cài đặt (mặc định ngày 6; là ngày thu đầu tiên sau ngày chốt số). Mã chuyển khoản dạng `TIỀNTỐ_PHÒNG_MM/YYYY`.
  - Mỗi đợt tự khớp SePay, đánh dấu đã thu và hiển thị QR riêng.
- **Phí khác** (rác, wifi, gửi xe...): thêm/bớt trong Cài đặt; mỗi phòng bật/tắt và đặt mức riêng ở mục Phòng. Phí bằng 0 không hiện.
- **Khoản phát sinh** theo tháng, cho phép số âm để giảm trừ.
- Số đầu kỳ tự lấy từ số cuối kỳ trước. Hóa đơn lưu bản chụp giá: lưu Cài đặt sẽ áp giá mới ngay cho hóa đơn tháng hiện tại chưa công bố, còn hóa đơn đã công bố giữ nguyên giá cũ.
- Sửa số hoặc khoản phát sinh của hóa đơn đã công bố thì hóa đơn tự về "chưa công bố" để bạn kiểm tra rồi công bố lại.

## Bảo mật

- Mọi trang và mọi thao tác ghi của chủ trọ đều kiểm tra phiên đăng nhập (cookie httpOnly có chữ ký).
- Đăng nhập sai 5 lần trong 15 phút từ một địa chỉ IP sẽ bị khóa tạm.
- Link người thuê là mã ngẫu nhiên 128 bit, chỉ đọc, không cho công cụ tìm kiếm lập chỉ mục. Khi người thuê trả phòng hoặc đổi người, bấm **Tạo lại link** ở mục Phòng để link cũ không dùng được nữa.

## Gửi link qua Zalo

Nút "Gửi qua Zalo" sao chép sẵn tin nhắn rồi mở khung chat Zalo của số điện thoại đã lưu (`https://zalo.me/84<số bỏ số 0 đầu>`), bạn dán và gửi. Cần số đó có Zalo và cho phép tìm bằng số điện thoại.

## Cài lên màn hình điện thoại (PWA)

Mở web trên Chrome Android → menu → **Thêm vào màn hình chính**. Web mở toàn màn hình như một app.
