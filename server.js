const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');

// ================== KHỞI TẠO APP & SERVER ==================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ================== MULTER CONFIG ==================
const upload = multer({ dest: 'uploads/' });

// ================== MIDDLEWARE - THỨ TỰ QUAN TRỌNG ==================
// 1. Body parser ĐẦU TIÊN
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 2. Session SAU body parser
app.use(
  session({
    secret: "secret-key-2fate-motor-2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

// 3. Static files
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. EJS setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ================== MYSQL CONNECTION ==================
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "bike_store",
});

db.connect((err) => {
  if (err) console.error("❌ Lỗi kết nối MySQL:", err);
  else console.log("✅ Đã kết nối MySQL thành công!");
});

// ================== HELPER FUNCTIONS ==================
function getCartCount(userId, callback) {
  if (!userId) return callback(0);
  const sql = "SELECT SUM(quantity) AS total FROM cart WHERE user_id = ?";
  db.query(sql, [userId], (err, results) => {
    if (err) return callback(0);
    callback(results[0].total || 0);
  });
}

function updateExpiredOrdersInDB(callback = () => {}) {
  const sql = `
    UPDATE orders 
    SET payment_status = 'Hết hạn thanh toán'
    WHERE payment_status = 'Đang thanh toán'
    AND payment_expires_at <= NOW()
  `;
  
  db.query(sql, (err, result) => {
    if (err) {
      console.error("❌ Lỗi cập nhật đơn hàng hết hạn:", err);
    } else if (result.affectedRows > 0) {
      console.log(`✅ Đã cập nhật ${result.affectedRows} đơn hàng hết hạn`);
    }
    callback();
  });
}

// ================== RES.LOCALS MIDDLEWARE ==================
app.use((req, res, next) => {
  if (!req.session) {
    console.error('❌ Session not initialized!');
    res.locals.cartCount = 0;
    res.locals.user = null;
    return next();
  }

  if (req.session.user) {
    getCartCount(req.session.user.id, (count) => {
      res.locals.cartCount = count;
      res.locals.user = req.session.user;
      next();
    });
  } else {
    res.locals.cartCount = 0;
    res.locals.user = null;
    next();
  }
});

// ================== PROTECTION MIDDLEWARES ==================
function isLoggedIn(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/login");
  }
  next();
}

function isAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    console.error('❌ Session không tồn tại - chuyển về login');
    return res.redirect("/login");
  }
  
  if (req.session.user.role !== "admin") {
    console.log('⚠️ User không phải admin:', req.session.user.username);
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Truy cập bị từ chối</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .error-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          }
          .error-box i {
            font-size: 4rem;
            color: #e74c3c;
            margin-bottom: 20px;
          }
          .error-box h1 {
            color: #2c3e50;
            margin-bottom: 15px;
          }
          .error-box p {
            color: #7f8c8d;
            margin-bottom: 25px;
          }
          .error-box a {
            display: inline-block;
            padding: 12px 30px;
            background: #3498db;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            transition: 0.3s;
          }
          .error-box a:hover {
            background: #2980b9;
          }
        </style>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body>
        <div class="error-box">
          <i class="fas fa-exclamation-triangle"></i>
          <h1>❌ Truy cập bị từ chối</h1>
          <p>Bạn không có quyền truy cập vào trang quản trị.<br>Chỉ admin mới có thể truy cập khu vực này.</p>
          <a href="/index"><i class="fas fa-home"></i> Về trang chủ</a>
        </div>
      </body>
      </html>
    `);
  }
  
  console.log('✅ Admin access granted:', req.session.user.username);
  next();
}

// ================== SOCKET.IO EVENTS ==================
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('user_message', (data) => {
    const { userId, username, message } = data;
    const userEmail = `user_${userId}@chat.com`;
    
    const sql = `
      INSERT INTO contacts (name, email, message, status, created_at) 
      VALUES (?, ?, ?, 'pending', NOW())
    `;
    
    db.query(sql, [username, userEmail, message], (err, result) => {
      if (err) {
        console.error('❌ Lỗi lưu tin nhắn:', err);
        return;
      }
      
      const messageId = result.insertId;
      
      io.emit('new_user_message', {
        id: messageId,
        userId,
        username,
        email: userEmail,
        message,
        created_at: new Date(),
        status: 'pending'
      });
      
      socket.emit('message_sent', {
        id: messageId,
        message,
        created_at: new Date()
      });

      console.log(`✅ Tin nhắn mới #${messageId} từ ${username}`);
    });
  });

  socket.on('admin_reply', (data) => {
    const { userEmail, replyMessage } = data;
    
    if (!userEmail || !replyMessage) {
      console.error('❌ Thiếu userEmail hoặc replyMessage');
      return;
    }

    const sql = `
      INSERT INTO contacts (name, email, message, status, created_at)
      SELECT name, email, ?, 'replied', NOW()
      FROM contacts
      WHERE email = ?
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    db.query(sql, [`[ADMIN]: ${replyMessage}`, userEmail], (err, result) => {
      if (err) {
        console.error('❌ Lỗi lưu reply:', err);
        return;
      }
      
      io.emit('admin_message', {
        userEmail,
        message: replyMessage,
        created_at: new Date()
      });
      
      console.log(`✅ Admin đã trả lời ${userEmail}`);
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

// ================== PUBLIC ROUTES ==================
app.get("/", (req, res) =>
  res.render("index", { activePage: "home", user: req.session.user })
);

app.get("/index", (req, res) =>
  res.render("index", { activePage: "home", user: req.session.user })
);

app.get("/contact", (req, res) => {
  res.render("contact", {
    activePage: "contact",
    user: req.session.user
  });
});

app.post("/contact/submit", (req, res) => {
  const { name, email, message } = req.body;
  
  if (!name || !email || !message) {
    return res.status(400).json({ 
      success: false, 
      message: "Vui lòng điền đầy đủ thông tin!" 
    });
  }

  const sql = `
    INSERT INTO contacts (name, email, message, status, created_at) 
    VALUES (?, ?, ?, 'pending', NOW())
  `;

  db.query(sql, [name, email, message], (err, result) => {
    if (err) {
      console.error("❌ Lỗi gửi liên hệ:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Không thể gửi tin nhắn!" 
      });
    }

    res.json({ 
      success: true, 
      message: "Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm." 
    });
  });
});

app.get("/event", (req, res) =>
  res.render("event", { activePage: "event", user: req.session.user })
);

app.get("/discount", (req, res) =>
  res.render("discount", { activePage: "discount", user: req.session.user })
);

app.get("/blog", (req, res) =>
  res.render("blog", { activePage: "blog", user: req.session.user })
);

// ================== AUTH ROUTES ==================
app.get("/login", (req, res) => res.render("login"));
app.get("/register", (req, res) => res.render("register"));
app.get("/forgot-password", (req, res) => res.render("forgot-password"));

app.post("/register", (req, res) => {
  const { username, email, password } = req.body;
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.send("Lỗi đăng ký!");
    const sql = "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";
    db.query(sql, [username, email, hashedPassword], (err) => {
      if (err) return res.send("Đăng ký thất bại!");
      res.redirect("/login");
    });
  });
});

// ================== CẬP NHẬT ROUTE LOGIN VỚI KIỂM TRA CẤM ==================
// Thay thế route POST "/login" hiện tại bằng code này
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.send(`
      <script>
        alert('Vui lòng nhập đầy đủ email và mật khẩu!');
        window.location.href = '/login';
      </script>
    `);
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error("❌ Lỗi database:", err);
      return res.send("❌ Lỗi cơ sở dữ liệu!");
    }
    
    if (results.length === 0) {
      return res.send(`
        <script>
          alert('❌ Email không tồn tại!');
          window.location.href = '/login';
        </script>
      `);
    }

    const user = results[0];
    const accountStatus = user.account_status || 'active';
    
    // ✅ KIỂM TRA TRẠNG THÁI TÀI KHOẢN TRƯỚC KHI KIỂM TRA PASSWORD
    if (accountStatus === 'banned') {
      const banReason = user.ban_reason || 'Không có lý do cụ thể';
      const bannedAt = user.banned_at 
        ? new Date(user.banned_at).toLocaleDateString('vi-VN')
        : 'N/A';
      const banSessionId = user.ban_session_id || '';
      
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Tài khoản bị cấm</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .ban-box {
              background: white;
              padding: 40px;
              border-radius: 10px;
              text-align: center;
              max-width: 600px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            }
            .ban-box i {
              font-size: 5rem;
              color: #dc3545;
              margin-bottom: 20px;
            }
            .ban-box h1 {
              color: #dc3545;
              margin-bottom: 15px;
            }
            .ban-box .info {
              background: #f8d7da;
              border: 1px solid #f5c6cb;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              text-align: left;
            }
            .ban-box .info strong {
              color: #721c24;
            }
            .contact-section {
              background: #e7f3ff;
              border: 2px solid #0066cc;
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
            }
            .contact-section h3 {
              color: #0066cc;
              margin-top: 0;
            }
            .alert {
              padding: 12px;
              border-radius: 5px;
              margin: 15px 0;
              text-align: left;
            }
            .alert-info {
              background: #cfe2ff;
              border: 1px solid #9ec5fe;
              color: #084298;
            }
            .contact-form textarea {
              width: 100%;
              padding: 12px;
              border: 1px solid #ddd;
              border-radius: 5px;
              margin: 10px 0;
              font-size: 14px;
              resize: vertical;
              min-height: 100px;
              box-sizing: border-box;
            }
            .btn {
              display: inline-block;
              padding: 12px 30px;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              transition: 0.3s;
              margin: 5px;
              border: none;
              cursor: pointer;
              font-size: 14px;
            }
            .btn-primary {
              background: #0066cc;
            }
            .btn-primary:hover {
              background: #0052a3;
            }
            .btn-primary:disabled {
              background: #999;
              cursor: not-allowed;
            }
            .btn-secondary {
              background: #6c757d;
            }
            .btn-secondary:hover {
              background: #5a6268;
            }
            .success-message {
              background: #d4edda;
              border: 1px solid #c3e6cb;
              color: #155724;
              padding: 12px;
              border-radius: 5px;
              margin: 10px 0;
              display: none;
            }
            .error-message {
              background: #f8d7da;
              border: 1px solid #f5c6cb;
              color: #721c24;
              padding: 12px;
              border-radius: 5px;
              margin: 10px 0;
              display: none;
            }
            .mt-3 { margin-top: 15px; }
            .mb-3 { margin-bottom: 15px; }
            .p-3 { padding: 15px; }
          </style>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        </head>
        <body>
          <div class="ban-box">
            <i class="fas fa-ban"></i>
            <h1>🚫 Tài khoản bị cấm</h1>
            <p>Tài khoản của bạn đã bị khóa và không thể đăng nhập.</p>
            
            <div class="info">
              <strong>Email:</strong> ${user.email}<br><br>
              <strong>Lý do:</strong><br>
              ${banReason}<br><br>
              <strong>Thời gian:</strong> ${bannedAt}
            </div>
            
            <div class="contact-section">
              <h3><i class="fas fa-envelope"></i> Yêu cầu mở khóa tài khoản</h3>
              <p style="margin: 10px 0; color: #333;">
                Nếu bạn cho rằng đây là nhầm lẫn hoặc muốn khiếu nại, vui lòng gửi yêu cầu:
              </p>
              
              <div class="alert alert-info mb-3">
                <strong>📌 Lưu ý quan trọng:</strong><br>
                • Bạn chỉ được gửi <strong>1 yêu cầu duy nhất cho mỗi lần bị cấm</strong><br>
                • Sau khi gửi, vui lòng đợi admin xử lý<br>
                • Không thể gửi thêm yêu cầu cho đến khi được xử lý
              </div>
              
              <div class="contact-form">
                <textarea id="appealMessage" placeholder="Nhập lý do yêu cầu mở khóa của bạn...&#10;&#10;Ví dụ: Tôi nghĩ đây là nhầm lẫn vì... / Tôi xin lỗi về hành vi trước đó và hứa sẽ..."></textarea>
                
                <div class="success-message" id="successMessage">
                  ✅ Yêu cầu của bạn đã được gửi! Admin sẽ xem xét và phản hồi sớm.
                </div>
                
                <div class="error-message" id="errorMessage">
                  ❌ Không thể gửi yêu cầu. Vui lòng thử lại!
                </div>
                
                <button class="btn btn-primary" id="btnSubmit" onclick="sendAppeal()">
                  <i class="fas fa-paper-plane"></i> Gửi yêu cầu
                </button>
              </div>
              
              <div class="mt-3 p-3" style="background: #f8f9fa; border-radius: 5px;">
                <h6 style="margin-bottom: 10px; color: #0066cc;">
                  <i class="fas fa-phone"></i> Cần hỗ trợ khẩn cấp?
                </h6>
                <p style="margin: 5px 0; font-size: 14px;">
                  📞 <strong>Hotline:</strong> 1900-xxxx (8:00 - 22:00)<br>
                  📧 <strong>Email:</strong> support@bikestore.com<br>
                  💬 <strong>Zalo:</strong> 0123-456-789
                </p>
              </div>
            </div>
            
            <a href="/index" class="btn btn-secondary">
              <i class="fas fa-home"></i> Về trang chủ
            </a>
          </div>
          
          <script>
            async function sendAppeal() {
              const message = document.getElementById('appealMessage').value;
              const successMsg = document.getElementById('successMessage');
              const errorMsg = document.getElementById('errorMessage');
              const btnSubmit = document.getElementById('btnSubmit');
              const textarea = document.getElementById('appealMessage');
              
              if (!message || message.trim().length < 10) {
                errorMsg.textContent = '❌ Vui lòng nhập ít nhất 10 ký tự!';
                errorMsg.style.display = 'block';
                successMsg.style.display = 'none';
                return;
              }
              
              btnSubmit.disabled = true;
              btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
              
              try {
                const response = await fetch('/api/send-ban-appeal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: '${user.email}',
                    userId: ${user.id},
                    banSessionId: '${banSessionId}',
                    message: message.trim()
                  })
                });
                
                const data = await response.json();
                
                if (data.success) {
                  successMsg.innerHTML = '✅ ' + data.message + '<br><small>💡 Admin sẽ xem xét yêu cầu của bạn trong thời gian sớm nhất.</small>';
                  successMsg.style.display = 'block';
                  errorMsg.style.display = 'none';
                  textarea.value = '';
                  textarea.disabled = true;
                  btnSubmit.disabled = true;
                  btnSubmit.innerHTML = '<i class="fas fa-check-circle"></i> Đã gửi';
                } else {
                  if (data.message.includes('đợi') || data.message.includes('giờ')) {
                    errorMsg.innerHTML = '⏳ <strong>' + data.message + '</strong>';
                  } else {
                    errorMsg.innerHTML = '❌ ' + data.message;
                  }
                  errorMsg.style.display = 'block';
                  successMsg.style.display = 'none';
                  btnSubmit.disabled = false;
                  btnSubmit.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi yêu cầu';
                }
              } catch (error) {
                console.error('Fetch error:', error);
                errorMsg.textContent = '❌ Lỗi kết nối. Vui lòng thử lại!';
                errorMsg.style.display = 'block';
                successMsg.style.display = 'none';
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi yêu cầu';
              }
            }
          </script>
        </body>
        </html>
      `);
    }
    
    if (accountStatus === 'suspended') {
      const suspendedUntil = user.suspended_until 
        ? new Date(user.suspended_until).toLocaleString('vi-VN')
        : 'N/A';
      const banReason = user.ban_reason || 'Không có lý do cụ thể';
      
      if (user.suspended_until && new Date(user.suspended_until) <= new Date()) {
        db.query(
          "UPDATE users SET account_status = 'active', ban_reason = NULL, banned_at = NULL, banned_by = NULL, suspended_until = NULL WHERE id = ?",
          [user.id],
          (updateErr) => {
            if (updateErr) {
              console.error('❌ Lỗi tự động mở khóa:', updateErr);
            } else {
              console.log(`✅ Tự động mở khóa user #${user.id}`);
            }
          }
        );
      } else {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Tài khoản tạm khóa</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              }
              .suspend-box {
                background: white;
                padding: 40px;
                border-radius: 10px;
                text-align: center;
                max-width: 500px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
              }
              .suspend-box i {
                font-size: 5rem;
                color: #ffc107;
                margin-bottom: 20px;
              }
              .suspend-box h1 {
                color: #856404;
                margin-bottom: 15px;
              }
              .suspend-box .info {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 5px;
                padding: 15px;
                margin: 20px 0;
                text-align: left;
              }
              .suspend-box a {
                display: inline-block;
                padding: 12px 30px;
                background: #6c757d;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                transition: 0.3s;
                margin-top: 20px;
              }
              .suspend-box a:hover {
                background: #5a6268;
              }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
          </head>
          <body>
            <div class="suspend-box">
              <i class="fas fa-pause-circle"></i>
              <h1>⏸️ Tài khoản tạm khóa</h1>
              <p>Tài khoản của bạn đang bị tạm khóa.</p>
              
              <div class="info">
                <strong>Lý do:</strong><br>
                ${banReason}<br><br>
                <strong>Mở khóa vào:</strong> ${suspendedUntil}
              </div>
              
              <p style="color: #6c757d; font-size: 0.9rem;">
                Vui lòng đợi đến thời gian mở khóa hoặc liên hệ quản trị viên.
              </p>
              
              <a href="/index"><i class="fas fa-home"></i> Về trang chủ</a>
            </div>
          </body>
          </html>
        `);
      }
    }
    
    // ✅ KIỂM TRA MẬT KHẨU
    const isMatch = bcrypt.compareSync(password, user.password);
    
    if (!isMatch) {
      return res.send(`
        <script>
          alert('❌ Sai mật khẩu!');
          window.location.href = '/login';
        </script>
      `);
    }

    // ✅ CẬP NHẬT THỜI GIAN ĐĂNG NHẬP
    db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id], (updateErr) => {
      if (updateErr) {
        console.error('⚠️ Lỗi cập nhật last_login:', updateErr);
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      req.session.save((err) => {
        if (err) {
          console.error('❌ Lỗi lưu session:', err);
          return res.send('Lỗi đăng nhập!');
        }

        console.log('✅ User logged in:', user.username, 'Role:', user.role);
        
        if (user.role === "admin") {
          res.redirect("/admin");
        } else {
          res.redirect("/index");
        }
      });
    });
  });
});

app.get("/logout", (req, res) => {
  const userId = req.session?.user?.id;
  
  if (userId) {
    // ✅ CẬP NHẬT THỜI GIAN ĐĂNG XUẤT
    db.query("UPDATE users SET last_logout = NOW() WHERE id = ?", [userId], (err) => {
      if (err) {
        console.error('❌ Lỗi cập nhật last_logout:', err);
      }
      
      req.session.destroy((err) => {
        if (err) console.error('❌ Lỗi logout:', err);
        res.redirect("/index");
      });
    });
  } else {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) console.error('❌ Lỗi logout:', err);
        res.redirect("/index");
      });
    } else {
      res.redirect("/index");
    }
  }
});
// ================== USER PROTECTED ROUTES ==================
app.get("/profile", isLoggedIn, (req, res) => {
  res.render("profile", { activePage: "profile", user: req.session.user });
});

app.post("/profile/update", isLoggedIn, (req, res) => {
  const { username, email, password } = req.body;
  let sql, params;

  if (password && password.trim() !== "") {
    const hashed = bcrypt.hashSync(password, 10);
    sql = "UPDATE users SET username = ?, email = ?, password = ? WHERE id = ?";
    params = [username, email, hashed, req.session.user.id];
  } else {
    sql = "UPDATE users SET username = ?, email = ? WHERE id = ?";
    params = [username, email, req.session.user.id];
  }

  db.query(sql, params, (err) => {
    if (err) return res.send("❌ Lỗi cập nhật hồ sơ!");
    req.session.user.username = username;
    req.session.user.email = email;
    res.redirect("/profile");
  });
});

app.get("/settings", isLoggedIn, (req, res) => {
  res.render("settings", {
    activePage: "settings",
    user: req.session.user,
    cartCount: res.locals.cartCount || 0
  });
});

// ================== PRODUCT ROUTES ==================
app.get("/api/products", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    if (err) return res.status(500).json({ error: "Lỗi database" });
    res.json(results);
  });
});

app.get("/api/products/:id", (req, res) => {
  const id = req.params.id;
  db.query("SELECT * FROM products WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ error: "Lỗi database" });
    res.json(results[0] || {});
  });
});

// API lấy tồn kho tất cả chi nhánh (cho user xem)
app.get("/api/warehouses/inventory", (req, res) => {
  const sql = `
    SELECT 
      i.product_id,
      i.warehouse_id,
      i.quantity,
      w.name as warehouse_name,
      w.address as warehouse_address
    FROM inventory i
    JOIN warehouses w ON i.warehouse_id = w.id
    WHERE w.status = 'active'
    ORDER BY w.name, i.product_id
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi tải tồn kho:", err);
      return res.json([]);
    }
    res.json(results);
  });
});

app.get("/product/:id", (req, res) => {
  const id = req.params.id;
  db.query("SELECT * FROM products WHERE id = ?", [id], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      res.render("product_detail", {
        product: results[0],
        activePage: "product",
        user: req.session.user,
      });
    } else {
      res.status(404).send("Sản phẩm không tồn tại");
    }
  });
});

app.get("/search", (req, res) => {
  const sql = "SELECT * FROM categories";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Lỗi tải categories:", err);
      return res.status(500).send("Lỗi server!");
    }

    const types = results.filter(c => c.type_category === "type");
    const ccs = results.filter(c => c.type_category === "cc");
    const colors = results.filter(c => c.type_category === "color");

    res.render("search", {
      activePage: "search",
      user: req.session.user,
      types,
      ccs,
      colors
    });
  });
});

