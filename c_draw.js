import {GEOMETRY_TOOLS, ONLY_ONE_POINT, TOOLS} from "./tools_2_11.js";


const mainCanvas = document.getElementById('main-canvas');
const mainCtx = mainCanvas.getContext('2d', {willReadFrequently: true});

const tempDrawCanvas = document.getElementById('temp-draw-canvas');
const tempDrawCtx = tempDrawCanvas.getContext('2d', {
    powerPreference: 'low-power',
    antialias: false
});

// 工具元素
const actionBar = document.getElementById('action-bar');
const toolsBar = document.getElementById('tools-bar');

const colorPanel = document.getElementById('color-panel');
const alphaSlider = document.getElementById('alphaSlider');
const brushSize = document.getElementById('brushSize');

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

// 配置
const CONFIG = Object.assign(Object.create(null), {
    backgroundColor: '#FFFFFF',
    maxHistory: 20,
    // 平滑系数
    smoothing: 0.4,
    // 速度影响系数
    velocityFactor: 5,
    // 压力影响系数
    pressureFactor: 10,
});
Object.freeze(CONFIG);

// 全局状态
const STATE = Object.assign(Object.create(null), {
    isDrawing: false,
    // 用于只需要起点终点但需要显示轨迹的
    onlyEndPoint: false,
    autoSave: false,

    tool: TOOLS.BRUSH,
    color: hexToRGBA(colorPanel.value, alphaSlider.value),
    brushSize: brushSize.value,
    canvasWidth: window.innerWidth - 120,
    canvasHeight: window.innerHeight - 60,

    points: [],
    undoStack: [],
    redoStack: [],
});
Object.preventExtensions(STATE);

// 绑定绘制方法
const drawFunc = new Map([
    [TOOLS.BRUSH, drawBrush],
    [TOOLS.ERASER, drawBrush],
    [TOOLS.COLOR_PICKER, colorPicker],
    [TOOLS.FILL, colorFiller],
    [TOOLS.LINE, drawLine],
    [TOOLS.RECTANGLE, drawTempRectangle],
    [TOOLS.CIRCLE, drawCircle]
]);

// 初始化画板
function initCanvas() {
    const scale = window.devicePixelRatio;
    mainCanvas.width = tempDrawCanvas.width = STATE.canvasWidth * scale;
    mainCanvas.height = tempDrawCanvas.height = STATE.canvasHeight * scale;
    mainCanvas.style.width = tempDrawCanvas.style.width = `${STATE.canvasWidth}px`;
    mainCanvas.style.height = tempDrawCanvas.style.height = `${STATE.canvasHeight}px`;

    mainCtx.scale(scale, scale);
    tempDrawCtx.scale(scale, scale);
    mainCtx.fillStyle = CONFIG.backgroundColor;
    mainCtx.lineJoin = tempDrawCtx.lineJoin = 'round';
    mainCtx.lineCap = tempDrawCtx.lineCap = 'round';

    updateBrushFn();
    updateButtonStates();
}

// 核心绘画功能
function penDown(event) {
    if (STATE.isDrawing) return;

    const pos = getPos(event);
    if (ONLY_ONE_POINT.has(STATE.tool)) {
        drawFunc.get(STATE.tool).apply(null, [pos]);
        return;
    }

    STATE.points.push(pos);
    STATE.isDrawing = true;
    tempDrawCtx.clearRect(0, 0, tempDrawCanvas.width, tempDrawCanvas.height);
    tempDrawCanvas.style.display = 'block';
}

function penMove(event) {
    if (!STATE.isDrawing) return;
    const pos = getPos(event);

    tempDrawCtx.clearRect(0, 0, tempDrawCanvas.width, tempDrawCanvas.height);
    tempDrawCtx.beginPath();
    tempDrawCtx.moveTo(STATE.points[0].x, STATE.points[0].y);
    if (STATE.onlyEndPoint) tempDrawCtx.lineTo(pos.x, pos.y);
    else {
        STATE.points.push(pos);
        STATE.points.forEach((point) => tempDrawCtx.lineTo(point.x, point.y));
    }
    tempDrawCtx.stroke();
}

