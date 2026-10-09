(function () {
  const hero = document.querySelector("[data-hero]");
  const wash = document.querySelector("[data-wash]");
  if (hero && wash && window.matchMedia("(pointer: fine)").matches) {
    hero.classList.add("is-follow");
    hero.addEventListener("pointermove", (event) => {
      const box = hero.getBoundingClientRect();
      const x = ((event.clientX - box.left) / box.width - 0.5) * 10;
      const y = ((event.clientY - box.top) / box.height - 0.5) * 10;
      wash.style.setProperty("--wx", `${x}%`);
      wash.style.setProperty("--wy", `${y}%`);
    });
  }

  const nodes = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    nodes.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
  );
  nodes.forEach((el) => io.observe(el));
})();
