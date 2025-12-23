let allProducts = [];
let allWarehouses = [];

async function loadProducts() {
  try {
    const [productsRes, warehousesRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/warehouses/inventory')
    ]);
    
    allProducts = await productsRes.json();
    allWarehouses = await warehousesRes.json();
    
    displayProducts(allProducts);
  } catch (err) {
    console.error('Lỗi tải sản phẩm:', err);
    document.getElementById('results').innerHTML = '<p style="text-align:center;padding:50px">Không thể tải sản phẩm!</p>';
  }
}

function displayProducts(products) {
  const resultsDiv = document.getElementById('results');
  
  if (products.length === 0) {
    resultsDiv.innerHTML = '<p style="text-align:center;padding:50px">Không tìm thấy sản phẩm nào!</p>';
    return;
  }
  
  resultsDiv.innerHTML = products.map(p => {
    const inventory = getProductInventory(p.id);
    const totalStock = inventory.reduce((sum, inv) => sum + inv.quantity, 0);
    
    return `
      <div class="product-card" style="border:1px solid #ddd;border-radius:10px;padding:15px;text-align:center;background:white">
        <img src="${p.image}" alt="${p.name}" style="width:100%;height:200px;object-fit:cover;border-radius:8px">
        <h3 style="margin:15px 0 10px;font-size:1.1rem">${p.name}</h3>
        <p class="price" style="color:#e74c3c;font-size:1.3rem;font-weight:bold;margin:10px 0">
          ${p.price.toLocaleString()} VND
        </p>
        
        <div style="background:#f8f9fa;padding:10px;border-radius:5px;margin:10px 0;text-align:left">
          <strong style="font-size:0.9rem">Tồn kho:</strong><br>
          ${inventory.length > 0 ? inventory.map(inv => `
            <div style="margin:5px 0;padding:5px;border-radius:3px;font-size:0.85rem;background:${
              inv.quantity === 0 ? '#f8d7da' : 
              inv.quantity <= 5 ? '#fff3cd' : '#d4edda'
            };color:${
              inv.quantity === 0 ? '#721c24' : 
              inv.quantity <= 5 ? '#856404' : '#155724'
            }">
              <strong>${inv.warehouse_name}:</strong> ${inv.quantity} xe
            </div>
          `).join('') : '<div style="background:#f8d7da;color:#721c24;padding:5px;border-radius:3px;font-size:0.85rem">Hết hàng tất cả chi nhánh</div>'}
        </div>
        
        ${totalStock > 0 ? 
          `<button onclick="viewProduct(${p.id})" style="width:100%;padding:12px;background:#3498db;color:white;border:none;border-radius:5px;cursor:pointer;font-size:1rem">Xem chi tiết</button>` :
          `<button disabled style="width:100%;padding:12px;background:#ccc;color:#666;border:none;border-radius:5px;cursor:not-allowed;font-size:1rem">Hết hàng</button>`
        }
      </div>
    `;
  }).join('');
}

function getProductInventory(productId) {
  return allWarehouses.filter(inv => inv.product_id === productId);
}