// ================== CART ROUTES - CẬP NHẬT ==================
app.post("/cart/add", isLoggedIn, (req, res) => {
  const { productId, warehouseId, color, quantity } = req.body;
  const userId = req.session.user.id;
  
  if (!warehouseId) {
    return res.status(400).json({ 
      success: false, 
      message: "Vui lòng chọn chi nhánh!" 
    });
  }
  
  // Kiểm tra tồn kho trước khi thêm
  const checkStockSql = `
    SELECT quantity 
    FROM inventory 
    WHERE warehouse_id = ? AND product_id = ?
  `;
  
  db.query(checkStockSql, [warehouseId, productId], (err, stockResult) => {
    if (err) {
      console.error("❌ Lỗi kiểm tra tồn kho:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Lỗi kiểm tra tồn kho!" 
      });
    }
    
    if (stockResult.length === 0 || stockResult[0].quantity < quantity) {
      const available = stockResult.length > 0 ? stockResult[0].quantity : 0;
      return res.json({ 
        success: false, 
        message: `Chi nhánh này chỉ còn ${available} sản phẩm!` 
      });
    }
    
    // Kiểm tra xem đã có trong giỏ chưa
    const checkCartSql = `
      SELECT id, quantity 
      FROM cart 
      WHERE user_id = ? AND product_id = ? AND warehouse_id = ? AND color = ?
    `;
    
    db.query(checkCartSql, [userId, productId, warehouseId, color], (err2, cartResult) => {
      if (err2) {
        return res.status(500).json({ 
          success: false, 
          message: "Lỗi kiểm tra giỏ hàng!" 
        });
      }
      
      if (cartResult.length > 0) {
        // Đã có trong giỏ -> cập nhật số lượng
        const newQty = cartResult[0].quantity + quantity;
        
        if (newQty > stockResult[0].quantity) {
          return res.json({ 
            success: false, 
            message: `Không đủ hàng! Chỉ còn ${stockResult[0].quantity} sản phẩm.` 
          });
        }
        
        const updateSql = "UPDATE cart SET quantity = ? WHERE id = ?";
        db.query(updateSql, [newQty, cartResult[0].id], (err3) => {
          if (err3) {
            return res.status(500).json({ 
              success: false, 
              message: "Lỗi cập nhật giỏ hàng!" 
            });
          }
          
          getCartCount(userId, (count) => {
            res.json({ success: true, cartCount: count });
          });
        });
      } else {
        // Chưa có -> thêm mới
        const insertSql = `
          INSERT INTO cart (user_id, product_id, warehouse_id, color, quantity)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        db.query(insertSql, [userId, productId, warehouseId, color, quantity], (err3) => {
          if (err3) {
            return res.status(500).json({ 
              success: false, 
              message: "Lỗi thêm vào giỏ hàng!" 
            });
          }
          
          getCartCount(userId, (count) => {
            res.json({ success: true, cartCount: count });
          });
        });
      }
    });
  });
});

// ================== MIDDLEWARE ĐẾM YÊU CẦU MỞ KHÓA ==================
// Thêm vào phần RES.LOCALS MIDDLEWARE trong server.js
// (Sau middleware getCartCount)

app.use((req, res, next) => {
  if (!req.session) {
    console.error('❌ Session not initialized!');
    res.locals.cartCount = 0;
    res.locals.user = null;
    res.locals.pendingAppealsCount = 0; // ✅ THÊM DÒNG NÀY
    return next();
  }

  // Đếm số yêu cầu mở khóa chờ xử lý (chỉ cho admin)
  function getPendingAppealsCount(callback) {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return callback(0);
    }
    
    const sql = `
      SELECT COUNT(*) as count 
      FROM contacts 
      WHERE name LIKE '[BAN APPEAL]%' 
      AND status = 'pending'
    `;
    
    db.query(sql, (err, results) => {
      if (err) {
        console.error('❌ Lỗi đếm ban appeals:', err);
        return callback(0);
      }
      callback(results[0].count || 0);
    });
  }

  if (req.session.user) {
    getCartCount(req.session.user.id, (count) => {
      res.locals.cartCount = count;
      res.locals.user = req.session.user;
      
      // ✅ ĐẾM BAN APPEALS CHO ADMIN
      if (req.session.user.role === 'admin') {
        getPendingAppealsCount((appealsCount) => {
          res.locals.pendingAppealsCount = appealsCount;
          next();
        });
      } else {
        res.locals.pendingAppealsCount = 0;
        next();
      }
    });
  } else {
    res.locals.cartCount = 0;
    res.locals.user = null;
    res.locals.pendingAppealsCount = 0;
    next();
  }
});

app.get("/cart", isLoggedIn, (req, res) => {
  const userId = req.session.user.id;
  
  const sql = `
    SELECT 
      c.id, 
      c.product_id, 
      c.warehouse_id,
      c.color, 
      c.quantity as cart_quantity,
      p.name, 
      p.price, 
      p.image,
      w.name as warehouse_name,
      i.quantity as stock_quantity
    FROM cart c
    JOIN products p ON c.product_id = p.id
    JOIN warehouses w ON c.warehouse_id = w.id
    LEFT JOIN inventory i ON i.warehouse_id = c.warehouse_id AND i.product_id = c.product_id
    WHERE c.user_id = ?
  `;
  
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("❌ Lỗi tải giỏ hàng:", err);
      return res.status(500).send("Lỗi khi tải giỏ hàng");
    }
    
    // Kiểm tra các sản phẩm không còn đủ hàng
    const warnings = [];
    results.forEach(item => {
      const stockQty = item.stock_quantity || 0;
      if (stockQty < item.cart_quantity) {
        warnings.push({
          productName: item.name,
          warehouse: item.warehouse_name,
          requested: item.cart_quantity,
          available: stockQty
        });
      }
    });
    
    res.render("cart", {
      activePage: "cart",
      user: req.session.user,
      cartItems: results,
      warnings: warnings
    });
  });
});

app.post("/cart/update/:id", isLoggedIn, (req, res) => {
  const cartId = req.params.id;
  const { quantity } = req.body;

  if (quantity <= 0) {
    db.query("DELETE FROM cart WHERE id = ?", [cartId], (err) => {
      if (err) return res.status(500).send("Lỗi xóa sản phẩm");
      res.redirect("/cart");
    });
  } else {
    // Kiểm tra tồn kho trước khi cập nhật
    const checkSql = `
      SELECT c.warehouse_id, c.product_id, i.quantity as stock_quantity
      FROM cart c
      LEFT JOIN inventory i ON i.warehouse_id = c.warehouse_id AND i.product_id = c.product_id
      WHERE c.id = ?
    `;
    
    db.query(checkSql, [cartId], (err, result) => {
      if (err || result.length === 0) {
        return res.status(500).send("Lỗi kiểm tra giỏ hàng");
      }
      
      const stockQty = result[0].stock_quantity || 0;
      if (quantity > stockQty) {
        return res.send(`
          <script>
            alert('❌ Không đủ hàng! Chỉ còn ${stockQty} sản phẩm.');
            window.location.href = '/cart';
          </script>
        `);
      }
      
      db.query("UPDATE cart SET quantity = ? WHERE id = ?", [quantity, cartId], (err) => {
        if (err) return res.status(500).send("Lỗi cập nhật số lượng");
        res.redirect("/cart");
      });
    });
  }
});

app.post("/cart/delete/:id", isLoggedIn, (req, res) => {
  const cartId = req.params.id;
  db.query("DELETE FROM cart WHERE id = ?", [cartId], (err) => {
    if (err) return res.status(500).send("Không thể xóa sản phẩm");
    res.redirect("/cart");
  });
});

// ================== ORDER ROUTES ==================
app.get("/orders", isLoggedIn, (req, res) => {
  const userId = req.session.user.id;
  
  updateExpiredOrdersInDB(() => {
    const sql = `
      SELECT 
        o.id,
        o.created_at,
        o.total_price,
        o.payment_status,
        o.address,
        o.phone,
        o.payment_expires_at
      FROM orders o
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `;

    db.query(sql, [userId], (err, orders) => {
      if (err) {
        console.error("❌ Lỗi tải đơn hàng:", err);
        return res.status(500).send("Lỗi tải đơn hàng!");
      }

      if (orders.length === 0) {
        return res.render("order", {
          activePage: "orders",
          user: req.session.user,
          currentOrders: [],
          completedOrders: []
        });
      }

      const orderIds = orders.map(o => o.id);
      const itemsSql = `
        SELECT 
          oi.order_id,
          oi.quantity,
          oi.price,
          p.name,
          p.image
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id IN (?)
      `;

      db.query(itemsSql, [orderIds], (err2, allItems) => {
        if (err2) {
          console.error("❌ Lỗi tải items:", err2);
          return res.status(500).send("Lỗi tải sản phẩm!");
        }

        orders.forEach(order => {
          order.items = allItems.filter(item => item.order_id === order.id);
        });

        res.render("order", {
          activePage: "orders",
          user: req.session.user,
          currentOrders: orders,
          completedOrders: []
        });
      });
    });
  });
});

app.get("/api/orders/:id", isLoggedIn, (req, res) => {
  const orderId = req.params.id;
  const userId = req.session.user.id;
  
  const orderSql = `SELECT * FROM orders WHERE id = ? AND user_id = ?`;
  
  db.query(orderSql, [orderId, userId], (err, orderResult) => {
    if (err) {
      console.error("❌ Lỗi truy vấn đơn hàng:", err);
      return res.json({ success: false, message: "Lỗi truy vấn đơn hàng!" });
    }
    
    if (orderResult.length === 0) {
      return res.json({ success: false, message: "Không tìm thấy đơn hàng!" });
    }
    
    const order = orderResult[0];
    
    const itemsSql = `
      SELECT oi.*, p.name, p.image
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `;
    
    db.query(itemsSql, [orderId], (err2, items) => {
      if (err2) {
        console.error("❌ Lỗi truy vấn sản phẩm:", err2);
        return res.json({ success: false, message: "Lỗi truy vấn sản phẩm!" });
      }
      
      res.json({ 
        success: true, 
        order: order,
        items: items 
      });
    });
  });
});

app.post("/api/orders/:id/expire", isLoggedIn, (req, res) => {
  const orderId = req.params.id;
  const userId = req.session.user.id;
  
  const sql = `
    UPDATE orders 
    SET payment_status = 'Hết hạn thanh toán'
    WHERE id = ? AND user_id = ? AND payment_status = 'Đang thanh toán'
  `;
  
  db.query(sql, [orderId, userId], (err, result) => {
    if (err) {
      console.error("❌ Lỗi cập nhật trạng thái:", err);
      return res.json({ success: false });
    }
    
    console.log(`✅ Đơn hàng #${orderId} đã hết hạn`);
    res.json({ success: true, updated: result.affectedRows > 0 });
  });
});

// ================== CHECKOUT ROUTES - CẬP NHẬT ==================
app.get("/checkout/address", isLoggedIn, (req, res) => {
  res.render("checkout_address", {
    activePage: "checkout",
    user: req.session.user
  });
});

app.post("/checkout/address", isLoggedIn, (req, res) => {
  const { address, phone } = req.body;
  const userId = req.session.user.id;

  // Lấy giỏ hàng với thông tin kho
  const cartSql = `
    SELECT 
      c.product_id, 
      c.warehouse_id,
      c.quantity as cart_quantity, 
      p.price,
      i.quantity as stock_quantity
    FROM cart c
    JOIN products p ON c.product_id = p.id
    LEFT JOIN inventory i ON i.warehouse_id = c.warehouse_id AND i.product_id = c.product_id
    WHERE c.user_id = ?
  `;

  db.query(cartSql, [userId], (err, cartItems) => {
    if (err) {
      console.error("❌ Lỗi lấy giỏ hàng:", err);
      return res.status(500).send("Không thể xử lý giỏ hàng!");
    }

    if (cartItems.length === 0) {
      return res.status(400).send("Giỏ hàng trống!");
    }

    // Kiểm tra tồn kho từng sản phẩm
    const outOfStock = [];
    cartItems.forEach(item => {
      const stockQty = item.stock_quantity || 0;
      if (stockQty < item.cart_quantity) {
        outOfStock.push({
          product_id: item.product_id,
          requested: item.cart_quantity,
          available: stockQty
        });
      }
    });

    if (outOfStock.length > 0) {
      return res.status(400).send(`
        <script>
          alert('❌ Một số sản phẩm không đủ hàng!\\n${outOfStock.map(i => 
            `Sản phẩm #${i.product_id}: Yêu cầu ${i.requested}, còn ${i.available}`
          ).join('\\n')}');
          window.location.href = '/cart';
        </script>
      `);
    }

    // Tính tổng tiền
    const total = cartItems.reduce((sum, item) => sum + item.price * item.cart_quantity, 0);

    // Tạo đơn hàng
    const orderSql = `
      INSERT INTO orders (
        user_id, address, phone, total_price, payment_status, 
        created_at, payment_expires_at
      )
      VALUES (?, ?, ?, ?, 'Đang thanh toán', NOW(), DATE_ADD(NOW(), INTERVAL 15 MINUTE))
    `;

    db.query(orderSql, [userId, address, phone, total], (err, result) => {
      if (err) {
        console.error("❌ Lỗi tạo đơn hàng:", err);
        return res.status(500).send("Không thể lưu thông tin giao hàng!");
      }

      const orderId = result.insertId;
      
      // Thêm order items với warehouse_id
      const insertItems = `
        INSERT INTO order_items (order_id, product_id, warehouse_id, quantity, price)
        SELECT ?, c.product_id, c.warehouse_id, c.quantity, p.price
        FROM cart c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?
      `;
      
      db.query(insertItems, [orderId, userId], (err2) => {
        if (err2) {
          console.error("❌ Lỗi lưu order_items:", err2);
          return res.status(500).send("Không thể lưu chi tiết đơn hàng!");
        }
        
        console.log(`✅ Đã tạo đơn hàng #${orderId}`);
        res.redirect(`/checkout?orderId=${orderId}`);
      });
    });
  });
});