function penUp(event) {
    if (!STATE.isDrawing) return;
    STATE.isDrawing = false;
    STATE.points.push(getPos(event));

    drawFunc.get(STATE.tool).apply();
    tempDrawCanvas.style.display = 'none';

    saveState();

    updateButtonStates();
    STATE.points = [];
}

function interruptDraw(event) {
    event.stopPropagation();
    event.preventDefault();

    STATE.isDrawing = false;
    STATE.points = [];
    tempDrawCanvas.style.display = 'none';
}

/* 绘画模式 */

// 默认,刷子模式
function drawBrush() {
    mainCtx.beginPath();
    mainCtx.moveTo(STATE.points[0].x, STATE.points[0].y);

    for (let i = 1; i < STATE.points.length - 2; i++) {
        const cp = STATE.points[i];
        const np = STATE.points[i + 1];
        mainCtx.quadraticCurveTo(cp.x, cp.y, (cp.x + np.x) / 2, (cp.y + np.y) / 2);
    }

    mainCtx.lineTo(STATE.points.at(-1).x, STATE.points.at(-1).y);
    mainCtx.stroke();
}

// 绘制直线
function drawLine() {
    mainCtx.beginPath();
    mainCtx.moveTo(STATE.points[0].x, STATE.points[0].y);
    mainCtx.lineTo(STATE.points.at(-1).x, STATE.points.at(-1).y);
    mainCtx.stroke();
}

function drawTempRectangle() {
    const startX = STATE.points[0].x;
    const startY = STATE.points[0].y;

    mainCtx.beginPath();
    mainCtx.rect(startX, startY, STATE.points.at(-1).x - startX, STATE.points.at(-1).y - startY);
    mainCtx.stroke();
}

function drawCircle() {
    const startPoint = STATE.points[0];
    const endPoint = STATE.points.at(-1);

    const centerX = (startPoint.x + endPoint.x) / 2;
    const centerY = (startPoint.y + endPoint.y) / 2;

    const radius = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) / 2;

    mainCtx.beginPath();
    mainCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    mainCtx.stroke();
}

function colorPicker(pos) {
    const imageData = mainCtx.getImageData(pos.x, pos.y, 1, 1).data;
    colorPanel.value = rgbaToHex(imageData[0], imageData[1], imageData[2]).slice(0, -2);
    alphaSlider.value = imageData[3] / 255;
}

function colorFiller(pos) {
    const {x, y} = pos;
    const width = mainCanvas.width;
    const height = mainCanvas.height;

    // 边界检查
    if (x < 0 || x >= width || y < 0 || y >= height) return;

    // rgba 转为无符号整数数
    const fillColor = STATE.color.match(/\d+\.?\d*/g).map(Number);
    fillColor[3] = Math.round(fillColor[3] * 255);
    const [r, g, b, a] = fillColor.map(c => Math.max(0, Math.min(255, c)));
    const fillColor32 = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

    const imageData = mainCtx.getImageData(0, 0, width, height);
    const uint32 = new Uint32Array(imageData.data.buffer);

    const targetColor32 = uint32[y * width + x];
    if (targetColor32 === fillColor32) return;

    const stack = new Uint32Array(width * height * 2);
    let stackSize = 0;
    stack[stackSize++] = x;
    stack[stackSize++] = y;

    while (stackSize > 0) {
        const y = stack[--stackSize];
        const x = stack[--stackSize];
        let lx = x, rx = x;

        // 向左扩展
        while (lx >= 0 && uint32[y * width + lx] === targetColor32) lx--;
        lx++;
        // 向右扩展
        while (rx < width && uint32[y * width + rx] === targetColor32) rx++;
        rx--;

        if (lx > rx) continue;

        for (let i = lx; i <= rx; i++) {
            uint32[y * width + i] = fillColor32;
            // 检查上一行
            if (y > 0 && uint32[(y - 1) * width + i] === targetColor32) {
                stack[stackSize++] = i;
                stack[stackSize++] = y - 1;
            }
            // 检查下一行
            if (y < height - 1 && uint32[(y + 1) * width + i] === targetColor32) {
                stack[stackSize++] = i;
                stack[stackSize++] = y + 1;
            }
        }
    }

    mainCtx.putImageData(imageData, 0, 0);
    saveState();
}

/* 状态管理 */

