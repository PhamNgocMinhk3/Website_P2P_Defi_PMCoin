# 📝 Kế Hoạch Phát Triển Tính Năng Chat

Đây là kế hoạch phát triển chi tiết, được sắp xếp theo thứ tự ưu tiên để xây dựng một hệ thống chat real-time hoàn chỉnh. Kế hoạch tập trung vào việc xây dựng nền tảng vững chắc, triển khai các tính năng cốt lõi (MVP), sau đó mới mở rộng ra các tính năng nâng cao và tối ưu hóa.

---

##  Giai đoạn 1: Nền tảng Backend & Chức năng Chat Cốt lõi (MVP)

### 1.1. Thiết lập Database & Models
- [ ] **Định nghĩa Models (Entity Framework)**:
    -   **`Chat`**: `Id`, `Name`, `Avatar`, `IsGroup`, `OwnerId`, `CreatedAt`, `RequireApproval`, `OnlyAdminsCanSend`, `AllowMemberInvite`.
    -   **`ChatParticipant`**: `ChatId`, `UserId`, `Nickname`, `Role` (int), `MutedUntil`, `ThemeColor`, `ThemeBackgroundUrl`.
    -   **`Message`**: `Id`, `ChatId`, `SenderId`, `Type` (string), `Content` (text), `Attachments` (jsonb), `ParentMessageId` (Guid?), `PollData`, `AppointmentData`.
    -   **`MessageReaction`**: `Id`, `MessageId`, `UserId`, `Reaction`.
    -   **`MessageRead`**: `Id`, `MessageId`, `UserId`, `ReadAt`.
    -   **`User` (Cập nhật)**: Thêm `IsOnline` (boolean) và `LastSeen` (DateTime?).
- [ ] **Cập nhật `DbContext`**: Thêm tất cả các `DbSet<>` mới và cấu hình quan hệ (Fluent API).
- [ ] **Tạo và Áp dụng Migration**:
    -   [ ] Chạy lệnh `dotnet ef migrations add InitialChatSchema` để tạo file migration.
    -   [ ] Chạy lệnh `dotnet ef database update` để áp dụng các thay đổi vào schema của PostgreSQL.

### 1.2. API & Real-time Cốt lõi
- [ ] **API Controller (`ChatController.cs`)**:
    -   `GET /api/chat/conversations`: Lấy danh sách cuộc trò chuyện của user.
    -   `GET /api/chat/{conversationId}/messages`: Lấy lịch sử tin nhắn (phân trang).
    -   `POST /api/chat/one-on-one`: Tạo hoặc lấy cuộc trò chuyện 1-1 đã có.
    -   `PUT /api/chat/conversations/{conversationId}/read`: Đánh dấu đã đọc.
- [ ] **Real-time Hub (`ChatHub.cs`)**:
    -   Tạo `ChatHub` kế thừa từ `Hub`.
    -   Method `SendMessage(conversationId, message)`: Gửi tin nhắn text, lưu vào DB, phát lại cho group.
    -   Method `JoinGroup(conversationId)` & `LeaveGroup(conversationId)`.
    -   **Quản lý Trạng thái (Presence)**:
    -   `OnConnectedAsync()`: Cập nhật `User.IsOnline = true` và thông báo cho các client liên quan.
    -   `OnDisconnectedAsync()`: Cập nhật `User.IsOnline = false`, `User.LastSeen = DateTime.UtcNow` và thông báo.
    -   Method `MarkAsRead(conversationId)`: Client gọi khi mở một cuộc trò chuyện.
    -   Method `Typing(conversationId, isTyping)`: Gửi sự kiện đang gõ phím.
- [ ] **Business Logic (`ChatService.cs`)**:
    -   Implement các logic CRUD cơ bản cho `Conversation`, `Message`.
    -   Logic xử lý tạo cuộc trò chuyện 1-1 (kiểm tra nếu đã tồn tại).
    -   **Logic xử lý DTO cho danh sách cuộc trò chuyện**:
    -   Khi lấy danh sách, API `GET /api/chat/conversations` phải trả về một DTO được tối ưu.
    -   **Tin nhắn cuối cùng**: Phải có mô tả cho các loại media (ví dụ: "Bạn: [Hình ảnh]", "Alice: [File: report.docx]").
    -   **Số tin chưa đọc**: Phải có trường `unreadCount` để frontend có thể làm nổi bật.
- [ ] **Logic xử lý tin nhắn chưa đọc**: Tăng `UnreadCount` khi gửi tin nhắn cho người dùng không online hoặc không ở trong cuộc trò chuyện. Reset khi người dùng đọc.
- [ ] **Logic Bảo mật**:
    -   Tất cả các endpoint trong `ChatController` và method trong `ChatHub` phải được bảo vệ bằng `[Authorize]`.
    -   Lấy `UserId` của người gọi từ `HttpContext.User` để đảm bảo an toàn.

