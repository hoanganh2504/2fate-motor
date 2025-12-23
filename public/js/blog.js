document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("blogModal");
  const closeBtn = document.querySelector(".close-btn");
  const modalTitle = document.getElementById("modalTitle");
  const modalContent = document.getElementById("modalContent");

  const readButtons = document.querySelectorAll(".btn-read");

  readButtons.forEach(button => {
    button.addEventListener("click", () => {
      modalTitle.textContent = button.getAttribute("data-title");
      modalContent.textContent = button.getAttribute("data-content");
      modal.style.display = "flex";
    });
  });

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
});
