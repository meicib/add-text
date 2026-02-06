const imageInput = document.getElementById("imageInput");
const clearPolygonButton = document.getElementById("clearPolygon");
const textInput = document.getElementById("textInput");
const fontSizeInput = document.getElementById("fontSize");
const fontFamilySelect = document.getElementById("fontFamily");
const textColorInput = document.getElementById("textColor");
const outlineColorInput = document.getElementById("outlineColor");
const outlineWidthInput = document.getElementById("outlineWidth");
const highlightTextInput = document.getElementById("highlightText");
const bgColorInput = document.getElementById("bgColor");
const bgOpacityInput = document.getElementById("bgOpacity");
const blendModeSelect = document.getElementById("blendMode");
const saveImageButton = document.getElementById("saveImage");

const imageCanvas = document.getElementById("imageCanvas");
const textCanvas = document.getElementById("textCanvas");
const uiCanvas = document.getElementById("uiCanvas");

const imageCtx = imageCanvas.getContext("2d");
const textCtx = textCanvas.getContext("2d");
const uiCtx = uiCanvas.getContext("2d");

const state = {
  image: null,
  polygons: [{ points: [], closed: false }],
  activePolygonIndex: 0,
  dragging: null,
};

const pointRadius = 8;

function resizeCanvases(width, height) {
  imageCanvas.width = width;
  imageCanvas.height = height;
  textCanvas.width = width;
  textCanvas.height = height;
  uiCanvas.width = width;
  uiCanvas.height = height;

  renderAll();
}

function renderAll() {
  drawImage();
  renderText();
  renderUI();
}

function drawImage() {
  imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  if (state.image) {
    imageCtx.drawImage(state.image, 0, 0, imageCanvas.width, imageCanvas.height);
  }
}

function getPolygonBounds(points) {
  if (!points.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function getLineSpans(points, y) {
  const intersections = [];
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];

    if ((y >= p1.y && y < p2.y) || (y >= p2.y && y < p1.y)) {
      const t = (y - p1.y) / (p2.y - p1.y);
      const x = p1.x + t * (p2.x - p1.x);
      intersections.push(x);
    }
  }

  intersections.sort((a, b) => a - b);
  const spans = [];
  for (let i = 0; i < intersections.length; i += 2) {
    const start = intersections[i];
    const end = intersections[i + 1];
    if (end !== undefined) {
      spans.push([start, end]);
    }
  }
  return spans;
}