---

## 🎨 Giai đoạn 2: Nền tảng Frontend & Tích hợp MVP

### 2.1. Thiết lập Services & Cấu trúc
- [ ] **Tạo `ChatApiService`**: Service mới chứa các phương thức gọi API RESTful từ `ChatController` (sử dụng `HttpClient`).
- [ ] **Mở rộng `SignalRService`**: *Hiện tại file `signalr.service.ts` chỉ xử lý cho `GameHub`. Cần mở rộng để quản lý kết nối và sự kiện cho `ChatHub`.*
    - [ ] Quản lý kết nối đến `ChatHub`.
    - [ ] Thêm các method để gọi Hub (`sendMessage`, `joinGroup`, `typing`).
    - [ ] Thêm các `Subject`/`Observable` để phát ra các sự kiện từ Hub (`messageReceived$`, `reactionAdded$`, `pollUpdated$`, `themeChanged$`, `incomingCall$`).
- [ ] **Refactor Toàn cục**:
    -   **Đồng bộ kiểu dữ liệu ID**: Chuyển tất cả các `id: number` trong các interface của frontend (`ChatUser`, `GroupMember`,...) thành `id: string` để khớp với kiểu `Guid` của backend. *Hiện tại trong `chat.component.ts` vẫn đang dùng `id: number`.*
- [ ] **State Management**:
    - [ ] **Quyết định**: Bắt đầu với giải pháp "Service với BehaviorSubject" để quản lý trạng thái chat.

### 2.2. Tích hợp Giao diện Cốt lõi
- [ ] **`ChatListComponent`**:
    -   Gọi API `GET /api/chat/conversations` để lấy danh sách chat.
    -   **Hiển thị icon trạng thái online/offline cho từng cuộc trò chuyện.**
    -   **Sắp xếp và làm nổi bật cuộc trò chuyện chưa đọc**:
        -   Các cuộc trò chuyện có `unreadCount > 0` phải được đẩy lên đầu danh sách.
        -   Áp dụng một class CSS (ví dụ: `.unread`) để làm nổi bật (in đậm, màu khác) các cuộc trò chuyện này.
    -   **Xử lý lỗi**: Khi API tải danh sách chat thất bại, hiển thị thông báo lỗi và nút "Thử lại".
    -   Subscribe vào `SignalRService.messageReceived$` để cập nhật tin nhắn cuối và thứ tự cuộc trò chuyện.
- [ ] **`ChatAreaComponent`**:
    -   Tải lịch sử chat từ API `GET /api/chat/{id}/messages`.
    -   Kết nối ô nhập liệu để gọi `SignalRService.sendMessage()`.
    -   **Xử lý lỗi gửi tin nhắn**:
        -   **Hiển thị trạng thái tin nhắn**: Thêm logic để hiển thị trạng thái "Đang gửi", "Đã gửi" (Delivered), "Đã xem" (Read) cho các tin nhắn đi.
    -   **Typing Indicator**: Hiển thị "User is typing..." khi nhận được sự kiện từ SignalR.
    -   **UI Fix**: Đảm bảo màu chữ của tin nhắn đến là màu đen mặc định để dễ đọc.
    -   **Dán ảnh từ Clipboard**: Hỗ trợ người dùng dán ảnh trực tiếp vào ô chat.
    -   **Hiển thị Link Preview**: Khi tin nhắn chứa link, hiển thị một card xem trước.
    -   Subscribe vào các sự kiện real-time từ `SignalRService`.

---

## 📦 Giai đoạn 3: Mở rộng Tính năng (Feature Expansion)

### 3.1. Media, Files & Message Interactions
- [ ] **Backend**:
- [X] **Frontend**: *Giao diện đã được xây dựng trong `chat-info.component.html` và `group-chat-info.component.html`.*
    -   **`ChatAreaComponent`**:
        -   Tích hợp logic upload và gửi tin nhắn media.
        -   Render các loại tin nhắn media khác nhau (image, video, audio, file) dựa trên `Attachments`.
        -   [X] Implement menu hành động khi hover/click vào tin nhắn (Trả lời, Chuyển tiếp, Thu hồi, Reactions). *UI cho các tùy chọn này đã có trong `chat-info.component.html`.*
        -   [ ] **UI/UX Reactions**: Hiển thị tóm tắt reaction trên tin nhắn và modal chi tiết.

