/* BuildAI · концептуален архитектурен план.
 * Без външни зависимости. Модулът работи в браузър и връща:
 *   - plan модел (стаи, стени, врати, прозорци, стълби, балкони);
 *   - SVG, DXF и PDF (PDF се сглобява от JPEG страници, за да има кирилица).
 *
 * ВАЖНО: това е концептуален чертеж по параметри, а не архитектурен работен
 * проект, конструктивен чертеж или разрешителна документация.
 */

const SHEET = { width: 420, height: 297, margin: 8 };
const MM_PER_M = 1000;
const STANDARD_SCALES = [50, 100, 150, 200, 250, 300, 400, 500];
const EXT_WALL = 0.25;
const INT_WALL = 0.12;

const COLORS = {
  ink: '#20343a',
  wall: '#37474b',
  wallLine: '#26383c',
  thin: '#6c8084',
  muted: '#73878b',
  accent: '#0c9488',
  warning: '#a64b2a',
  sheet: '#ffffff',
  frame: '#34565b',
};

const ROOM_TINTS = {
  living: '#eefaf6',
  kitchen: '#fff9ec',
  bedroom: '#f2f7fd',
  bath: '#eef8fb',
  hall: '#f6fbf5',
  stairs: '#f5f3fb',
  garage: '#f2f4f4',
  closet: '#f8f7f4',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fmt(value, digits = 2) {
  return Number(value || 0).toLocaleString('bg-BG', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function areaLabel(value) {
  return `${fmt(value, 1)} m²`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(value, maxChars) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function typeLabel(type) {
  return type === 'villa' ? 'Вила' : type === 'apartment' ? 'Жилищна сграда' : 'Къща';
}

function buildRoomProgram(config, level) {
  const ground = level === 0;
  const apartment = config.buildingType === 'apartment';

  if (apartment) {
    if (ground) {
      return [
        { name: 'Входно фоайе', type: 'hall', weight: 1.0 },
        { name: 'Стълбище / асансьор', type: 'stairs', weight: 1.4 },
        { name: 'Дневна', type: 'living', weight: 2.2 },
        { name: 'Кухня', type: 'kitchen', weight: 1.0 },
        { name: 'Баня / WC', type: 'bath', weight: 0.7 },
      ];
    }
    return [
      { name: 'Стълбище / асансьор', type: 'stairs', weight: 1.4 },
      { name: 'Дневна', type: 'living', weight: 2.0 },
      { name: 'Кухня', type: 'kitchen', weight: 0.9 },
      { name: 'Спалня 1', type: 'bedroom', weight: 1.4 },
      { name: 'Спалня 2', type: 'bedroom', weight: 1.2 },
      { name: 'Баня / WC', type: 'bath', weight: 0.7 },
    ];
  }

  if (ground) {
    const rooms = [
      { name: 'Дневна', type: 'living', weight: 2.8 },
      { name: 'Кухня', type: 'kitchen', weight: 1.2 },
      { name: 'Входно антре', type: 'hall', weight: 1.1 },
      { name: 'Баня / WC', type: 'bath', weight: 0.7 },
    ];
    if (config.floors === 1) rooms.push({ name: 'Спалня', type: 'bedroom', weight: 1.6 });
    else rooms.push({ name: 'Кабинет / гостна', type: 'bedroom', weight: 1.2 });
    if (config.garage) rooms.push({ name: 'Гараж', type: 'garage', weight: 1.7 });
    if (config.floors > 1) rooms.push({ name: 'Стълбище', type: 'stairs', weight: 0.8 });
    return rooms;
  }

  return [
    { name: 'Стълбище / коридор', type: 'stairs', weight: 0.9 },
    { name: 'Спалня 1', type: 'bedroom', weight: 1.7 },
    { name: 'Спалня 2', type: 'bedroom', weight: 1.4 },
    { name: 'Спалня 3', type: 'bedroom', weight: 1.15 },
    { name: 'Баня / WC', type: 'bath', weight: 0.7 },
    { name: 'Гардероб', type: 'closet', weight: 0.55 },
  ];
}

function fitRoomProgram(program, usableArea) {
  const minimumArea = 5.8;
  const rooms = program.slice();
  const protectedTypes = new Set(['hall', 'stairs', 'living']);
  while (rooms.length > 3 && usableArea / rooms.length < minimumArea) {
    const removable = rooms.filter(room => !protectedTypes.has(room.type));
    if (!removable.length) break;
    removable.sort((a, b) => a.weight - b.weight);
    rooms.splice(rooms.indexOf(removable[0]), 1);
  }
  return rooms;
}

function partitionRect(rect, rooms, depth = 0) {
  if (rooms.length === 1) return [{ ...rect, ...rooms[0] }];
  const total = rooms.reduce((sum, room) => sum + Math.max(0.2, room.weight), 0);
  let leftWeight = 0;
  let split = 1;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < rooms.length; index += 1) {
    leftWeight += Math.max(0.2, rooms[index - 1].weight);
    const difference = Math.abs(leftWeight - total / 2);
    if (difference < best) { best = difference; split = index; }
  }
  const leftRooms = rooms.slice(0, split);
  const rightRooms = rooms.slice(split);
  const leftTotal = leftRooms.reduce((sum, room) => sum + Math.max(0.2, room.weight), 0);
  let ratio = leftTotal / total;
  ratio = clamp(ratio, 0.2, 0.8);

  let splitX = rect.w >= rect.d;
  if (depth % 3 === 2) splitX = !splitX;
  if (splitX && rect.w * ratio < 1.5) splitX = false;
  if (!splitX && rect.d * ratio < 1.5) splitX = true;

  if (splitX) {
    const cut = rect.w * ratio;
    return [
      ...partitionRect({ x: rect.x, y: rect.y, w: cut, d: rect.d }, leftRooms, depth + 1),
      ...partitionRect({ x: rect.x + cut, y: rect.y, w: rect.w - cut, d: rect.d }, rightRooms, depth + 1),
    ];
  }
  const cut = rect.d * ratio;
  return [
    ...partitionRect({ x: rect.x, y: rect.y, w: rect.w, d: cut }, leftRooms, depth + 1),
    ...partitionRect({ x: rect.x, y: rect.y + cut, w: rect.w, d: rect.d - cut }, rightRooms, depth + 1),
  ];
}

function roomAtPoint(rooms, x, y) {
  const containing = rooms.filter(room => x >= room.x - 0.03 && x <= room.x + room.w + 0.03 && y >= room.y - 0.03 && y <= room.y + room.d + 0.03);
  if (!containing.length) return null;
  containing.sort((a, b) => (b.w * b.d) - (a.w * a.d));
  return containing[0];
}

function swapRoomIdentity(a, b) {
  if (!a || !b || a === b) return;
  const name = a.name;
  const type = a.type;
  a.name = b.name;
  a.type = b.type;
  b.name = name;
  b.type = type;
}

function findRoomByType(rooms, type) {
  return rooms.find(room => room.type === type) || null;
}

function sharedBoundary(a, b, tolerance = 0.02) {
  const vertical = (Math.abs((a.x + a.w) - b.x) <= tolerance || Math.abs((b.x + b.w) - a.x) <= tolerance);
  if (vertical) {
    const at = Math.abs((a.x + a.w) - b.x) <= tolerance ? a.x + a.w : b.x + b.w;
    const from = Math.max(a.y, b.y);
    const to = Math.min(a.y + a.d, b.y + b.d);
    if (to - from >= 0.9) {
      const left = a.x < b.x ? a : b;
      const right = left === a ? b : a;
      return { axis: 'v', at, from, to, overlap: to - from, left, right };
    }
  }
  const horizontal = (Math.abs((a.y + a.d) - b.y) <= tolerance || Math.abs((b.y + b.d) - a.y) <= tolerance);
  if (horizontal) {
    const at = Math.abs((a.y + a.d) - b.y) <= tolerance ? a.y + a.d : b.y + b.d;
    const from = Math.max(a.x, b.x);
    const to = Math.min(a.x + a.w, b.x + b.w);
    if (to - from >= 0.9) {
      const upper = a.y < b.y ? a : b;
      const lower = upper === a ? b : a;
      return { axis: 'h', at, from, to, overlap: to - from, upper, lower };
    }
  }
  return null;
}

function inferInteriorWalls(rooms, config, tolerance = 0.015) {
  const L = config.length;
  const W = config.width;
  const segments = new Map();
  const add = (x1, y1, x2, y2) => {
    const key = `${round(x1)}:${round(y1)}:${round(x2)}:${round(y2)}`;
    const reverse = `${round(x2)}:${round(y2)}:${round(x1)}:${round(y1)}`;
    if (!segments.has(reverse)) segments.set(key, { x1, y1, x2, y2 });
  };
  for (const room of rooms) {
    const right = room.x + room.w;
    const back = room.y + room.d;
    if (room.x > EXT_WALL + tolerance) add(room.x, room.y, room.x, back);
    if (right < L - EXT_WALL - tolerance) add(right, room.y, right, back);
    if (room.y > EXT_WALL + tolerance) add(room.x, room.y, right, room.y);
    if (back < W - EXT_WALL - tolerance) add(room.x, back, right, back);
  }
  return [...segments.values()];
}

function inferInteriorDoors(rooms) {
  const edges = [];
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const boundary = sharedBoundary(rooms[i], rooms[j]);
      if (boundary) edges.push(boundary);
    }
  }
  const adjacency = new Map(rooms.map(room => [room, []]));
  for (const edge of edges) {
    adjacency.get(edge.left || edge.upper)?.push({ edge, other: edge.right || edge.lower });
    adjacency.get(edge.right || edge.lower)?.push({ edge, other: edge.left || edge.upper });
  }
  const root = findRoomByType(rooms, 'hall') || findRoomByType(rooms, 'stairs') || findRoomByType(rooms, 'living') || rooms[0];
  const visited = new Set([root]);
  const queue = [root];
  const doors = [];
  while (queue.length) {
    const room = queue.shift();
    for (const connection of adjacency.get(room) || []) {
      const other = connection.other;
      if (!other || visited.has(other)) continue;
      visited.add(other);
      queue.push(other);
      const edge = connection.edge;
      const width = clamp(Math.min(0.9, edge.overlap - 0.35), 0.65, 0.95);
      if (edge.axis === 'v') {
        const center = (edge.from + edge.to) / 2;
        const dir = (edge.right.w * edge.right.d) >= (edge.left.w * edge.left.d) ? 1 : -1;
        doors.push({ axis: 'v', at: edge.at, from: center - width / 2, to: center + width / 2, width, dir, open: false, rooms: [edge.left.name, edge.right.name] });
      } else {
        const center = (edge.from + edge.to) / 2;
        const dir = (edge.lower.w * edge.lower.d) >= (edge.upper.w * edge.upper.d) ? 1 : -1;
        doors.push({ axis: 'h', at: edge.at, from: center - width / 2, to: center + width / 2, width, dir, open: false, rooms: [edge.upper.name, edge.lower.name] });
      }
    }
  }
  // Кухнята и дневната получават широк отвор, ако са съседни (open plan).
  const living = findRoomByType(rooms, 'living');
  const kitchen = findRoomByType(rooms, 'kitchen');
  if (living && kitchen) {
    const boundary = sharedBoundary(living, kitchen);
    if (boundary) {
      const width = clamp(boundary.overlap - 0.5, 0.9, 1.8);
      if (boundary.axis === 'v') {
        const center = (boundary.from + boundary.to) / 2;
        doors.push({ axis: 'v', at: boundary.at, from: center - width / 2, to: center + width / 2, width, dir: 1, open: true, rooms: [living.name, kitchen.name] });
      } else {
        const center = (boundary.from + boundary.to) / 2;
        doors.push({ axis: 'h', at: boundary.at, from: center - width / 2, to: center + width / 2, width, dir: 1, open: true, rooms: [living.name, kitchen.name] });
      }
    }
  }
  // A door is useful only if it does not duplicate a wide living/kitchen opening.
  return doors.filter((door, index, all) => all.findIndex(other => other.axis === door.axis && Math.abs(other.at - door.at) < 0.01 && Math.abs(other.from - door.from) < 0.2) === index);
}

function computeBalconies(config, level, rooms) {
  if (!config.balconies || level === 0) return [];
  const candidates = rooms
    .filter(room => Math.abs(room.y - EXT_WALL) <= 0.02 && ['living', 'bedroom'].includes(room.type) && room.w >= 2.2)
    .sort((a, b) => (b.w * b.d) - (a.w * a.d));
  const room = candidates[0];
  if (!room) return [];
  const width = clamp(room.w - 0.5, 1.6, 2.8);
  const depth = 1.1;
  return [{
    x: room.x + (room.w - width) / 2,
    y: -depth,
    w: width,
    d: depth,
    room: room.name,
  }];
}

function overlapsOpening(candidate, openings) {
  return openings.some(opening => opening.side === candidate.side && candidate.start < opening.start + opening.width - 0.05 && opening.start < candidate.start + candidate.width - 0.05);
}

function computeExteriorOpenings(config, level, rooms, balconies) {
  const L = config.length;
  const W = config.width;
  const openings = [];
  const add = (side, start, width, type, label) => {
    const limit = side === 'W' || side === 'E' ? W : L;
    const boundedStart = clamp(start, 0.15, Math.max(0.15, limit - width - 0.15));
    const height = type === 'window' ? num(config.windowHeight, 1.3) : type === 'garage' ? 2.4 : num(config.doorHeight, 2.1);
    openings.push({ side, start: boundedStart, width: Math.max(0.45, width), height, type, label });
  };

  const doorWidth = clamp(num(config.doorWidth, 1), 0.8, 1.6);
  const doorX = config.doorPosition === 'left' ? L * 0.28 : config.doorPosition === 'right' ? L * 0.72 : L * 0.5;
  if (level === 0) add('S', doorX - doorWidth / 2, doorWidth, 'door', 'ВХОД');

  const garage = findRoomByType(rooms, 'garage');
  if (garage) {
    const width = clamp(garage.w - 0.55, 2.2, 3.2);
    add('S', garage.x + (garage.w - width) / 2, width, 'garage', 'ГАРАЖ');
  }

  for (const balcony of balconies) {
    add('S', balcony.x + (balcony.w - 0.95) / 2, 0.95, 'balcony', 'БАЛКОН');
  }

  for (const room of rooms) {
    if (room.type === 'garage') continue;
    const sides = [];
    if (Math.abs(room.y - EXT_WALL) <= 0.02) sides.push({ side: 'S', from: room.x, to: room.x + room.w });
    if (Math.abs((room.y + room.d) - (W - EXT_WALL)) <= 0.02) sides.push({ side: 'N', from: room.x, to: room.x + room.w });
    if (Math.abs(room.x - EXT_WALL) <= 0.02) sides.push({ side: 'W', from: room.y, to: room.y + room.d });
    if (Math.abs((room.x + room.w) - (L - EXT_WALL)) <= 0.02) sides.push({ side: 'E', from: room.y, to: room.y + room.d });

    for (const side of sides) {
      const length = side.to - side.from;
      if (length < 1.0) continue;
      const count = clamp(Math.floor(length / 2.7) + 1, 1, 3);
      const windowWidth = clamp(Math.min(room.type === 'bath' ? 0.75 : 1.45, (length - 0.7) / count - 0.25), 0.6, 1.55);
      for (let index = 0; index < count; index += 1) {
        const center = side.from + 0.35 + (length - 0.7) * (index + 0.5) / count;
        const candidate = { side: side.side, start: center - windowWidth / 2, width: windowWidth };
        if (overlapsOpening(candidate, openings)) continue;
        add(side.side, candidate.start, windowWidth, 'window', room.name);
      }
    }
  }

  // Приоритет на входа/гаража/балкона; премахваме евентуални припокривания на прозорци.
  const priority = { door: 0, garage: 1, balcony: 2, window: 3 };
  openings.sort((a, b) => priority[a.type] - priority[b.type] || a.start - b.start);
  const accepted = [];
  for (const opening of openings) {
    if (!accepted.some(other => other.side === opening.side && opening.start < other.start + other.width - 0.02 && other.start < opening.start + opening.width - 0.02)) accepted.push(opening);
  }
  return accepted.sort((a, b) => a.side.localeCompare(b.side) || a.start - b.start);
}

function findStairsRoom(rooms) {
  const room = findRoomByType(rooms, 'stairs');
  return room ? { x: room.x, y: room.y, w: room.w, d: room.d } : null;
}

function corridorProgram(config, level) {
  const ground = level === 0;
  const apartment = config.buildingType === 'apartment';
  const make = (name, type, weight) => ({ name, type, weight });

  if (apartment) {
    if (ground) return {
      front: [make('Дневна', 'living', 2.2), make('Кухня', 'kitchen', 1.0)],
      back: [make('Баня / WC', 'bath', 0.7), make('Стълбище / асансьор', 'stairs', 1.4)],
      hall: true,
    };
    return {
      front: [make('Дневна', 'living', 2.0), make('Кухня', 'kitchen', 0.9), make('Спалня 1', 'bedroom', 1.3)],
      back: [make('Спалня 2', 'bedroom', 1.2), make('Баня / WC', 'bath', 0.7), make('Стълбище', 'stairs', 1.2)],
      hall: false,
    };
  }

  if (ground) {
    const front = [make('Дневна', 'living', 2.8), make('Кухня', 'kitchen', 1.2)];
    const back = [make('Баня / WC', 'bath', 0.7)];
    if (config.floors === 1) back.push(make('Спалня', 'bedroom', 1.6));
    else back.push(make('Кабинет / гостна', 'bedroom', 1.2), make('Стълбище', 'stairs', 1.0));
    if (config.garage) front.push(make('Гараж', 'garage', 1.6));
    return { front, back, hall: true };
  }

  return {
    front: [make('Спалня 1', 'bedroom', 1.7), make('Спалня 2', 'bedroom', 1.35)],
    back: [make('Спалня 3', 'bedroom', 1.15), make('Баня / WC', 'bath', 0.7), make('Гардероб', 'closet', 0.5), make('Стълбище / коридор', 'stairs', 1.0)],
    hall: false,
  };
}

function partitionRow(rect, rooms) {
  if (!rooms.length) return [];
  if (rooms.length === 1) {
    return [{ ...rect, ...rooms[0], area: rect.w * rect.d }];
  }
  const caps = { bath: 2.9, closet: 2.2, kitchen: 5.0, stairs: 3.1, garage: 3.2, hall: 2.8 };
  const total = rooms.reduce((sum, room) => sum + Math.max(0.2, room.weight), 0);
  let widths = rooms.map(room => rect.w * Math.max(0.2, room.weight) / total);
  widths = widths.map((width, index) => Math.min(width, caps[rooms[index].type] ?? width));
  let leftover = rect.w - widths.reduce((sum, width) => sum + width, 0);
  if (leftover > 0.02) {
    const flexible = rooms.map((room, index) => ({ room, index })).filter(item => !caps[item.room.type]);
    if (flexible.length) {
      const weight = flexible.reduce((sum, item) => sum + Math.max(0.2, item.room.weight), 0);
      flexible.forEach(item => { widths[item.index] += leftover * Math.max(0.2, item.room.weight) / weight; });
    } else {
      widths[widths.length - 1] += leftover;
    }
  } else if (leftover < -0.02) {
    const scale = rect.w / widths.reduce((sum, width) => sum + width, 0);
    widths = widths.map(width => width * scale);
  }
  // Keep every room usable; take the difference from the widest rooms.
  for (let index = 0; index < widths.length; index += 1) {
    if (widths[index] >= 1.2) continue;
    const deficit = 1.2 - widths[index];
    const donor = widths.map((width, donorIndex) => ({ width, donorIndex })).filter(item => item.width > 1.2 + deficit).sort((a, b) => b.width - a.width)[0];
    if (!donor) break;
    widths[index] = 1.2;
    widths[donor.donorIndex] -= deficit;
  }
  const sum = widths.reduce((totalWidth, width) => totalWidth + width, 0);
  if (Math.abs(sum - rect.w) > 0.02) {
    const adjustable = widths.indexOf(Math.max(...widths));
    widths[adjustable] += rect.w - sum;
  }
  const result = [];
  let cursor = rect.x;
  rooms.forEach((room, index) => {
    const width = index === rooms.length - 1 ? rect.x + rect.w - cursor : widths[index];
    result.push({ ...room, x: cursor, y: rect.y, w: width, d: rect.d, area: width * rect.d });
    cursor += width;
  });
  return result;
}

function expandCorridorProgram(frontBack, usableArea) {
  const targetRooms = clamp(Math.round(usableArea / 27), 5, 10);
  let current = frontBack.front.length + frontBack.back.length + (frontBack.hall ? 1 : 0);
  let bedroomNumber = [...frontBack.front, ...frontBack.back].filter(room => room.type === 'bedroom').length;
  while (current < targetRooms) {
    bedroomNumber += 1;
    const extra = { name: bedroomNumber <= 3 ? `Спалня ${bedroomNumber}` : `Стая ${bedroomNumber}`, type: 'bedroom', weight: bedroomNumber <= 2 ? 1.45 : 1.15 };
    const frontCount = frontBack.front.length;
    const backCount = frontBack.back.length;
    if (frontCount <= backCount) frontBack.front.push(extra);
    else frontBack.back.push(extra);
    current += 1;
  }
  return frontBack;
}

function corridorDoors(rooms, corridor) {
  const doors = [];
  for (const room of rooms) {
    if (room === corridor || room.type === 'garage') continue;
    const touchesTop = Math.abs((room.y + room.d) - corridor.y) <= 0.02;
    const touchesBottom = Math.abs(room.y - (corridor.y + corridor.d)) <= 0.02;
    if (!touchesTop && !touchesBottom) continue;
    const width = room.type === 'hall' ? 1.1 : room.type === 'stairs' ? 0.95 : 0.9;
    const center = room.x + room.w / 2;
    const available = room.w - 0.5;
    if (available < 0.7) continue;
    const opening = Math.min(width, available);
    doors.push({
      axis: 'h',
      at: touchesTop ? corridor.y : corridor.y + corridor.d,
      from: center - opening / 2,
      to: center + opening / 2,
      width: opening,
      dir: touchesTop ? 1 : -1,
      open: room.type === 'hall',
      rooms: [room.name, corridor.name],
    });
  }
  return doors;
}

function layoutCorridorFloor(config, level, inner) {
  const frontBack = expandCorridorProgram(corridorProgram(config, level), inner.w * inner.d);
  const corridorH = inner.d > 10 ? 1.25 : 1.05;
  const frontD = (inner.d - corridorH) * 0.52;
  const backD = inner.d - corridorH - frontD;
  const corridor = { name: 'Коридор', type: 'hall', x: inner.x, y: inner.y + frontD, w: inner.w, d: corridorH, area: inner.w * corridorH };
  const doorWidth = clamp(num(config.doorWidth, 1), 0.8, 1.6);
  const requestedX = config.doorPosition === 'left' ? config.length * 0.28 : config.doorPosition === 'right' ? config.length * 0.72 : config.length * 0.5;
  const hallW = frontBack.hall ? clamp(doorWidth + 0.8, 1.6, 2.4) : 0;
  const hallX = frontBack.hall ? clamp(requestedX - hallW / 2, inner.x + 0.15, inner.x + inner.w - hallW - 0.15) : inner.x;

  const rooms = [];
  if (frontBack.hall) rooms.push({ name: 'Входно антре', type: 'hall', x: hallX, y: inner.y, w: hallW, d: frontD, area: hallW * frontD });

  let left = frontBack.hall ? { x: inner.x, w: Math.max(0, hallX - inner.x) } : { x: inner.x, w: inner.w };
  let right = frontBack.hall ? { x: hallX + hallW, w: Math.max(0, inner.x + inner.w - hallX - hallW) } : null;
  const otherFront = frontBack.front.slice();
  const garage = otherFront.find(room => room.type === 'garage');
  if (garage) {
    const index = otherFront.indexOf(garage);
    const garageWidth = clamp(2.8, 2.4, 3.2);
    if (Math.max(left.w, right.w) >= garageWidth + 0.4) {
      if (left.w >= right.w) {
        rooms.push({ ...garage, x: left.x, y: inner.y, w: garageWidth, d: frontD, area: garageWidth * frontD });
        left = { x: left.x + garageWidth, w: left.w - garageWidth };
      } else {
        rooms.push({ ...garage, x: right.x + right.w - garageWidth, y: inner.y, w: garageWidth, d: frontD, area: garageWidth * frontD });
        right = { x: right.x, w: right.w - garageWidth };
      }
      otherFront.splice(index, 1);
    }
  }

  // Разпределяме дневната/кухнята в двете зони около антрето.
  const regions = [left, right].filter(region => region && region.w > 0.35);
  if (regions.length === 1) {
    rooms.push(...partitionRow({ x: regions[0].x, y: inner.y, w: regions[0].w, d: frontD }, otherFront));
  } else if (regions.length === 2) {
    const sorted = [...regions].sort((a, b) => b.w - a.w);
    const canSplitSmall = sorted[1].w >= 3.0 && otherFront.length >= 2;
    if (!canSplitSmall) {
      const small = sorted[1];
      const big = sorted[0];
      const smallRoom = otherFront.find(room => room.type === 'kitchen') || otherFront[otherFront.length - 1];
      const bigRooms = otherFront.filter(room => room !== smallRoom);
      if (smallRoom) rooms.push(...partitionRow({ x: small.x, y: inner.y, w: small.w, d: frontD }, [smallRoom]));
      if (bigRooms.length) rooms.push(...partitionRow({ x: big.x, y: inner.y, w: big.w, d: frontD }, bigRooms));
    } else {
      const leftRooms = otherFront.filter((_room, index) => index % 2 === 0);
      const rightRooms = otherFront.filter((_room, index) => index % 2 === 1);
      rooms.push(...partitionRow({ x: sorted[0].x, y: inner.y, w: sorted[0].w, d: frontD }, leftRooms));
      rooms.push(...partitionRow({ x: sorted[1].x, y: inner.y, w: sorted[1].w, d: frontD }, rightRooms));
    }
  }

  // Задната зона: стълбището е в единия край, за да съвпада на всички етажи.
  const backRooms = frontBack.back.slice();
  const stairProgram = backRooms.find(room => room.type === 'stairs');
  let stairRect = null;
  let backRect = { x: inner.x, y: corridor.y + corridorH, w: inner.w, d: backD };
  if (stairProgram) {
    backRooms.splice(backRooms.indexOf(stairProgram), 1);
    const stairW = clamp(2.5, 2.1, 3.1);
    stairRect = { ...stairProgram, x: inner.x + inner.w - stairW, y: backRect.y, w: stairW, d: backD, area: stairW * backD };
    backRect = { ...backRect, w: inner.w - stairW };
  }
  rooms.push(...partitionRow(backRect, backRooms));
  if (stairRect) rooms.push(stairRect);
  rooms.push(corridor);

  rooms.forEach((room, index) => { room.id = index + 1; room.area = room.w * room.d; });
  const doors = corridorDoors(rooms, corridor);
  const stairs = stairRect ? { x: stairRect.x, y: stairRect.y, w: stairRect.w, d: stairRect.d } : null;
  return { rooms, doors, stairs, corridor };
}

function layoutSmallFloor(config, level, inner) {
  const area = inner.w * inner.d;
  if (area < 22) {
    const room = { name: 'Общо пространство', type: 'living', x: inner.x, y: inner.y, w: inner.w, d: inner.d, area: inner.w * inner.d, weight: 1 };
    const doors = level === 0 ? [] : [];
    return { rooms: [room], doors, stairs: null, corridor: null };
  }
  if (area < 34) {
    const splitX = inner.w >= inner.d;
    const firstW = splitX ? inner.w * 0.62 : inner.w;
    const firstD = splitX ? inner.d : inner.d * 0.62;
    const first = { name: 'Дневна', type: 'living', x: inner.x, y: inner.y, w: firstW, d: firstD, area: firstW * firstD };
    const second = { name: 'Баня / WC', type: 'bath', x: splitX ? inner.x + firstW : inner.x, y: splitX ? inner.y : inner.y + firstD, w: splitX ? inner.w - firstW : inner.w, d: splitX ? inner.d : inner.d - firstD };
    second.area = second.w * second.d;
    const rooms = [first, second];
    const doors = inferInteriorDoors(rooms);
    return { rooms, doors, stairs: null, corridor: null };
  }
  const program = fitRoomProgram(buildRoomProgram(config, level), area);
  const rooms = partitionRect(inner, program);
  rooms.forEach((room, index) => { room.id = index + 1; room.area = room.w * room.d; });
  const entranceX = config.doorPosition === 'left' ? config.length * 0.28 : config.doorPosition === 'right' ? config.length * 0.72 : config.length * 0.5;
  if (level === 0) {
    const entrance = roomAtPoint(rooms, entranceX, EXT_WALL + 0.06);
    const hall = findRoomByType(rooms, 'hall');
    if (entrance && hall && entrance !== hall) swapRoomIdentity(entrance, hall);
  }
  return { rooms, doors: inferInteriorDoors(rooms), stairs: findStairsRoom(rooms), corridor: null };
}

export function buildArchitecturalPlan(config = {}, options = {}) {
  const L = clamp(num(config.length, 12), 4, 30);
  const W = clamp(num(config.width, 9), 4, 30);
  const floors = clamp(Math.round(num(config.floors, 2)), 1, 6);
  const floorHeight = clamp(num(config.floorHeight, 3), 2.5, 4);
  const inner = { x: EXT_WALL, y: EXT_WALL, w: L - 2 * EXT_WALL, d: W - 2 * EXT_WALL };
  const usableArea = inner.w * inner.d;
  const levels = [];

  for (let level = 0; level < floors; level += 1) {
    const layout = inner.d >= 6.2 && inner.w >= 5.6 && usableArea >= 34
      ? layoutCorridorFloor(config, level, inner)
      : layoutSmallFloor(config, level, inner);
    const rooms = layout.rooms;
    let bedroomIndex = 0;
    for (const room of rooms) {
      if (room.type !== 'bedroom' || !/^(Спалня|Стая)/i.test(room.name)) continue;
      bedroomIndex += 1;
      room.name = `Спалня ${bedroomIndex}`;
    }
    const stairs = layout.stairs || findStairsRoom(rooms);

    const balconies = computeBalconies(config, level, rooms);
    const openings = computeExteriorOpenings(config, level, rooms, balconies);
    const interiorWalls = inferInteriorWalls(rooms, { length: L, width: W });
    const interiorDoors = layout.doors;
    const roomArea = rooms.reduce((sum, room) => sum + room.area, 0);

    levels.push({
      index: level,
      label: floors === 1 ? 'Едноетажна сграда' : `Етаж ${level + 1}`,
      elevation: level * floorHeight,
      height: floorHeight,
      rooms,
      roomArea,
      interiorWalls,
      interiorDoors,
      exteriorOpenings: openings,
      stairs,
      balconies,
      roofOutline: level === floors - 1 && config.roofType !== 'flat',
    });
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    projectName: String(options.projectName || '').trim().slice(0, 120) || 'BuildAI концептуален проект',
    buildingType: config.buildingType || 'house',
    typeLabel: typeLabel(config.buildingType),
    length: L,
    width: W,
    floors,
    floorHeight,
    footprint: L * W,
    grossArea: L * W * floors,
    wallThickness: { exterior: EXT_WALL, interior: INT_WALL },
    roofType: config.roofType || 'gable',
    levels,
  };
}

function sheetBounds(plan, level) {
  let minY = -2.6;
  let maxY = plan.width + 1.6;
  for (const balcony of level.balconies) minY = Math.min(minY, balcony.y - 0.5);
  return { minX: -1.9, maxX: plan.length + 1.9, minY, maxY };
}

function layoutPlan(plan, level, region = { x: 13, y: 38, w: 266, h: 204 }, forcedScale = 0) {
  const bounds = sheetBounds(plan, level);
  const maxPpm = Math.min(region.w / (bounds.maxX - bounds.minX), region.h / (bounds.maxY - bounds.minY));
  const requestedScale = Number(forcedScale);
  let scaleDen = STANDARD_SCALES.find(scale => MM_PER_M / scale <= maxPpm);
  if (!scaleDen) scaleDen = Math.ceil((MM_PER_M / maxPpm) / 50) * 50;
  if (requestedScale > 0) {
    const requestedPpm = MM_PER_M / requestedScale;
    const fits = (bounds.maxX - bounds.minX) * requestedPpm <= region.w && (bounds.maxY - bounds.minY) * requestedPpm <= region.h;
    if (fits) scaleDen = requestedScale;
  }
  const ppm = MM_PER_M / scaleDen;
  const drawW = (bounds.maxX - bounds.minX) * ppm;
  const drawH = (bounds.maxY - bounds.minY) * ppm;
  const originX = region.x + (region.w - drawW) / 2 - bounds.minX * ppm;
  const originY = region.y + (region.h - drawH) / 2 - bounds.minY * ppm;
  return { region, bounds, scaleDen, ppm, originX, originY };
}

function buildPlanSheet(plan, levelIndex = 0, options = {}) {
  const level = plan.levels[clamp(levelIndex, 0, plan.levels.length - 1)];
  const layout = layoutPlan(plan, level, options.region, options.scaleDen);
  const { ppm } = layout;
  const showFurniture = options.showFurniture !== false;
  const showDimensions = options.showDimensions !== false;
  const primitives = [];
  const push = primitive => primitives.push(primitive);
  const X = x => layout.originX + x * ppm;
  const Y = y => layout.originY + (y - layout.bounds.minY) * ppm;
  const S = value => value * ppm;
  const line = (x1, y1, x2, y2, color = COLORS.thin, width = 0.25, dash = null, cap = 'butt') => push({ type: 'line', x1, y1, x2, y2, color, width, dash, cap });
  const rect = (x, y, w, h, fill = 'none', stroke = 'none', width = 0.25, dash = null) => push({ type: 'rect', x, y, w, h, fill, stroke, width, dash });
  const circle = (cx, cy, r, fill = 'none', stroke = 'none', width = 0.25) => push({ type: 'circle', cx, cy, r, fill, stroke, width });
  const arc = (cx, cy, r, a0, a1, color = COLORS.ink, width = 0.25) => push({ type: 'arc', cx, cy, r, a0, a1, color, width });
  const polygon = (points, fill = 'none', stroke = 'none', width = 0.25) => push({ type: 'polygon', points, fill, stroke, width });
  const text = (x, y, value, size = 2.4, color = COLORS.ink, anchor = 'start', weight = 400, baseline = 'middle') => push({ type: 'text', x, y, text: String(value ?? ''), size, color, anchor, weight, baseline });

  // --- Sheet frame and header -------------------------------------------------
  rect(0, 0, SHEET.width, SHEET.height, COLORS.sheet);
  rect(SHEET.margin, SHEET.margin, SHEET.width - SHEET.margin * 2, SHEET.height - SHEET.margin * 2, 'none', COLORS.frame, 0.45);
  rect(SHEET.margin + 2, SHEET.margin + 2, SHEET.width - SHEET.margin * 2 - 4, SHEET.height - SHEET.margin * 2 - 4, 'none', '#9fb4b3', 0.2);

  text(13, 15, 'BUILDAI · АРХИТЕКТУРЕН ПЛАН', 4.4, COLORS.accent, 'start', 700);
  const headerProjectName = String(plan.projectName || '').length > 58 ? `${String(plan.projectName).slice(0, 55)}…` : plan.projectName;
  text(13, 20.5, headerProjectName, 2.7, COLORS.ink, 'start', 600);
  text(13, 24.7, `${plan.typeLabel} · ${fmt(plan.length, 2)} × ${fmt(plan.width, 2)} m · ${plan.floors} ${plan.floors === 1 ? 'етаж' : 'етажа'}`, 2.1, COLORS.muted);
  text(407, 15, 'КОНЦЕПТУАЛЕН ЧЕРТЕЖ', 2.2, COLORS.muted, 'end', 700);
  text(407, 19.5, `Лист A-${String(level.index + 1).padStart(2, '0')} · ${level.label}`, 2.5, COLORS.ink, 'end', 600);
  line(13, 28, 407, 28, COLORS.frame, 0.35);

  // --- Room fills -------------------------------------------------------------
  for (const room of level.rooms) {
    rect(X(room.x), Y(room.y), S(room.w), S(room.d), ROOM_TINTS[room.type] || '#f7fbfa');
  }

  // --- Exterior wall band -----------------------------------------------------
  rect(X(0), Y(0), S(plan.length), S(plan.width), COLORS.wall);
  rect(X(EXT_WALL), Y(EXT_WALL), S(plan.length - 2 * EXT_WALL), S(plan.width - 2 * EXT_WALL), COLORS.sheet);
  rect(X(0), Y(0), S(plan.length), S(plan.width), 'none', COLORS.wallLine, 0.35);
  rect(X(EXT_WALL), Y(EXT_WALL), S(plan.length - 2 * EXT_WALL), S(plan.width - 2 * EXT_WALL), 'none', COLORS.wallLine, 0.35);

  // Re-fill rooms over the white inner rectangle so the tint remains visible.
  for (const room of level.rooms) {
    rect(X(room.x), Y(room.y), S(room.w), S(room.d), ROOM_TINTS[room.type] || '#f7fbfa');
  }

  // --- Interior walls ---------------------------------------------------------
  for (const wall of level.interiorWalls) {
    line(X(wall.x1), Y(wall.y1), X(wall.x2), Y(wall.y2), COLORS.wall, S(INT_WALL), null, 'butt');
  }

  // --- Dimensions -------------------------------------------------------------
  if (showDimensions) {
  const drawTick = (x, y, horizontal) => {
    const d = 0.9;
    if (horizontal) line(x - d, y + d, x + d, y - d, COLORS.thin, 0.22);
    else line(x - d, y - d, x + d, y + d, COLORS.thin, 0.22);
  };
  const dimLine = (x1, y1, x2, y2, label, horizontal = true) => {
    line(x1, y1, x2, y2, COLORS.thin, 0.25);
    drawTick(x1, y1, horizontal);
    drawTick(x2, y2, horizontal);
    text((x1 + x2) / 2, y1 - 1.1, label, 2.0, COLORS.ink, 'middle');
  };
  const overallY = Y(-1.05);
  const overallX = X(-1.05);
  dimLine(X(0), overallY, X(plan.length), overallY, `${fmt(plan.length, 2)} m`, true);
  line(X(0), Y(0) - 0.8, X(0), overallY + 1.1, COLORS.thin, 0.2);
  line(X(plan.length), Y(0) - 0.8, X(plan.length), overallY + 1.1, COLORS.thin, 0.2);
  // Depth dimension (vertical).
  line(overallX, Y(0), overallX, Y(plan.width), COLORS.thin, 0.25);
  drawTick(overallX, Y(0), false);
  drawTick(overallX, Y(plan.width), false);
  push({ type: 'text', x: overallX - 1.6, y: (Y(0) + Y(plan.width)) / 2, text: `${fmt(plan.width, 2)} m`, size: 2.0, color: COLORS.ink, anchor: 'middle', weight: 400, baseline: 'middle' });
  line(X(0) - 0.8, Y(0), overallX + 1.1, Y(0), COLORS.thin, 0.2);
  line(X(0) - 0.8, Y(plan.width), overallX + 1.1, Y(plan.width), COLORS.thin, 0.2);

  // Chain dimension along the entrance facade.
  const frontRooms = level.rooms.filter(room => Math.abs(room.y - EXT_WALL) <= 0.03).sort((a, b) => a.x - b.x);
  if (frontRooms.length) {
    const chainY = Y(-1.95);
    const stops = [...new Set([0, ...frontRooms.flatMap(room => [round(room.x, 2), round(room.x + room.w, 2)]), plan.length])].sort((a, b) => a - b);
    line(X(stops[0]), chainY, X(stops[stops.length - 1]), chainY, COLORS.thin, 0.2, [1.1, 0.8]);
    stops.forEach(stop => {
      drawTick(X(stop), chainY, true);
      line(X(stop), Y(0) - 0.6, X(stop), chainY + 0.8, COLORS.thin, 0.16);
    });
    for (let index = 1; index < stops.length; index += 1) {
      const length = stops[index] - stops[index - 1];
      if (length < 0.9) continue;
      text((X(stops[index - 1]) + X(stops[index])) / 2, chainY - 1.0, fmt(length, 2), 1.8, COLORS.muted, 'middle');
    }
  }

  }

  // --- Exterior openings ------------------------------------------------------
  const wallSpan = (side) => side === 'S' ? { x0: 0, x1: plan.length, y0: 0, y1: EXT_WALL } : side === 'N' ? { x0: 0, x1: plan.length, y0: plan.width - EXT_WALL, y1: plan.width } : side === 'W' ? { x0: 0, x1: EXT_WALL, y0: 0, y1: plan.width } : { x0: plan.length - EXT_WALL, x1: plan.length, y0: 0, y1: plan.width };

  const drawJamb = (side, start, width) => {
    const band = wallSpan(side);
    if (side === 'S' || side === 'N') {
      line(X(start), Y(band.y0), X(start), Y(band.y1), COLORS.wallLine, 0.35);
      line(X(start + width), Y(band.y0), X(start + width), Y(band.y1), COLORS.wallLine, 0.35);
    } else {
      line(X(band.x0), Y(start), X(band.x1), Y(start), COLORS.wallLine, 0.35);
      line(X(band.x0), Y(start + width), X(band.x1), Y(start + width), COLORS.wallLine, 0.35);
    }
  };

  const drawWindow = (side, start, width) => {
    const band = wallSpan(side);
    if (side === 'S' || side === 'N') {
      rect(X(start), Y(band.y0), S(width), S(EXT_WALL), COLORS.sheet);
      drawJamb(side, start, width);
      const y1 = band.y0 + EXT_WALL * 0.32;
      const y2 = band.y0 + EXT_WALL * 0.68;
      line(X(start), Y(y1), X(start + width), Y(y1), COLORS.wallLine, 0.3);
      line(X(start), Y(y2), X(start + width), Y(y2), COLORS.wallLine, 0.3);
      if (width > 1.15) line(X(start + width / 2), Y(y1), X(start + width / 2), Y(y2), COLORS.wallLine, 0.22);
    } else {
      rect(X(band.x0), Y(start), S(EXT_WALL), S(width), COLORS.sheet);
      drawJamb(side, start, width);
      const x1 = band.x0 + EXT_WALL * 0.32;
      const x2 = band.x0 + EXT_WALL * 0.68;
      line(X(x1), Y(start), X(x1), Y(start + width), COLORS.wallLine, 0.3);
      line(X(x2), Y(start), X(x2), Y(start + width), COLORS.wallLine, 0.3);
      if (width > 1.15) line(X(x1), Y(start + width / 2), X(x2), Y(start + width / 2), COLORS.wallLine, 0.22);
    }
  };

  const drawSwingDoor = (side, start, width) => {
    const band = wallSpan(side);
    if (side === 'S' || side === 'N') rect(X(start), Y(band.y0), S(width), S(EXT_WALL), COLORS.sheet);
    else rect(X(band.x0), Y(start), S(EXT_WALL), S(width), COLORS.sheet);
    drawJamb(side, start, width);
    let hingeX, hingeY, a0, a1;
    if (side === 'S') { hingeX = X(start); hingeY = Y(EXT_WALL); a0 = 0; a1 = Math.PI / 2; }
    else if (side === 'N') { hingeX = X(start); hingeY = Y(plan.width - EXT_WALL); a0 = 0; a1 = -Math.PI / 2; }
    else if (side === 'W') { hingeX = X(EXT_WALL); hingeY = Y(start); a0 = Math.PI / 2; a1 = 0; }
    else { hingeX = X(plan.length - EXT_WALL); hingeY = Y(start); a0 = Math.PI / 2; a1 = Math.PI; }
    const r = S(width);
    const endX = hingeX + Math.cos(a1) * r;
    const endY = hingeY + Math.sin(a1) * r;
    line(hingeX, hingeY, endX, endY, COLORS.ink, 0.3);
    arc(hingeX, hingeY, r, a0, a1, COLORS.ink, 0.22);
  };

  const openingTags = new Map();
  let windowNumber = 0;
  let doorNumber = 0;
  let balconyNumber = 0;
  let garageNumber = 0;
  for (const opening of level.exteriorOpenings) {
    let tag = '';
    if (opening.type === 'window') tag = `W${++windowNumber}`;
    else if (opening.type === 'door') tag = `D${++doorNumber}`;
    else if (opening.type === 'balcony') tag = `BD${++balconyNumber}`;
    else if (opening.type === 'garage') tag = `GD${++garageNumber}`;
    openingTags.set(opening, tag);
    if (opening.type === 'window') drawWindow(opening.side, opening.start, opening.width);
    else if (opening.type === 'door' || opening.type === 'balcony') drawSwingDoor(opening.side, opening.start, opening.width);
    else if (opening.type === 'garage') {
      const band = wallSpan('S');
      rect(X(opening.start), Y(band.y0), S(opening.width), S(EXT_WALL), COLORS.sheet);
      drawJamb('S', opening.start, opening.width);
      line(X(opening.start), Y(EXT_WALL * 0.5), X(opening.start + opening.width), Y(EXT_WALL * 0.5), COLORS.wallLine, 0.5);
      for (let x = opening.start + 0.35; x < opening.start + opening.width - 0.2; x += 0.5) {
        line(X(x), Y(EXT_WALL * 0.25), X(x), Y(EXT_WALL * 0.75), COLORS.muted, 0.18);
      }
    }
    if (tag) {
      let tagX = 0;
      let tagY = 0;
      let anchor = 'middle';
      if (opening.side === 'S') { tagX = X(opening.start + opening.width / 2); tagY = Y(EXT_WALL + 0.24); }
      else if (opening.side === 'N') { tagX = X(opening.start + opening.width / 2); tagY = Y(plan.width - EXT_WALL - 0.24); }
      else if (opening.side === 'W') { tagX = X(EXT_WALL + 0.28); tagY = Y(opening.start + opening.width / 2); anchor = 'start'; }
      else { tagX = X(plan.length - EXT_WALL - 0.28); tagY = Y(opening.start + opening.width / 2); anchor = 'end'; }
      text(tagX, tagY, tag, 1.45, COLORS.accent, anchor, 700);
    }
  }

  // --- Interior doors ---------------------------------------------------------
  const drawInteriorDoor = (door) => {
    if (door.axis === 'v') {
      line(X(door.at), Y(door.from), X(door.at), Y(door.to), COLORS.sheet, S(INT_WALL) + 0.5);
      line(X(door.at), Y(door.from) - 1.4, X(door.at), Y(door.from) + 1.4, COLORS.wallLine, 0.28);
      line(X(door.at), Y(door.to) - 1.4, X(door.at), Y(door.to) + 1.4, COLORS.wallLine, 0.28);
      if (!door.open) {
        const hingeX = X(door.at);
        const hingeY = Y(door.from);
        const r = S(door.width);
        const a0 = Math.PI / 2;
        const a1 = door.dir > 0 ? 0 : Math.PI;
        line(hingeX, hingeY, hingeX + Math.cos(a1) * r, hingeY + Math.sin(a1) * r, COLORS.ink, 0.3);
        arc(hingeX, hingeY, r, a0, a1, COLORS.ink, 0.2);
      }
    } else {
      line(X(door.from), Y(door.at), X(door.to), Y(door.at), COLORS.sheet, S(INT_WALL) + 0.5);
      line(X(door.from) - 1.4, Y(door.at), X(door.from) + 1.4, Y(door.at), COLORS.wallLine, 0.28);
      line(X(door.to) - 1.4, Y(door.at), X(door.to) + 1.4, Y(door.at), COLORS.wallLine, 0.28);
      if (!door.open) {
        const hingeX = X(door.from);
        const hingeY = Y(door.at);
        const r = S(door.width);
        const a0 = 0;
        const a1 = door.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        line(hingeX, hingeY, hingeX + Math.cos(a1) * r, hingeY + Math.sin(a1) * r, COLORS.ink, 0.3);
        arc(hingeX, hingeY, r, a0, a1, COLORS.ink, 0.2);
      }
    }
  };
  for (const door of level.interiorDoors) drawInteriorDoor(door);

  // --- Stairs -----------------------------------------------------------------
  if (level.stairs) {
    const stairs = level.stairs;
    const alongX = stairs.w >= stairs.d;
    const runWidth = Math.min(1.15, (alongX ? stairs.d : stairs.w) - 0.35);
    if (runWidth > 0.55) {
      if (alongX) {
        const y = stairs.y + stairs.d / 2 - runWidth / 2;
        rect(X(stairs.x + 0.2), Y(y), S(stairs.w - 0.4), S(runWidth), 'none', COLORS.muted, 0.22);
        const count = Math.max(3, Math.floor((stairs.w - 0.4) / 0.28));
        for (let index = 1; index < count; index += 1) {
          const x = stairs.x + 0.2 + (stairs.w - 0.4) * index / count;
          line(X(x), Y(y), X(x), Y(y + runWidth), COLORS.muted, 0.2);
        }
        line(X(stairs.x + 0.35), Y(y + runWidth / 2), X(stairs.x + stairs.w - 0.55), Y(y + runWidth / 2), COLORS.ink, 0.25);
        polygon([[X(stairs.x + stairs.w - 0.55), Y(y + runWidth / 2)], [X(stairs.x + stairs.w - 0.9), Y(y + runWidth / 2 - 0.55)], [X(stairs.x + stairs.w - 0.9), Y(y + runWidth / 2 + 0.55)]], COLORS.ink);
      } else {
        const x = stairs.x + stairs.w / 2 - runWidth / 2;
        rect(X(x), Y(stairs.y + 0.2), S(runWidth), S(stairs.d - 0.4), 'none', COLORS.muted, 0.22);
        const count = Math.max(3, Math.floor((stairs.d - 0.4) / 0.28));
        for (let index = 1; index < count; index += 1) {
          const y = stairs.y + 0.2 + (stairs.d - 0.4) * index / count;
          line(X(x), Y(y), X(x + runWidth), Y(y), COLORS.muted, 0.2);
        }
        line(X(x + runWidth / 2), Y(stairs.y + 0.35), X(x + runWidth / 2), Y(stairs.y + stairs.d - 0.55), COLORS.ink, 0.25);
        polygon([[X(x + runWidth / 2), Y(stairs.y + stairs.d - 0.55)], [X(x + runWidth / 2 - 0.55), Y(stairs.y + stairs.d - 0.9)], [X(x + runWidth / 2 + 0.55), Y(stairs.y + stairs.d - 0.9)]], COLORS.ink);
      }
      text(X(stairs.x + stairs.w / 2), Y(stairs.y + stairs.d / 2) - 0.8, level.index === 0 ? 'ГОРЕ' : 'ДОЛУ', 1.55, COLORS.muted, 'middle', 700);
    }
  }

  // --- Balconies ---------------------------------------------------------------
  for (const balcony of level.balconies) {
    rect(X(balcony.x), Y(balcony.y), S(balcony.w), S(balcony.d), '#f9fcfb', COLORS.muted, 0.3);
    line(X(balcony.x), Y(balcony.y), X(balcony.x + balcony.w), Y(balcony.y), COLORS.wallLine, 0.55);
    line(X(balcony.x), Y(balcony.y + 0.08), X(balcony.x + balcony.w), Y(balcony.y + 0.08), COLORS.muted, 0.2);
    text(X(balcony.x + balcony.w / 2), Y(balcony.y + balcony.d / 2), 'Балкон', 1.8, COLORS.muted, 'middle');
  }

  // --- Roof outline ------------------------------------------------------------
  if (level.roofOutline) {
    rect(X(-0.35), Y(-0.35), S(plan.length + 0.7), S(plan.width + 0.7), 'none', COLORS.muted, 0.2, [2.2, 1.4]);
  }

  // --- Furniture symbols (conceptual, to scale) --------------------------------
  if (showFurniture) {
    const furnitureColor = '#91a6aa';
    const furnitureFill = '#f4f8f8';
    const fRect = (x, y, w, d) => rect(X(x), Y(y), S(w), S(d), furnitureFill, furnitureColor, 0.22);
    const fLine = (x1, y1, x2, y2, width = 0.22) => line(X(x1), Y(y1), X(x2), Y(y2), furnitureColor, width);
    const fCircle = (cx, cy, r) => circle(X(cx), Y(cy), S(r), 'none', furnitureColor, 0.22);
    for (const room of level.rooms) {
      if (room.w < 1.4 || room.d < 1.4) continue;
      if (room.type === 'living' && room.w >= 3.0 && room.d >= 2.5) {
        const sofaW = Math.min(2.4, room.w - 1.1);
        const sofaX = room.x + (room.w - sofaW) / 2;
        const sofaY = room.y + room.d - 1.05;
        fRect(sofaX, sofaY, sofaW, 0.62);
        fLine(sofaX, sofaY, sofaX + sofaW, sofaY, 0.32);
        fRect(room.x + room.w / 2 - 0.52, room.y + room.d - 1.95, 1.04, 0.52);
        fLine(room.x + room.w * 0.22, room.y + 0.3, room.x + room.w * 0.78, room.y + 0.3, 0.3);
      } else if (room.type === 'bedroom' && room.w >= 2.6 && room.d >= 2.7) {
        const bedW = Math.min(1.6, room.w - 1.0);
        const bedD = Math.min(2.0, room.d - 0.8);
        const bedX = room.x + 0.4;
        const bedY = room.y + room.d - bedD - 0.35;
        fRect(bedX, bedY, bedW, bedD);
        fLine(bedX, bedY + 0.05, bedX + bedW, bedY + 0.05, 0.32);
        fRect(bedX + 0.12, bedY + 0.12, bedW - 0.24, 0.34);
        if (room.w >= 3.5) fRect(room.x + room.w - 0.78, room.y + 0.35, 0.58, Math.min(1.6, room.d - 0.7));
      } else if (room.type === 'kitchen' && room.w >= 2.0 && room.d >= 1.9) {
        const counterW = Math.min(room.w - 0.5, 3.2);
        const counterX = room.x + 0.25;
        const counterY = room.y + 0.3;
        fRect(counterX, counterY, counterW, 0.58);
        fCircle(counterX + counterW * 0.24, counterY + 0.29, 0.19);
        for (let i = 0; i < 4; i += 1) {
          fCircle(counterX + counterW * 0.62 + (i % 2) * 0.22, counterY + 0.18 + Math.floor(i / 2) * 0.22, 0.07);
        }
        fLine(counterX + counterW, counterY, counterX + counterW, counterY + 0.58, 0.28);
      } else if (room.type === 'bath' && room.w >= 1.5 && room.d >= 1.5) {
        fRect(room.x + 0.3, room.y + room.d - 0.95, 0.58, 0.58);
        fCircle(room.x + 0.59, room.y + room.d - 0.66, 0.16);
        fCircle(room.x + room.w - 0.55, room.y + 0.55, 0.22);
        fRect(room.x + room.w - 0.95, room.y + room.d - 1.05, 0.7, 0.7);
      } else if (room.type === 'garage' && room.w >= 2.4 && room.d >= 3.0) {
        const carW = Math.min(1.85, room.w - 0.9);
        const carD = Math.min(4.0, room.d - 1.1);
        const carX = room.x + (room.w - carW) / 2;
        const carY = room.y + (room.d - carD) / 2;
        fRect(carX, carY, carW, carD);
        fLine(carX + 0.25, carY + 0.65, carX + carW - 0.25, carY + 0.65, 0.36);
        fCircle(carX + 0.25, carY + 0.25, 0.14);
        fCircle(carX + carW - 0.25, carY + 0.25, 0.14);
      } else if (room.type === 'hall' && room.w >= 1.6 && room.d >= 1.8) {
        fRect(room.x + 0.2, room.y + 0.25, 0.5, Math.min(1.6, room.d - 0.5));
      } else if (room.type === 'closet' && room.w >= 1.2) {
        fRect(room.x + 0.15, room.y + 0.2, room.w - 0.3, 0.5);
      }
    }
  }

  // --- Room labels ---------------------------------------------------------------
  for (const room of level.rooms) {
    const cx = X(room.x + room.w / 2);
    const cy = Y(room.y + room.d / 2);
    const widthMm = S(room.w);
    const heightMm = S(room.d);
    if (room.name === 'Коридор') {
      text(cx, cy, room.name, Math.min(2.0, heightMm * 0.42), COLORS.ink, 'middle', 700);
      continue;
    }
    if (room.type === 'stairs') {
      continue;
    }
    if (heightMm < 9 || widthMm < 10) {
      text(cx, cy, room.name.split(/[\s/]+/).filter(Boolean).slice(0, 2).join(' '), 1.65, COLORS.ink, 'middle', 600);
      continue;
    }
    let size = clamp(Math.min(widthMm, heightMm) / 6, 1.75, 2.8);
    let maxChars = Math.max(4, Math.floor((widthMm - 1.8) / (size * 0.56)));
    let nameLines = wrapText(room.name, maxChars);
    if (nameLines.length > 2) {
      size = Math.max(1.6, size * 0.82);
      maxChars = Math.max(5, Math.floor((widthMm - 1.8) / (size * 0.56)));
      nameLines = wrapText(room.name, maxChars).slice(0, 3);
    }
    const lineHeight = size * 1.15;
    const startY = cy - ((nameLines.length - 1) * lineHeight) / 2 - 1.2;
    nameLines.forEach((line, index) => text(cx, startY + index * lineHeight, line, size, COLORS.ink, 'middle', 700));
    const areaY = startY + (nameLines.length - 1) * lineHeight + lineHeight + 0.8;
    text(cx, areaY, areaLabel(room.area), Math.max(1.6, size - 0.55), COLORS.ink, 'middle');
    if (heightMm > 17) text(cx, areaY + 3.0, `${fmt(room.w, 2)} × ${fmt(room.d, 2)}`, Math.max(1.5, size - 0.8), COLORS.muted, 'middle');
  }

  // --- Entrance marker -------------------------------------------------------------
  const entrance = level.exteriorOpenings.find(opening => opening.type === 'door');
  if (entrance) {
    const x = X(entrance.start + entrance.width / 2);
    const y = Y(-0.45);
    text(x, y, 'ВХОД', 2.1, COLORS.accent, 'middle', 700);
    polygon([[x, y + 1.4], [x - 1.4, y + 3.2], [x + 1.4, y + 3.2]], COLORS.accent);
  }

  // --- North arrow and scale bar ---------------------------------------------------
  const northX = 398;
  const northY = 39;
  circle(northX, northY, 4.2, 'none', COLORS.frame, 0.25);
  polygon([[northX, northY - 3.4], [northX - 1.5, northY + 2.2], [northX, northY + 1.2], [northX + 1.5, northY + 2.2]], COLORS.ink);
  text(northX, northY - 5.6, 'С', 2.0, COLORS.ink, 'middle', 700);
  const scaleY = 239;
  const scaleX = 14;
  const scaleMeters = layout.scaleDen <= 100 ? 5 : 10;
  const scalePx = scaleMeters * ppm;
  rect(scaleX, scaleY - 1.1, scalePx, 2.2, COLORS.sheet, COLORS.ink, 0.2);
  rect(scaleX, scaleY - 1.1, scalePx / 2, 2.2, COLORS.ink);
  text(scaleX, scaleY + 2.6, '0', 1.8, COLORS.ink, 'middle');
  text(scaleX + scalePx / 2, scaleY + 2.6, fmt(scaleMeters / 2, 1), 1.8, COLORS.ink, 'middle');
  text(scaleX + scalePx, scaleY + 2.6, `${fmt(scaleMeters, 0)} m`, 1.8, COLORS.ink, 'middle');
  text(scaleX + scalePx + 3, scaleY, `Мащаб 1:${layout.scaleDen}`, 1.9, COLORS.muted, 'start', 600);

  // --- Schedule ---------------------------------------------------------------------
  const panelX = 288;
  const panelW = 119;
  const tableY = 48;
  text(panelX, tableY - 4.0, `ПОМЕЩЕНИЯ · ${level.label.toUpperCase()}`, 2.35, COLORS.ink, 'start', 700);
  const columns = [panelX, panelX + 9, panelX + 84, panelX + panelW];
  line(columns[0], tableY, columns[3], tableY, COLORS.frame, 0.3);
  text(columns[0] + 1, tableY + 3.2, '№', 1.9, COLORS.muted, 'start', 700);
  text(columns[1] + 1, tableY + 3.2, 'Помещение', 1.9, COLORS.muted, 'start', 700);
  text(columns[2] + 1, tableY + 3.2, 'Площ', 1.9, COLORS.muted, 'start', 700);
  line(columns[0], tableY + 5.2, columns[3], tableY + 5.2, COLORS.thin, 0.2);
  const rowHeight = 5.2;
  level.rooms.forEach((room, index) => {
    const y = tableY + 5.2 + rowHeight * index;
    text(columns[0] + 1, y + rowHeight / 2, String(index + 1).padStart(2, '0'), 1.9, COLORS.muted, 'start');
    text(columns[1] + 1, y + rowHeight / 2, room.name, 2.0, COLORS.ink, 'start', 500);
    text(columns[2] + 1, y + rowHeight / 2, areaLabel(room.area), 2.0, COLORS.ink, 'start');
    line(columns[0], y + rowHeight, columns[3], y + rowHeight, '#dce7e5', 0.15);
  });
  const totalY = tableY + 5.2 + rowHeight * level.rooms.length + 2.2;
  line(columns[0], totalY - 2.2, columns[3], totalY - 2.2, COLORS.frame, 0.25);
  text(columns[1] + 1, totalY, 'Обща площ на помещенията', 2.0, COLORS.ink, 'start', 700);
  text(columns[2] + 1, totalY, areaLabel(level.roomArea), 2.0, COLORS.ink, 'start', 700);
  text(columns[1] + 1, totalY + 5.0, 'Застроена площ', 1.9, COLORS.muted, 'start');
  text(columns[2] + 1, totalY + 5.0, areaLabel(plan.footprint), 1.9, COLORS.muted, 'start');
  text(columns[1] + 1, totalY + 9.6, 'РЗП (всички етажи)', 1.9, COLORS.muted, 'start');
  text(columns[2] + 1, totalY + 9.6, areaLabel(plan.grossArea), 1.9, COLORS.muted, 'start');

  const noteY = totalY + 17;
  text(panelX, noteY, 'ЗАБЕЛЕЖКИ', 2.1, COLORS.ink, 'start', 700);
  const notes = [
    'Планът е концептуален и е изготвен по зададените параметри.',
    'Не съдържа конструктивни изчисления, ВиК, електро и пожарна безопасност.',
    'Преди строителство или подаване в община го провери с правоспособен архитект и инженер.',
    'Размерите са в метри; мерната единица на чертежа е mm при посочения мащаб.',
  ];
  let lineY = noteY + 4.4;
  notes.forEach(note => {
    wrapText(note, 58).forEach(part => {
      text(panelX, lineY, part, 1.65, COLORS.muted);
      lineY += 3.2;
    });
    lineY += 0.6;
  });

  const scheduleStart = Math.max(lineY + 3.5, 178);
  if (scheduleStart < 224) {
    const typeNames = { door: 'Входна врата', balcony: 'Балконна врата', garage: 'Гаражна врата', window: 'Прозорец' };
    const rows = level.exteriorOpenings.map(opening => ({
      tag: openingTags.get(opening) || '',
      type: typeNames[opening.type] || opening.type,
      size: `${fmt(opening.width, 2)} × ${fmt(opening.height, 2)}`,
      priority: opening.type === 'door' ? 0 : opening.type === 'garage' ? 1 : opening.type === 'balcony' ? 2 : 3,
    })).filter(row => row.tag).sort((a, b) => a.priority - b.priority || a.tag.localeCompare(b.tag, 'bg'));
    text(panelX, scheduleStart, 'ДОГРАМА И ВЪНШНИ ВРАТИ', 2.1, COLORS.ink, 'start', 700);
    const scheduleColumns = [panelX, panelX + 12, panelX + 58, panelX + 104];
    line(scheduleColumns[0], scheduleStart + 3.4, scheduleColumns[3], scheduleStart + 3.4, COLORS.frame, 0.25);
    text(scheduleColumns[0], scheduleStart + 6.0, 'Озн.', 1.65, COLORS.muted, 'start', 700);
    text(scheduleColumns[1], scheduleStart + 6.0, 'Вид', 1.65, COLORS.muted, 'start', 700);
    text(scheduleColumns[2], scheduleStart + 6.0, 'Размер m', 1.65, COLORS.muted, 'start', 700);
    rows.slice(0, 9).forEach((row, index) => {
      const y = scheduleStart + 9.5 + index * 3.8;
      text(scheduleColumns[0], y, row.tag, 1.7, COLORS.accent, 'start', 700);
      text(scheduleColumns[1], y, row.type, 1.7, COLORS.ink);
      text(scheduleColumns[2], y, row.size, 1.7, COLORS.ink);
      line(scheduleColumns[0], y + 1.9, scheduleColumns[3], y + 1.9, '#dce7e5', 0.14);
    });
    if (rows.length > 9) text(panelX, scheduleStart + 9.5 + 9 * 3.8, `+ още ${rows.length - 9} отвора`, 1.6, COLORS.muted);
  }

  // --- Title block -------------------------------------------------------------------
  const blockX = 226;
  const blockY = 250;
  const blockW = 181;
  const blockH = 39;
  rect(blockX, blockY, blockW, blockH, COLORS.sheet, COLORS.frame, 0.35);
  line(blockX, blockY + 19, blockX + blockW, blockY + 19, COLORS.frame, 0.25);
  line(blockX + 108, blockY, blockX + 108, blockY + blockH, COLORS.frame, 0.25);
  line(blockX + 156, blockY, blockX + 156, blockY + blockH, COLORS.frame, 0.25);
  line(blockX, blockY + 30, blockX + blockW, blockY + 30, COLORS.frame, 0.25);

  text(blockX + 3, blockY + 4.2, 'ПРОЕКТ', 1.65, COLORS.muted, 'start', 700);
  text(blockX + 3, blockY + 8.4, String(plan.projectName || '').length > 46 ? `${String(plan.projectName).slice(0, 43)}…` : plan.projectName, 2.2, COLORS.ink, 'start', 600);
  text(blockX + 3, blockY + 12.4, `${plan.typeLabel} · ${fmt(plan.length, 2)} × ${fmt(plan.width, 2)} m`, 1.9, COLORS.ink);
  text(blockX + 3, blockY + 16.2, `${plan.floors} ${plan.floors === 1 ? 'етаж' : 'етажа'} · височина ${fmt(plan.floorHeight, 2)} m`, 1.8, COLORS.muted);

  text(blockX + 111, blockY + 4.2, 'ЕТАЖ', 1.65, COLORS.muted, 'start', 700);
  text(blockX + 111, blockY + 8.4, `${level.index + 1} от ${plan.floors}`, 2.2, COLORS.ink, 'start', 700);
  text(blockX + 111, blockY + 12.4, `Котин ${fmt(level.elevation, 2)} m`, 1.8, COLORS.ink);
  text(blockX + 111, blockY + 16.2, `Площ ${areaLabel(level.roomArea)}`, 1.8, COLORS.muted);

  text(blockX + 159, blockY + 4.2, 'МАЩАБ', 1.65, COLORS.muted, 'start', 700);
  text(blockX + 159, blockY + 8.4, `1:${layout.scaleDen}`, 2.2, COLORS.ink, 'start', 700);
  text(blockX + 159, blockY + 12.4, 'ДАТА', 1.65, COLORS.muted, 'start', 700);
  text(blockX + 159, blockY + 16.2, options.date || new Date().toLocaleDateString('bg-BG'), 1.8, COLORS.ink);

  text(blockX + 3, blockY + 23.2, 'ИЗГОТВИЛ', 1.6, COLORS.muted, 'start', 700);
  text(blockX + 3, blockY + 27.2, 'BuildAI · процедурен архитектурен план', 1.9, COLORS.ink);
  text(blockX + 3, blockY + 32.2, 'Концептуален план — не за строителство. Провери с архитект и инженер.', 1.65, COLORS.warning);
  text(blockX + 159, blockY + 23.2, 'ЛИСТ', 1.6, COLORS.muted, 'start', 700);
  text(blockX + 159, blockY + 27.2, `A-${String(level.index + 1).padStart(2, '0')} / ${String(plan.floors).padStart(2, '0')}`, 2.0, COLORS.ink, 'start', 700);
  text(blockX + 159, blockY + 32.2, 'BuildAI', 1.8, COLORS.accent, 'start', 700);

  return { primitives, layout, level, plan };
}

function svgNumber(value) {
  const rounded = Math.round(Number(value) * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function svgPrimitive(primitive) {
  const stroke = primitive.stroke && primitive.stroke !== 'none';
  const fill = primitive.fill && primitive.fill !== 'none';
  const dash = primitive.dash ? ` stroke-dasharray="${primitive.dash.map(value => svgNumber(value)).join(' ')}"` : '';
  const width = primitive.width ?? 0.25;
  switch (primitive.type) {
    case 'line':
      return `<line x1="${svgNumber(primitive.x1)}" y1="${svgNumber(primitive.y1)}" x2="${svgNumber(primitive.x2)}" y2="${svgNumber(primitive.y2)}" stroke="${primitive.color}" stroke-width="${svgNumber(primitive.width ?? 0.25)}" stroke-linecap="${primitive.cap || 'butt'}"${dash}/>`;
    case 'rect':
      return `<rect x="${svgNumber(primitive.x)}" y="${svgNumber(primitive.y)}" width="${svgNumber(primitive.w)}" height="${svgNumber(primitive.h)}" fill="${fill ? primitive.fill : 'none'}" stroke="${stroke ? primitive.stroke : 'none'}"${stroke ? ` stroke-width="${svgNumber(width)}"` : ''}${dash}/>`;
    case 'circle':
      return `<circle cx="${svgNumber(primitive.cx)}" cy="${svgNumber(primitive.cy)}" r="${svgNumber(primitive.r)}" fill="${fill ? primitive.fill : 'none'}" stroke="${stroke ? primitive.stroke : 'none'}"${stroke ? ` stroke-width="${svgNumber(width)}"` : ''}/>`;
    case 'arc': {
      const cx = primitive.cx;
      const cy = primitive.cy;
      const r = primitive.r;
      const a0 = primitive.a0;
      const a1 = primitive.a1;
      const sx = cx + Math.cos(a0) * r;
      const sy = cy + Math.sin(a0) * r;
      const ex = cx + Math.cos(a1) * r;
      const ey = cy + Math.sin(a1) * r;
      const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
      const sweep = a1 > a0 ? 1 : 0;
      return `<path d="M ${svgNumber(sx)} ${svgNumber(sy)} A ${svgNumber(r)} ${svgNumber(r)} 0 ${large} ${sweep} ${svgNumber(ex)} ${svgNumber(ey)}" fill="none" stroke="${primitive.color}" stroke-width="${svgNumber(width)}"${dash}/>`;
    }
    case 'polygon':
      return `<polygon points="${primitive.points.map(point => `${svgNumber(point[0])},${svgNumber(point[1])}`).join(' ')}" fill="${fill ? primitive.fill : 'none'}" stroke="${stroke ? primitive.stroke : 'none'}"${stroke ? ` stroke-width="${svgNumber(width)}"` : ''}/>`;
    case 'text': {
      const anchor = primitive.anchor === 'middle' ? 'middle' : primitive.anchor === 'end' ? 'end' : 'start';
      const baseline = primitive.baseline === 'middle' ? 'middle' : 'alphabetic';
      return `<text x="${svgNumber(primitive.x)}" y="${svgNumber(primitive.y)}" font-size="${svgNumber(primitive.size)}" font-weight="${primitive.weight || 400}" fill="${primitive.color}" text-anchor="${anchor}" dominant-baseline="${baseline}">${escapeXml(primitive.text)}</text>`;
    }
    default:
      return '';
  }
}

export function planToSvg(plan, levelIndex = 0, options = {}) {
  const sheet = buildPlanSheet(plan, levelIndex, options);
  const body = sheet.primitives.map(svgPrimitive).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.width} ${SHEET.height}" width="${SHEET.width}mm" height="${SHEET.height}mm" role="img" aria-label="Архитектурен план: ${escapeXml(plan.projectName)}" font-family="Arial, Helvetica, sans-serif" shape-rendering="geometricPrecision">${body}</svg>`;
}

export function planSheetInfo(plan, levelIndex = 0, options = {}) {
  const sheet = buildPlanSheet(plan, levelIndex, options);
  return {
    scaleDen: sheet.layout.scaleDen,
    levelLabel: sheet.level.label,
    rooms: sheet.level.rooms.length,
    roomArea: sheet.level.roomArea,
  };
}

function paintPrimitive(context, primitive, scale) {
  const stroke = primitive.stroke && primitive.stroke !== 'none';
  const fill = primitive.fill && primitive.fill !== 'none';
  context.save();
  context.setLineDash(primitive.dash ? primitive.dash.map(value => value * scale) : []);
  context.lineWidth = (primitive.width ?? 0.25) * scale;
  context.strokeStyle = primitive.stroke || primitive.color || COLORS.ink;
  context.fillStyle = primitive.fill || primitive.color || COLORS.ink;
  context.lineCap = primitive.cap || 'butt';
  switch (primitive.type) {
    case 'line':
      context.beginPath();
      context.moveTo(primitive.x1 * scale, primitive.y1 * scale);
      context.lineTo(primitive.x2 * scale, primitive.y2 * scale);
      context.stroke();
      break;
    case 'rect':
      context.beginPath();
      context.rect(primitive.x * scale, primitive.y * scale, primitive.w * scale, primitive.h * scale);
      if (fill) context.fill();
      if (stroke) context.stroke();
      break;
    case 'circle':
      context.beginPath();
      context.arc(primitive.cx * scale, primitive.cy * scale, primitive.r * scale, 0, Math.PI * 2);
      if (fill) context.fill();
      if (stroke) context.stroke();
      break;
    case 'arc':
      context.beginPath();
      context.arc(primitive.cx * scale, primitive.cy * scale, primitive.r * scale, primitive.a0, primitive.a1, primitive.a1 < primitive.a0);
      context.stroke();
      break;
    case 'polygon':
      context.beginPath();
      primitive.points.forEach((point, index) => {
        if (index === 0) context.moveTo(point[0] * scale, point[1] * scale);
        else context.lineTo(point[0] * scale, point[1] * scale);
      });
      context.closePath();
      if (fill) context.fill();
      if (stroke) context.stroke();
      break;
    case 'text': {
      const weight = primitive.weight || 400;
      context.font = `${weight} ${primitive.size * scale}px Arial, Helvetica, sans-serif`;
      context.textAlign = primitive.anchor === 'middle' ? 'center' : primitive.anchor === 'end' ? 'right' : 'left';
      context.textBaseline = 'middle';
      context.fillStyle = primitive.color || COLORS.ink;
      context.fillText(primitive.text, primitive.x * scale, primitive.y * scale);
      break;
    }
    default:
      break;
  }
  context.restore();
}

export function planToCanvas(plan, levelIndex = 0, pxPerMm = 7, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(SHEET.width * pxPerMm);
  canvas.height = Math.round(SHEET.height * pxPerMm);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузърът не предоставя 2D canvas за PDF плана.');
  context.fillStyle = COLORS.sheet;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const sheet = buildPlanSheet(plan, levelIndex, options);
  for (const primitive of sheet.primitives) paintPrimitive(context, primitive, pxPerMm);
  return canvas;
}

function pdfTextString(value) {
  const text = String(value || 'BuildAI');
  let hex = 'FEFF';
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code <= 0xffff) hex += code.toString(16).padStart(4, '0');
    else {
      const normalized = code - 0x10000;
      hex += (0xd800 + (normalized >> 10)).toString(16).padStart(4, '0');
      hex += (0xdc00 + (normalized & 0x3ff)).toString(16).padStart(4, '0');
    }
  }
  return `<${hex}>`;
}

