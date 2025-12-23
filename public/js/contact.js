const modal = document.getElementById("contactModal");
const btn = document.querySelector(".btn-contact");
const closeBtn = document.querySelector(".close-btn");
const form = document.getElementById("contactForm");

// Mở modal
btn.addEventListener("click", function (e) {
    e.preventDefault();
    modal.style.display = "flex";
});

// Đóng modal
closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
});

window.addEventListener("click", (e) => {
    if (e.target === modal) {
        modal.style.display = "none";
    }
});

// Xử lý form (demo)
form.addEventListener("submit", function (e) {
    e.preventDefault();
    alert("Cảm ơn bạn đã liên hệ! Thông tin đã được gửi.");
    modal.style.display = "none";
    form.reset();
});