app.get("/checkout", isLoggedIn, (req, res) => {
  const { orderId } = req.query;
  const userId = req.session.user.id;

  if (!orderId) {
    return res.status(400).send("Thiếu mã đơn hàng!");
  }

  const orderSql = `SELECT * FROM orders WHERE id = ? AND user_id = ?`;

  db.query(orderSql, [orderId, userId], (err, orderResult) => {
    if (err) {
      console.error("Lỗi truy vấn đơn hàng:", err);
      return res.status(500).send("Không thể tải thông tin đơn hàng!");
    }

    if (orderResult.length === 0) {
      return res.status(404).send("Không tìm thấy đơn hàng!");
    }

    const order = orderResult[0];
    let remainingTime = 0;
    let isExpired = false;
    
    if (order.payment_expires_at) {
      const now = new Date();
      const expireTime = new Date(order.payment_expires_at);
      remainingTime = Math.floor((expireTime - now) / 1000);
      
      if (remainingTime <= 0) {
        remainingTime = 0;
        isExpired = true;
        
        if (order.payment_status === 'Đang thanh toán') {
          db.query(
            "UPDATE orders SET payment_status = 'Hết hạn thanh toán' WHERE id = ?",
            [orderId],
            (updateErr) => {
              if (updateErr) console.error("❌ Lỗi cập nhật trạng thái hết hạn:", updateErr);
            }
          );
        }
      }
    }

    const cartSql = `
      SELECT c.product_id, c.quantity, c.color, p.name, p.price, p.image
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ?
    `;

    db.query(cartSql, [userId], (err, cartItems) => {
      if (err) {
        console.error("Lỗi truy vấn giỏ hàng:", err);
        return res.status(500).send("Không thể tải danh sách sản phẩm!");
      }

      const total = order.total_price || 0;
      const address = order.address || "Chưa có";
      const phone = order.phone || "Chưa có";

      const bankId = "970422";
      const accountNo = "123456789";
      const accountName = encodeURIComponent("Nguyen Van A");
      const addInfo = encodeURIComponent(`DH_${orderId}_${userId}`);
      const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${total}&addInfo=${addInfo}&accountName=${accountName}`;

      res.render("checkout", {
        activePage: "checkout",
        user: req.session.user,
        order,
        cartItems,
        total,
        address,
        phone,
        qrUrl,
        remainingTime,
        isExpired
      });
    });
  });
});

app.post("/checkout/confirm", isLoggedIn, (req, res) => {
  const userId = req.session.user.id;
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).send("Thiếu mã đơn hàng!");
  }

  // Lấy thông tin đơn hàng
  const orderItemsSql = `
    SELECT oi.product_id, oi.warehouse_id, oi.quantity
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.id = ? AND o.user_id = ? AND o.payment_status = 'Đang thanh toán'
  `;

  db.query(orderItemsSql, [orderId, userId], (err, items) => {
    if (err || items.length === 0) {
      return res.status(400).send("Đơn hàng không hợp lệ!");
    }

    // Kiểm tra tồn kho lần cuối trước khi trừ
    const checkPromises = items.map(item => {
      return new Promise((resolve, reject) => {
        const checkSql = `
          SELECT quantity 
          FROM inventory 
          WHERE warehouse_id = ? AND product_id = ?
        `;
        
        db.query(checkSql, [item.warehouse_id, item.product_id], (err, result) => {
          if (err) return reject(err);
          
          const available = result[0]?.quantity || 0;
          if (available < item.quantity) {
            return reject(new Error(`Sản phẩm #${item.product_id} không đủ hàng`));
          }
          
          resolve();
        });
      });
    });

    Promise.all(checkPromises)
      .then(() => {
        // Trừ tồn kho
        const updatePromises = items.map(item => {
          return new Promise((resolve, reject) => {
            const updateSql = `
              UPDATE inventory 
              SET quantity = quantity - ?
              WHERE warehouse_id = ? AND product_id = ?
            `;
            
            db.query(updateSql, [item.quantity, item.warehouse_id, item.product_id], (err) => {
              if (err) return reject(err);
              
              // Ghi log giao dịch
              const logSql = `
                INSERT INTO warehouse_transactions 
                  (warehouse_id, product_id, transaction_type, quantity, 
                   reference_type, reference_id, created_by)
                VALUES (?, ?, 'export', ?, 'order', ?, ?)
              `;
              
              db.query(logSql, [
                item.warehouse_id, 
                item.product_id, 
                item.quantity, 
                orderId, 
                userId
              ], (err2) => {
                if (err2) console.error("⚠️ Lỗi ghi log:", err2);
                resolve();
              });
            });
          });
        });

        return Promise.all(updatePromises);
      })
      .then(() => {
        // Cập nhật trạng thái đơn hàng
        const updateOrderSql = `
          UPDATE orders 
          SET payment_status = 'Đã thanh toán' 
          WHERE id = ? AND user_id = ?
        `;

        db.query(updateOrderSql, [orderId, userId], (err) => {
          if (err) {
            console.error("❌ Lỗi cập nhật đơn hàng:", err);
            return res.status(500).send("Không thể xác nhận thanh toán!");
          }

          // Xóa giỏ hàng
          db.query("DELETE FROM cart WHERE user_id = ?", [userId], (err2) => {
            if (err2) console.error("Lỗi xóa giỏ hàng:", err2);
            
            console.log(`✅ Đơn hàng #${orderId} đã hoàn tất - Đã trừ tồn kho`);
            res.redirect("/order-success");
          });
        });
      })
      .catch(err => {
        console.error("❌ Lỗi xử lý thanh toán:", err);
        res.status(400).send(`
          <script>
            alert('❌ ${err.message}\\nVui lòng kiểm tra lại giỏ hàng!');
            window.location.href = '/cart';
          </script>
        `);
      });
  });
});

app.get("/order-success", isLoggedIn, (req, res) => {
  res.render("order_success", { user: req.session.user, activePage: "success" });
});

// ================== BAN APPEAL API - THÊM VÀO SERVER.JS ==================
// Thêm route này vào phần PUBLIC ROUTES hoặc trước ADMIN ROUTES

// API nhận yêu cầu mở khóa từ user bị cấm
app.post("/api/send-ban-appeal", (req, res) => {
  const { email, userId, banSessionId, message } = req.body;
  
  console.log('📨 Nhận ban appeal:', { email, userId, banSessionId, messageLength: message?.length });
  
  if (!email || !userId || !banSessionId || !message) {
    console.error('❌ Thiếu thông tin:', { email: !!email, userId: !!userId, banSessionId: !!banSessionId, message: !!message });
    return res.json({ 
      success: false, 
      message: "Thiếu thông tin bắt buộc!" 
    });
  }
  
  if (message.trim().length < 10) {
    return res.json({ 
      success: false, 
      message: "Nội dung yêu cầu phải có ít nhất 10 ký tự!" 
    });
  }
  
  // Kiểm tra user và ban_session_id
  const checkUserSql = `
    SELECT id, username, email, account_status, banned_at, ban_session_id 
    FROM users 
    WHERE id = ? AND email = ?
  `;
  
  db.query(checkUserSql, [userId, email], (err, userResult) => {
    if (err) {
      console.error("❌ Lỗi kiểm tra user:", err);
      return res.json({ 
        success: false, 
        message: "Lỗi hệ thống!" 
      });
    }
    
    if (userResult.length === 0) {
      console.error('❌ Không tìm thấy user:', userId, email);
      return res.json({ 
        success: false, 
        message: "Không tìm thấy tài khoản!" 
      });
    }
    
    const user = userResult[0];
    console.log('✅ Tìm thấy user:', { id: user.id, email: user.email, status: user.account_status, banSessionId: user.ban_session_id });
    
    if (user.account_status !== 'banned' && user.account_status !== 'suspended') {
      return res.json({ 
        success: false, 
        message: "Tài khoản không bị khóa!" 
      });
    }
    
    // ✅ KIỂM TRA BAN_SESSION_ID KHỚP
    if (user.ban_session_id !== banSessionId) {
      console.error('❌ Ban session không khớp:', { userSession: user.ban_session_id, requestSession: banSessionId });
      return res.json({ 
        success: false, 
        message: "Phiên ban không hợp lệ! Vui lòng đăng xuất và đăng nhập lại." 
      });
    }
    
    // ✅ CHỈ KIỂM TRA YÊU CẦU CỦA LẦN BAN HIỆN TẠI (KHÔNG KIỂM TRA 24H)
    const checkExistingSql = `
      SELECT id, status, created_at
      FROM contacts 
      WHERE email = ? 
        AND name LIKE '[BAN APPEAL]%'
        AND ban_session_id = ?
      LIMIT 1
    `;
    
    db.query(checkExistingSql, [email, banSessionId], (err2, existingResult) => {
      if (err2) {
        console.error("❌ Lỗi kiểm tra yêu cầu cũ:", err2);
        return res.json({ 
          success: false, 
          message: "Lỗi hệ thống!" 
        });
      }
      
      console.log('🔍 Kiểm tra yêu cầu cũ:', existingResult.length > 0 ? existingResult[0] : 'Không có');
      
      // Nếu đã có yêu cầu cho lần ban này
      if (existingResult.length > 0) {
        const existingAppeal = existingResult[0];
        
        if (existingAppeal.status === 'pending' || existingAppeal.status === 'processing') {
          return res.json({ 
            success: false, 
            message: "⏳ Bạn đã gửi yêu cầu mở khóa cho lần bị cấm này. Vui lòng đợi admin xử lý!" 
          });
        }
        
        if (existingAppeal.status === 'closed') {
          return res.json({ 
            success: false, 
            message: "❌ Yêu cầu mở khóa của bạn đã bị từ chối.\n\n📞 Liên hệ: Hotline 1900-xxxx" 
          });
        }
      }
      
      // ✅ TẠO YÊU CẦU MỚI (BỎ KIỂM TRA 24H)
      const appealMessage = `[YÊU CẦU MỞ KHÓA TÀI KHOẢN]

User: ${user.username}
Email: ${email}
ID: ${userId}
Ban Session: ${banSessionId}
Thời gian bị cấm: ${user.banned_at ? new Date(user.banned_at).toLocaleString('vi-VN') : 'N/A'}

Nội dung:
${message.trim()}`;
      
      const insertSql = `
        INSERT INTO contacts (name, email, message, status, ban_session_id, created_at) 
        VALUES (?, ?, ?, 'pending', ?, NOW())
      `;
      
      db.query(insertSql, [`[BAN APPEAL] ${user.username}`, email, appealMessage, banSessionId], (err3, result) => {
        if (err3) {
          console.error("❌ Lỗi lưu ban appeal:", err3);
          return res.json({ 
            success: false, 
            message: "Không thể gửi yêu cầu! Vui lòng thử lại." 
          });
        }
        
        console.log(`📧 ✅ User #${userId} đã gửi ban appeal #${result.insertId} (Session: ${banSessionId})`);
        
        if (io) {
          io.emit('new_ban_appeal', {
            id: result.insertId,
            userId: userId,
            username: user.username,
            email: email,
            message: message.trim(),
            banSessionId: banSessionId,
            created_at: new Date()
          });
        }
        
        res.json({ 
          success: true,
          message: "Yêu cầu đã được gửi thành công! Admin sẽ xem xét trong thời gian sớm nhất."
        });
      });
    });
  });
});

