function resolveRoute(kind) {
    if (window.location.protocol !== "file:") {
        if (kind === "home") return "../";
        if (kind === "map") return "../map/";
        return "#";
    }

    const path = window.location.pathname;
    const fromStatic = path.includes("/static/");

    if (fromStatic) {
        if (kind === "home") return "../../public/index.html";
        if (kind === "map") return "../../public/map/index.html";
        return "#";
    }

    if (kind === "home") return "../index.html";
    if (kind === "map") return "../map/index.html";
    return "#";
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-route]").forEach((link) => {
        const kind = link.getAttribute("data-route");
        const target = resolveRoute(kind);
        if (target !== "#") {
            link.setAttribute("href", target);
        }
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    document.querySelectorAll("[data-reveal]").forEach((node) => observer.observe(node));
});