function viewProduct(id) {
  fetch(`/api/products/${id}`)
    .then(res => res.json())
    .then(product => {
      const inventory = getProductInventory(id);
      const availableWarehouses = inventory.filter(inv => inv.quantity > 0);
      
      document.getElementById('results').style.display = 'none';
      document.getElementById('product-detail').style.display = 'block';
      document.getElementById('product-detail').innerHTML = `
        <div style="max-width:1000px;margin:0 auto;padding:20px">
          <button onclick="backToResults()" style="padding:10px 20px;background:#95a5a6;color:white;border:none;border-radius:5px;cursor:pointer;margin-bottom:20px">
            ← Quay lại
          </button>
          
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div>
              <img src="${product.image}" alt="${product.name}" style="width:100%;border-radius:10px">
            </div>
            
            <div>
              <h1 style="margin:0 0 20px;font-size:2rem">${product.name}</h1>
              <p style="color:#e74c3c;font-size:2rem;font-weight:bold;margin:0 0 30px">
                ${product.price.toLocaleString()} VND
              </p>
              
              ${availableWarehouses.length > 0 ? `
                <div style="background:#f8f9fa;padding:20px;border-radius:10px">
                  <h3 style="margin:0 0 15px">Chọn chi nhánh mua hàng:</h3>
                  
                  <select id="warehouseSelect" style="width:100%;padding:12px;margin-bottom:15px;border:2px solid #ddd;border-radius:5px;font-size:1rem">
                    ${availableWarehouses.map(inv => `
                      <option value="${inv.warehouse_id}" data-max="${inv.quantity}">
                        ${inv.warehouse_name} - Còn ${inv.quantity} xe
                      </option>
                    `).join('')}
                  </select>
                  
                  <label style="display:block;margin-bottom:5px;font-weight:bold">Số lượng:</label>
                  <input type="number" id="quantityInput" value="1" min="1" max="${availableWarehouses[0].quantity}" 
                         style="width:100%;padding:12px;margin-bottom:15px;border:2px solid #ddd;border-radius:5px;font-size:1rem">
                  
                  <label style="display:block;margin-bottom:5px;font-weight:bold">Màu sắc:</label>
                  <input type="text" id="colorInput" placeholder="Nhập màu (VD: Đen, Trắng, Đỏ...)" 
                         style="width:100%;padding:12px;margin-bottom:20px;border:2px solid #ddd;border-radius:5px;font-size:1rem">
                  
                  <button onclick="addToCart(${product.id})" 
                          style="width:100%;padding:15px;background:#27ae60;color:white;border:none;border-radius:5px;cursor:pointer;font-size:1.2rem;font-weight:bold">
                    🛒 Thêm vào giỏ hàng
                  </button>
                </div>
              ` : `
                <div style="background:#f8d7da;padding:20px;border-radius:10px;color:#721c24">
                  <h3 style="margin:0 0 10px">❌ Hết hàng!</h3>
                  <p style="margin:0">Sản phẩm này hiện đã hết hàng tại tất cả chi nhánh.<br>Vui lòng quay lại sau khi chúng tôi nhập thêm hàng.</p>
                </div>
              `}
              
              <div style="margin-top:30px">
                <h3 style="margin:0 0 15px">Chi tiết tồn kho các chi nhánh:</h3>
                <table style="width:100%;border-collapse:collapse">
                  <thead>
                    <tr style="background:#f8f9fa">
                      <th style="padding:12px;border:1px solid #ddd;text-align:left">Chi nhánh</th>
                      <th style="padding:12px;border:1px solid #ddd;text-align:center">Tồn kho</th>
                      <th style="padding:12px;border:1px solid #ddd;text-align:center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${inventory.map(inv => `
                      <tr>
                        <td style="padding:12px;border:1px solid #ddd">${inv.warehouse_name}</td>
                        <td style="padding:12px;border:1px solid #ddd;text-align:center">
                          <strong style="font-size:1.2rem">${inv.quantity}</strong> xe
                        </td>
                        <td style="padding:12px;border:1px solid #ddd;text-align:center">
                          <span style="padding:5px 15px;border-radius:20px;font-size:0.9rem;background:${
                            inv.quantity === 0 ? '#f8d7da' : 
                            inv.quantity <= 5 ? '#fff3cd' : '#d4edda'
                          };color:${
                            inv.quantity === 0 ? '#721c24' : 
                            inv.quantity <= 5 ? '#856404' : '#155724'
                          }">
                            ${inv.quantity === 0 ? '❌ Hết hàng' : 
                              inv.quantity <= 5 ? '⚠️ Sắp hết' : '✅ Còn hàng'}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Update max quantity khi đổi chi nhánh
      const warehouseSelect = document.getElementById('warehouseSelect');
      if (warehouseSelect) {
        warehouseSelect.addEventListener('change', function() {
          const selectedOption = this.options[this.selectedIndex];
          const maxQty = parseInt(selectedOption.dataset.max);
          const qtyInput = document.getElementById('quantityInput');
          qtyInput.max = maxQty;
          if (parseInt(qtyInput.value) > maxQty) {
            qtyInput.value = maxQty;
          }
        });
      }
    });
}

function backToResults() {
  document.getElementById('product-detail').style.display = 'none';
  document.getElementById('results').style.display = 'grid';
}

function addToCart(productId) {
  const warehouseId = document.getElementById('warehouseSelect')?.value;
  const quantity = parseInt(document.getElementById('quantityInput')?.value || 1);
  const color = document.getElementById('colorInput')?.value || 'Mặc định';
  
  if (!warehouseId) {
    alert('Vui lòng chọn chi nhánh!');
    return;
  }
  
  if (!color || color.trim() === '' || color === 'Mặc định') {
    alert('Vui lòng nhập màu sắc bạn muốn!');
    return;
  }
  
  const selectedOption = document.querySelector('#warehouseSelect option:checked');
  const maxQty = parseInt(selectedOption.dataset.max);
  
  if (quantity > maxQty) {
    alert(`Số lượng không hợp lệ! Chi nhánh này chỉ còn ${maxQty} xe.`);
    return;
  }
  
  fetch('/cart/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      productId, 
      warehouseId,
      color, 
      quantity 
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('✅ Đã thêm vào giỏ hàng!');
      location.reload();
    } else {
      alert('❌ ' + (data.message || 'Không thể thêm vào giỏ hàng!'));
    }
  })
  .catch(err => {
    console.error('Lỗi:', err);
    alert('❌ Có lỗi xảy ra!');
  });
}

function filterProducts() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const type = document.getElementById('typeFilter').value;
  const cc = document.getElementById('ccFilter').value;
  const color = document.getElementById('colorFilter').value;
  
  let filtered = allProducts.filter(p => {
    const matchName = !search || p.name.toLowerCase().includes(search);
    const matchType = !type || p.type?.toLowerCase().replace(/\s+/g, '-') === type;
    const matchCC = !cc || p.cc?.toString() === cc;
    const matchColor = !color || p.color?.toLowerCase().includes(color);
    
    return matchName && matchType && matchCC && matchColor;
  });
  
  displayProducts(filtered);
}

function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('typeFilter').value = '';
  document.getElementById('ccFilter').value = '';
  document.getElementById('colorFilter').value = '';
  displayProducts(allProducts);
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('searchBtn')?.addEventListener('click', filterProducts);
  document.getElementById('clearBtn')?.addEventListener('click', clearFilters);
  document.getElementById('searchInput')?.addEventListener('input', filterProducts);
  
  loadProducts();
});