// API admin xem danh sách ban appeals
app.get("/admin/ban-appeals", isAdmin, (req, res) => {
  const sql = `
    SELECT c.*, u.id as user_id, u.username, u.account_status, u.ban_reason, u.banned_at
    FROM contacts c
    LEFT JOIN users u ON c.email = u.email
    WHERE c.name LIKE '[BAN APPEAL]%'
    ORDER BY 
      CASE c.status
        WHEN 'pending' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'replied' THEN 3
        WHEN 'closed' THEN 4
      END,
      c.created_at DESC
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi tải ban appeals:", err);
      return res.status(500).send("Lỗi tải dữ liệu!");
    }
    
    res.render("admin/admin_ban", {
      appeals: results,
      title: "Yêu cầu mở khóa tài khoản",
      user: req.session.user
    });
  });
});

// API admin phê duyệt mở khóa
app.post("/admin/ban-appeals/approve/:id", isAdmin, (req, res) => {
  const appealId = req.params.id;
  const { userId, reason } = req.body;
  
  if (!userId) {
    return res.json({ 
      success: false, 
      message: "Thiếu userId!" 
    });
  }
  
  const unbanSql = `
    UPDATE users 
    SET account_status = 'active',
        ban_reason = NULL,
        banned_at = NULL,
        banned_by = NULL,
        ban_session_id = NULL
    WHERE id = ?
  `;
  
  db.query(unbanSql, [userId], (err, result) => {
    if (err) {
      console.error("❌ Lỗi mở khóa:", err);
      return res.json({ 
        success: false, 
        message: "Không thể mở khóa!" 
      });
    }
    
    const updateAppealSql = `
      UPDATE contacts 
      SET status = 'replied', 
          message = CONCAT(message, '

[ADMIN APPROVED]
Admin đã phê duyệt mở khóa.
Lý do: ${reason || 'Đã xem xét và chấp nhận'}')
      WHERE id = ?
    `;
    
    db.query(updateAppealSql, [appealId], (err2) => {
      if (err2) {
        console.error("⚠️ Lỗi cập nhật appeal:", err2);
      }
      
      console.log(`✅ Admin ${req.session.user.username} đã phê duyệt mở khóa user #${userId}`);
      
      res.json({ 
        success: true,
        message: "Đã mở khóa tài khoản!"
      });
    });
  });
});

// API admin từ chối yêu cầu
app.post("/admin/ban-appeals/reject/:id", isAdmin, (req, res) => {
  const appealId = req.params.id;
  const { reason } = req.body;
  
  const updateSql = `
    UPDATE contacts 
    SET status = 'closed', 
        message = CONCAT(message, '\n\n[ADMIN REJECTED]\nYêu cầu bị từ chối.\nLý do: ${reason || 'Vi phạm nghiêm trọng'}')
    WHERE id = ?
  `;
  
  db.query(updateSql, [appealId], (err) => {
    if (err) {
      console.error("❌ Lỗi từ chối appeal:", err);
      return res.json({ 
        success: false, 
        message: "Không thể từ chối!" 
      });
    }
    
    console.log(`❌ Admin ${req.session.user.username} đã từ chối ban appeal #${appealId}`);
    
    res.json({ 
      success: true,
      message: "Đã từ chối yêu cầu!"
    });
  });
});

// ================== ADMIN ROUTES ==================
app.get("/admin", isAdmin, (req, res) => {
  const counts = {
    productCount: 0,
    orderCount: 0,
    userCount: 0,
    totalRevenue: 0
  };

  db.query("SELECT COUNT(*) AS count FROM products", (err, productResult) => {
    if (err) {
      console.error("Lỗi truy vấn products:", err);
      return res.render("admin", { ...counts, title: "Trang quản trị" });
    }
    counts.productCount = productResult[0].count;

    db.query("SELECT COUNT(*) AS count FROM orders", (err, orderResult) => {
      if (err) {
        console.error("Lỗi truy vấn orders:", err);
        return res.render("admin", { ...counts, title: "Trang quản trị" });
      }
      counts.orderCount = orderResult[0].count;

      db.query("SELECT COUNT(*) AS count FROM users", (err, userResult) => {
        if (err) {
          console.error("Lỗi truy vấn users:", err);
          return res.render("admin", { ...counts, title: "Trang quản trị" });
        }
        counts.userCount = userResult[0].count;

        db.query("SELECT SUM(total_price) AS total FROM orders", (err, totalResult) => {
          if (err) {
            console.error("Lỗi truy vấn doanh thu:", err);
            return res.render("admin", { ...counts, title: "Trang quản trị" });
          }

          counts.totalRevenue = totalResult[0].total || 0;

          res.render("admin", {
            title: "Trang quản trị",
            productCount: counts.productCount,
            orderCount: counts.orderCount,
            userCount: counts.userCount,
            totalRevenue: counts.totalRevenue
          });
        });
      });
    });
  });
});

app.get("/admin/users", isAdmin, (req, res) => {
  const sql = `
    SELECT 
      id, 
      username, 
      email, 
      role, 
      account_status, 
      created_at,
      last_login,
      last_logout,
      CASE 
        WHEN last_logout IS NULL AND last_login IS NOT NULL THEN 1
        WHEN last_logout < last_login THEN 1
        ELSE 0
      END as is_online
    FROM users 
    ORDER BY last_login DESC
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi truy xuất dữ liệu người dùng:", err);
      return res.status(500).send("❌ Lỗi truy xuất dữ liệu người dùng!");
    }
    
    res.render("admin/users", { 
      users: results, 
      title: "Quản lý người dùng", 
      user: req.session.user 
    });
  });
});

// ================== ADMIN USER MANAGEMENT ROUTES ==================

// Change user role (lên/xuống chức)
app.post("/admin/users/change-role", isAdmin, (req, res) => {
  const { userId, role } = req.body;
  
  // Validate role
  if (!['admin', 'user'].includes(role)) {
    return res.json({ 
      success: false, 
      message: "Vai trò không hợp lệ!" 
    });
  }
  
  // Không cho phép thay đổi chính mình
  if (parseInt(userId) === req.session.user.id) {
    return res.json({ 
      success: false, 
      message: "Không thể thay đổi quyền của chính bạn!" 
    });
  }
  
  const sql = "UPDATE users SET role = ? WHERE id = ?";
  
  db.query(sql, [role, userId], (err, result) => {
    if (err) {
      console.error("❌ Lỗi thay đổi quyền:", err);
      return res.json({ 
        success: false, 
        message: "Không thể thay đổi quyền!" 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.json({ 
        success: false, 
        message: "Không tìm thấy người dùng!" 
      });
    }
    
    console.log(`✅ Admin ${req.session.user.username} đã thay đổi quyền user #${userId} thành ${role}`);
    
    res.json({ 
      success: true,
      message: `Đã thay đổi quyền thành ${role}!`
    });
  });
});

