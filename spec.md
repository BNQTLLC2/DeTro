# SPEC: Web quản lý phòng trọ (9 phòng)

## 1. Mục tiêu
Web giúp chủ trọ nhập chỉ số điện/nước hàng tháng, tự tính hóa đơn cho từng phòng (tiền phòng + điện + nước + rác + các phí khác), và để người thuê xem hóa đơn của phòng mình qua một link riêng. Deploy trên Vercel.

## 2. Người dùng
| Vai trò | Cách truy cập | Quyền |
|---|---|---|
| Chủ trọ (1 người) | Đăng nhập bằng một mật khẩu quản trị duy nhất | Toàn quyền: quản lý phòng, nhập chỉ số, cài đặt, tạo hóa đơn, đánh dấu đã thu |
| Người thuê | Link riêng của phòng, không cần đăng nhập | Chỉ xem hóa đơn và lịch sử của phòng mình (chỉ đọc) |

## 3. Tech stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- Database: Neon Postgres (qua Vercel Marketplace). ORM: Drizzle hoặc Prisma (chọn một)
- Deploy: Vercel. Biến môi trường: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`
- Xác thực chủ trọ: so khớp mật khẩu với `ADMIN_PASSWORD`, lưu phiên bằng cookie httpOnly đã ký. Cần giới hạn số lần đăng nhập sai
- Không dùng Google Sheets (đã chọn Neon). Có thể thêm xuất sang Sheet/Excel sau

## 4. Giao diện chung
- Toàn bộ tiếng Việt; tiền VNĐ định dạng `1.234.000đ`
- Tối ưu cho điện thoại (mobile-first) cho cả trang chủ trọ và trang người thuê
- Hỗ trợ chế độ tối (theo hệ thống, có nút chuyển)

## 5. Mô hình dữ liệu (đề xuất)
- **rooms**: id, name (tên/số phòng), rent (giá thuê), tenant_name, tenant_phone, occupants (số người ở hiện tại), deposit (tiền cọc), move_in_date, billing_day (ngày chốt số, 1–31), is_vacant, public_token (chuỗi ngẫu nhiên khó đoán cho link xem), room-level fee overrides
- **fee_types** (chủ trọ tự thêm/bớt): id, name (rác, wifi, gửi xe, vệ sinh...), calc_method (`fixed` | `per_person` | `per_unit`), default_amount, active
- **room_fees**: room_id, fee_type_id, amount_override, quantity (ví dụ số xe), enabled
- **settings**: giá điện/kWh, định mức nước giá rẻ mỗi người (m³), giá nước thấp (đ/m³), giá nước cao (đ/m³), thông tin ngân hàng (tên ngân hàng, số tài khoản, tên chủ TK), tên nhà trọ
- **invoices**: id, room_id, period (tháng/năm), period_start, period_end, due_date, elec_start, elec_end, elec_read_at, water_start, water_end, water_read_at (ngày ghi nhận điện/nước tách riêng, trống đến khi nhập), occupants_snapshot, rent, elec_amount, water_amount, other_items (JSON: tên, số tiền), adjustments (JSON: các khoản phát sinh/giảm trừ), total, status (`unpaid` | `paid`), published, published_at, paid_at, note
- Hóa đơn lưu bản chụp (snapshot) đơn giá và số liệu tại thời điểm tạo, để đổi giá sau này không làm đổi hóa đơn cũ

## 6. Quy tắc tính tiền
- **Tiền phòng**: `rent` của từng phòng (có thể khác nhau giữa các phòng)
- **Tiền điện**: `(elec_end - elec_start) × giá điện/kWh` (giá đơn, cấu hình trong cài đặt, mỗi phòng có công tơ riêng)
- **Tiền nước** (mỗi phòng có đồng hồ riêng, giá bậc theo số người):
  - `m3_used = water_end - water_start`
  - `quota = occupants × định mức giá rẻ mỗi người (m³)`
  - `m3_low = min(m3_used, quota)`, `m3_high = max(m3_used - quota, 0)`
  - `water_amount = m3_low × giá thấp + m3_high × giá cao`
  - Hiển thị trên hóa đơn: số khối, định mức, phần giá thấp, phần giá cao
  - Định mức và đơn giá nằm trong cài đặt, chủ trọ sửa được bất cứ lúc nào
- **Tiền rác và phí khác**: tiền rác **mỗi phòng một mức riêng** (không cố định chung), lưu theo từng phòng trong `room_fees` (`amount_override`). Chủ trọ tự thêm/bớt loại phí. Cách tính mỗi loại: cố định/phòng, theo số người, hoặc theo số lượng. Có thể đặt mức riêng cho từng phòng hoặc tắt với phòng không áp dụng
- **Khoản phát sinh theo tháng**: chủ trọ thêm khoản bất kỳ vào hóa đơn một phòng (sửa chữa, đền bù, giảm trừ...). Cho phép số âm
- **Tổng**: tiền phòng + điện + nước + các loại phí + phát sinh
- **Nợ cũ**: không cộng dồn. Mỗi hóa đơn độc lập, chỉ có trạng thái chưa đóng/đã đóng
- Làm tròn tiền về đồng (số nguyên)
- Đổi/reset công tơ: không xử lý đặc biệt. Chỉ cảnh báo nếu số cuối nhỏ hơn số đầu, chủ trọ có thể sửa số đầu thủ công

## 7. Chu kỳ thu tiền
- Ngày chốt số khác nhau theo từng phòng (`billing_day` theo ngày vào ở)
- Số đầu kỳ tự lấy từ số cuối kỳ trước; tháng đầu tiên chủ trọ nhập tay
- Mỗi hóa đơn có hạn đóng (`due_date`), mặc định = ngày chốt + N ngày (N cấu hình trong cài đặt)

## 8. Màn hình chủ trọ (cần đăng nhập)
1. **Đăng nhập**: một ô mật khẩu
2. **Tổng quan tháng**: bảng 9 phòng, cột: đã nhập chỉ số chưa, hóa đơn tạo chưa, trạng thái đóng tiền, số tiền. Dòng tổng: dự kiến / đã thu / còn thiếu. Chọn tháng để xem
3. **Nhập chỉ số theo từng phòng**: chọn một phòng (lưới các phòng, mỗi ô hiện điện/nước đã nhập hay chưa và ngày ghi nhận). Điện và nước nhập riêng, mỗi phần có nút lưu và ngày ghi nhận riêng, có thể nhập vào hai ngày khác nhau. Số đầu tự lấy từ kỳ trước, tự tính thử số tiền ngay khi nhập. Có phần tạm tính của phòng; chỉ tạo được hóa đơn nháp khi đã lưu đủ cả điện và nước
- **Công bố**: chủ trọ bấm công bố từng phòng (ở màn Tổng quan hoặc màn nhập chỉ số) hoặc "Công bố tất cả" cho mọi phòng đã nhập đủ điện và nước. Có nút "Hủy công bố" để rút lại. Phòng thiếu số điện hoặc nước thì chưa công bố được. Sửa số sau khi công bố thì cần công bố lại để cập nhật. Dữ liệu: invoices có `published` (bool) và `published_at`
4. **Chi tiết hóa đơn**: xem/sửa các dòng, thêm khoản phát sinh, đánh dấu đã thu (ghi ngày thu), copy link của phòng
5. **Quản lý phòng**: thêm/sửa 9 phòng (tên, giá thuê, người thuê, SĐT, số người ở, tiền cọc, ngày vào ở, ngày chốt, phòng trống), xem/tạo lại link riêng
6. **Cài đặt**: giá điện, định mức + giá nước, danh mục phí (thêm/bớt/sửa), thông tin ngân hàng, tên nhà trọ, số ngày hạn đóng
- Người thuê đổi hoặc số người đổi: cập nhật `occupants` của phòng; hóa đơn đã tạo giữ nguyên snapshot

## 9. Trang người thuê (không đăng nhập)
- URL: `/p/<public_token>` (token ngẫu nhiên dài, khó đoán; không liệt kê được các phòng khác)
- Hiển thị: tên phòng, hóa đơn tháng mới nhất (chi tiết từng khoản, số điện/nước đầu-cuối, định mức nước), trạng thái đã/chưa đóng, hạn đóng
- Hiện **mã QR chuyển khoản** (một tài khoản chung) với số tiền và nội dung chuyển khoản tự sinh, dạng `<Tên phòng> <MM/YYYY>`. Hiển thị thêm số tài khoản dạng text
- Lịch sử các tháng trước (chỉ đọc)
- Trang không cho search engine lập chỉ mục (`noindex`)
- Chỉ hóa đơn đã **công bố** mới hiển thị cho người thuê. Hóa đơn chưa công bố (nháp) người thuê không thấy, kể cả trong danh sách tháng và biểu đồ thống kê. Nếu chưa có hóa đơn nào, hiện thông báo "chưa có hóa đơn"

## 10. Thông báo
- Chỉ qua link xem trên web, chủ trọ tự copy link gửi cho người thuê (Zalo, SMS...)
- Gợi ý tính năng nhỏ: nút "Copy tin nhắn" soạn sẵn nội dung kèm link và số tiền
- Chưa làm: gửi tự động qua Zalo OA/email, xuất PDF, ảnh chụp công tơ (có thể thêm sau)

## 11. Phi chức năng
- Chỉ một chủ trọ; chưa cần đa tài khoản hay đa nhà trọ
- Bảo mật: tất cả API ghi dữ liệu đều kiểm tra phiên đăng nhập; link người thuê chỉ đọc
- Dữ liệu nhỏ (9 phòng), dùng Neon gói miễn phí là đủ
- Có tập lệnh seed tạo sẵn 9 phòng và cài đặt mặc định

## 12. Giả định đã đặt (cần bạn xác nhận hoặc sửa)
- Rác: mỗi phòng một mức riêng (đã xác nhận). Các phí khác: mỗi loại tự chọn cách tính (cố định/theo người/theo số lượng), có thể đặt mức riêng từng phòng
- Thanh toán: QR chuyển khoản, chủ trọ tự đánh dấu đã thu thủ công
- Cách tính ngày chốt: tính theo từng phòng, kỳ liền sau kỳ trước (không theo tháng dương lịch cố định)
- Giá điện: một mức đơn giá cho tất cả phòng (đã chọn theo kWh, không bậc thang)

## 13. Việc còn mở (hỏi lại khi bắt đầu code)
- Giá điện/kWh, định mức nước/người, giá nước thấp/cao, số tiền rác thực tế
- Thông tin ngân hàng nhận tiền
- Tên/giá/số người của từng phòng trong 9 phòng
- Có cần tên miền riêng hay dùng `*.vercel.app`

## 14. Kế hoạch triển khai gợi ý
1. Khởi tạo Next.js + Tailwind, kết nối Neon, tạo schema và seed
2. Xác thực chủ trọ bằng mật khẩu
3. Quản lý phòng + cài đặt (giá điện/nước, loại phí)
4. Hàm tính hóa đơn (có kiểm thử đơn vị cho điện/nước bậc/số người)
5. Màn hình nhập chỉ số hàng loạt + tổng quan tháng
6. Trang người thuê `/p/<token>` + QR chuyển khoản
7. Dark mode, tối ưu mobile, deploy Vercel (thêm biến môi trường, chạy migration)


## 15. Thanh toán SePay (bổ sung)
- Mã VietQR cho từng hóa đơn đã công bố (số tiền = còn thiếu, nội dung = tiền tố + mã hóa đơn), có nút tải QR về máy.
- Webhook `POST /api/sepay` (SePay "tiền vào", chứng thực `Authorization: Apikey <SEPAY_API_KEY>`), chống trùng theo id giao dịch.
- Bảng `payments` lưu giao dịch; đủ tiền thì tự đánh dấu đã đóng; thiếu tiền hiện số còn lại; giao dịch không khớp được liệt kê cho chủ trọ.
- Cài đặt: tiền tố mã thanh toán (2-8 chữ cái).
