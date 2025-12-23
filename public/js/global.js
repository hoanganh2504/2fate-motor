document.addEventListener("DOMContentLoaded", () => {
    const darkMode = localStorage.getItem("darkMode") === "true";
    const lang = localStorage.getItem("lang") || "vi";

    // Áp dụng giao diện
    document.body.classList.add(darkMode ? "dark-mode" : "light-mode");

    // Nếu có phần tử ngôn ngữ (header chẳng hạn)
    if (typeof translations !== "undefined") {
        const t = translations[lang];
        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.getAttribute("data-i18n");
            if (t[key]) el.textContent = t[key];
        });
    }
});