// Ban user (cấm tài khoản)
app.post("/admin/users/ban", isAdmin, (req, res) => {
  const { userId, reason } = req.body;
  
  if (parseInt(userId) === req.session.user.id) {
    return res.json({ 
      success: false, 
      message: "Không thể cấm tài khoản của chính bạn!" 
    });
  }
  
  // ✅ TẠO BAN_SESSION_ID MỚI + ĐẶT LẠI BANNED_AT
  const banSessionId = `ban_${userId}_${Date.now()}`;
  
  const sql = `
    UPDATE users 
    SET account_status = 'banned',
        ban_reason = ?,
        banned_at = NOW(),
        banned_by = ?,
        ban_session_id = ?
    WHERE id = ?
  `;
  
  db.query(sql, [reason, req.session.user.id, banSessionId, userId], (err, result) => {
    if (err) {
      console.error("❌ Lỗi cấm tài khoản:", err);
      return res.json({ 
        success: false, 
        message: "Không thể cấm tài khoản!" 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.json({ 
        success: false, 
        message: "Không tìm thấy người dùng!" 
      });
    }
    
    console.log(`⚠️ Admin ${req.session.user.username} đã cấm user #${userId} - Session: ${banSessionId}`);
    
    res.json({ 
      success: true,
      message: "Đã cấm tài khoản!"
    });
  });
});


// Unban user (mở khóa tài khoản)
app.post("/admin/users/unban", isAdmin, (req, res) => {
  const { userId } = req.body;
  
  const sql = `
    UPDATE users 
    SET account_status = 'active',
        ban_reason = NULL,
        banned_at = NULL,
        banned_by = NULL,
        ban_session_id = NULL
    WHERE id = ?
  `;
  
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("❌ Lỗi mở khóa:", err);
      return res.json({ 
        success: false, 
        message: "Không thể mở khóa tài khoản!" 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.json({ 
        success: false, 
        message: "Không tìm thấy người dùng!" 
      });
    }
    
    console.log(`✅ Admin ${req.session.user.username} đã mở khóa user #${userId}`);
    
    res.json({ 
      success: true,
      message: "Đã mở khóa tài khoản!"
    });
  });
});


// Delete user (xóa vĩnh viễn)
app.post("/admin/users/delete", isAdmin, (req, res) => {
  const { userId } = req.body;
  
  // Không cho phép xóa chính mình
  if (parseInt(userId) === req.session.user.id) {
    return res.json({ 
      success: false, 
      message: "Không thể xóa tài khoản của chính bạn!" 
    });
  }
  
  // Xóa các dữ liệu liên quan trước
  db.query("DELETE FROM cart WHERE user_id = ?", [userId], (err1) => {
    if (err1) {
      console.error("❌ Lỗi xóa giỏ hàng:", err1);
    }
    
    db.query("DELETE FROM orders WHERE user_id = ?", [userId], (err2) => {
      if (err2) {
        console.error("❌ Lỗi xóa đơn hàng:", err2);
      }
      
      db.query("DELETE FROM users WHERE id = ?", [userId], (err3, result) => {
        if (err3) {
          console.error("❌ Lỗi xóa user:", err3);
          return res.json({ 
            success: false, 
            message: "Không thể xóa tài khoản!" 
          });
        }
        
        if (result.affectedRows === 0) {
          return res.json({ 
            success: false, 
            message: "Không tìm thấy người dùng!" 
          });
        }
        
        console.log(`🗑️ Admin ${req.session.user.username} đã XÓA VĨNH VIỄN user #${userId}`);
        
        res.json({ 
          success: true,
          message: "Đã xóa tài khoản!"
        });
      });
    });
  });
});

// Route hiển thị form thêm sản phẩm mới
app.get('/admin/products/new', isAdmin, (req, res) => {
  const categoriesSql = "SELECT * FROM categories ORDER BY type_category, name";
  
  db.query(categoriesSql, (err, categories) => {
    if (err) {
      console.error("❌ Lỗi tải categories:", err);
      return res.status(500).send("Lỗi tải dữ liệu!");
    }
    
    // Phân loại categories
    const types = categories.filter(c => c.type_category === "type");
    const ccs = categories.filter(c => c.type_category === "cc");
    const colors = categories.filter(c => c.type_category === "color");
    const brands = categories.filter(c => c.type_category === "brand");
    
    res.render('admin/new_product', { 
      title: 'Thêm mới Sản phẩm',
      types: types,
      ccs: ccs,
      colors: colors,
      brands: brands,
      user: req.session.user
    });
  });
});

app.post('/admin/products/new', isAdmin, upload.single('image'), (req, res) => {
  const { name, price, type, cc, color, stock, status, description } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : '';

  if (!name || !price || !type || !cc || !color || !req.file) {
    return res.status(400).send(`
      <script>
        alert('❌ Vui lòng điền đầy đủ thông tin bắt buộc!');
        window.history.back();
      </script>
    `);
  }

  const sql = `
    INSERT INTO products (name, price, type, cc, color, stock, status, description, image) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const stockValue = stock ? parseInt(stock) : 0;
  const statusValue = status || 'active';
  
  // ✅ Không cần parseInt(cc) nữa vì cc là chuỗi từ categories
  db.query(
    sql, 
    [name, parseFloat(price), type, cc, color, stockValue, statusValue, description || null, imagePath], 
    (err, result) => {
      if (err) {
        console.error("❌ Lỗi lưu sản phẩm:", err);
        return res.status(500).send(`
          <script>
            alert('❌ Lỗi lưu sản phẩm: ${err.message}');
            window.history.back();
          </script>
        `);
      }
      
      console.log(`✅ Đã thêm sản phẩm mới #${result.insertId}`);
      res.redirect('/admin/products');
    }
  );
});

app.get('/admin/products', isAdmin, (req, res) => {
  const productsSql = `
    SELECT 
      p.*,
      COALESCE(SUM(i.quantity), 0) as stock
    FROM products p
    LEFT JOIN inventory i ON p.id = i.product_id
    GROUP BY p.id
    ORDER BY p.id DESC
  `;
  
  const categoriesSql = "SELECT * FROM categories ORDER BY type_category, name";
  
  db.query(productsSql, (err1, products) => {
    if (err1) {
      console.error("❌ Lỗi tải products:", err1);
      return res.status(500).send("Lỗi truy xuất dữ liệu sản phẩm");
    }
    
    db.query(categoriesSql, (err2, categories) => {
      if (err2) {
        console.error("❌ Lỗi tải categories:", err2);
        return res.status(500).send("Lỗi truy xuất dữ liệu categories");
      }
      
      const types = categories.filter(c => c.type_category === "type");
      const ccs = categories.filter(c => c.type_category === "cc");
      const colors = categories.filter(c => c.type_category === "color");
      const brands = categories.filter(c => c.type_category === "brand");
      
      res.render('admin/products', { 
        products: products,
        types: types,
        ccs: ccs,
        colors: colors,
        brands: brands,
        title: 'Quản lý sản phẩm', 
        user: req.session.user 
      });
    });
  });
});

app.delete('/admin/products/delete/:id', isAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.query("DELETE FROM products WHERE id = ?", [id], (err) => {
    if (err) return res.json({ success: false });
    res.json({ success: true });
  });
});

app.post('/admin/products/edit', isAdmin, upload.single('image'), (req, res) => {
  const { id, name, price, type, cc, color, stock, status, description, existingImage } = req.body;
  const productId = parseInt(id);
  let imagePath = existingImage;

  if (req.file) {
    imagePath = "/uploads/" + req.file.filename;
  }

  const stockValue = stock ? parseInt(stock) : 0;
  const statusValue = status || 'active';

  const sql = `
    UPDATE products 
    SET name = ?, price = ?, type = ?, cc = ?, color = ?, 
        stock = ?, status = ?, description = ?, image = ? 
    WHERE id = ?
  `;
  
  // ✅ Không parse cc nữa
  db.query(
    sql, 
    [name, parseFloat(price), type, cc, color, stockValue, statusValue, description || null, imagePath, productId], 
    (err) => {
      if (err) {
        console.error("❌ Lỗi cập nhật sản phẩm:", err);
        return res.status(500).send(`
          <script>
            alert('❌ Lỗi cập nhật: ${err.message}');
            window.history.back();
          </script>
        `);
      }
      
      console.log(`✅ Đã cập nhật sản phẩm #${productId}`);
      res.redirect('/admin/products');
    }
  );
});
// ================== ADMIN CATEGORIES ==================
app.get("/admin/categories", isAdmin, (req, res) => {
  const sql = "SELECT * FROM categories ORDER BY type_category, id ASC";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi truy xuất danh mục:", err);
      return res.status(500).send("Lỗi truy xuất dữ liệu danh mục!");
    }
    res.render("admin/categories", {
      categories: results,
      title: "Quản lý danh mục",
      user: req.session.user,
    });
  });
});

app.post("/admin/categories/add", isAdmin, (req, res) => {
  const { name, type_category, description } = req.body;
  
  if (!name || name.trim() === "" || !type_category) {
    return res.status(400).send("Tên danh mục và loại không được để trống!");
  }

  const sql = "INSERT INTO categories (name, type_category, description, created_at) VALUES (?, ?, ?, NOW())";
  db.query(sql, [name.trim(), type_category, description || null], (err) => {
    if (err) {
      console.error("❌ Lỗi thêm danh mục:", err);
      return res.status(500).send("Không thể thêm danh mục!");
    }
    res.redirect("/admin/categories");
  });
});

app.post("/admin/categories/edit", isAdmin, (req, res) => {
  const { id, name, type_category, description } = req.body;
  
  if (!id || !name || !type_category) {
    return res.status(400).send("Thiếu thông tin danh mục!");
  }

  const sql = "UPDATE categories SET name = ?, type_category = ?, description = ? WHERE id = ?";
  db.query(sql, [name.trim(), type_category, description || null, id], (err) => {
    if (err) {
      console.error("❌ Lỗi cập nhật danh mục:", err);
      return res.status(500).send("Không thể cập nhật danh mục!");
    }
    res.redirect("/admin/categories");
  });
});

app.get("/admin/categories/delete/:id", isAdmin, (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM categories WHERE id = ?";
  db.query(sql, [id], (err) => {
    if (err) {
      console.error("❌ Lỗi xóa danh mục:", err);
      return res.status(500).send("Không thể xóa danh mục!");
    }
    res.redirect("/admin/categories");
  });
});

// ================== ADMIN ORDERS ==================
app.get("/admin/orders", isAdmin, (req, res) => {
  updateExpiredOrdersInDB(() => {
    const sql = `
      SELECT o.*, u.username, u.email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `;
    
    db.query(sql, (err, results) => {
      if (err) {
        console.error("❌ Lỗi truy xuất đơn hàng:", err);
        return res.status(500).send("Lỗi truy xuất dữ liệu đơn hàng!");
      }
      res.render("admin/orders", { 
        orders: results, 
        title: "Quản lý đơn hàng", 
        user: req.session.user 
      });
    });
  });
});

app.get("/admin/orders/:id", isAdmin, (req, res) => {
  const orderId = req.params.id;
  
  updateExpiredOrdersInDB(() => {
    const orderSql = `
      SELECT o.*, u.username, u.email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `;
    
    db.query(orderSql, [orderId], (err, orderResult) => {
      if (err) {
        console.error("❌ Lỗi truy xuất đơn hàng:", err);
        return res.status(500).send("Không thể tải thông tin đơn hàng!");
      }
      
      if (orderResult.length === 0) {
        return res.status(404).send("Không tìm thấy đơn hàng!");
      }
      
      const order = orderResult[0];
      
      const itemsSql = `
        SELECT oi.*, p.name, p.image
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `;
      
      db.query(itemsSql, [orderId], (err2, items) => {
        if (err2) {
          console.error("❌ Lỗi truy xuất sản phẩm:", err2);
          return res.status(500).send("Không thể tải chi tiết sản phẩm!");
        }
        
        res.render("admin/order_detail", {
          order: order,
          items: items,
          title: `Chi tiết đơn hàng #${orderId}`,
          user: req.session.user
        });
      });
    });
  });
});

app.post("/admin/orders/update-status/:id", isAdmin, (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;
  
  if (!['pending', 'completed', 'cancelled'].includes(status)) {
    return res.json({ success: false, message: "Trạng thái không hợp lệ!" });
  }
  
  const sql = "UPDATE orders SET status = ? WHERE id = ?";
  db.query(sql, [status, orderId], (err) => {
    if (err) {
      console.error("❌ Lỗi cập nhật trạng thái:", err);
      return res.json({ success: false, message: "Không thể cập nhật!" });
    }
    res.json({ success: true });
  });
});

app.post("/admin/orders/cancel/:id", isAdmin, (req, res) => {
  const orderId = req.params.id;
  
  const sql = "UPDATE orders SET status = 'cancelled' WHERE id = ?";
  db.query(sql, [orderId], (err) => {
    if (err) {
      console.error("❌ Lỗi hủy đơn hàng:", err);
      return res.json({ success: false, message: "Không thể hủy đơn!" });
    }
    res.json({ success: true });
  });
});