### 3.2. Quản lý Nhóm Chat
- [ ] **Backend**:
    -   **APIs**: `POST /groups`, `DELETE /conversations/{id}`, `PUT /groups/{id}/settings`, `POST/DELETE/PUT` members, `POST /transfer-ownership`, `POST /leave`, `GET /invite-link`.
    -   **Logic phân quyền**: Implement chi tiết logic cho OWNER, ADMIN, MEMBER.
    -   **Hub**: Thêm các sự kiện `MemberJoined`, `MemberLeftOrKicked`, `MemberRoleChanged`.
- [X] **Frontend**: *Giao diện quản lý nhóm đã rất chi tiết trong `group-chat-info.component.html`.*
    -   [X] **`GroupCreationComponent`**: Hoàn thiện luồng tạo nhóm, tìm kiếm và thêm thành viên. *UI đã có trong `chat.component.ts` và `group-creation.component`.*
    -   [X] **`ChatInfoComponent` & `GroupChatInfoComponent`**:
    -   **Cập nhật Real-time**: Lắng nghe các sự kiện SignalR (`MemberJoined`, `MemberLeftOrKicked`, `MemberRoleChanged`) để cập nhật giao diện sidebar thông tin ngay lập tức.
    -   [X] Tích hợp đầy đủ các chức năng quản lý thành viên, cài đặt nhóm, và phân quyền trên UI. *Giao diện đã có đủ các nút, input và modal cho các chức năng này.*

---

## 💎 Giai đoạn 4: Tính năng Nâng cao & Hoàn thiện Trải nghiệm

### 4.1. Hệ thống Thông báo & Tìm kiếm
- [ ] **Backend**:
    -   **Model `Notification`**: `Id`, `UserId`, `Content`, `Link`, `IsRead`, `CreatedAt`.
    -   **`NotificationController`**: `GET /notifications`, `POST /mark-as-read`.
    -   **Logic**: Tạo thông báo khi có tin nhắn mới.
    -   **API Tìm kiếm**: `GET /api/chat/messages/search` và `GET /api/users/search`.
- [ ] **Frontend**:
    -   **`NotificationService` & `NotificationBellComponent`**: Xây dựng hệ thống chuông thông báo real-time.
    -   **Tìm kiếm**: Tích hợp chức năng tìm kiếm tin nhắn và người dùng vào giao diện.

### 4.2. Cuộc gọi Video/Audio (WebRTC)
- [ ] **Backend**:
    -   **Model `CallHistory`**: `Id`, `ChatId`, `CallerId`, `StartTime`, `EndTime`, `DurationInSeconds`.
    -   **Hub**: Thêm các method `IncomingCall`, `CallAccepted`, `CallRejected` để "báo hiệu" (signaling).
- [ ] **Frontend**:
    -   **`CallService`**: Quản lý luồng media (camera, mic) và kết nối peer-to-peer qua WebRTC.
    -   Tích hợp giao diện cuộc gọi vào ứng dụng.

### 4.3. Các tính năng khác
- [ ] **Polls & Events**:
    -   Backend: API và logic xử lý.
    -   Frontend: Giao diện tạo và tương tác với poll/event.
- [ ] **Tùy chỉnh & Bảo mật**:
    -   Backend: API cho `customize`, `block`, `report`.
    -   [X] Frontend: Giao diện cho các chức năng này. *UI đã có trong `chat-info.component.html`.*
- [ ] **Các Model phụ**: `PinnedMessage`, `SharedLink`.

---

## 🔮 Giai đoạn 5: Tối ưu & Mở rộng (Post-Launch)
- [ ] **Hệ thống Thông báo (Notification System)**:
- [ ] **SignalR Backplane**: Nghiên cứu và chuẩn bị cho việc sử dụng một backplane (như Redis hoặc Azure SignalR Service) để có thể scale out backend ra nhiều server mà không làm gián đoạn kết nối real-time.
- [ ] **Tối ưu truy vấn Database (PostgreSQL)**:
    -   **Indexing**: Rà soát và thêm các index cần thiết, đặc biệt là composite index cho các bảng `Messages`, `ChatMembers`.
    -   **Trigram Index (pg_trgm)**: Áp dụng GIN/GIST index trên các cột `FullName`, `WalletCode` để tăng tốc độ tìm kiếm văn bản.
    -   **Tối ưu LINQ Queries**:
        -   Sử dụng `Select()` để project ra DTO, chỉ lấy các cột cần thiết.
        -   Sử dụng `AsNoTracking()` cho các truy vấn chỉ đọc.
        -   Áp dụng các kỹ thuật chống N+1 khi lấy danh sách cuộc trò chuyện.
- [ ] **Tối ưu Frontend**:
    -   Sử dụng `OnPush` Change Detection cho các component.
    -   Sử dụng `trackBy` trong các vòng lặp `*ngFor`.
    -   Tách các bundle code (lazy loading) cho các module ít dùng.