function fitWordToWidth(word, maxWidth, ctx) {
  if (ctx.measureText(word).width <= maxWidth) {
    return word;
  }
  let low = 0;
  let high = word.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = word.slice(0, mid);
    if (ctx.measureText(slice).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return word.slice(0, Math.max(1, low));
}

function tokenizeText(text) {
  const paragraphs = text.split(/\n/);
  const tokens = [];
  paragraphs.forEach((paragraph, index) => {
    const words = paragraph.trim().length ? paragraph.trim().split(/\s+/) : [];
    words.forEach((word) => tokens.push({ type: "word", text: word }));
    if (index < paragraphs.length - 1) {
      tokens.push({ type: "newline" });
    }
  });
  return tokens;
}

function drawPolygonPath(ctx, points) {
  if (points.length === 0) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function renderText() {
  textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
  if (!state.polygons.length) {
    return;
  }

  const fontSize = Number(fontSizeInput.value);
  const fontFamily = fontFamilySelect.value;
  const textColor = textColorInput.value;
  const outlineColor = outlineColorInput.value;
  const outlineWidth = Number(outlineWidthInput.value);
  const highlightText = highlightTextInput.checked;
  const bgColor = bgColorInput.value;
  const bgOpacity = Number(bgOpacityInput.value);

  textCtx.font = `${fontSize}px ${fontFamily}`;
  textCtx.fillStyle = textColor;
  textCtx.strokeStyle = outlineColor;
  textCtx.lineWidth = outlineWidth;
  textCtx.textBaseline = "middle";

  const lineHeight = fontSize * 1.2;
  const tokens = tokenizeText(textInput.value);
  let tokenIndex = 0;

  state.polygons.forEach((polygon) => {
    if (!polygon.closed || polygon.points.length < 3) {
      return;
    }

    const { minY, maxY } = getPolygonBounds(polygon.points);

    textCtx.save();
    drawPolygonPath(textCtx, polygon.points);
    textCtx.clip();

    for (let y = minY + lineHeight / 2; y <= maxY - lineHeight / 2; y += lineHeight) {
      if (tokenIndex >= tokens.length) {
        break;
      }
      const spans = getLineSpans(polygon.points, y);
      if (!spans.length) {
        continue;
      }

      for (const [start, end] of spans) {
        if (tokenIndex >= tokens.length) {
          break;
        }
        if (tokens[tokenIndex].type === "newline") {
          tokenIndex += 1;
          break;
        }
        const maxWidth = end - start;
        let line = "";
        while (tokenIndex < tokens.length) {
          const token = tokens[tokenIndex];
          if (token.type === "newline") {
            tokenIndex += 1;
            break;
          }
          const candidate = line ? `${line} ${token.text}` : token.text;
          if (textCtx.measureText(candidate).width <= maxWidth) {
            line = candidate;
            tokenIndex += 1;
          } else if (!line) {
            const fit = fitWordToWidth(token.text, maxWidth, textCtx);
            line = fit;
            const remainder = token.text.slice(fit.length);
            if (remainder.length) {
              tokens[tokenIndex].text = remainder;
            } else {
              tokenIndex += 1;
            }
            break;
          } else {
            break;
          }
        }

        if (line) {
          if (highlightText) {
            textCtx.save();
            textCtx.globalAlpha = bgOpacity;
            textCtx.fillStyle = bgColor;
            const padding = fontSize * 0.15;
            const textWidth = textCtx.measureText(line).width;
            textCtx.fillRect(start - padding, y - lineHeight / 2, textWidth + padding * 2, lineHeight);
            textCtx.restore();
          }
          if (outlineWidth > 0) {
            textCtx.strokeText(line, start, y);
          }
          textCtx.fillText(line, start, y);
        }
      }
    }

    textCtx.restore();
  });
}

function renderUI() {
  uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  const hasPoints = state.polygons.some((polygon) => polygon.points.length);
  if (!hasPoints) {
    return;
  }

  uiCtx.save();
  uiCtx.lineWidth = 2;

  state.polygons.forEach((polygon, index) => {
    if (!polygon.points.length) {
      return;
    }
    uiCtx.strokeStyle = polygon.closed ? "#4ade80" : "#60a5fa";
    uiCtx.fillStyle = polygon.closed ? "rgba(74, 222, 128, 0.15)" : "rgba(96, 165, 250, 0.2)";

    uiCtx.beginPath();
    uiCtx.moveTo(polygon.points[0].x, polygon.points[0].y);
    for (let i = 1; i < polygon.points.length; i += 1) {
      uiCtx.lineTo(polygon.points[i].x, polygon.points[i].y);
    }
    if (polygon.closed) {
      uiCtx.closePath();
      uiCtx.fill();
    }
    uiCtx.stroke();

    uiCtx.fillStyle = "#ffffff";
    uiCtx.strokeStyle = index === state.activePolygonIndex ? "#0f172a" : "#1f2937";
    polygon.points.forEach((point) => {
      uiCtx.beginPath();
      uiCtx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
      uiCtx.fill();
      uiCtx.stroke();
    });
  });

  uiCtx.restore();
}

function canvasPointFromEvent(event) {
  const rect = uiCanvas.getBoundingClientRect();
  const scaleX = uiCanvas.width / rect.width;
  const scaleY = uiCanvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function findPointIndex(points, point) {
  return points.findIndex((p) => {
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    return Math.sqrt(dx * dx + dy * dy) <= pointRadius * 1.5;
  });
}

function getActivePolygon() {
  return state.polygons[state.activePolygonIndex];
}

function closeActivePolygon() {
  const polygon = getActivePolygon();
  if (polygon.points.length >= 3) {
    polygon.closed = true;
    state.polygons.push({ points: [], closed: false });
    state.activePolygonIndex = state.polygons.length - 1;
  }
}

uiCanvas.addEventListener("pointerdown", (event) => {
  if (!state.image) {
    return;
  }
  const point = canvasPointFromEvent(event);
  for (let i = 0; i < state.polygons.length; i += 1) {
    const polygon = state.polygons[i];
    const index = findPointIndex(polygon.points, point);
    if (index !== -1) {
      state.activePolygonIndex = i;
      state.dragging = { polygonIndex: i, pointIndex: index };
      uiCanvas.setPointerCapture(event.pointerId);
      renderUI();
      return;
    }
  }
});

uiCanvas.addEventListener("pointermove", (event) => {
  if (!state.dragging) {
    return;
  }
  const point = canvasPointFromEvent(event);
  const polygon = state.polygons[state.dragging.polygonIndex];
  polygon.points[state.dragging.pointIndex] = point;
  renderAll();
});

uiCanvas.addEventListener("pointerup", (event) => {
  if (state.dragging) {
    state.dragging = null;
    uiCanvas.releasePointerCapture(event.pointerId);
  }
});

uiCanvas.addEventListener("click", (event) => {
  if (!state.image) {
    return;
  }
  const point = canvasPointFromEvent(event);
  const polygon = getActivePolygon();
  if (polygon.closed) {
    return;
  }
  if (polygon.points.length >= 3) {
    const firstPoint = polygon.points[0];
    const dx = firstPoint.x - point.x;
    const dy = firstPoint.y - point.y;
    if (Math.sqrt(dx * dx + dy * dy) <= pointRadius * 2) {
      closeActivePolygon();
      renderAll();
      return;
    }
  }
  polygon.points.push(point);
  renderUI();
});

clearPolygonButton.addEventListener("click", () => {
  state.polygons = [{ points: [], closed: false }];
  state.activePolygonIndex = 0;
  renderAll();
});

imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    state.image = image;
    resizeCanvases(image.naturalWidth, image.naturalHeight);
    URL.revokeObjectURL(url);
  };
  image.src = url;
});

function updateBlendMode() {
  const mode = blendModeSelect.value;
  textCanvas.style.mixBlendMode = mode === "normal" ? "normal" : mode;
}

[
  textInput,
  fontSizeInput,
  fontFamilySelect,
  textColorInput,
  outlineColorInput,
  outlineWidthInput,
  highlightTextInput,
  bgColorInput,
  bgOpacityInput,
].forEach((input) => {
  input.addEventListener("input", renderText);
});

blendModeSelect.addEventListener("change", () => {
  updateBlendMode();
  renderText();
});

saveImageButton.addEventListener("click", () => {
  if (!state.image) {
    return;
  }
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = imageCanvas.width;
  exportCanvas.height = imageCanvas.height;
  const exportCtx = exportCanvas.getContext("2d");

  exportCtx.drawImage(imageCanvas, 0, 0);
  const mode = blendModeSelect.value;
  exportCtx.globalCompositeOperation = mode === "normal" ? "source-over" : mode;
  exportCtx.drawImage(textCanvas, 0, 0);

  const link = document.createElement("a");
  link.download = "photo-text.png";
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
});

updateBlendMode();
renderAll();