// ================== ADMIN CONTACTS ==================
app.get("/admin/contact_admin", isAdmin, (req, res) => {
  const sql = `
    SELECT c1.* 
    FROM contacts c1
    INNER JOIN (
      SELECT email, MAX(created_at) as max_date
      FROM contacts
      GROUP BY email
    ) c2 ON c1.email = c2.email AND c1.created_at = c2.max_date
    ORDER BY 
      CASE c1.status
        WHEN 'pending' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'replied' THEN 3
        WHEN 'closed' THEN 4
      END,
      c1.created_at DESC
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi truy xuất liên hệ:", err);
      return res.status(500).send("Lỗi truy xuất dữ liệu!");
    }
    
    res.render("admin/contact_admin", {
      contacts: results,
      title: "Quản lý liên hệ",
      user: req.session.user
    });
  });
});

app.get("/admin/contact_admin/:id", isAdmin, (req, res) => {
  const contactId = req.params.id;
  
  const sql = "SELECT * FROM contacts WHERE id = ?";
  
  db.query(sql, [contactId], (err, results) => {
    if (err) {
      console.error("❌ Lỗi truy xuất liên hệ:", err);
      return res.status(500).send("<p>Lỗi tải liên hệ!</p>");
    }
    
    if (results.length === 0) {
      return res.status(404).send("<p>Không tìm thấy liên hệ!</p>");
    }
    
    res.render("admin/contact_detail", {
      contact: results[0]
    });
  });
});

app.post("/admin/contact_admin/update-status/:id", isAdmin, (req, res) => {
  const contactId = req.params.id;
  const { status } = req.body;
  
  const validStatuses = ['pending', 'processing', 'replied', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.json({ 
      success: false, 
      message: "Trạng thái không hợp lệ!" 
    });
  }
  
  const sql = "UPDATE contacts SET status = ?, updated_at = NOW() WHERE id = ?";
  
  db.query(sql, [status, contactId], (err, result) => {
    if (err) {
      console.error("❌ Lỗi cập nhật trạng thái:", err);
      return res.json({ 
        success: false, 
        message: "Không thể cập nhật trạng thái!" 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.json({ 
        success: false, 
        message: "Không tìm thấy liên hệ!" 
      });
    }
    
    console.log(`✅ Đã cập nhật trạng thái liên hệ #${contactId} thành '${status}'`);
    
    io.emit('status_updated', {
      contactId: parseInt(contactId),
      newStatus: status
    });
    
    res.json({ 
      success: true,
      message: "Cập nhật trạng thái thành công!",
      status: status
    });
  });
});

app.post("/admin/contacts/delete/:id", isAdmin, (req, res) => {
  const contactId = req.params.id;
  
  const sql = "DELETE FROM contacts WHERE id = ?";
  
  db.query(sql, [contactId], (err, result) => {
    if (err) {
      console.error("❌ Lỗi xóa liên hệ:", err);
      return res.json({ 
        success: false, 
        message: "Không thể xóa liên hệ!" 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.json({ 
        success: false, 
        message: "Không tìm thấy liên hệ!" 
      });
    }
    
    console.log(`✅ Đã xóa liên hệ #${contactId}`);
    
    res.json({ 
      success: true,
      message: "Xóa liên hệ thành công!"
    });
  });
});

app.get("/api/contacts/:id/messages", isAdmin, (req, res) => {
  const contactId = req.params.id;
  
  const sql = "SELECT * FROM contacts WHERE id = ?";
  
  db.query(sql, [contactId], (err, results) => {
    if (err || results.length === 0) {
      return res.json({ success: false, messages: [] });
    }
    
    const contact = results[0];
    const messages = [];
    const fullMessage = contact.message;
    const parts = fullMessage.split(/\[ADMIN REPLY\]:\s*/);
    
    if (parts[0] && parts[0].trim()) {
      messages.push({
        type: 'user',
        content: parts[0].trim(),
        created_at: contact.created_at
      });
    }
    
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] && parts[i].trim()) {
        messages.push({
          type: 'admin',
          content: parts[i].trim(),
          created_at: contact.updated_at || contact.created_at
        });
      }
    }
    
    res.json({ 
      success: true, 
      messages,
      contact: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        status: contact.status
      }
    });
  });
});

app.get("/api/user-contacts/:email", isAdmin, (req, res) => {
  const userEmail = decodeURIComponent(req.params.email);
  
  const sql = `
    SELECT * FROM contacts 
    WHERE email = ?
    ORDER BY created_at ASC
  `;
  
  db.query(sql, [userEmail], (err, results) => {
    if (err) {
      console.error("❌ Lỗi truy xuất tin nhắn:", err);
      return res.json({ success: false, messages: [] });
    }
    
    const messages = [];
    let latestStatus = 'pending';
    
    results.forEach(contact => {
      latestStatus = contact.status;
      
      if (contact.message.startsWith('[ADMIN]:')) {
        messages.push({
          type: 'admin',
          content: contact.message.replace('[ADMIN]:', '').trim(),
          created_at: contact.created_at
        });
      } else {
        messages.push({
          type: 'user',
          content: contact.message,
          created_at: contact.created_at
        });
      }
    });
    
    res.json({ 
      success: true, 
      messages,
      latestStatus
    });
  });
});

app.post("/api/update-user-status", isAdmin, (req, res) => {
  const { userEmail, status } = req.body;
  
  const validStatuses = ['pending', 'processing', 'replied', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.json({ 
      success: false, 
      message: "Trạng thái không hợp lệ!" 
    });
  }
  
  const sql = "UPDATE contacts SET status = ?, updated_at = NOW() WHERE email = ?";
  
  db.query(sql, [status, userEmail], (err, result) => {
    if (err) {
      console.error("❌ Lỗi cập nhật trạng thái:", err);
      return res.json({ 
        success: false, 
        message: "Không thể cập nhật trạng thái!" 
      });
    }
    
    console.log(`✅ Đã cập nhật trạng thái cho ${userEmail} thành '${status}'`);
    
    res.json({ 
      success: true,
      message: "Cập nhật trạng thái thành công!",
      status: status
    });
  });
});

// ================== WAREHOUSE MANAGEMENT ==================

app.get("/admin/warehouses", isAdmin, (req, res) => {
  const sql = `
    SELECT w.*, u.username as manager_name,
           COUNT(DISTINCT i.product_id) as product_count,
           SUM(i.quantity) as total_quantity
    FROM warehouses w
    LEFT JOIN users u ON w.manager_id = u.id
    LEFT JOIN inventory i ON w.id = i.warehouse_id
    GROUP BY w.id
    ORDER BY w.created_at DESC
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi tải danh sách kho:", err);
      return res.status(500).send("Lỗi tải dữ liệu!");
    }
    
    res.render("admin/warehouses", {
      warehouses: results,
      title: "Quản lý kho",
      user: req.session.user
    });
  });
});

app.post("/admin/warehouses/add", isAdmin, (req, res) => {
  const { name, address, phone } = req.body;
  
  if (!name || !address) {
    return res.status(400).json({ 
      success: false, 
      message: "Tên và địa chỉ kho là bắt buộc!" 
    });
  }
  
  const sql = `
    INSERT INTO warehouses (name, address, manager_id, phone, status)
    VALUES (?, ?, ?, ?, 'active')
  `;
  
  db.query(sql, [name, address, req.session.user.id, phone], (err, result) => {
    if (err) {
      console.error("❌ Lỗi thêm kho:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Không thể thêm kho!" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Thêm kho thành công!",
      warehouseId: result.insertId
    });
  });
});

app.get("/admin/warehouses/:id/inventory", isAdmin, (req, res) => {
  const warehouseId = req.params.id;
  
  const warehouseSql = "SELECT * FROM warehouses WHERE id = ?";
  
  db.query(warehouseSql, [warehouseId], (err, warehouseResult) => {
    if (err || warehouseResult.length === 0) {
      return res.status(404).send("Không tìm thấy kho!");
    }
    
    const inventorySql = `
      SELECT i.*, p.name, p.price, p.image,
             (i.quantity * p.price) as total_value
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.warehouse_id = ?
      ORDER BY p.name
    `;
    
    db.query(inventorySql, [warehouseId], (err2, inventory) => {
      if (err2) {
        console.error("❌ Lỗi tải tồn kho:", err2);
        return res.status(500).send("Lỗi tải dữ liệu!");
      }
      
      res.render("admin/warehouse_inventory", {
        warehouse: warehouseResult[0],
        inventory: inventory,
        title: `Tồn kho - ${warehouseResult[0].name}`,
        user: req.session.user
      });
    });
  });
});

// ================== IMPORT RECEIPTS ==================

app.get("/admin/import-receipts", isAdmin, (req, res) => {
  const sql = `
    SELECT ir.*, w.name as warehouse_name, u.username as created_by_name,
           COUNT(iri.id) as item_count
    FROM import_receipts ir
    LEFT JOIN warehouses w ON ir.warehouse_id = w.id
    LEFT JOIN users u ON ir.created_by = u.id
    LEFT JOIN import_receipt_items iri ON ir.id = iri.import_receipt_id
    GROUP BY ir.id
    ORDER BY ir.created_at DESC
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi tải phiếu nhập:", err);
      return res.status(500).send("Lỗi tải dữ liệu!");
    }
    
    res.render("admin/import_receipts", {
      receipts: results,
      title: "Phiếu nhập kho",
      user: req.session.user
    });
  });
});

app.get("/admin/import-receipts/new", isAdmin, (req, res) => {
  const warehousesSql = "SELECT * FROM warehouses WHERE status = 'active'";
  const productsSql = "SELECT id, name, price FROM products ORDER BY name";
  
  db.query(warehousesSql, (err1, warehouses) => {
    if (err1) {
      return res.status(500).send("Lỗi tải danh sách kho!");
    }
    
    db.query(productsSql, (err2, products) => {
      if (err2) {
        return res.status(500).send("Lỗi tải danh sách sản phẩm!");
      }
      
      res.render("admin/import_receipt_new", {
        warehouses: warehouses,
        products: products,
        title: "Tạo phiếu nhập kho",
        user: req.session.user
      });
    });
  });
});