// 保存状态
function saveState(sx = 0, sy = 0, sw = mainCanvas.width, sh = mainCanvas.height) {
    const states = Object.assign(Object.create(null), {
        sx: sx, sy: sy, sw: sw, sh: sh,
        compressedData: pako.deflate(mainCtx.getImageData(sx, sy, sw, sh).data),
    });

    STATE.undoStack.push(states);

    if (STATE.undoStack.length > CONFIG.maxHistory) STATE.undoStack.shift();
    STATE.redoStack = [];

    if (STATE.autoSave) autoSave();
}

// 重现状态
function reappearState(states) {
    if (!states) return;
    const {compressedData, sx, sy, sw, sh} = states;

    const imgData = new ImageData(new Uint8ClampedArray(pako.inflate(compressedData)), sw, sh);
    mainCtx.putImageData(imgData, sx, sy);
}

// 撤销
const undoFn = throttleTimeOut(() => {
    if (STATE.undoStack.length <= 1) return;

    STATE.redoStack.push(STATE.undoStack.pop());
    reappearState(STATE.undoStack.at(-1));
    updateButtonStates();
}, 200);

// 重做
const redoFn = throttleTimeOut(() => {
    if (!STATE.redoStack.length) return;

    const states = STATE.redoStack.pop();
    STATE.undoStack.push(states);
    reappearState(states);
    updateButtonStates();
}, 200);


/* 画布操作 */

// 清空
const clearCanvas = throttleTimeOut(() => {
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    tempDrawCtx.clearRect(0, 0, tempDrawCanvas.width, tempDrawCanvas.height);
    saveState();
    updateButtonStates();
}, 500);

function resizeCanvas(newWidth, newHeight) {
    if (!newWidth) newWidth = parseInt(document.getElementById('canvasWidth').value);
    if (!newHeight) newHeight = parseInt(document.getElementById('canvasHeight').value);

    if (!newWidth || !newHeight || newWidth < 100 || newHeight < 100) {
        alert('请输入有效的尺寸(最小100px)', 'warning');
        return;
    }

    // 保存当前内容
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = mainCanvas.width;
    tempCanvas.height = mainCanvas.height;
    tempCtx.drawImage(mainCanvas, 0, 0);

    // 更新尺寸
    STATE.canvasWidth = newWidth;
    STATE.canvasHeight = newHeight;
    initCanvas();

    mainCtx.drawImage(tempCanvas, 0, 0);
    saveState();
}

/* 辅助功能 */

// 切换工具
function switchTool(target) {
    STATE.tool = drawFunc.get(target.id) ? target.id : TOOLS.BRUSH;
    STATE.onlyEndPoint = GEOMETRY_TOOLS.has(STATE.tool);

    mainCtx.globalCompositeOperation = STATE.tool === TOOLS.ERASER ? 'destination-out' : 'source-over';
    toolsBar.querySelector('.active')?.classList.remove('active');
    target.classList.add('active');
    updateBrushFn();
}

// 更新笔刷状态
const updateBrushFn = debounce(() => {
    STATE.color = STATE.tool === TOOLS.ERASER ? '#ffffff' : hexToRGBA(colorPanel.value, alphaSlider.value);
    mainCtx.strokeStyle = tempDrawCtx.strokeStyle = STATE.color;
    mainCtx.lineWidth = tempDrawCtx.lineWidth = STATE.brushSize = brushSize.value;
}, 150);

// 更新按钮状态
function updateButtonStates() {
    undoBtn.disabled = STATE.undoStack.length <= 1;
    redoBtn.disabled = STATE.redoStack.length === 0;
}

// 获取事件位置
function getPos(event) {
    const rect = mainCanvas.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
}

