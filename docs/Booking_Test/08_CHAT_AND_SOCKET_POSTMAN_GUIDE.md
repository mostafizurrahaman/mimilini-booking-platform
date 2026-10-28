# 🎒 Chat & Socket.IO Postman Guide (So Easy Even a Class 5 Student Can Do It!)

Welcome! 👋 In this guide, you will learn step-by-step how to test:
1. **Normal Chat** (Customer $\leftrightarrow$ Artist)
2. **Support Chat** (Customer or Artist $\leftrightarrow$ Admin)
3. **Sending Images in Messages** (Using the separate Image Upload API)
4. **Conversation Filters** (`all`, `unread`, `today`, `booking_active`)
5. **Real-Time Socket.IO Events** in Postman

---

## 🧩 Part 1: How to Create a Socket.IO Request in Postman (5 Simple Clicks)

Normally in Postman we create an **HTTP** request. For real-time chatting, we need a **Socket.IO** tab!

### Step 1: Open a Socket.IO Tab
1. Open **Postman**.
2. Look at the top-left corner and click the **`New`** button (next to "My Workspace").
3. A popup box will appear with icons (`HTTP`, `GraphQL`, `gRPC`, `WebSocket`, `Socket.IO`).
4. Click on **`Socket.IO`** (the lightning bolt icon ⚡).
   > 💡 **Important:** Do **NOT** click "WebSocket". Click **"Socket.IO"**!

---

### Step 2: Type the Server URL
In the URL bar at the top (where it says `Enter URL`), type:
```text
http://localhost:5000
```
*(If your server runs on another port, replace `5000` with your port number).*

---

### Step 3: Add Your Login Token (Authentication) 🔐
Our server is secure! It won't let strangers connect without a login token (`accessToken`).

You have **2 super easy ways** to add your token in the Postman Socket.IO tab:

#### ✅ Way A (Easiest — Headers Tab):
1. Click the **`Headers`** tab right below the URL bar.
2. In the **Key** box, type: `Authorization`
3. In the **Value** box, type: `Bearer YOUR_ACCESS_TOKEN_HERE`

#### ✅ Way B (Params Tab):
1. Click the **`Params`** tab right below the URL bar.
2. In the **Key** box, type: `token`
3. In the **Value** box, paste your `YOUR_ACCESS_TOKEN_HERE`

---

### Step 4: Add the Event Listeners (So You Can See Incoming Messages!) 🎧
Before clicking **Connect**, tell Postman which events to listen to so they pop up on your screen:

1. Look at the **`Events`** tab (next to `Message`, `Params`, `Headers`).
2. Click **`+ Add Event`** and add these event names (and make sure the toggle switch is **ON** ✅ for each):
   - `chat:connected` *(Tells you when you are connected!)*
   - `chat:new_message` *(Shows every new message in real-time!)*
   - `chat:conversation_updated` *(Shows updated unread count & last message!)*
   - `chat:messages_read` *(Shows when the other person read your messages!)*
   - `chat:user_typing` *(Shows when the other person is typing...)*
   - `chat:message_edited` *(Shows when a message is edited!)*
   - `chat:message_deleted` *(Shows when a message is deleted!)*
   - `chat:joined` *(Confirms you joined a chat room!)*
   - `chat:error` *(Shows any mistake/error clearly!)*
   - `user:online` *(Shows when a user comes online!)*
   - `user:offline` *(Shows when a user goes offline!)*

---

### Step 5: Click the Blue `Connect` Button! 🚀
1. Click **`Connect`** on the right side of the URL bar.
2. Down in the **Response / Messages** panel at the bottom, you will immediately see `Connected` and a message from **`chat:connected`**:
```json
{
  "success": true,
  "message": "Connected to Mimilini real-time chat server",
  "user": {
    "_id": "67f123...",
    "name": "Sarah Jenkins",
    "email": "sarah@example.com",
    "role": "customer"
  },
  "socketId": "xYz123AbC"
}
```
🎉 **Congratulations!** You are now connected to the real-time chat server!

