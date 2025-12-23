// ==========================
// QUẢN LÝ GIAO DIỆN VÀ CHUYỂN MỤC
// ==========================
function showSection(section) {
  document.querySelectorAll('.section').forEach(sec => sec.style.display = 'none');
  const active = document.getElementById(section + '-section');
  if (active) active.style.display = 'block';
}

// ==========================
// NGƯỜI DÙNG
// ==========================

// Lấy danh sách người dùng
function loadUsers() {
  fetch('/api/users')
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#users-table tbody');
      tbody.innerHTML = '';
      data.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${user.id}</td>
          <td>${user.username}</td>
          <td>${user.email}</td>
          <td>
            <button class="btn btn-sm btn-warning" onclick="showEditUser(${user.id})">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    })
    .catch(err => console.error('Lỗi load user:', err));
}


// ==========================
// SẢN PHẨM
// ==========================

// Lấy danh sách sản phẩm
function loadProducts() {
  fetch('/api/products')
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#products-table tbody');
      tbody.innerHTML = '';
      data.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.id}</td>
          <td>${p.name}</td>
          <td>${p.price.toLocaleString()} ₫</td>
          <td>
            <button class="btn btn-sm btn-warning" onclick="showEditProduct(${p.id})">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    })
    .catch(err => console.error('Lỗi load product:', err));
}

// Xóa sản phẩm
function deleteProduct(id) {
  if (confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) {
    fetch('/api/products/' + id, { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        alert(data.message || 'Đã xóa sản phẩm');
        loadProducts();
      })
      .catch(err => console.error('Lỗi xóa product:', err));
  }
}

// Hiện / Ẩn form thêm sản phẩm
function showAddProductForm() {
  document.getElementById('add-product-form').style.display = 'block';
}
function hideAddProductForm() {
  document.getElementById('add-product-form').style.display = 'none';
}

// Thêm sản phẩm mới
document.getElementById('form-add-product')?.addEventListener('submit', function (e) {
  e.preventDefault();
  const name = document.getElementById('new-product-name').value;
  const price = parseFloat(document.getElementById('new-product-price').value);

  fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price })
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message || 'Thêm sản phẩm thành công');
      hideAddProductForm();
      loadProducts();
    })
    .catch(err => console.error('Lỗi thêm product:', err));
});

// Hiện form sửa sản phẩm
function showEditProduct(id) {
  fetch('/api/products/' + id)
    .then(res => res.json())
    .then(p => {
      document.getElementById('edit-product-id').value = p.id;
      document.getElementById('edit-product-name').value = p.name;
      document.getElementById('edit-product-price').value = p.price;
      document.getElementById('edit-product-form').style.display = 'block';
    })
    .catch(err => console.error('Lỗi tải product:', err));
}

function hideEditProduct() {
  document.getElementById('edit-product-form').style.display = 'none';
}

// Cập nhật sản phẩm
document.getElementById('form-edit-product')?.addEventListener('submit', function (e) {
  e.preventDefault();
  const id = document.getElementById('edit-product-id').value;
  const name = document.getElementById('edit-product-name').value;
  const price = parseFloat(document.getElementById('edit-product-price').value);

  fetch('/api/products/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price })
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message || 'Cập nhật sản phẩm thành công');
      hideEditProduct();
      loadProducts();
    })
    .catch(err => console.error('Lỗi cập nhật product:', err));
});

// ==========================
// KHỞI CHẠY KHI MỞ TRANG
// ==========================
window.onload = () => {
  showSection('users');
  loadUsers();
};