export function buildPdfFromJpegPages(pages, meta = {}) {
  if (!pages.length) throw new Error('Няма страници за PDF.');
  const encoder = new TextEncoder();
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = data => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObject = number => {
    offsets[number] = length;
    push(`${number} 0 obj\n`);
  };
  const endObject = () => push('\nendobj\n');

  push('%PDF-1.4\n%âãÏÓ\n');
  const pageCount = pages.length;
  const pageObjects = pages.map((_page, index) => 4 + index * 3);
  const contentObjects = pages.map((_page, index) => 5 + index * 3);
  const imageObjects = pages.map((_page, index) => 6 + index * 3);

  startObject(1);
  push('<< /Type /Catalog /Pages 2 0 R >>');
  endObject();

  startObject(2);
  push(`<< /Type /Pages /Kids [${pageObjects.map(number => `${number} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  endObject();

  startObject(3);
  const creation = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  push(`<< /Title ${pdfTextString(meta.title || 'BuildAI архитектурен план')} /Author ${pdfTextString('BuildAI')} /Creator ${pdfTextString('BuildAI architectural plan')} /Producer ${pdfTextString('BuildAI')} /CreationDate (D:${creation}) >>`);
  endObject();

  const mediaWidth = 1190.551;
  const mediaHeight = 841.89;
  pages.forEach((page, index) => {
    const pageNumber = pageObjects[index];
    const contentNumber = contentObjects[index];
    const imageNumber = imageObjects[index];

    startObject(pageNumber);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mediaWidth.toFixed(3)} ${mediaHeight.toFixed(3)}] /Resources << /XObject << /Im0 ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`);
    endObject();

    const content = `q\n${mediaWidth.toFixed(3)} 0 0 ${mediaHeight.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentBytes = encoder.encode(content);
    startObject(contentNumber);
    push(`<< /Length ${contentBytes.length} >>\nstream\n`);
    push(contentBytes);
    push('\nendstream');
    endObject();

    startObject(imageNumber);
    push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);
    push(page.bytes);
    push('\nendstream');
    endObject();
  });

  const maxObject = 3 + pageCount * 3;
  const xrefOffset = length;
  let xref = `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let number = 1; number <= maxObject; number += 1) {
    xref += `${String(offsets[number] || 0).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${maxObject + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const output = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
  return output;
}

async function canvasToJpegBytes(canvas, quality = 0.92) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не успях да кодирам PDF страницата като JPEG.')), 'image/jpeg', quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function planPdfBlob(plan, options = {}) {
  const pages = [];
  for (let index = 0; index < plan.levels.length; index += 1) {
    const canvas = planToCanvas(plan, index, options.pxPerMm || 7, { ...options, date: options.date });
    const bytes = await canvasToJpegBytes(canvas, 0.92);
    pages.push({ bytes, width: canvas.width, height: canvas.height });
    canvas.width = 1;
    canvas.height = 1;
  }
  const bytes = buildPdfFromJpegPages(pages, { title: `${plan.projectName} · архитектурен план` });
  return new Blob([bytes], { type: 'application/pdf' });
}

