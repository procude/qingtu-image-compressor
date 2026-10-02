import './style.css';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 30;
const MAX_IMAGE_PIXELS = 40_000_000;
const SUPPORTED_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);
const EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const fileInput = document.querySelector('#fileInput');
const dropzone = document.querySelector('#dropzone');
const selectButton = document.querySelector('#selectButton');
const formatSelect = document.querySelector('#formatSelect');
const qualitySlider = document.querySelector('#qualitySlider');
const qualityValue = document.querySelector('#qualityValue');
const qualityHint = document.querySelector('#qualityHint');
const compressButton = document.querySelector('#compressButton');
const taskList = document.querySelector('#taskList');
const emptyState = document.querySelector('#emptyState');
const queueCount = document.querySelector('#queueCount');
const clearButton = document.querySelector('#clearButton');
const statusMessage = document.querySelector('#statusMessage');

const tasks = [];
let nextId = 1;
let isProcessing = false;

selectButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});

for (const eventName of ['dragenter', 'dragover']) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
  });
}

dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer?.files));
dropzone.addEventListener('click', (event) => {
  if (!event.target.closest('button')) fileInput.click();
});
dropzone.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target === dropzone) {
    event.preventDefault();
    fileInput.click();
  }
});
dropzone.tabIndex = 0;

qualitySlider.addEventListener('input', () => {
  qualityValue.textContent = `${qualitySlider.value}%`;
  const quality = Number(qualitySlider.value);
  qualityHint.textContent = quality < 50
    ? '压缩得更彻底，适合对体积特别敏感的场景。'
    : quality > 88
      ? '保留更多画面细节，文件也会相应大一点。'
      : '品质与大小刚刚好，适合大多数照片。';
});

compressButton.addEventListener('click', compressPendingTasks);
clearButton.addEventListener('click', clearTasks);
formatSelect.addEventListener('change', updateControls);

taskList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const task = tasks.find((item) => item.id === Number(button.dataset.id));
  if (!task) return;

  if (button.dataset.action === 'download' && task.result) downloadBlob(task.result, task.outputName);
  if (button.dataset.action === 'remove' && task.state !== 'processing') removeTask(task);
  if (button.dataset.action === 'retry' && task.state === 'error') {
    task.state = 'pending';
    task.error = '';
    renderTasks();
    updateControls();
  }
});

function getFileType(file) {
  const reportedType = file.type.toLowerCase();
  if (EXTENSIONS.has(reportedType)) return reportedType;
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return SUPPORTED_TYPES.get(extension) ?? '';
}

function addFiles(fileList) {
  if (!fileList?.length) return;
  const acceptedFiles = [];
  let rejectedType = 0;
  let rejectedSize = 0;
  let rejectedLimit = 0;

  for (const file of fileList) {
    if (tasks.length + acceptedFiles.length >= MAX_FILES) {
      rejectedLimit += 1;
      continue;
    }
    const type = getFileType(file);
    if (!type) {
      rejectedType += 1;
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejectedSize += 1;
      continue;
    }
    acceptedFiles.push({ file, type });
  }

  for (const { file, type } of acceptedFiles) {
    tasks.push({
      id: nextId++,
      file,
      inputType: type,
      originalUrl: URL.createObjectURL(file),
      result: null,
      resultUrl: '',
      outputName: '',
      state: 'pending',
      error: '',
    });
  }

  const messages = [];
  if (acceptedFiles.length) messages.push(`已添加 ${acceptedFiles.length} 张图片`);
  if (rejectedType) messages.push(`${rejectedType} 张格式不支持`);
  if (rejectedSize) messages.push(`${rejectedSize} 张超过 20 MB`);
  if (rejectedLimit) messages.push(`最多添加 ${MAX_FILES} 张图片`);
  statusMessage.textContent = `${messages.join('，')}${acceptedFiles.length ? '。图片仅在本地处理。' : '。'}`;
  renderTasks();
  updateControls();
}

function removeTask(task) {
  revokeTaskUrls(task);
  tasks.splice(tasks.indexOf(task), 1);
  renderTasks();
  updateControls();
}

function clearTasks() {
  if (isProcessing) return;
  for (const task of tasks) revokeTaskUrls(task);
  tasks.length = 0;
  statusMessage.textContent = '图片队列已清空。';
  renderTasks();
  updateControls();
}

function revokeTaskUrls(task) {
  URL.revokeObjectURL(task.originalUrl);
  if (task.resultUrl) URL.revokeObjectURL(task.resultUrl);
}

function renderTasks() {
  queueCount.textContent = String(tasks.length);
  emptyState.hidden = tasks.length > 0;
  taskList.hidden = tasks.length === 0;
  taskList.innerHTML = tasks.map(renderTask).join('');
}

