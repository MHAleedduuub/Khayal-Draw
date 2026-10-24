
"use strict";

const $ = id => document.getElementById(id);

const state = {
  width: 800,
  height: 600,
  zoom: 1,
  tool: "brush",
  color: "#9b7bff",
  size: 8,
  opacity: 1,
  fontSize: 32,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  layers: [],
  activeId: null,
  nextId: 1,
  drawing: false,
  start: null,
  last: null,
  preview: null,
  undo: [],
  redo: [],
  maxHistory: 25
};

const layerCanvas = new Map();

function status(message) {
  $("status").textContent = message;
}

function makeLayer(name) {
  const id = state.nextId++;
  const canvas = document.createElement("canvas");
  canvas.width = state.width;
  canvas.height = state.height;
  canvas.className = "layer-canvas";
  canvas.dataset.layerId = String(id);
  canvas.style.pointerEvents = "none";

  const layer = {
    id,
    name: name || `Layer ${id}`,
    visible: true,
    canvas
  };

  state.layers.push(layer);
  layerCanvas.set(id, canvas);
  state.activeId = id;
  $("canvasStage").appendChild(canvas);

  refreshStage();
  refreshLayers();
  remember();

  return layer;
}

function activeLayer() {
  return state.layers.find(layer => layer.id === state.activeId) || null;
}

function contextOf(layer) {
  return layer.canvas.getContext("2d");
}

function refreshStage() {
  const stage = $("canvasStage");
  stage.style.width = `${state.width * state.zoom}px`;
  stage.style.height = `${state.height * state.zoom}px`;

  state.layers.forEach((layer, index) => {
    layer.canvas.style.zIndex = String(index + 1);
    layer.canvas.style.pointerEvents =
      layer.id === state.activeId && layer.visible ? "auto" : "none";
    layer.canvas.classList.toggle("hidden-layer", !layer.visible);
  });

  $("documentInfo").textContent = `${state.width} × ${state.height} px`;
  $("zoomValue").textContent = `${Math.round(state.zoom * 100)}%`;
}

function refreshLayers() {
  const list = $("layersList");
  list.replaceChildren();

  [...state.layers].reverse().forEach(layer => {
    const item = document.createElement("div");
    item.className = "layer-item";
    if (layer.id === state.activeId) item.classList.add("selected");

    const visibility = document.createElement("button");
    visibility.className = "layer-visibility";
    visibility.textContent = layer.visible ? "◉" : "○";
    visibility.title = layer.visible ? "Hide layer" : "Show layer";
    visibility.classList.toggle("off", !layer.visible);
    visibility.addEventListener("click", event => {
      event.stopPropagation();
      layer.visible = !layer.visible;
      refreshStage();
      refreshLayers();
      remember();
    });

    const name = document.createElement("div");
    name.className = "layer-name";
    name.textContent = layer.name;
    name.title = "Double tap or double click to rename";
    name.addEventListener("click", () => selectLayer(layer.id));
    name.addEventListener("dblclick", () => renameLayer(layer));

    const select = document.createElement("button");
    select.className = "layer-select";
    select.textContent = "▤";
    select.title = "Select layer";
    select.addEventListener("click", () => selectLayer(layer.id));

    item.append(visibility, name, select);
    list.appendChild(item);
  });
}

function selectLayer(id) {
  const layer = state.layers.find(item => item.id === id);
  if (!layer) return;

  state.activeId = id;
  refreshStage();
  refreshLayers();
}

function renameLayer(layer) {
  const value = prompt("اسم الطبقة:", layer.name);
  if (value && value.trim()) {
    layer.name = value.trim().slice(0, 60);
    refreshLayers();
    remember();
  }
}

function addLayer() {
  makeLayer(`Layer ${state.nextId}`);
  status("تمت إضافة طبقة جديدة");
}

function deleteLayer() {
  if (state.layers.length <= 1) {
    status("لازم تسيب طبقة واحدة على الأقل");
    return;
  }

  const index = state.layers.findIndex(layer => layer.id === state.activeId);
  if (index < 0) return;

  const [removed] = state.layers.splice(index, 1);
  removed.canvas.remove();
  layerCanvas.delete(removed.id);

  state.activeId = state.layers[Math.max(0, index - 1)].id;
  refreshStage();
  refreshLayers();
  remember();
  status("تم حذف الطبقة");
}

function moveLayer(direction) {
  const index = state.layers.findIndex(layer => layer.id === state.activeId);
  const next = index + direction;

  if (index < 0 || next < 0 || next >= state.layers.length) return;

  [state.layers[index], state.layers[next]] =
    [state.layers[next], state.layers[index]];

  refreshStage();
  refreshLayers();
  remember();
}