function dxfNumber(value) {
  const rounded = Math.round(Number(value) * 10000) / 10000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function dxfLine(x1, y1, x2, y2, layer = 'WALLS') {
  return `0\nLINE\n8\n${layer}\n10\n${dxfNumber(x1)}\n20\n${dxfNumber(y1)}\n30\n0\n11\n${dxfNumber(x2)}\n21\n${dxfNumber(y2)}\n31\n0\n`;
}

function dxfText(x, y, height, value, layer = 'LABELS', rotation = 0) {
  const safe = String(value ?? '').replace(/[\r\n]+/g, ' ').slice(0, 240);
  return `0\nTEXT\n8\n${layer}\n10\n${dxfNumber(x)}\n20\n${dxfNumber(y)}\n30\n0\n40\n${dxfNumber(height)}\n1\n${safe}\n50\n${dxfNumber(rotation)}\n7\nSTANDARD\n`;
}

function dxfPolyline(points, closed, layer = 'WALLS') {
  const rows = points.map(point => `10\n${dxfNumber(point[0])}\n20\n${dxfNumber(point[1])}\n`).join('');
  return `0\nLWPOLYLINE\n8\n${layer}\n90\n${points.length}\n70\n${closed ? 1 : 0}\n${rows}`;
}

function dxfArc(cx, cy, radius, a0, a1, layer = 'DOORS') {
  let start = -a0 * 180 / Math.PI;
  let end = -a1 * 180 / Math.PI;
  start = ((start % 360) + 360) % 360;
  end = ((end % 360) + 360) % 360;
  if (end < start) end += 360;
  return `0\nARC\n8\n${layer}\n10\n${dxfNumber(cx)}\n20\n${dxfNumber(-cy)}\n30\n0\n40\n${dxfNumber(radius)}\n50\n${dxfNumber(start)}\n51\n${dxfNumber(end)}\n`;
}

export function planToDxf(plan, levelIndex = 0, options = {}) {
  const level = plan.levels[clamp(levelIndex, 0, plan.levels.length - 1)];
  const L = plan.length;
  const W = plan.width;
  let entities = '';
  const add = value => { entities += value; };

  // Walls: outer and inner face + interior partitions.
  add(dxfPolyline([[0, -0], [L, -0], [L, -W], [0, -W]], true, 'WALLS'));
  add(dxfPolyline([[EXT_WALL, -EXT_WALL], [L - EXT_WALL, -EXT_WALL], [L - EXT_WALL, -(W - EXT_WALL)], [EXT_WALL, -(W - EXT_WALL)]], true, 'WALLS'));
  for (const wall of level.interiorWalls) add(dxfLine(wall.x1, -wall.y1, wall.x2, -wall.y2, 'WALLS'));
  for (const room of level.rooms) {
    add(dxfPolyline([[room.x, -room.y], [room.x + room.w, -room.y], [room.x + room.w, -(room.y + room.d)], [room.x, -(room.y + room.d)]], true, 'ROOMS'));
  }

  // Exterior openings.
  for (const opening of level.exteriorOpenings) {
    const side = opening.side;
    const start = opening.start;
    const end = opening.start + opening.width;
    if (side === 'S' || side === 'N') {
      const yOuter = side === 'S' ? 0 : W;
      const yInner = side === 'S' ? EXT_WALL : W - EXT_WALL;
      add(dxfLine(start, -yOuter, start, -yInner, 'OPENINGS'));
      add(dxfLine(end, -yOuter, end, -yInner, 'OPENINGS'));
      if (opening.type === 'window') {
        const y1 = yOuter + (yInner - yOuter) * 0.33;
        const y2 = yOuter + (yInner - yOuter) * 0.67;
        add(dxfLine(start, -y1, end, -y1, 'WINDOWS'));
        add(dxfLine(start, -y2, end, -y2, 'WINDOWS'));
      } else if (opening.type === 'garage') {
        add(dxfLine(start, -(yOuter + (yInner - yOuter) * 0.5), end, -(yOuter + (yInner - yOuter) * 0.5), 'DOORS'));
      } else {
        const hingeX = start;
        const hingeY = side === 'S' ? EXT_WALL : W - EXT_WALL;
        const dir = side === 'S' ? 1 : -1;
        add(dxfLine(hingeX, -hingeY, hingeX, -(hingeY + dir * opening.width), 'DOORS'));
        add(dxfArc(hingeX, hingeY, opening.width, side === 'S' ? 0 : 0, side === 'S' ? Math.PI / 2 : -Math.PI / 2, 'DOORS'));
      }
    } else {
      const xOuter = side === 'W' ? 0 : L;
      const xInner = side === 'W' ? EXT_WALL : L - EXT_WALL;
      add(dxfLine(xOuter, -start, xInner, -start, 'OPENINGS'));
      add(dxfLine(xOuter, -end, xInner, -end, 'OPENINGS'));
      if (opening.type === 'window') {
        const x1 = xOuter + (xInner - xOuter) * 0.33;
        const x2 = xOuter + (xInner - xOuter) * 0.67;
        add(dxfLine(x1, -start, x1, -end, 'WINDOWS'));
        add(dxfLine(x2, -start, x2, -end, 'WINDOWS'));
      } else {
        const hingeX = side === 'W' ? EXT_WALL : L - EXT_WALL;
        const hingeY = start;
        const dir = side === 'W' ? 1 : -1;
        add(dxfLine(hingeX, -hingeY, hingeX + dir * opening.width, -hingeY, 'DOORS'));
        add(dxfArc(hingeX, hingeY, opening.width, side === 'W' ? Math.PI / 2 : Math.PI / 2, side === 'W' ? 0 : Math.PI, 'DOORS'));
      }
    }
  }

  // Interior doors.
  for (const door of level.interiorDoors) {
    if (door.axis === 'v') {
      add(dxfLine(door.at, -door.from, door.at, -door.to, 'OPENINGS'));
      if (!door.open) {
        add(dxfLine(door.at, -door.from, door.at + door.dir * door.width, -door.from, 'DOORS'));
        add(dxfArc(door.at, door.from, door.width, Math.PI / 2, door.dir > 0 ? 0 : Math.PI, 'DOORS'));
      }
    } else {
      add(dxfLine(door.from, -door.at, door.to, -door.at, 'OPENINGS'));
      if (!door.open) {
        add(dxfLine(door.from, -door.at, door.from, -(door.at + door.dir * door.width), 'DOORS'));
        add(dxfArc(door.from, door.at, door.width, 0, door.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 'DOORS'));
      }
    }
  }

  // Stairs.
  if (level.stairs) {
    const stairs = level.stairs;
    const alongX = stairs.w >= stairs.d;
    const runWidth = Math.min(1.15, (alongX ? stairs.d : stairs.w) - 0.35);
    if (runWidth > 0.55) {
      if (alongX) {
        const y = stairs.y + stairs.d / 2 - runWidth / 2;
        add(dxfPolyline([[stairs.x + 0.2, -y], [stairs.x + stairs.w - 0.2, -y], [stairs.x + stairs.w - 0.2, -(y + runWidth)], [stairs.x + 0.2, -(y + runWidth)]], true, 'STAIRS'));
        const count = Math.max(3, Math.floor((stairs.w - 0.4) / 0.28));
        for (let index = 1; index < count; index += 1) {
          const x = stairs.x + 0.2 + (stairs.w - 0.4) * index / count;
          add(dxfLine(x, -y, x, -(y + runWidth), 'STAIRS'));
        }
      } else {
        const x = stairs.x + stairs.w / 2 - runWidth / 2;
        add(dxfPolyline([[x, -(stairs.y + 0.2)], [x + runWidth, -(stairs.y + 0.2)], [x + runWidth, -(stairs.y + stairs.d - 0.2)], [x, -(stairs.y + stairs.d - 0.2)]], true, 'STAIRS'));
        const count = Math.max(3, Math.floor((stairs.d - 0.4) / 0.28));
        for (let index = 1; index < count; index += 1) {
          const y = stairs.y + 0.2 + (stairs.d - 0.4) * index / count;
          add(dxfLine(x, -y, x + runWidth, -y, 'STAIRS'));
        }
      }
    }
  }

  // Balconies.
  for (const balcony of level.balconies) {
    add(dxfPolyline([[balcony.x, -balcony.y], [balcony.x + balcony.w, -balcony.y], [balcony.x + balcony.w, -(balcony.y + balcony.d)], [balcony.x, -(balcony.y + balcony.d)]], true, 'BALCONY'));
    add(dxfText(balcony.x + balcony.w / 2, -(balcony.y + balcony.d / 2), 0.18, 'Балкон', 'LABELS'));
  }

  // Dimensions.
  add(dxfLine(0, 1.05, L, 1.05, 'DIMENSIONS'));
  add(dxfLine(0, 1.45, 0, 0.9, 'DIMENSIONS'));
  add(dxfLine(L, 1.45, L, 0.9, 'DIMENSIONS'));
  add(dxfText(L / 2, 1.45, 0.22, `${fmt(L, 2)} m`, 'DIMENSIONS'));
  add(dxfLine(-1.05, 0, -1.05, -W, 'DIMENSIONS'));
  add(dxfLine(-1.45, 0, -0.9, 0, 'DIMENSIONS'));
  add(dxfLine(-1.45, -W, -0.9, -W, 'DIMENSIONS'));
  add(dxfText(-2.1, -W / 2, 0.22, `${fmt(W, 2)} m`, 'DIMENSIONS'));

  // Room labels.
  for (const room of level.rooms) {
    const x = room.x + room.w / 2;
    const y = room.y + room.d / 2;
    add(dxfText(x, -y + 0.2, 0.24, room.name, 'LABELS'));
    add(dxfText(x, -y - 0.2, 0.18, `${fmt(room.area, 1)} m² · ${fmt(room.w, 2)} × ${fmt(room.d, 2)}`, 'LABELS'));
  }

  // Sheet info in model space (text only; the DXF is a drawing, not a sheet layout).
  add(dxfText(0, 3.0, 0.32, `BuildAI · ${plan.projectName}`, 'SHEET'));
  add(dxfText(0, 2.5, 0.22, `${level.label} · мащаб 1:${options.scaleDen || 100} · концептуален план, не за строителство`, 'SHEET'));

  const header = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1021\n9\n$INSUNITS\n70\n6\n9\n$DWGCODEPAGE\n3\nUTF-8\n9\n$EXTMIN\n10\n${dxfNumber(-3)}\n20\n${dxfNumber(-W - 3)}\n30\n0\n9\n$EXTMAX\n10\n${dxfNumber(L + 3)}\n20\n${dxfNumber(4)}\n30\n0\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
  return `${header}${entities}0\nENDSEC\n0\nEOF\n`;
}