function renderTask(task) {
  const isDone = task.state === 'done';
  const isError = task.state === 'error';
  const isRunning = task.state === 'processing';
  const stateLabel = isDone ? '压缩完成' : isRunning ? '正在压缩' : isError ? '压缩失败' : '等待压缩';
  const stateClass = isDone ? 'state-done' : isError ? 'state-error' : isRunning ? 'state-running' : 'state-pending';
  const savings = isDone && task.result.size < task.file.size
    ? Math.round((1 - task.result.size / task.file.size) * 100)
    : 0;
  const detail = isError
    ? `<span class="task-error" title="${escapeHtml(task.error)}">${escapeHtml(task.error)}</span>`
    : isDone
      ? `<span>${formatBytes(task.file.size)} <span class="size-arrow">→</span> <strong>${formatBytes(task.result.size)}</strong>${savings ? ` <span class="task-savings">省 ${savings}%</span>` : ''}</span>`
      : `<span>${formatBytes(task.file.size)} · ${escapeHtml(task.inputType.replace('image/', '').toUpperCase())}</span>`;

  return `
    <article class="task-card">
      <img class="task-thumbnail" src="${task.originalUrl}" alt="${escapeHtml(task.file.name)} 的图片预览" />
      <div class="task-info">
        <p class="task-name" title="${escapeHtml(task.file.name)}">${escapeHtml(task.file.name)}</p>
        <p class="task-detail">${detail}</p>
      </div>
      <span class="task-state ${stateClass}"><span class="state-dot"></span>${stateLabel}</span>
      ${isDone
        ? `<button class="download-button" type="button" data-action="download" data-id="${task.id}" aria-label="下载 ${escapeHtml(task.outputName)}">下载 <span aria-hidden="true">↓</span></button>`
        : isError
          ? `<button class="retry-button" type="button" data-action="retry" data-id="${task.id}">重试</button>`
          : ''}
      <button class="remove-button" type="button" data-action="remove" data-id="${task.id}" aria-label="移除 ${escapeHtml(task.file.name)}" ${isRunning ? 'disabled' : ''}>×</button>
    </article>`;
}

function updateControls() {
  const hasPending = tasks.some((task) => task.state === 'pending');
  compressButton.disabled = !hasPending || isProcessing;
  compressButton.classList.toggle('is-working', isProcessing);
  compressButton.innerHTML = isProcessing
    ? '<span class="button-spinner" aria-hidden="true"></span><span>正在压缩</span>'
    : `<span>${hasPending ? '开始压缩' : tasks.length ? '全部压缩完成' : '开始压缩'}</span><span class="button-arrow" aria-hidden="true">↗</span>`;
  clearButton.disabled = isProcessing || tasks.length === 0;
  selectButton.disabled = tasks.length >= MAX_FILES;
  formatSelect.disabled = isProcessing;
  qualitySlider.disabled = isProcessing || formatSelect.value === 'image/png';
  if (formatSelect.value !== 'image/png') {
    qualityHint.textContent = qualitySlider.value < 50
      ? '压缩得更彻底，适合对体积特别敏感的场景。'
      : qualitySlider.value > 88
        ? '保留更多画面细节，文件也会相应大一点。'
        : '品质与大小刚刚好，适合大多数照片。';
  } else {
    qualityHint.textContent = 'PNG 使用无损编码，质量选项不适用。';
  }
  updateQualityTrack();
}

function updateQualityTrack() {
  const minimum = Number(qualitySlider.min);
  const maximum = Number(qualitySlider.max);
  const percentage = ((Number(qualitySlider.value) - minimum) / (maximum - minimum)) * 100;
  qualitySlider.style.background = `linear-gradient(to right, #839d74 0%, #839d74 ${percentage}%, #e2e6dd ${percentage}%, #e2e6dd 100%)`;
}

async function compressPendingTasks() {
  if (isProcessing) return;
  isProcessing = true;
  updateControls();
  let completed = 0;
  let failed = 0;

  try {
    let task = tasks.find((item) => item.state === 'pending');
    while (task) {
      task.state = 'processing';
      renderTasks();
      try {
        task.result = await compressImage(task.file, formatSelect.value, Number(qualitySlider.value) / 100);
        task.resultUrl = URL.createObjectURL(task.result);
        task.outputName = getOutputName(task.file.name, task.result.type);
        task.state = 'done';
        completed += 1;
      } catch (error) {
        task.state = 'error';
        task.error = error instanceof Error ? error.message : '图片无法读取，请重试';
        failed += 1;
      }
      renderTasks();
      task = tasks.find((item) => item.state === 'pending');
    }
  } finally {
    isProcessing = false;
    updateControls();
  }

  statusMessage.textContent = failed
    ? `完成 ${completed} 张，${failed} 张未能压缩；可重试失败的图片。`
    : `全部完成，${completed} 张图片已压缩。图片仍只保存在你的设备上。`;
}

async function compressImage(file, outputType, quality) {
  let bitmap;
  let canvas;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      throw new Error('图片分辨率过大，请选择低于 4000 万像素的图片');
    }

    canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { alpha: outputType !== 'image/jpeg' });
    if (!context) throw new Error('浏览器暂不支持图片处理');
    if (outputType === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error('图片编码失败，请换一种格式重试'));
          return;
        }
        resolve(result);
      }, outputType, quality);
    });

    if (blob.type !== outputType) {
      throw new Error('当前浏览器不支持所选输出格式，请试试 WebP 或 JPG');
    }
    return blob;
  } catch (error) {
    if (error instanceof Error && error.name === 'InvalidStateError') {
      throw new Error('图片无法读取，请检查文件是否损坏');
    }
    throw error;
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

function getOutputName(fileName, mimeType) {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return `${baseName}-轻图.${EXTENSIONS.get(mimeType) ?? 'webp'}`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

window.addEventListener('pagehide', () => {
  for (const task of tasks) revokeTaskUrls(task);
}, { once: true });

renderTasks();
updateControls();