function snapshot() {
  return {
    width: state.width,
    height: state.height,
    activeId: state.activeId,
    nextId: state.nextId,
    layers: state.layers.map(layer => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      image: layer.canvas.toDataURL("image/png")
    }))
  };
}

function remember() {
  try {
    state.undo.push(snapshot());
    if (state.undo.length > state.maxHistory) state.undo.shift();
    state.redo = [];
  } catch (_) {
    status("تعذر حفظ خطوة التراجع؛ الذاكرة ممتلئة");
  }
}

function restoreSnapshot(data) {
  state.width = data.width;
  state.height = data.height;
  state.layers = [];
  state.activeId = data.activeId;
  state.nextId = data.nextId || 1;
  layerCanvas.clear();
  $("canvasStage").replaceChildren();

  const jobs = data.layers.map(item => new Promise(resolve => {
    const canvas = document.createElement("canvas");
    canvas.width = state.width;
    canvas.height = state.height;
    canvas.className = "layer-canvas";
    canvas.dataset.layerId = String(item.id);

    const layer = {
      id: item.id,
      name: item.name,
      visible: item.visible,
      canvas
    };

    state.layers.push(layer);
    layerCanvas.set(layer.id, canvas);
    $("canvasStage").appendChild(canvas);

    const image = new Image();
    image.onload = () => {
      canvas.getContext("2d").drawImage(image, 0, 0);
      resolve();
    };
    image.onerror = () => resolve();
    image.src = item.image;
  }));

  return Promise.all(jobs).then(() => {
    if (!state.layers.some(layer => layer.id === state.activeId)) {
      state.activeId = state.layers[0]?.id || null;
    }
    refreshStage();
    refreshLayers();
  });
}

async function undo() {
  if (state.undo.length <= 1) return;

  state.redo.push(state.undo.pop());
  await restoreSnapshot(state.undo[state.undo.length - 1]);
  status("تم التراجع");
}

async function redo() {
  if (!state.redo.length) return;

  const data = state.redo.pop();
  state.undo.push(data);
  await restoreSnapshot(data);
  status("تمت إعادة الخطوة");
}

function pointFromEvent(event) {
  const canvas = activeLayer()?.canvas;
  if (!canvas) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();

  return {
    x: (event.clientX - rect.left) * state.width / rect.width,
    y: (event.clientY - rect.top) * state.height / rect.height
  };
}

function setupContext(context, erasing = false) {
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = state.size;
  context.globalAlpha = state.opacity;
  context.globalCompositeOperation = erasing
    ? "destination-out"
    : "source-over";
  context.strokeStyle = state.color;
  context.fillStyle = state.color;
}

function drawStroke(context, from, to, erasing = false) {
  setupContext(context, erasing);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
}

function drawShape(context, tool, from, to) {
  setupContext(context);

  context.beginPath();

  if (tool === "line") {
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  } else if (tool === "rect") {
    context.strokeRect(
      from.x,
      from.y,
      to.x - from.x,
      to.y - from.y
    );
  } else if (tool === "ellipse") {
    const x = (from.x + to.x) / 2;
    const y = (from.y + to.y) / 2;
    const rx = Math.abs(to.x - from.x) / 2;
    const ry = Math.abs(to.y - from.y) / 2;

    context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    context.stroke();
  }

  context.globalAlpha = 1;
}

