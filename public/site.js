const header = document.querySelector("[data-header]");
const toggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

function syncHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

syncHeader();
window.addEventListener("scroll", syncHeader, { passive: true });

if (toggle && header) {
  toggle.addEventListener("click", () => {
    header.classList.toggle("nav-open");
  });
}

if (nav && header) {
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) header.classList.remove("nav-open");
  });
}

const whatsappForm = document.querySelector("[data-whatsapp-form]");
if (whatsappForm) {
  whatsappForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(whatsappForm);
    const nome = String(data.get("nome") || "").trim();
    const telefone = String(data.get("telefone") || "").trim();
    const interesse = String(data.get("interesse") || "").trim();
    const mensagem = String(data.get("mensagem") || "").trim();

    if (!nome) {
      whatsappForm.querySelector("[name='nome']").focus();
      return;
    }

    const text = [
      `Olá! Meu nome é ${nome}.`,
      telefone ? `Telefone: ${telefone}` : "",
      interesse ? `Interesse: ${interesse}` : "",
      mensagem || "Gostaria de atendimento da Laca Corretores."
    ].filter(Boolean).join("\n");

    window.open(`https://wa.me/5513991802430?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    whatsappForm.reset();
  });
}

const propertyGallery = document.querySelector("[data-property-gallery]");

if (propertyGallery) {
  initPropertyGallery(propertyGallery);
}

function initPropertyGallery(root) {
  let items = [];

  try {
    items = JSON.parse(root.dataset.galleryItems || "[]");
  } catch (error) {
    items = [];
  }

  items = items.filter((item) => item && item.src);
  if (!items.length) return;

  const lightbox = document.createElement("div");
  lightbox.className = "gallery-lightbox";
  lightbox.hidden = true;
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Galeria de fotos do imovel");
  lightbox.innerHTML = `
    <div class="gallery-lightbox-shell">
      <div class="gallery-lightbox-top">
        <div>
          <div class="gallery-lightbox-count" data-lightbox-count></div>
          <div class="gallery-lightbox-hint">Clique na foto para ampliar</div>
        </div>
        <button class="gallery-lightbox-close" type="button" data-lightbox-close>Fechar</button>
      </div>
      <div class="gallery-lightbox-stage" data-lightbox-stage>
        <button class="gallery-lightbox-zoom" type="button" data-lightbox-zoom aria-label="Ampliar imagem">
          <img data-lightbox-image alt="">
        </button>
      </div>
      <button class="gallery-lightbox-nav prev" type="button" data-lightbox-prev>Anterior</button>
      <button class="gallery-lightbox-nav next" type="button" data-lightbox-next>Proxima</button>
      <div class="gallery-lightbox-thumbs" data-lightbox-thumbs role="listbox" aria-label="Miniaturas da galeria"></div>
    </div>
  `;
  document.body.appendChild(lightbox);

  const closeButton = lightbox.querySelector("[data-lightbox-close]");
  const prevButton = lightbox.querySelector("[data-lightbox-prev]");
  const nextButton = lightbox.querySelector("[data-lightbox-next]");
  const count = lightbox.querySelector("[data-lightbox-count]");
  const stage = lightbox.querySelector("[data-lightbox-stage]");
  const zoomButton = lightbox.querySelector("[data-lightbox-zoom]");
  const image = lightbox.querySelector("[data-lightbox-image]");
  const thumbs = lightbox.querySelector("[data-lightbox-thumbs]");
  const thumbButtons = [];
  let currentIndex = 0;
  let lastFocused = null;
  let pointerStartX = 0;
  let pointerId = null;

  items.forEach((item, index) => {
    const button = document.createElement("button");
    const thumb = document.createElement("img");
    button.className = "gallery-lightbox-thumb";
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-label", `Abrir foto ${index + 1}`);
    thumb.src = item.src;
    thumb.alt = "";
    thumb.loading = "lazy";
    button.appendChild(thumb);
    button.addEventListener("click", () => showImage(index));
    thumbs.appendChild(button);
    thumbButtons.push(button);
  });

  const hasManyImages = items.length > 1;
  prevButton.hidden = !hasManyImages;
  nextButton.hidden = !hasManyImages;
  thumbs.hidden = !hasManyImages;

  root.querySelectorAll("[data-gallery-open]").forEach((button) => {
    button.addEventListener("click", () => openGallery(Number(button.dataset.galleryOpen) || 0));
  });

  closeButton.addEventListener("click", closeGallery);
  prevButton.addEventListener("click", () => moveImage(-1));
  nextButton.addEventListener("click", () => moveImage(1));
  zoomButton.addEventListener("click", () => setZoom(!lightbox.classList.contains("is-zoomed")));

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeGallery();
  });

  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    pointerStartX = event.clientX;
    pointerId = event.pointerId;
  });

  stage.addEventListener("pointerup", (event) => {
    if (pointerId !== event.pointerId) return;
    const distance = event.clientX - pointerStartX;
    pointerId = null;
    if (Math.abs(distance) > 44 && hasManyImages) moveImage(distance < 0 ? 1 : -1);
  });

  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeGallery();
      return;
    }

    if (event.key === "ArrowLeft" && hasManyImages) {
      event.preventDefault();
      moveImage(-1);
      return;
    }

    if (event.key === "ArrowRight" && hasManyImages) {
      event.preventDefault();
      moveImage(1);
      return;
    }

    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      setZoom(!lightbox.classList.contains("is-zoomed"));
      return;
    }

    keepFocusInside(event);
  });

  function openGallery(index) {
    lastFocused = document.activeElement;
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    showImage(index);
    requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
  }

  function closeGallery() {
    lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
    setZoom(false);
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus({ preventScroll: true });
    }
  }

  function showImage(index) {
    currentIndex = (index + items.length) % items.length;
    const item = items[currentIndex];
    image.src = item.src;
    image.alt = item.alt || `Foto ${currentIndex + 1} do imovel`;
    count.textContent = `${currentIndex + 1} / ${items.length}`;
    thumbButtons.forEach((button, buttonIndex) => {
      const isActive = buttonIndex === currentIndex;
      button.setAttribute("aria-selected", String(isActive));
      if (isActive) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    setZoom(false);
  }

  function moveImage(direction) {
    showImage(currentIndex + direction);
  }

  function setZoom(isZoomed) {
    lightbox.classList.toggle("is-zoomed", isZoomed);
    zoomButton.setAttribute("aria-label", isZoomed ? "Reduzir imagem" : "Ampliar imagem");
    if (!isZoomed) stage.scrollTo({ top: 0, left: 0 });
  }

  function keepFocusInside(event) {
    if (event.key !== "Tab") return;

    const focusable = Array.from(lightbox.querySelectorAll("button:not([hidden])"))
      .filter((element) => !element.disabled && element.offsetParent !== null);

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
