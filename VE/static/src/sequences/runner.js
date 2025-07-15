import { sendAction } from '../autopilot/index.js';

export async function loadSequences(selectElement) {
  if (!selectElement) return;
  selectElement.innerHTML = '';
  const res = await fetch('/api/sequences');
  if (!res.ok) return;
  const list = await res.json();
  for (const s of list) {
    const opt = document.createElement('option');
    opt.value = s.file;
    opt.textContent = s.name;
    opt.dataset.format = s.format || 'csv';
    selectElement.appendChild(opt);
  }
}

export function getSensorValue(car, name) {
  name = name.toLowerCase();
  if (name === 'front' || name === 'red') return car.frontDistance;
  if (name === 'left') return car.leftDistance;
  if (name === 'right') return car.rightDistance;
  if (name === 'back' || name === 'rear') return car.rearDistance;
  return Infinity;
}

export function evaluateCondition(val, op, target) {
  switch (op) {
    case '<':
      return val < target;
    case '>':
      return val > target;
    case '<=':
      return val <= target;
    case '>=':
      return val >= target;
    case '==':
      return val == target;
    case '!=':
      return val != target;
  }
  return false;
}

export function parseTextSequence(text, format) {
  const steps = [];
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    const ifMatch = line.match(/^if\s+(\w+)\s*(<=|>=|==|!=|<|>)\s*(\d+(?:\.\d+)?)\s+then\s+(\w+)\s+(\d+(?:\.\d+)?)\s+else\s+(\w+)\s+(\d+(?:\.\d+)?)/i);
    if (ifMatch) {
      const [, sensor, op, val, a1, d1, a2, d2] = ifMatch;
      steps.push({
        condition: { sensor, op, value: parseFloat(val) },
        then: { action: a1, duration: parseFloat(d1) },
        else: { action: a2, duration: parseFloat(d2) },
      });
    } else {
      const forMatch = line.match(/^for\s+(\d+)\s+(\w+)\s+(\d+(?:\.\d+)?)/i);
      if (forMatch) {
        const [, cnt, act, dur] = forMatch;
        steps.push({ action: act, duration: parseFloat(dur), repeat: parseInt(cnt) });
      } else {
        let action, dur;
        if (format === 'csv') {
          [action, dur] = line.split(',');
        } else {
          [action, dur] = line.split(/\s+/);
        }
        dur = parseFloat(dur);
        if (action && !isNaN(dur)) steps.push({ action, duration: dur });
      }
    }
  }
  return steps;
}

export async function executeSteps(car, steps) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const step of steps) {
    if (step.action) {
      const reps = step.repeat || 1;
      for (let i = 0; i < reps; i++) {
        if (step.action === 'left' || step.action === 'right') {
          await sendAction(car, step.action, step.duration);
        } else {
          await sendAction(car, step.action);
          await sleep(step.duration * 1000);
          await sendAction(car, 'stop');
        }
      }
    } else if (step.condition || step.if) {
      const cond = step.condition || step.if;
      const thenSteps = step.then || cond.then;
      const elseSteps = step.else || cond.else;
      const val = getSensorValue(car, cond.sensor);
      const target = evaluateCondition(val, cond.op, cond.value)
        ? thenSteps
        : elseSteps;
      await executeSteps(car, Array.isArray(target) ? target : [target]);
    } else if (step.loop) {
      for (let i = 0; i < step.loop.repeat; i++) {
        await executeSteps(car, step.loop.steps);
      }
    } else if (step.while) {
      while (evaluateCondition(getSensorValue(car, step.while.sensor), step.while.op, step.while.value)) {
        await executeSteps(car, step.while.steps);
      }
    } else if (step.call) {
      await runSequence(car, step.call, getFormatFromFile(step.call));
    }
  }
}

export function getFormatFromFile(file) {
  if (file.endsWith('.ros')) return 'ros';
  if (file.endsWith('.json')) return 'json';
  return 'csv';
}

export async function runSequence(car, file, format) {
  if (!file) return;
  const res = await fetch('/static/sequences/' + encodeURIComponent(file));
  if (!res.ok) return;

  let steps = [];
  if (format === 'json' || file.endsWith('.json')) {
    steps = await res.json();
  } else {
    const text = await res.text();
    steps = parseTextSequence(text, format);
  }
  await executeSteps(car, steps);
}