function drawText() {
  const text = $("textInput").value;
  if (!text.trim()) {
    status("اكتب النص أولًا");
    return;
  }

  const layer = activeLayer();
  if (!layer) return;

  const x = state.width / 2;
  const y = state.height / 2;
  const context = contextOf(layer);

  setupContext(context);
  context.font = `${state.fontSize}px Tahoma, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.direction = document.documentElement.dir === "rtl" ? "rtl" : "ltr";
  context.fillText(text, x, y, state.width - 30);
  context.globalAlpha = 1;

  remember();
  status("تمت إضافة النص إلى الطبقة الحالية");
}

function startDrawing(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (state.tool === "hand" || state.tool === "text") return;

  const layer = activeLayer();
  if (!layer || !layer.visible) return;

  event.preventDefault();
  state.drawing = true;
  state.start = pointFromEvent(event);
  state.last = state.start;

  const context = contextOf(layer);
  state.preview = context.getImageData(0, 0, state.width, state.height);

  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch (_) {}
}

function moveDrawing(event) {
  if (!state.drawing) return;
  event.preventDefault();

  const layer = activeLayer();
  if (!layer) return;

  const current = pointFromEvent(event);
  const context = contextOf(layer);

  if (state.tool === "brush" || state.tool === "eraser") {
    drawStroke(context, state.last, current, state.tool === "eraser");
    state.last = current;
  } else {
    context.putImageData(state.preview, 0, 0);
    drawShape(context, state.tool, state.start, current);
  }
}

function endDrawing(event) {
  if (!state.drawing) return;

  state.drawing = false;
  const layer = activeLayer();

  if (layer) {
    if (["line", "rect", "ellipse"].includes(state.tool)) {
      const current = pointFromEvent(event);
      const context = contextOf(layer);
      context.putImageData(state.preview, 0, 0);
      drawShape(context, state.tool, state.start, current);
    }
    remember();
  }

  state.preview = null;
}

function chooseTool(tool) {
  state.tool = tool;

  document.querySelectorAll(".tool").forEach(button => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });

  $("canvasStage").style.cursor =
    tool === "hand" ? "grab" :
    tool === "text" ? "text" : "crosshair";

  if (tool === "text") status("اضغط على إضافة نص لوضع النص بمنتصف اللوحة");
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    status("اختار ملف صورة صحيح");
    return;
  }

  const url = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    const layer = activeLayer();
    if (!layer) {
      URL.revokeObjectURL(url);
      return;
    }

    const context = contextOf(layer);
    const scale = Math.min(
      state.width / image.width,
      state.height / image.height,
      1
    );

    const width = image.width * scale;
    const height = image.height * scale;
    const x = (state.width - width) / 2;
    const y = (state.height - height) / 2;

    context.drawImage(image, x, y, width, height);
    URL.revokeObjectURL(url);
    remember();
    status("تمت إضافة الصورة إلى الطبقة الحالية");
  };

  image.onerror = () => {
    URL.revokeObjectURL(url);
    status("تعذر فتح الصورة");
  };

  image.src = url;
}

function resetDocument(width, height, transparent) {
  state.width = width;
  state.height = height;
  state.layers = [];
  state.activeId = null;
  state.nextId = 1;
  state.undo = [];
  state.redo = [];
  layerCanvas.clear();
  $("canvasStage").replaceChildren();

  const layer = makeLayer("Layer 1");

  if (!transparent) {
    const context = contextOf(layer);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  refreshStage();
  refreshLayers();
  state.undo = [];
  remember();
  $("modal").hidden = true;
  status("تم إنشاء مستند جديد");
}

function openNewDialog() {
  $("modal").hidden = false;
}

function exportPNG() {
  const output = document.createElement("canvas");
  output.width = state.width;
  output.height = state.height;

  const context = output.getContext("2d");
  context.filter =
    `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;

  state.layers.forEach(layer => {
    if (layer.visible) context.drawImage(layer.canvas, 0, 0);
  });

  context.filter = "none";

  output.toBlob(blob => {
    if (!blob) {
      status("تعذر إنشاء الصورة");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "khayalstudio-drawing.png";
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("تم تنزيل الصورة بصيغة PNG");
  }, "image/png");
}

function saveProject() {
  try {
    const data = snapshot();
    data.version = 1;
    data.adjustments = {
      brightness: state.brightness,
      contrast: state.contrast,
      saturation: state.saturation
    };

    const blob = new Blob(
      [JSON.stringify(data)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "khayalstudio-project.json";
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("تم تنزيل ملف المشروع القابل للتعديل");
  } catch (_) {
    status("تعذر حفظ المشروع؛ جرّب تقليل حجم الصور");
  }
}

async function openProject(file) {
  if (!file) return;

  try {
    if (file.size > 40 * 1024 * 1024) {
      status("ملف المشروع أكبر من الحد المسموح به (40 MB)");
      return;
    }

    const data = JSON.parse(await file.text());

    if (
      !data ||
      !Array.isArray(data.layers) ||
      !Number.isInteger(data.width) ||
      !Number.isInteger(data.height) ||
      data.width < 1 || data.height < 1 ||
      data.width > 2400 || data.height > 2400 ||
      data.layers.length < 1 || data.layers.length > 60
    ) {
      throw new Error("invalid project");
    }

    await restoreSnapshot(data);

    const adjustments = data.adjustments || {};
    setAdjustment("brightness", adjustments.brightness ?? 100);
    setAdjustment("contrast", adjustments.contrast ?? 100);
    setAdjustment("saturation", adjustments.saturation ?? 100);

    state.undo = [];
    state.redo = [];
    remember();

    status("تم فتح المشروع");
  } catch (_) {
    status("ملف المشروع غير صالح أو تالف");
  }
}

function setAdjustment(name, value) {
  const safe = Math.max(0, Math.min(200, Number(value) || 100));
  state[name] = safe;

  const range = $(`${name}Range`);
  const output = $(`${name}Value`);

  if (range) range.value = safe;
  if (output) output.textContent = safe;

  $("canvasStage").style.filter =
    `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
}

function fitCanvas() {
  const viewport = $("viewport");
  const available = Math.max(100, viewport.clientWidth - 30);

  state.zoom = Math.min(1, available / state.width);
  state.zoom = Math.max(0.1, state.zoom);

  refreshStage();
}

function setZoom(value) {
  state.zoom = Math.max(0.1, Math.min(2, value));
  refreshStage();
}

function init() {
  makeLayer("Layer 1");

  document.querySelectorAll(".tool").forEach(button => {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool;
      chooseTool(tool);

      if (tool === "text") {
        drawText();
      }
    });
  });

  $("colorPicker").addEventListener("input", event => {
    state.color = event.target.value;
  });

  document.querySelectorAll("[data-color]").forEach(button => {
    button.addEventListener("click", () => {
      state.color = button.dataset.color;
      $("colorPicker").value = state.color;
    });
  });

  $("sizeRange").addEventListener("input", event => {
    state.size = Number(event.target.value);
    $("sizeValue").textContent = state.size;
  });

  $("opacityRange").addEventListener("input", event => {
    state.opacity = Number(event.target.value) / 100;
    $("opacityValue").textContent = event.target.value;
  });

  $("fontSize").addEventListener("input", event => {
    state.fontSize = Number(event.target.value);
    $("fontSizeValue").textContent = state.fontSize;
  });

  $("imageInput").addEventListener("change", event => {
    loadImageFile(event.target.files[0]);
    event.target.value = "";
  });

  $("addLayerBtn").addEventListener("click", addLayer);
  $("deleteLayerBtn").addEventListener("click", deleteLayer);
  $("layerUpBtn").addEventListener("click", () => moveLayer(1));
  $("layerDownBtn").addEventListener("click", () => moveLayer(-1));

  $("clearLayerBtn").addEventListener("click", () => {
    const layer = activeLayer();
    if (!layer) return;

    contextOf(layer).clearRect(0, 0, state.width, state.height);
    remember();
    status("تم مسح الطبقة الحالية");
  });

  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  $("exportBtn").addEventListener("click", exportPNG);
  $("saveProjectBtn").addEventListener("click", saveProject);
  $("newBtn").addEventListener("click", openNewDialog);

  $("cancelNewBtn").addEventListener("click", () => {
    $("modal").hidden = true;
  });

  $("createNewBtn").addEventListener("click", () => {
    const width = Number($("docWidth").value);
    const height = Number($("docHeight").value);

    if (
      !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 100 || height < 100 || width > 2400 || height > 2400
    ) {
      status("العرض والارتفاع لازم يكونوا بين 100 و2400");
      return;
    }

    if (!confirm("إنشاء مستند جديد؟ احفظ مشروعك الحالي أولًا لو محتاجه.")) {
      return;
    }

    resetDocument(width, height, $("transparentBg").checked);
  });

  $("openProjectBtn").addEventListener("click", () => $("projectInput").click());

  $("projectInput").addEventListener("change", async event => {
    await openProject(event.target.files[0]);
    event.target.value = "";
  });

  $("brightnessRange").addEventListener("input", event =>
    setAdjustment("brightness", event.target.value)
  );
  $("contrastRange").addEventListener("input", event =>
    setAdjustment("contrast", event.target.value)
  );
  $("saturationRange").addEventListener("input", event =>
    setAdjustment("saturation", event.target.value)
  );

  $("resetAdjustmentsBtn").addEventListener("click", () => {
    setAdjustment("brightness", 100);
    setAdjustment("contrast", 100);
    setAdjustment("saturation", 100);
  });

  $("zoomInBtn").addEventListener("click", () => setZoom(state.zoom + 0.1));
  $("zoomOutBtn").addEventListener("click", () => setZoom(state.zoom - 0.1));
  $("fitBtn").addEventListener("click", fitCanvas);

  $("canvasStage").addEventListener("pointerdown", event => {
    if (state.tool === "text") {
      drawText();
      return;
    }

    if (state.tool === "hand") {
      status("استخدم التمرير لتحريك مساحة العمل");
      return;
    }

    startDrawing(event);
  });

  $("canvasStage").addEventListener("pointermove", moveDrawing);
  $("canvasStage").addEventListener("pointerup", endDrawing);
  $("canvasStage").addEventListener("pointercancel", endDrawing);

  document.addEventListener("keydown", event => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  });

  fitCanvas();
  window.addEventListener("resize", fitCanvas);
}

init();