app.post("/admin/import-receipts/create", isAdmin, (req, res) => {
  const { warehouse_id, supplier_name, supplier_phone, notes, items } = req.body;
  
  if (!warehouse_id || !items || items.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Thiếu thông tin bắt buộc!" 
    });
  }
  
  const receiptCode = `NK-${Date.now().toString().slice(-8)}`;
  const totalAmount = items.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) * parseFloat(item.unit_price));
  }, 0);
  
  const receiptSql = `
    INSERT INTO import_receipts 
      (receipt_code, warehouse_id, supplier_name, supplier_phone, 
       created_by, total_amount, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
  `;
  
  db.query(
    receiptSql, 
    [receiptCode, warehouse_id, supplier_name, supplier_phone, 
     req.session.user.id, totalAmount, notes],
    (err, result) => {
      if (err) {
        console.error("❌ Lỗi tạo phiếu nhập:", err);
        return res.status(500).json({ 
          success: false, 
          message: "Không thể tạo phiếu nhập!" 
        });
      }
      
      const receiptId = result.insertId;
      
      const itemsSql = `
        INSERT INTO import_receipt_items 
          (import_receipt_id, product_id, quantity, unit_price, notes)
        VALUES ?
      `;
      
      const itemsData = items.map(item => [
        receiptId, item.product_id, item.quantity, item.unit_price, item.notes || null
      ]);
      
      db.query(itemsSql, [itemsData], (err2) => {
        if (err2) {
          console.error("❌ Lỗi thêm chi tiết phiếu nhập:", err2);
          db.query("DELETE FROM import_receipts WHERE id = ?", [receiptId]);
          return res.status(500).json({ 
            success: false, 
            message: "Không thể thêm chi tiết phiếu nhập!" 
          });
        }
        
        console.log(`✅ Đã tạo phiếu nhập #${receiptId} - ${receiptCode}`);
        
        res.json({ 
          success: true, 
          message: "Tạo phiếu nhập thành công!",
          receiptId: receiptId,
          receiptCode: receiptCode
        });
      });
    }
  );
});

app.get("/admin/import-receipts/:id", isAdmin, (req, res) => {
  const receiptId = req.params.id;
  
  const receiptSql = `
    SELECT ir.*, w.name as warehouse_name, u.username as created_by_name
    FROM import_receipts ir
    LEFT JOIN warehouses w ON ir.warehouse_id = w.id
    LEFT JOIN users u ON ir.created_by = u.id
    WHERE ir.id = ?
  `;
  
  db.query(receiptSql, [receiptId], (err, receiptResult) => {
    if (err || receiptResult.length === 0) {
      return res.status(404).send("Không tìm thấy phiếu nhập!");
    }
    
    const itemsSql = `
      SELECT iri.*, p.name as product_name, p.image
      FROM import_receipt_items iri
      JOIN products p ON iri.product_id = p.id
      WHERE iri.import_receipt_id = ?
    `;
    
    db.query(itemsSql, [receiptId], (err2, items) => {
      if (err2) {
        console.error("❌ Lỗi tải chi tiết:", err2);
        return res.status(500).send("Lỗi tải dữ liệu!");
      }
      
      res.render("admin/import_receipt_detail", {
        receipt: receiptResult[0],
        items: items,
        title: `Chi tiết phiếu nhập #${receiptResult[0].receipt_code}`,
        user: req.session.user
      });
    });
  });
});

// ================== EXPORT RECEIPTS ==================

app.get("/admin/export-receipts", isAdmin, (req, res) => {
  const sql = `
    SELECT er.*, w.name as warehouse_name, u.username as created_by_name,
           COUNT(eri.id) as item_count
    FROM export_receipts er
    LEFT JOIN warehouses w ON er.warehouse_id = w.id
    LEFT JOIN users u ON er.created_by = u.id
    LEFT JOIN export_receipt_items eri ON er.id = eri.export_receipt_id
    GROUP BY er.id
    ORDER BY er.created_at DESC
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi tải phiếu xuất:", err);
      return res.status(500).send("Lỗi tải dữ liệu!");
    }
    
    res.render("admin/export_receipts", {
      receipts: results,
      title: "Phiếu xuất kho",
      user: req.session.user
    });
  });
});

app.get("/admin/export-receipts/new", isAdmin, (req, res) => {
  const warehousesSql = "SELECT * FROM warehouses WHERE status = 'active'";
  
  db.query(warehousesSql, (err, warehouses) => {
    if (err) {
      return res.status(500).send("Lỗi tải danh sách kho!");
    }
    
    res.render("admin/export_receipt_new", {
      warehouses: warehouses,
      title: "Tạo phiếu xuất kho",
      user: req.session.user
    });
  });
});

app.get("/api/warehouses/:id/inventory", (req, res) => {
  const warehouseId = req.params.id;
  
  const sql = `
    SELECT i.*, p.name, p.price, p.image
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    WHERE i.warehouse_id = ? AND i.quantity > 0
    ORDER BY p.name
  `;
  
  db.query(sql, [warehouseId], (err, results) => {
    if (err) {
      console.error("❌ Lỗi tải tồn kho:", err);
      return res.json({ success: false, inventory: [] });
    }
    
    res.json({ success: true, inventory: results });
  });
});

app.post("/admin/export-receipts/create", isAdmin, (req, res) => {
  const { warehouse_id, customer_name, customer_phone, notes, items } = req.body;
  
  if (!warehouse_id || !items || items.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Thiếu thông tin bắt buộc!" 
    });
  }
  
  const checkInventorySql = `
    SELECT product_id, quantity 
    FROM inventory 
    WHERE warehouse_id = ? AND product_id IN (?)
  `;
  
  const productIds = items.map(item => item.product_id);
  
  db.query(checkInventorySql, [warehouse_id, productIds], (err, inventory) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: "Lỗi kiểm tra tồn kho!" 
      });
    }
    
    const inventoryMap = {};
    inventory.forEach(inv => {
      inventoryMap[inv.product_id] = inv.quantity;
    });
    
    for (const item of items) {
      const available = inventoryMap[item.product_id] || 0;
      if (available < item.quantity) {
        return res.status(400).json({ 
          success: false, 
          message: `Sản phẩm ID ${item.product_id} không đủ tồn kho! Có: ${available}, cần: ${item.quantity}` 
        });
      }
    }
    
    const receiptCode = `XK-${Date.now().toString().slice(-8)}`;
    const totalAmount = items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) * parseFloat(item.unit_price));
    }, 0);
    
    const receiptSql = `
      INSERT INTO export_receipts 
        (receipt_code, warehouse_id, customer_name, customer_phone, 
         created_by, total_amount, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
    `;
    
    db.query(
      receiptSql, 
      [receiptCode, warehouse_id, customer_name, customer_phone, 
       req.session.user.id, totalAmount, notes],
      (err, result) => {
        if (err) {
          console.error("❌ Lỗi tạo phiếu xuất:", err);
          return res.status(500).json({ 
            success: false, 
            message: "Không thể tạo phiếu xuất!" 
          });
        }
        
        const receiptId = result.insertId;
        
        const itemsSql = `
          INSERT INTO export_receipt_items 
            (export_receipt_id, product_id, quantity, unit_price, notes)
          VALUES ?
        `;
        
        const itemsData = items.map(item => [
          receiptId, item.product_id, item.quantity, item.unit_price, item.notes || null
        ]);
        
        db.query(itemsSql, [itemsData], (err2) => {
          if (err2) {
            console.error("❌ Lỗi thêm chi tiết phiếu xuất:", err2);
            db.query("DELETE FROM export_receipts WHERE id = ?", [receiptId]);
            return res.status(500).json({ 
              success: false, 
              message: "Không thể thêm chi tiết phiếu xuất!" 
            });
          }
          
          console.log(`✅ Đã tạo phiếu xuất #${receiptId} - ${receiptCode}`);
          
          res.json({ 
            success: true, 
            message: "Tạo phiếu xuất thành công!",
            receiptId: receiptId,
            receiptCode: receiptCode
          });
        });
      }
    );
  });
});

app.get("/admin/export-receipts/:id", isAdmin, (req, res) => {
  const receiptId = req.params.id;
  
  const receiptSql = `
    SELECT er.*, w.name as warehouse_name, u.username as created_by_name
    FROM export_receipts er
    LEFT JOIN warehouses w ON er.warehouse_id = w.id
    LEFT JOIN users u ON er.created_by = u.id
    WHERE er.id = ?
  `;
  
  db.query(receiptSql, [receiptId], (err, receiptResult) => {
    if (err || receiptResult.length === 0) {
      return res.status(404).send("Không tìm thấy phiếu xuất!");
    }
    
    const itemsSql = `
      SELECT eri.*, p.name as product_name, p.image
      FROM export_receipt_items eri
      JOIN products p ON eri.product_id = p.id
      WHERE eri.export_receipt_id = ?
    `;
    
    db.query(itemsSql, [receiptId], (err2, items) => {
      if (err2) {
        console.error("❌ Lỗi tải chi tiết:", err2);
        return res.status(500).send("Lỗi tải dữ liệu!");
      }
      
      res.render("admin/export_receipt_detail", {
        receipt: receiptResult[0],
        items: items,
        title: `Chi tiết phiếu xuất #${receiptResult[0].receipt_code}`,
        user: req.session.user
      });
    });
  });
});

// ================== REPORTS & STATISTICS ==================

app.get("/admin/warehouse-reports", isAdmin, (req, res) => {
  const overviewSql = "SELECT * FROM v_inventory_overview";
  
  db.query(overviewSql, (err, overview) => {
    if (err) {
      console.error("❌ Lỗi tải báo cáo:", err);
      return res.status(500).send("Lỗi tải dữ liệu!");
    }
    
    res.render("admin/warehouse_reports", {
      overview: overview,
      title: "Báo cáo xuất nhập kho",
      user: req.session.user
    });
  });
});

app.get("/admin/warehouse-transactions", isAdmin, (req, res) => {
  const { warehouse_id, product_id, from_date, to_date } = req.query;
  
  let sql = `
    SELECT t.*, w.name as warehouse_name, p.name as product_name, 
           u.username as created_by_name
    FROM warehouse_transactions t
    LEFT JOIN warehouses w ON t.warehouse_id = w.id
    LEFT JOIN products p ON t.product_id = p.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (warehouse_id) {
    sql += " AND t.warehouse_id = ?";
    params.push(warehouse_id);
  }
  
  if (product_id) {
    sql += " AND t.product_id = ?";
    params.push(product_id);
  }
  
  if (from_date) {
    sql += " AND DATE(t.created_at) >= ?";
    params.push(from_date);
  }
  
  if (to_date) {
    sql += " AND DATE(t.created_at) <= ?";
    params.push(to_date);
  }
  
  sql += " ORDER BY t.created_at DESC LIMIT 500";
  
  db.query(sql, params, (err, transactions) => {
    if (err) {
      console.error("❌ Lỗi tải lịch sử:", err);
      return res.status(500).send("Lỗi tải dữ liệu!");
    }
    
    const warehousesSql = "SELECT id, name FROM warehouses WHERE status = 'active'";
    const productsSql = "SELECT id, name FROM products";
    
    db.query(warehousesSql, (err1, warehouses) => {
      db.query(productsSql, (err2, products) => {
        res.render("admin/warehouse_transactions", {
          transactions: transactions,
          warehouses: warehouses || [],
          products: products || [],
          filters: { warehouse_id, product_id, from_date, to_date },
          title: "Lịch sử giao dịch kho",
          user: req.session.user
        });
      });
    });
  });
});

// ================== SCHEDULED JOBS ==================
setInterval(() => {
  updateExpiredOrdersInDB();
}, 60000);

console.log("✅ Đã khởi động scheduled job: Tự động cập nhật đơn hàng hết hạn mỗi phút");

// ================== START SERVER ==================
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
  console.log(`👤 User có thể truy cập: http://localhost:${PORT}`);
  console.log(`🔐 Admin có thể truy cập: http://localhost:${PORT}/admin`);
  console.log(`📧 Contacts admin: http://localhost:${PORT}/admin/contact_admin`);
});