> 💡 **Pro Tip for Testing Live Chat:**
> Open **two** Socket.IO tabs in Postman!
> - **Tab 1:** Connect using **Customer's Token**
> - **Tab 2:** Connect using **Artist's Token** (or **Admin's Token** for support chat)
> When you send a message in Tab 1, you will see it pop up instantly in Tab 2!

---

## 📡 Part 2: How to Send Socket Events in Postman

In your connected Socket.IO tab:
1. Click the **`Message`** tab (under the URL bar).
2. Change the format dropdown from `Text` to **`JSON`**.
3. In the **`Event Name`** box (bottom-left of the message editor, next to the `Send` button), type the event name (for example: `chat:send_message`).
4. Check the **`Acknowledgement`** checkbox (optional, shows the server's direct reply).
5. Click **`Send`**!

Here are all the Socket Events you can send:

---

### 1️⃣ Send a Normal Chat Message (Customer $\leftrightarrow$ Artist)
- **Event Name:** `chat:send_message`
- **Message (JSON):**

**Option A — If this is your FIRST message to the Artist (or Customer):**
```json
{
  "chatType": "normal",
  "receiverId": "PASTE_ARTIST_OR_CUSTOMER_USER_ID_HERE",
  "text": "Hi! Are you available for bridal makeup this Saturday?"
}
```
*(The server will automatically create the conversation and send the message!)*

**Option B — If you already have the `chatId`:**
```json
{
  "chatId": "PASTE_CHAT_ID_HERE",
  "text": "Sounds great, thank you!"
}
```

---

### 2️⃣ Send a Support Chat Message (Customer/Artist $\leftrightarrow$ Admin)
- **Event Name:** `chat:send_message`
- **Message (JSON):**

**When Customer or Artist writes to Admin Support (No Admin ID needed!):**
```json
{
  "chatType": "support",
  "text": "Hello Admin, I need help with my booking payment."
}
```

**When Admin replies to that Support Chat:**
```json
{
  "chatId": "PASTE_SUPPORT_CHAT_ID_HERE",
  "text": "Hi there! I am checking your booking right now. How can I help?"
}
```

---

### 3️⃣ Send a Message with Images (or Text + Images) 🖼️
First, upload your image(s) using the **HTTP Image Upload API** (see Part 3 below) to get the image URLs. Then send them in `images`:

- **Event Name:** `chat:send_message`
- **Message (JSON):**
```json
{
  "chatId": "PASTE_CHAT_ID_HERE",
  "text": "Here is the bridal look I want!",
  "images": [
    "https://your-s3-bucket.amazonaws.com/chatImages/look1.jpg",
    "https://your-s3-bucket.amazonaws.com/chatImages/look2.jpg"
  ]
}
```
*(You can also send ONLY `"images"` without `"text"`!)*

---

### 4️⃣ Join a Specific Chat Room
*(Note: You already receive messages automatically in your personal room `user:<yourId>`, but joining a chat room is great when a user opens a chat screen for typing indicators!)*
- **Event Name:** `chat:join`
- **Message (JSON):**
```json
{
  "chatId": "PASTE_CHAT_ID_HERE"
}
```

---

### 5️⃣ Mark Messages as Read ✅✅
- **Event Name:** `chat:mark_read`
- **Message (JSON):**
```json
{
  "chatId": "PASTE_CHAT_ID_HERE"
}
```
*(Resets your unread badge to `0` and notifies the other person via `chat:messages_read`!)*

---

### 6️⃣ Show "Typing..." Indicator ✍️
- **Event Name:** `chat:typing`
- **Message (JSON):**
```json
{
  "chatId": "PASTE_CHAT_ID_HERE",
  "isTyping": true
}
```
*(Send `"isTyping": false` when the user stops typing).*

---

### 7️⃣ Edit Your Message ✏️
- **Event Name:** `chat:edit_message`
- **Message (JSON):**
```json
{
  "chatId": "PASTE_CHAT_ID_HERE",
  "messageId": "PASTE_MESSAGE_ID_HERE",
  "text": "Updated message text here!"
}
```

---

### 8️⃣ Delete Your Message 🗑️
- **Event Name:** `chat:delete_message`
- **Message (JSON):**
```json
{
  "chatId": "PASTE_CHAT_ID_HERE",
  "messageId": "PASTE_MESSAGE_ID_HERE"
}
```

---

## 🌐 Part 3: Regular HTTP REST APIs in Postman

All HTTP endpoints require Header:
`Authorization: Bearer <YOUR_ACCESS_TOKEN>`

---

### 📸 1. Separate API to Upload Message Images
- **Method:** `POST`
- **URL:** `{{base_url}}/chats/upload-images` (e.g., `http://localhost:5000/api/v1/chats/upload-images`)
- **Body Type:** `form-data`
  - **Key:** `images` (Change key type from `Text` to **`File`** on the right side of the Key box!)
  - **Value:** Select 1 to 10 image files from your computer.
- **Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Chat message images uploaded successfully!",
  "data": {
    "images": [
      "https://mimilini-bucket.s3.ap-southeast-2.amazonaws.com/chatImages/17300000-photo.png"
    ]
  }
}
```
👉 Copy the URL(s) from `data.images` and pass them in `chat:send_message` or `POST /api/v1/chats/:chatId/messages`!

---

### 🗂️ 2. Get Conversations List with All 4 Filters
- **Method:** `GET`
- **URL:** `{{base_url}}/chats`

You can test all **4 filters** using Query Params:

| What You Want to See | URL in Postman |
| :--- | :--- |
| **1. All Conversations** | `GET {{base_url}}/chats?filter=all` |
| **2. Only Unread Conversations** | `GET {{base_url}}/chats?filter=unread` |
| **3. Only Today's Conversations** | `GET {{base_url}}/chats?filter=today` |
| **4. Only Active Booking Conversations** | `GET {{base_url}}/chats?filter=booking_active` *(or `filter=booking active`)* |

**Optional Extra Query Params:**
- `chatType=normal` (Only Customer $\leftrightarrow$ Artist chats)
- `chatType=support` (Only Support chats with Admin)
- `searchTerm=Sarah` (Search by name, business name, email, subject, or message text)
- `page=1&limit=20`

---

### 💬 3. Start or Get a Conversation (HTTP)
- **Method:** `POST`
- **URL:** `{{base_url}}/chats`
- **Body (`raw` $\rightarrow$ `JSON`):**

**For Normal Chat (Customer $\leftrightarrow$ Artist):**
```json
{
  "chatType": "normal",
  "participantId": "PASTE_ARTIST_OR_CUSTOMER_USER_ID",
  "bookingId": "OPTIONAL_BOOKING_ID",
  "initialMessage": "Hello! Excited for our upcoming booking!"
}
```

**For Support Chat (Customer or Artist $\leftrightarrow$ Admin):**
```json
{
  "chatType": "support",
  "subject": "Question about my refund",
  "initialMessage": "Hi Admin, could you check my wallet refund?"
}
```

---

### 📜 4. Get Messages Inside a Conversation
- **Method:** `GET`
- **URL:** `{{base_url}}/chats/:chatId/messages?page=1&limit=30`

---

### ✉️ 5. Send a Message via HTTP (Also Broadcasts Over Socket.IO!)
- **Method:** `POST`
- **URL:** `{{base_url}}/chats/:chatId/messages`
- **Body (`raw` $\rightarrow$ `JSON`):**
```json
{
  "text": "Here is the photo you asked for!",
  "images": [
    "https://mimilini-bucket.s3.ap-southeast-2.amazonaws.com/chatImages/17300000-photo.png"
  ]
}
```

---

### ✅ 6. Mark Conversation as Read via HTTP
- **Method:** `PATCH`
- **URL:** `{{base_url}}/chats/:chatId/read`

---

### ✏️ 7. Edit / Delete a Message via HTTP
- **Edit (`PATCH`):** `{{base_url}}/chats/:chatId/messages/:messageId` with body `{ "text": "Updated text" }`
- **Delete (`DELETE`):** `{{base_url}}/chats/:chatId/messages/:messageId`