// 导出
function exportPNG() {
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 创建高分辨率副本
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = mainCanvas.width;
    exportCanvas.height = mainCanvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.fillStyle = CONFIG.backgroundColor;
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportCtx.drawImage(mainCanvas, 0, 0);

    link.download = `drawing-${timestamp}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}

// 保存至本地
const saveCanvas = debounce(() => {
    try {
        const canvasData = {
            imgData: mainCanvas.toDataURL(),
            state: {
                color: STATE.color,
                brushSize: STATE.brushSize,
                canvasWidth: STATE.canvasWidth,
                canvasHeight: STATE.canvasHeight,
            }
        };

        localStorage.setItem('canvas-work-save', JSON.stringify(canvasData));
        if (!STATE.autoSave) alert('保存成功', 'success');
    } catch (err) {
        alert('保存失败,数据过大', 'error');
    }
}, 200);

// 加载本地信息
function loadSavedCanvas() {
    try {
        const canvasData = JSON.parse(localStorage.getItem('canvas-work-save') || 'null');
        if (!canvasData) return saveState();

        brushSize.value = canvasData.state.brushSize;
        resizeCanvas(canvasData.state.canvasWidth, canvasData.state.canvasHeight);

        const img = new Image();
        img.src = canvasData.imgData;
        img.addEventListener('load', () => {
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            mainCtx.drawImage(img, 0, 0);
            saveState();
            updateBrushFn();
            updateButtonStates();
        }, {once: true});

    } catch (e) {
        console.error(`Error when load save: ${e}`);
        localStorage.removeItem('canvas-work-save');
    }
}

const autoSave = debounce(saveCanvas, 3000);

// 全新开始
async function cleanTotal() {
    if (!await confirm('注意,会清空工作区以及所有保存信息!', {category: 'warning'})) return;
    localStorage.removeItem('canvas-work-save');
    location.reload();
}

// 初始化
initCanvas();
loadSavedCanvas();

// 键盘快捷键
const keyActions = new Map([
    ['z', undoFn],
    ['Z', redoFn],
    ['s', saveCanvas],
    ['E', exportPNG]
]);

const toolKey = new Map([
    ['b', TOOLS.BRUSH],
    ['e', TOOLS.ERASER],
    ['c', TOOLS.COLOR_PICKER]
]);

function handleKeydown(event) {
    const isTool = toolKey.get(event.key);
    if (isTool) {
        event.preventDefault();
        switchTool(document.getElementById(isTool));
        return;
    }

    if (!event.ctrlKey) return;
    const func = keyActions.get(event.key);
    if (!func) return;
    event.preventDefault();
    func.apply();
}

// 顶部操作栏
const chooseActions = new Map([
    ['clear-canvas', clearCanvas],
    ['undoBtn', undoFn],
    ['redoBtn', redoFn],
    ['resize-canvas', resizeCanvas],
    ['save-local', saveCanvas],
    ['auto-save', () => STATE.autoSave = document.getElementById('auto-save').checked],
    ['export-png', exportPNG],
    ['clean-total', cleanTotal],
]);

// 添加事件监听器
mainCanvas.addEventListener('auxclick', interruptDraw);
mainCanvas.addEventListener('contextmenu', event => event.preventDefault());
mainCanvas.addEventListener('pointerdown', penDown);
mainCanvas.addEventListener('pointermove', penMove, {passive: true});
mainCanvas.addEventListener('pointerup', penUp);
mainCanvas.addEventListener('pointerout', penUp);

actionBar.addEventListener('click', e => chooseActions.get(e.target.id)?.apply());
toolsBar.addEventListener('click', event => {
    const target = event.target.closest('.tool');
    if (!target) return;
    switchTool(target);
});

colorPanel.addEventListener('input', updateBrushFn);
alphaSlider.addEventListener('input', updateBrushFn);
brushSize.addEventListener('input', updateBrushFn);

document.addEventListener('keydown', handleKeydown);

// 工具方法
function throttleTimeOut(func, wait = 200) {
    let timer = null;
    return function (...args) {
        if (timer) return;
        func.apply(this, args);
        timer = setTimeout(() => timer = null, wait);
    }
}

function debounce(func, wait = 50, immediate = false) {
    let timer;
    return function (...args) {
        if (immediate) wait = 0;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), wait);
    }
}

function hexToRGBA(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const a = hex.length === 8 ? parseInt(hex.slice(7, 9), 16) : alpha;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function rgbaToHex(r, g, b, a = 1) {
    // 将每个颜色值转换为两位的十六进制字符串
    const toHex = (value) => {
        const hex = Number(value).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    // 将 alpha 值转换为 0-255 范围内的整数
    const alpha = Math.round(a * 255);

    // 组合所有的十六进制值
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(alpha)}`;
}