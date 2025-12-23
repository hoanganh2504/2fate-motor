const express = require("express");
const router = express.Router();
const db = require("../db");

// Middleware kiểm tra đăng nhập
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// ================== THÊM VÀO GIỎ HÀNG ==================
router.post("/add", requireLogin, (req, res) => {
  const userId = req.session.user.id;
  const { productId, color, quantity } = req.body;

  db.query(
    "SELECT * FROM cart WHERE user_id=? AND product_id=? AND color=?",
    [userId, productId, color],
    (err, results) => {
      if (err) return res.status(500).send("Lỗi cơ sở dữ liệu.");

      if (results.length > 0) {
        // Nếu sản phẩm đã có thì tăng số lượng
        db.query(
          "UPDATE cart SET quantity = quantity + ? WHERE id = ?",
          [quantity, results[0].id],
          (err2) => {
            if (err2) return res.status(500).send("Lỗi khi cập nhật số lượng.");
            res.redirect("/cart");
          }
        );
      } else {
        // Nếu chưa có thì thêm mới
        db.query(
          "INSERT INTO cart (user_id, product_id, color, quantity) VALUES (?,?,?,?)",
          [userId, productId, color, quantity],
          (err3) => {
            if (err3) return res.status(500).send("Lỗi khi thêm vào giỏ hàng.");
            res.redirect("/cart");
          }
        );
      }
    }
  );
});

// ================== HIỂN THỊ GIỎ HÀNG ==================
router.get("/", requireLogin, (req, res) => {
  const userId = req.session.user.id;
  db.query(
    "SELECT c.*, p.name, p.price, p.image FROM cart c JOIN products p ON c.product_id = p.id WHERE c.user_id=?",
    [userId],
    (err, results) => {
      if (err) throw err;
      res.render("cart", { cartItems: results });
    }
  );
});

// ================== CẬP NHẬT SỐ LƯỢNG ==================
router.post("/update/:id", requireLogin, (req, res) => {
  const cartId = req.params.id;
  const { quantity } = req.body;

  if (quantity <= 0) {
    // Nếu số lượng = 0 thì xóa sản phẩm
    db.query("DELETE FROM cart WHERE id=?", [cartId], (err) => {
      if (err) return res.status(500).send("Không thể xóa sản phẩm.");
      res.redirect("/cart");
    });
  } else {
    db.query("UPDATE cart SET quantity=? WHERE id=?", [quantity, cartId], (err) => {
      if (err) return res.status(500).send("Không thể cập nhật số lượng.");
      res.redirect("/cart");
    });
  }
});

// ================== XÓA SẢN PHẨM ==================
router.post("/delete/:id", requireLogin, (req, res) => {
  const cartId = req.params.id;
  db.query("DELETE FROM cart WHERE id=?", [cartId], (err) => {
    if (err) return res.status(500).send("Không thể xóa sản phẩm.");
    res.redirect("/cart");
  });
});

module.exports = router;
