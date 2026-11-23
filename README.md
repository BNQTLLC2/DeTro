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

## Thanh toán qua SePay (mỗi phòng một tài khoản VA)

Mỗi phòng có một tài khoản định danh (VA) riêng của SePay. Người thuê chuyển khoản vào VA của phòng mình, nên dù họ sửa nội dung chuyển khoản thì tiền vẫn về đúng phòng. Không còn dùng tài khoản chung. Phòng nào chưa khai báo VA thì trang người thuê không hiện mã QR.

1. Tại my.sepay.vn, kết nối ngân hàng (loại hỗ trợ VA) rồi tạo một tài khoản VA cho từng phòng.
2. Trên Vercel đặt biến môi trường:
   - `BANK_CODE`: mã VietQR của ngân hàng (ví dụ `BIDV`, `MB`, `OCB`).
   - `BANK_HOLDER`: tên chủ tài khoản (tùy chọn, hiện trên trang người thuê).
   - Mỗi phòng một biến `VA_<tên phòng>` chứa số VA. Tên phòng bỏ chữ "Phòng" và dấu: phòng "Phòng 101" thì `VA_101`, phòng "Phòng A2" thì `VA_A2`. Ví dụ `VA_101=96247XXXX101`.
   - `SEPAY_API_KEY`: khóa bí mật của webhook (bước 3).
3. Tại SePay tạo webhook: sự kiện **Có tiền vào**, URL `https://<tên-miền-của-bạn>/api/sepay`, kiểu chứng thực **API Key** với đúng khóa ở bước 2, kiểu nội dung JSON. Tắt tùy chọn "bỏ qua nếu không có mã thanh toán" nếu có.
4. Redeploy sau khi thêm hoặc đổi biến môi trường.

Cách ghi nhận: webhook SePay gửi kèm `subAccount` (số VA nhận tiền). Hệ thống tìm phòng có VA đó, chọn hóa đơn cũ nhất của phòng còn khoản chờ thu, rồi chọn đợt thu theo số tiền: đúng số còn thiếu của tiền trọ thì tính tiền trọ, đúng số điện, nước, phí khác thì tính khoản đó, còn lại chia cho điện, nước, phí khác trước rồi đến tiền trọ. Đủ tiền thì tự đánh dấu đã thu. Tiền thừa không tự chuyển sang tháng sau.
Giao dịch vào VA lạ, hoặc VA của phòng không còn khoản nào chờ thu, được liệt kê ở trang Tổng quan (mục "chưa khớp") để bạn đối chiếu và đánh dấu thủ công. Mỗi giao dịch SePay chỉ được ghi một lần (chống gọi trùng).
Trang Tổng quan cảnh báo các phòng đang thuê mà chưa có biến `VA_...`.

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
  - Tiền trọ tự công bố đúng ngày thu (khi có người mở trang Tổng quan hoặc trang người thuê, và mỗi sáng nhờ Vercel Cron). Muốn bật Cron: thêm biến môi trường `CRON_SECRET` (chuỗi bất kỳ) trên Vercel rồi Redeploy. Chủ trọ vẫn công bố sớm hoặc hủy công bố tay được, hệ thống không tự công bố lại phần đã hủy.
  - Mỗi đợt tự khớp SePay, đánh dấu đã thu và hiển thị QR riêng.
- **Phí khác** (rác, wifi, gửi xe...): thêm/bớt trong Cài đặt; mỗi phòng bật/tắt và đặt mức riêng ở mục Phòng. Phí bằng 0 không hiện.
- **Khoản phát sinh** theo tháng, cho phép số âm để giảm trừ.
- Số đầu kỳ tự lấy từ số cuối kỳ trước. Hóa đơn lưu bản chụp giá: lưu Cài đặt sẽ áp giá mới ngay cho hóa đơn tháng hiện tại chưa thu tiền, còn hóa đơn tháng cũ và hóa đơn đã thu giữ nguyên giá cũ.
- Sửa số hoặc khoản phát sinh của hóa đơn đã công bố thì hóa đơn tự về "chưa công bố" để bạn kiểm tra rồi công bố lại.

## Bảo mật

- Mọi trang và mọi thao tác ghi của chủ trọ đều kiểm tra phiên đăng nhập (cookie httpOnly có chữ ký).
- Đăng nhập sai 5 lần trong 15 phút từ một địa chỉ IP sẽ bị khóa tạm.
- Link người thuê là mã ngẫu nhiên 128 bit, chỉ đọc, không cho công cụ tìm kiếm lập chỉ mục. Khi người thuê trả phòng hoặc đổi người, bấm **Tạo lại link** ở mục Phòng để link cũ không dùng được nữa.

## Gửi link qua Zalo

Nút "Gửi qua Zalo" sao chép sẵn tin nhắn rồi mở khung chat Zalo của số điện thoại đã lưu (`https://zalo.me/84<số bỏ số 0 đầu>`), bạn dán và gửi. Cần số đó có Zalo và cho phép tìm bằng số điện thoại.

## Cài lên màn hình điện thoại (PWA)

Mở web trên Chrome Android → menu → **Thêm vào màn hình chính**. Web mở toàn màn hình như một app.
