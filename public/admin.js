const state = {
  posts: [],
  properties: [],
  editingPostId: null,
  editingPropertyId: null,
  postSearch: "",
  postStatus: "all",
  propertySearch: "",
  propertyStatus: "all"
};

const loginView = document.querySelector("[data-login-view]");
const appView = document.querySelector("[data-app-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const logoutButton = document.querySelector("[data-logout]");
const statsEl = document.querySelector("[data-stats]");

const postListEl = document.querySelector("[data-post-list]");
const postForm = document.querySelector("[data-editor-form]");
const postEditorTitle = document.querySelector("[data-editor-title]");
const postMessage = document.querySelector("[data-editor-message]");
const postSaveButton = document.querySelector("[data-save-button]");
const postSearchInput = document.querySelector("[data-search]");
const postStatusFilter = document.querySelector("[data-status-filter]");
const newPostButton = document.querySelector("[data-new-post]");
const resetPostButton = document.querySelector("[data-reset-form]");
const postMediaTypeInput = document.querySelector("[data-media-type]");
const postYoutubeRow = document.querySelector("[data-youtube-row]");
const postUploadRow = document.querySelector("[data-upload-row]");
const postVideoUploadRow = document.querySelector("[data-video-upload-row]");
const coverUpload = document.querySelector("[data-cover-upload]");
const videoUpload = document.querySelector("[data-video-upload]");
const coverStatus = document.querySelector("[data-cover-status]");
const videoStatus = document.querySelector("[data-video-status]");

const propertyListEl = document.querySelector("[data-property-list]");
const propertyForm = document.querySelector("[data-property-form]");
const propertyEditorTitle = document.querySelector("[data-property-editor-title]");
const propertyMessage = document.querySelector("[data-property-message]");
const propertySaveButton = document.querySelector("[data-save-property-button]");
const propertySearchInput = document.querySelector("[data-property-search]");
const propertyStatusFilter = document.querySelector("[data-property-status-filter]");
const resetPropertyButton = document.querySelector("[data-reset-property-form]");
const propertyMediaTypeInput = document.querySelector("[data-property-media-type]");
const propertyYoutubeRow = document.querySelector("[data-property-youtube-row]");
const propertyUploadRow = document.querySelector("[data-property-upload-row]");
const propertyVideoUploadRow = document.querySelector("[data-property-video-upload-row]");
const propertyImageUpload = document.querySelector("[data-property-image-upload]");
const propertyVideoUpload = document.querySelector("[data-property-video-upload]");
const propertyImageStatus = document.querySelector("[data-property-image-status]");
const propertyVideoStatus = document.querySelector("[data-property-video-status]");

boot();

async function boot() {
  const me = await api("/api/me");
  if (me.authenticated) {
    showApp();
    await loadAll();
  } else {
    showLogin();
  }
  bindEvents();
}

function bindEvents() {
  loginForm?.addEventListener("submit", handleLogin);
  logoutButton?.addEventListener("click", handleLogout);

  postForm?.addEventListener("submit", handlePostSave);
  postSearchInput?.addEventListener("input", () => {
    state.postSearch = postSearchInput.value.trim().toLowerCase();
    renderPostList();
  });
  postStatusFilter?.addEventListener("change", () => {
    state.postStatus = postStatusFilter.value;
    renderPostList();
  });
  newPostButton?.addEventListener("click", () => resetPostEditor(true));
  resetPostButton?.addEventListener("click", () => resetPostEditor(true));
  postMediaTypeInput?.addEventListener("change", syncPostMediaRows);
  coverUpload?.addEventListener("change", () => uploadFile(coverUpload, "post-cover"));
  videoUpload?.addEventListener("change", () => uploadFile(videoUpload, "post-video"));

  propertyForm?.addEventListener("submit", handlePropertySave);
  propertySearchInput?.addEventListener("input", () => {
    state.propertySearch = propertySearchInput.value.trim().toLowerCase();
    renderPropertyList();
  });
  propertyStatusFilter?.addEventListener("change", () => {
    state.propertyStatus = propertyStatusFilter.value;
    renderPropertyList();
  });
  resetPropertyButton?.addEventListener("click", () => resetPropertyEditor(true));
  propertyMediaTypeInput?.addEventListener("change", syncPropertyMediaRows);
  propertyImageUpload?.addEventListener("change", () => uploadFile(propertyImageUpload, "property-image"));
  propertyVideoUpload?.addEventListener("change", () => uploadFile(propertyVideoUpload, "property-video"));
}

async function handleLogin(event) {
  event.preventDefault();
  setMessage(loginMessage, "Entrando...");
  const data = new FormData(loginForm);
  try {
    await api("/api/login", {
      method: "POST",
      body: { password: data.get("password") }
    });
    loginForm.reset();
    showApp();
    await loadAll();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
}

async function handleLogout() {
  await api("/api/logout", { method: "POST", body: {} });
  showLogin();
}

async function loadAll() {
  const [postData, propertyData] = await Promise.all([
    api("/api/admin/posts"),
    api("/api/admin/properties")
  ]);
  state.posts = postData.posts || [];
  state.properties = propertyData.properties || [];
  renderStats();
  renderPostList();
  renderPropertyList();
  if (!state.editingPostId) resetPostEditor(false);
  if (!state.editingPropertyId) resetPropertyEditor(false);
}

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
}

function renderStats() {
  const publishedProperties = state.properties.filter((item) => item.status === "published").length;
  const draftProperties = state.properties.filter((item) => item.status !== "published").length;
  const publishedPosts = state.posts.filter((item) => item.status === "published").length;
  const videos = [...state.posts, ...state.properties].filter((item) => item.mediaType !== "none").length;
  statsEl.innerHTML = [
    ["Imóveis publicados", publishedProperties],
    ["Imóveis rascunho", draftProperties],
    ["Posts publicados", publishedPosts],
    ["Itens com vídeo", videos]
  ].map(([label, value]) => `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderPostList() {
  const filtered = state.posts.filter((post) => {
    const text = `${post.title} ${post.neighborhood} ${post.category} ${(post.tags || []).join(" ")}`.toLowerCase();
    const matchesSearch = !state.postSearch || text.includes(state.postSearch);
    const matchesStatus = state.postStatus === "all" || post.status === state.postStatus;
    return matchesSearch && matchesStatus;
  });

  if (!filtered.length) {
    postListEl.innerHTML = `<div class="empty-state">Nenhuma postagem encontrada.</div>`;
    return;
  }

  postListEl.innerHTML = filtered.map((post) => `
    <article class="post-row">
      <img src="${escapeAttr(post.coverImage || "/assets/praia-grande-orla.jpg")}" alt="">
      <div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.category)} • ${escapeHtml(post.neighborhood)} • /post/${escapeHtml(post.slug)}</p>
        <span class="status-pill ${post.status}">${post.status === "published" ? "Publicado" : "Rascunho"}${post.featured ? " • destaque" : ""}${post.mediaType !== "none" ? " • vídeo" : ""}</span>
      </div>
      <div class="row-actions">
        <button class="ghost-button" type="button" data-edit-post="${post.id}">Editar</button>
        ${post.status === "published" ? `<a class="ghost-link" href="/post/${post.slug}" target="_blank" rel="noopener">Abrir</a>` : ""}
        <button class="danger-button" type="button" data-delete-post="${post.id}">Excluir</button>
      </div>
    </article>
  `).join("");

  postListEl.querySelectorAll("[data-edit-post]").forEach((button) => {
    button.addEventListener("click", () => editPost(button.dataset.editPost));
  });
  postListEl.querySelectorAll("[data-delete-post]").forEach((button) => {
    button.addEventListener("click", () => deletePost(button.dataset.deletePost));
  });
}

function renderPropertyList() {
  const filtered = state.properties.filter((property) => {
    const text = `${property.title} ${property.reference} ${property.neighborhood} ${property.propertyType} ${(property.features || []).join(" ")}`.toLowerCase();
    const matchesSearch = !state.propertySearch || text.includes(state.propertySearch);
    const matchesStatus = state.propertyStatus === "all" || property.status === state.propertyStatus;
    return matchesSearch && matchesStatus;
  });

  if (!filtered.length) {
    propertyListEl.innerHTML = `<div class="empty-state">Nenhum imóvel encontrado.</div>`;
    return;
  }

  propertyListEl.innerHTML = filtered.map((property) => `
    <article class="post-row">
      <img src="${escapeAttr(property.coverImage || "/assets/praia-grande-orla.jpg")}" alt="">
      <div>
        <h3>${escapeHtml(property.title)}</h3>
        <p>${escapeHtml(property.reference)} • ${escapeHtml(property.propertyType)} • ${escapeHtml(property.neighborhood)} • ${formatCurrency(property.price)}</p>
        <span class="status-pill ${property.status}">${property.status === "published" ? "Publicado" : "Rascunho"}${property.featured ? " • destaque" : ""}</span>
        <span class="status-pill ${property.saleStatus}">${saleStatusLabel(property.saleStatus)}</span>
      </div>
      <div class="row-actions">
        <button class="ghost-button" type="button" data-edit-property="${property.id}">Editar</button>
        ${property.status === "published" ? `<a class="ghost-link" href="/imovel/${property.slug}" target="_blank" rel="noopener">Abrir</a>` : ""}
        <button class="danger-button" type="button" data-delete-property="${property.id}">Excluir</button>
      </div>
    </article>
  `).join("");

  propertyListEl.querySelectorAll("[data-edit-property]").forEach((button) => {
    button.addEventListener("click", () => editProperty(button.dataset.editProperty));
  });
  propertyListEl.querySelectorAll("[data-delete-property]").forEach((button) => {
    button.addEventListener("click", () => deleteProperty(button.dataset.deleteProperty));
  });
}

function editPost(id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post) return;
  state.editingPostId = id;
  postEditorTitle.textContent = "Editar postagem";
  fillPostForm(post);
  document.querySelector("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editProperty(id) {
  const property = state.properties.find((item) => item.id === id);
  if (!property) return;
  state.editingPropertyId = id;
  propertyEditorTitle.textContent = "Editar imóvel";
  fillPropertyForm(property);
  document.querySelector("#property-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deletePost(id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post) return;
  if (!confirm(`Excluir "${post.title}"? Essa ação remove a postagem do site.`)) return;
  await api(`/api/admin/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (state.editingPostId === id) resetPostEditor(false);
  await loadAll();
}

