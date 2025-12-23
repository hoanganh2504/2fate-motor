document.addEventListener("DOMContentLoaded", () => {
  const registerButtons = document.querySelectorAll(".btn-register");

  registerButtons.forEach(button => {
    button.addEventListener("click", () => {
      const eventName = button.getAttribute("data-event");
      alert(`🎉 Bạn đã đăng ký tham gia sự kiện: ${eventName}`);
    });
  });
});
