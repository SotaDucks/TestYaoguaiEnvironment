// Small debug toggle (top-right). Opens a panel to tune the pixel-art rendering live.
const CSS = `
.yg-dbg { position: fixed; top: 12px; right: 12px; z-index: 10; font: 12px/1.4 ui-monospace, Consolas, monospace;
  color: #e9edf0; user-select: none; }
.yg-dbg button { font: inherit; color: inherit; background: rgba(24, 28, 33, 0.82); border: 2px solid #59626b;
  padding: 4px 10px; cursor: pointer; image-rendering: pixelated; }
.yg-dbg button:hover { border-color: #8e9aa5; }
.yg-dbg-toggle { display: block; margin-left: auto; }
.yg-dbg-panel { margin-top: 6px; width: 230px; padding: 10px 12px; background: rgba(24, 28, 33, 0.86); border: 2px solid #59626b; }
.yg-dbg-panel[hidden] { display: none; }
.yg-dbg-row { margin-bottom: 9px; }
.yg-dbg-row header { display: flex; justify-content: space-between; margin-bottom: 3px; }
.yg-dbg-row header span:last-child { color: #9fe3c0; }
.yg-dbg-row input[type=range] { width: 100%; margin: 0; accent-color: #6fcf9f; }
.yg-dbg-check { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; cursor: pointer; }
.yg-dbg-check input { accent-color: #6fcf9f; margin: 0; }
`;

export function createDebugPanel(settings, defaults, onChange) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'yg-dbg';
  const toggle = document.createElement('button');
  toggle.className = 'yg-dbg-toggle';
  toggle.textContent = '调试';
  const panel = document.createElement('div');
  panel.className = 'yg-dbg-panel';
  panel.hidden = true;
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });
  root.append(toggle, panel);

  const sync = [];
  const slider = (label, key, min, max, step, fmt) => {
    const row = document.createElement('div');
    row.className = 'yg-dbg-row';
    const head = document.createElement('header');
    const name = document.createElement('span');
    name.textContent = label;
    const val = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    const show = () => {
      input.value = settings[key];
      val.textContent = fmt(settings[key]);
    };
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      show();
      onChange(key);
    });
    show();
    sync.push(show);
    head.append(name, val);
    row.append(head, input);
    panel.append(row);
  };

  slider('像素大小', 'pixelSize', 1, 12, 1, (v) => (v === 1 ? '1 px（不像素化）' : `${v} px`));
  slider('轮廓暗边', 'depthEdge', 0, 1, 0.01, (v) => v.toFixed(2));
  slider('棱边高光', 'normalEdge', 0, 1, 0.01, (v) => v.toFixed(2));

  const check = document.createElement('label');
  check.className = 'yg-dbg-check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.addEventListener('change', () => {
    settings.snap = box.checked;
    onChange('snap');
  });
  check.append(box, document.createTextNode('镜头对齐像素网格'));
  panel.append(check);
  sync.push(() => {
    box.checked = settings.snap;
  });
  box.checked = settings.snap;

  const reset = document.createElement('button');
  reset.textContent = '恢复默认';
  reset.addEventListener('click', () => {
    Object.assign(settings, defaults);
    sync.forEach((f) => f());
    onChange('reset');
  });
  panel.append(reset);

  // keep slider drags from reaching the orbit controls underneath
  for (const ev of ['pointerdown', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation());
  document.body.append(root);
  return root;
}