async function deleteProperty(id) {
  const property = state.properties.find((item) => item.id === id);
  if (!property) return;
  if (!confirm(`Excluir "${property.title}"? Essa ação remove o imóvel da vitrine.`)) return;
  await api(`/api/admin/properties/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (state.editingPropertyId === id) resetPropertyEditor(false);
  await loadAll();
}

function resetPostEditor(scroll = false) {
  state.editingPostId = null;
  postEditorTitle.textContent = "Nova postagem";
  postForm.reset();
  postForm.elements.category.value = "Mercado imobiliário";
  postForm.elements.neighborhood.value = "Praia Grande";
  postForm.elements.status.value = "draft";
  postForm.elements.coverImage.value = "/assets/praia-grande-orla.jpg";
  postForm.elements.mediaType.value = "none";
  postForm.elements.author.value = "Laca Corretores";
  syncPostMediaRows();
  setMessage(postMessage, "");
  if (scroll) document.querySelector("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetPropertyEditor(scroll = false) {
  state.editingPropertyId = null;
  propertyEditorTitle.textContent = "Novo imóvel";
  propertyForm.reset();
  propertyForm.elements.status.value = "draft";
  propertyForm.elements.saleStatus.value = "available";
  propertyForm.elements.propertyType.value = "Apartamento";
  propertyForm.elements.neighborhood.value = "Praia Grande";
  propertyForm.elements.cityState.value = "Praia Grande/SP";
  propertyForm.elements.bedrooms.value = "2";
  propertyForm.elements.suites.value = "1";
  propertyForm.elements.bathrooms.value = "2";
  propertyForm.elements.parkingSpaces.value = "1";
  propertyForm.elements.acceptsFinancing.checked = true;
  propertyForm.elements.images.value = "/assets/praia-grande-orla.jpg";
  propertyForm.elements.mediaType.value = "none";
  syncPropertyMediaRows();
  setMessage(propertyMessage, "");
  if (scroll) document.querySelector("#property-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillPostForm(post) {
  postForm.elements.id.value = post.id || "";
  postForm.elements.title.value = post.title || "";
  postForm.elements.slug.value = post.slug || "";
  postForm.elements.excerpt.value = post.excerpt || "";
  postForm.elements.body.value = post.body || "";
  postForm.elements.category.value = post.category || "";
  postForm.elements.neighborhood.value = post.neighborhood || "";
  postForm.elements.tags.value = (post.tags || []).join(", ");
  postForm.elements.status.value = post.status || "draft";
  postForm.elements.featured.checked = Boolean(post.featured);
  postForm.elements.coverImage.value = post.coverImage || "";
  postForm.elements.mediaType.value = post.mediaType || "none";
  postForm.elements.youtubeUrl.value = post.youtubeUrl || "";
  postForm.elements.uploadUrl.value = post.uploadUrl || "";
  postForm.elements.seoTitle.value = post.seoTitle || "";
  postForm.elements.seoDescription.value = post.seoDescription || "";
  postForm.elements.author.value = post.author || "Laca Corretores";
  syncPostMediaRows();
  setMessage(postMessage, "");
}

function fillPropertyForm(property) {
  propertyForm.elements.id.value = property.id || "";
  propertyForm.elements.title.value = property.title || "";
  propertyForm.elements.reference.value = property.reference || "";
  propertyForm.elements.slug.value = property.slug || "";
  propertyForm.elements.shortDescription.value = property.shortDescription || "";
  propertyForm.elements.description.value = property.description || "";
  propertyForm.elements.highlights.value = (property.highlights || []).join("\n");
  propertyForm.elements.features.value = (property.features || []).join("\n");
  propertyForm.elements.nearby.value = (property.nearby || []).join("\n");
  propertyForm.elements.status.value = property.status || "draft";
  propertyForm.elements.saleStatus.value = property.saleStatus || "available";
  propertyForm.elements.propertyType.value = property.propertyType || "Apartamento";
  propertyForm.elements.neighborhood.value = property.neighborhood || "Praia Grande";
  propertyForm.elements.price.value = property.price || "";
  propertyForm.elements.condoFee.value = property.condoFee || "";
  propertyForm.elements.iptu.value = property.iptu || "";
  propertyForm.elements.distanceToBeach.value = property.distanceToBeach || "";
  propertyForm.elements.usableArea.value = property.usableArea || "";
  propertyForm.elements.totalArea.value = property.totalArea || "";
  propertyForm.elements.bedrooms.value = property.bedrooms || "0";
  propertyForm.elements.suites.value = property.suites || "0";
  propertyForm.elements.bathrooms.value = property.bathrooms || "0";
  propertyForm.elements.parkingSpaces.value = property.parkingSpaces || "0";
  propertyForm.elements.floor.value = property.floor || "";
  propertyForm.elements.cityState.value = `${property.city || "Praia Grande"}/${property.state || "SP"}`;
  propertyForm.elements.address.value = property.address || "";
  propertyForm.elements.mapUrl.value = property.mapUrl || "";
  propertyForm.elements.featured.checked = Boolean(property.featured);
  propertyForm.elements.acceptsFinancing.checked = Boolean(property.acceptsFinancing);
  propertyForm.elements.acceptsExchange.checked = Boolean(property.acceptsExchange);
  propertyForm.elements.furnished.checked = Boolean(property.furnished);
  propertyForm.elements.images.value = (property.images || []).join("\n");
  propertyForm.elements.mediaType.value = property.mediaType || "none";
  propertyForm.elements.youtubeUrl.value = property.youtubeUrl || "";
  propertyForm.elements.uploadUrl.value = property.uploadUrl || "";
  propertyForm.elements.seoTitle.value = property.seoTitle || "";
  propertyForm.elements.seoDescription.value = property.seoDescription || "";
  syncPropertyMediaRows();
  setMessage(propertyMessage, "");
}

async function handlePostSave(event) {
  event.preventDefault();
  const payload = postPayload();
  const wasEditing = Boolean(state.editingPostId);
  const method = state.editingPostId ? "PUT" : "POST";
  const url = state.editingPostId ? `/api/admin/posts/${encodeURIComponent(state.editingPostId)}` : "/api/admin/posts";
  postSaveButton.disabled = true;
  setMessage(postMessage, "Salvando...");
  try {
    const data = await api(url, { method, body: payload });
    state.editingPostId = data.post.id;
    await loadAll();
    editPost(data.post.id);
    setMessage(postMessage, wasEditing ? "Alteracoes da postagem salvas com sucesso." : "Postagem cadastrada com sucesso.", "success");
  } catch (error) {
    setMessage(postMessage, error.message, "error");
  } finally {
    postSaveButton.disabled = false;
  }
}

async function handlePropertySave(event) {
  event.preventDefault();
  const payload = propertyPayload();
  const wasEditing = Boolean(state.editingPropertyId);
  const method = state.editingPropertyId ? "PUT" : "POST";
  const url = state.editingPropertyId ? `/api/admin/properties/${encodeURIComponent(state.editingPropertyId)}` : "/api/admin/properties";
  propertySaveButton.disabled = true;
  setMessage(propertyMessage, "Salvando...");
  try {
    const data = await api(url, { method, body: payload });
    state.editingPropertyId = data.property.id;
    setMessage(propertyMessage, "Imóvel salvo com sucesso.", "success");
    await loadAll();
    editProperty(data.property.id);
    setMessage(propertyMessage, wasEditing ? "Alteracoes do imovel salvas com sucesso." : "Imovel cadastrado com sucesso.", "success");
  } catch (error) {
    setMessage(propertyMessage, error.message, "error");
  } finally {
    propertySaveButton.disabled = false;
  }
}

function postPayload() {
  const form = new FormData(postForm);
  return {
    title: form.get("title"),
    slug: form.get("slug"),
    excerpt: form.get("excerpt"),
    body: form.get("body"),
    category: form.get("category"),
    neighborhood: form.get("neighborhood"),
    tags: form.get("tags"),
    status: form.get("status"),
    featured: form.get("featured") === "on",
    coverImage: form.get("coverImage"),
    mediaType: form.get("mediaType"),
    youtubeUrl: form.get("youtubeUrl"),
    uploadUrl: form.get("uploadUrl"),
    seoTitle: form.get("seoTitle"),
    seoDescription: form.get("seoDescription"),
    author: form.get("author")
  };
}

function propertyPayload() {
  const form = new FormData(propertyForm);
  const [city, stateCode] = String(form.get("cityState") || "Praia Grande/SP").split("/");
  return {
    title: form.get("title"),
    reference: form.get("reference"),
    slug: form.get("slug"),
    shortDescription: form.get("shortDescription"),
    description: form.get("description"),
    highlights: form.get("highlights"),
    features: form.get("features"),
    nearby: form.get("nearby"),
    status: form.get("status"),
    saleStatus: form.get("saleStatus"),
    propertyType: form.get("propertyType"),
    neighborhood: form.get("neighborhood"),
    price: form.get("price"),
    condoFee: form.get("condoFee"),
    iptu: form.get("iptu"),
    distanceToBeach: form.get("distanceToBeach"),
    usableArea: form.get("usableArea"),
    totalArea: form.get("totalArea"),
    bedrooms: form.get("bedrooms"),
    suites: form.get("suites"),
    bathrooms: form.get("bathrooms"),
    parkingSpaces: form.get("parkingSpaces"),
    floor: form.get("floor"),
    city: city?.trim() || "Praia Grande",
    state: stateCode?.trim() || "SP",
    address: form.get("address"),
    mapUrl: form.get("mapUrl"),
    featured: form.get("featured") === "on",
    acceptsFinancing: form.get("acceptsFinancing") === "on",
    acceptsExchange: form.get("acceptsExchange") === "on",
    furnished: form.get("furnished") === "on",
    images: form.get("images"),
    coverImage: firstLine(form.get("images")) || "/assets/praia-grande-orla.jpg",
    mediaType: form.get("mediaType"),
    youtubeUrl: form.get("youtubeUrl"),
    uploadUrl: form.get("uploadUrl"),
    seoTitle: form.get("seoTitle"),
    seoDescription: form.get("seoDescription")
  };
}

function syncPostMediaRows() {
  const type = postMediaTypeInput.value;
  postYoutubeRow.hidden = type !== "youtube";
  postUploadRow.hidden = type !== "upload";
  postVideoUploadRow.hidden = type !== "upload";
}

function syncPropertyMediaRows() {
  const type = propertyMediaTypeInput.value;
  propertyYoutubeRow.hidden = type !== "youtube";
  propertyUploadRow.hidden = type !== "upload";
  propertyVideoUploadRow.hidden = type !== "upload";
}

async function uploadFile(input, kind) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const statusEl = {
    "post-cover": coverStatus,
    "post-video": videoStatus,
    "property-image": propertyImageStatus,
    "property-video": propertyVideoStatus
  }[kind];
  const isPropertyGallery = kind === "property-image";
  const uploadQueue = isPropertyGallery ? files : [files[0]];
  statusEl.textContent = uploadQueue.length > 1 ? `Enviando 1 de ${uploadQueue.length}...` : "Enviando...";

  try {
    const uploaded = [];

    for (let index = 0; index < uploadQueue.length; index += 1) {
      if (uploadQueue.length > 1) statusEl.textContent = `Enviando ${index + 1} de ${uploadQueue.length}...`;
      const form = new FormData();
      form.append("file", uploadQueue[index]);
      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha no upload.");
      uploaded.push(data);
    }

    if (kind === "post-cover") {
      const data = uploaded[0];
      postForm.elements.coverImage.value = data.url;
      statusEl.textContent = `Capa enviada: ${data.name}`;
    }
    if (kind === "post-video") {
      const data = uploaded[0];
      postForm.elements.uploadUrl.value = data.url;
      postForm.elements.mediaType.value = "upload";
      statusEl.textContent = `Vídeo enviado: ${data.name}`;
      syncPostMediaRows();
    }
    if (kind === "property-image") {
      uploaded.forEach((data) => appendLine(propertyForm.elements.images, data.url));
      statusEl.textContent = uploaded.length === 1
        ? `Imagem adicionada: ${uploaded[0].name}`
        : `${uploaded.length} imagens adicionadas à galeria`;
    }
    if (kind === "property-video") {
      const data = uploaded[0];
      propertyForm.elements.uploadUrl.value = data.url;
      propertyForm.elements.mediaType.value = "upload";
      statusEl.textContent = `Vídeo enviado: ${data.name}`;
      syncPropertyMediaRows();
    }
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    input.value = "";
  }
}

async function api(url, options = {}) {
  const fetchOptions = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {}
  };
  if (options.body !== undefined) {
    fetchOptions.headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, fetchOptions);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || "Erro inesperado.");
  return data;
}

function setMessage(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

function firstLine(value = "") {
  return String(value).split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean)[0] || "";
}

function appendLine(input, value) {
  const current = String(input.value || "").trim();
  input.value = current ? `${current}\n${value}` : value;
}

function saleStatusLabel(value) {
  return {
    available: "Disponível",
    reserved: "Reservado",
    sold: "Vendido"
  }[value] || "Disponível";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
