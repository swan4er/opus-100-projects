/* ================================================================
   Демо-режим: заготовленные сцены и правки в том же формате,
   что отвечает нейросеть. Плюс маленький разборщик фраз без сети:
   «ночь», «дождь», «добавь кота» — понимает, остальное — честно нет.
   ================================================================ */
(function () {
  'use strict';
  const D = {};

  // ---------- заготовленные сцены ----------
  D.scenes = [
    {
      q: 'Мельница у пруда на закате',
      reply: 'Мельница машет крыльями, утки при деле, бабушка у колодца. Закат включён.',
      title: 'Мельница у пруда', clear: true,
      env: { time: 'sunset', weather: 'clear', ground: 'meadow', sea: 0, wind: 0.35 },
      add: [
        { id: 'mill', type: 'windmill', x: -3.4, z: -3.0, rot: 20, anim: 'spin', speed: 0.7 },
        { id: 'cottage', type: 'house', kind: 'cottage', x: 3.9, z: -3.6, rot: -28, color: '#efe2c6', color2: '#c4533a' },
        { id: 'barn', type: 'house', kind: 'barn', x: -6.6, z: 1.6, rot: 70 },
        { id: 'pond', type: 'pond', kind: 'lilies', x: 3.6, z: 2.6 },
        { id: 'well', type: 'well', x: 0.4, z: -0.9 },
        { id: 'oak1', type: 'tree', kind: 'oak', x: -7.0, z: -3.6 },
        { id: 'birch1', type: 'tree', kind: 'birch', x: 7.3, z: -1.0 },
        { id: 'pine1', type: 'tree', kind: 'pine', x: 0.6, z: -7.6 },
        { id: 'birch2', type: 'tree', kind: 'birch', x: -2.4, z: -7.2 },
        { id: 'oak2', type: 'tree', kind: 'oak', x: 6.9, z: 4.4, s: 0.9 },
        { id: 'apple1', type: 'tree', kind: 'apple', x: -5.4, z: 5.4, s: 0.85 },
        { id: 'fir1', type: 'tree', kind: 'fir', x: 4.2, z: -7.4, s: 0.9 },
        { id: 'fence1', type: 'fence', kind: 'picket', x: 3.7, z: -1.0, rot: 0, n: 4 },
        { id: 'flowers1', type: 'flowers', kind: 'meadow', x: -1.6, z: 2.6 },
        { id: 'flowers2', type: 'flowers', kind: 'sunflowers', x: 6.2, z: -4.6 },
        { id: 'flowers3', type: 'flowers', kind: 'tulips', x: 1.2, z: 5.4 },
        { id: 'bush1', type: 'bush', kind: 'berry', x: -3.2, z: 6.8 },
        { id: 'bush2', type: 'bush', kind: 'round', x: 8.0, z: 1.8 },
        { id: 'hay1', type: 'crate', kind: 'hay', x: -4.4, z: -0.4, rot: 30 },
        { id: 'barrel1', type: 'barrel', x: -4.9, z: 3.9 },
        { id: 'lamp1', type: 'lamp', kind: 'street', x: 1.9, z: -2.6 },
        { id: 'bench1', type: 'bench', x: 6.4, z: 0.9, rot: -80 },
        { id: 'mush1', type: 'mushroom', kind: 'amanita', x: -7.8, z: -1.2 },
        { id: 'mush2', type: 'mushroom', kind: 'amanita', x: -7.4, z: -0.6, s: 0.7 },
        { id: 'grandma', type: 'person', kind: 'grandma', x: 1.3, z: -0.1, rot: -30, anim: 'wave' },
        { id: 'kid', type: 'person', kind: 'child', x: -0.4, z: 2.0, anim: 'hop' },
        { id: 'farmer', type: 'person', kind: 'man', x: -4.2, z: 1.4, rot: 60, color: '#5c7fa8' },
        { id: 'cow1', type: 'animal', kind: 'cow', x: -2.6, z: 4.4, rot: 110 },
        { id: 'sheep1', type: 'animal', kind: 'sheep', x: -0.8, z: 5.6, rot: 200 },
        { id: 'sheep2', type: 'animal', kind: 'sheep', x: 0.2, z: 6.8, rot: 150, s: 0.85 },
        { id: 'cat1', type: 'animal', kind: 'cat', on: 'cottage', x: 3.9, z: -3.6, anim: 'sleep' },
        { id: 'dog1', type: 'animal', kind: 'dog', x: 1.0, z: 1.4, anim: 'walk' },
        { id: 'duck1', type: 'animal', kind: 'duck', on: 'pond', x: 3.6, z: 2.6, anim: 'swim' },
        { id: 'duck2', type: 'animal', kind: 'duck', on: 'pond', x: 3.6, z: 2.6, anim: 'swim', color: '#f2e6b8' },
        { id: 'hen1', type: 'animal', kind: 'chicken', x: -3.4, z: 2.4, anim: 'hop', speed: 0.6 },
        { id: 'balloon1', type: 'balloon', kind: 'hot', x: 5.8, z: -5.4, y: 5.4, anim: 'bob', color: '#e2503a', color2: '#f2c94c' },
        { id: 'birds1', type: 'bird', kind: 'songbird', n: 4, x: -4, z: 2, y: 7.5, anim: 'fly' },
        { id: 'cloud1', type: 'cloud', x: -5.5, z: -5.5, y: 10.2 },
        { id: 'cloud2', type: 'cloud', x: 6, z: 3, y: 9.4, s: 0.8 },
      ],
      hints: ['сделай ночь', 'добавь дождь', 'пусть все танцуют'],
    },
    {
      q: 'Маяк на скале, шторм, ночь',
      reply: 'Шторм заказан, луч маяка крутится, рыбак держится молодцом.',
      title: 'Маяк в шторм', clear: true,
      env: { time: 'night', weather: 'storm', ground: 'rock', sea: 0.55, wind: 0.8 },
      add: [
        { id: 'cliff', type: 'cliff', kind: 'rock', x: -1.8, z: -1.8, n: 3 },
        { id: 'lighthouse', type: 'lighthouse', on: 'cliff', x: -1.8, z: -1.8, anim: 'spin' },
        { id: 'hut', type: 'house', kind: 'cottage', x: 2.9, z: -2.4, rot: -25, color: '#b9ab96', color2: '#3e4a5a' },
        { id: 'pine1', type: 'tree', kind: 'pine', x: -4.9, z: -3.4 },
        { id: 'fir1', type: 'tree', kind: 'fir', x: 4.4, z: -4.6, s: 0.85 },
        { id: 'fir2', type: 'tree', kind: 'fir', x: -5.3, z: 0.4, s: 0.75 },
        { id: 'rock1', type: 'rock', kind: 'boulder', x: 7.9, z: 1.2, s: 1.4 },
        { id: 'rock2', type: 'rock', kind: 'flat', x: -3.6, z: 3.4 },
        { id: 'rock3', type: 'rock', kind: 'boulder', x: -8.2, z: -3.4, s: 1.2 },
        { id: 'fence1', type: 'fence', kind: 'stone', x: 0.4, z: 3.9, rot: 10, n: 3 },
        { id: 'lamp1', type: 'lamp', kind: 'lantern', x: 1.5, z: 0.1 },
        { id: 'barrel1', type: 'barrel', x: 3.8, z: 0.6 },
        { id: 'barrel2', type: 'barrel', x: 4.4, z: 1.2, s: 0.8 },
        { id: 'crate1', type: 'crate', x: 3.2, z: 1.3, rot: 20 },
        { id: 'flag1', type: 'flag', x: -0.1, z: 1.2, color: '#c9443a' },
        { id: 'reeds1', type: 'grass', kind: 'reeds', x: -1.8, z: 5.2 },
        { id: 'fisher', type: 'person', kind: 'fisher', x: 1.9, z: 4.4, rot: 10 },
        { id: 'kid', type: 'person', kind: 'child', x: 0.9, z: 1.9, anim: 'wave', color: '#3f7fd0' },
        { id: 'cat1', type: 'animal', kind: 'cat', on: 'hut', x: 2.9, z: -2.4, color: '#4a4a52' },
        { id: 'boat1', type: 'boat', kind: 'sail', x: 4.6, z: 6.6, rot: 20, anim: 'bob' },
        { id: 'ship1', type: 'boat', kind: 'ship', x: -7.2, z: 5.0, rot: 35, anim: 'bob', speed: 0.8 },
        { id: 'boat2', type: 'boat', kind: 'rowboat', x: 7.0, z: -4.4, rot: -60, anim: 'bob' },
        { id: 'dolphin', type: 'fish', kind: 'dolphin', x: -5.4, z: -7.2 },
        { id: 'gulls', type: 'bird', kind: 'gull', n: 3, x: 3, z: 3, y: 7.2, anim: 'fly' },
      ],
      hints: ['сделай утро', 'убери шторм', 'добавь корабль'],
    },
    {
      q: 'Зимняя деревня вечером',
      reply: 'Снег идёт, окна тёплые, снеговик уже обзавёлся морковкой.',
      title: 'Зимняя деревня', clear: true,
      env: { time: 'night', weather: 'snow', ground: 'snow', sea: 0, wind: 0.15 },
      add: [
        { id: 'izba1', type: 'house', kind: 'izba', x: -3.9, z: -2.8, rot: 25 },
        { id: 'izba2', type: 'house', kind: 'izba', x: 3.8, z: -3.3, rot: -30, color: '#8a5a36', color2: '#7a3a2e' },
        { id: 'tower', type: 'house', kind: 'tower', x: 0.2, z: -6.6, color: '#efe6d6', color2: '#3e6a5a' },
        { id: 'elka', type: 'tree', kind: 'fir', x: 0.3, z: -1.6, s: 1.15 },
        { id: 'fir1', type: 'tree', kind: 'fir', x: -7.2, z: -2.6 },
        { id: 'fir2', type: 'tree', kind: 'fir', x: -6.4, z: 3.0, s: 0.9 },
        { id: 'fir3', type: 'tree', kind: 'fir', x: 7.2, z: 0.6 },
        { id: 'fir4', type: 'tree', kind: 'pine', x: 6.6, z: -5.2, s: 0.9 },
        { id: 'fir5', type: 'tree', kind: 'fir', x: -3.2, z: -7.6, s: 0.85 },
        { id: 'fir6', type: 'tree', kind: 'fir', x: 5.0, z: 5.8, s: 0.8 },
        { id: 'fence1', type: 'fence', kind: 'picket', x: -4.2, z: 0.6, rot: 25, n: 4 },
        { id: 'lamp1', type: 'lamp', kind: 'street', x: -1.4, z: 0.9 },
        { id: 'lamp2', type: 'lamp', kind: 'street', x: 2.8, z: 2.9 },
        { id: 'lantern1', type: 'lamp', kind: 'paper', x: 2.1, z: -1.2, color: '#e2503a' },
        { id: 'gift1', type: 'gift', x: 1.3, z: -0.5 },
        { id: 'gift2', type: 'gift', x: -0.8, z: -0.3, color: '#3f7fd0', color2: '#f4f1ea' },
        { id: 'gift3', type: 'gift', x: 0.4, z: 0.3, s: 0.8, color: '#5c9e48' },
        { id: 'snowman', type: 'snowman', x: 3.2, z: 0.9, rot: -20 },
        { id: 'bench1', type: 'bench', x: -2.9, z: 3.6, rot: 20 },
        { id: 'sled', type: 'custom', name: 'санки', x: 4.4, z: 2.6, rot: -40, parts: [
          { shape: 'box', p: [0, 0.35, 0], s: [0.7, 0.08, 1.3], color: '#c7423a' },
          { shape: 'box', p: [-0.3, 0.12, 0], s: [0.06, 0.06, 1.5], color: '#6e4c34' },
          { shape: 'box', p: [0.3, 0.12, 0], s: [0.06, 0.06, 1.5], color: '#6e4c34' },
          { shape: 'box', p: [-0.3, 0.24, 0.5], s: [0.06, 0.22, 0.06], color: '#6e4c34' },
          { shape: 'box', p: [0.3, 0.24, 0.5], s: [0.06, 0.22, 0.06], color: '#6e4c34' },
          { shape: 'box', p: [-0.3, 0.24, -0.5], s: [0.06, 0.22, 0.06], color: '#6e4c34' },
          { shape: 'box', p: [0.3, 0.24, -0.5], s: [0.06, 0.22, 0.06], color: '#6e4c34' },
        ] },
        { id: 'grandpa', type: 'person', kind: 'grandpa', on: 'bench1', x: -2.9, z: 3.6, rot: 20 },
        { id: 'kid1', type: 'person', kind: 'child', x: 0.9, z: 2.4, anim: 'hop' },
        { id: 'kid2', type: 'person', kind: 'child', x: -0.4, z: 3.2, anim: 'dance', color: '#3f7fd0', color2: '#f2c94c' },
        { id: 'mom', type: 'person', kind: 'woman', x: 2.2, z: 4.6, rot: -30, anim: 'wave', color: '#6e8b6a' },
        { id: 'dog1', type: 'animal', kind: 'dog', x: -1.8, z: 5.2, anim: 'walk', color: '#d9c09a' },
        { id: 'crows', type: 'bird', kind: 'crow', n: 2, x: -5, z: -4, y: 6.8, anim: 'fly', speed: 0.7 },
      ],
      hints: ['сделай утро', 'добавь каток', 'пусть все танцуют'],
    },
    {
      q: 'Лагерь на Марсе',
      reply: 'Ракета на месте, купол надут, марсоход греет колёса. Воздух — по записи.',
      title: 'Лагерь на Марсе', clear: true,
      env: { time: 'day', weather: 'clear', ground: 'mars', sea: 0, wind: 0.2, sky: ['#3a2244', '#e2946a'] },
      add: [
        { id: 'rocket', type: 'rocket', x: -3.6, z: -3.4, s: 1.15 },
        { id: 'volcano', type: 'mountain', kind: 'volcano', x: 3.9, z: -6.2, s: 0.8, color: '#8a4a36' },
        { id: 'dome', type: 'custom', name: 'купол', x: -5.4, z: 1.8, parts: [
          { shape: 'cylinder', p: [0, 0.1, 0], s: [3.2, 0.2, 3.2], color: '#b8bec6', mat: 'metal' },
          { shape: 'sphere', p: [0, 0.2, 0], s: [3, 3, 3], color: '#bfe8ff', mat: 'glass' },
          { shape: 'box', p: [0, 0.55, 1.45], s: [0.7, 0.9, 0.4], color: '#e8eaec' },
          { shape: 'ring', p: [0, 0.25, 0], s: [3.2, 3.2, 3.2], r: [90, 0, 0], color: '#8e949c', mat: 'metal' },
          { shape: 'sphere', p: [0, 1.0, 0], s: [0.5, 0.5, 0.5], color: '#ffd98a', mat: 'glow' },
        ] },
        { id: 'rover', type: 'custom', name: 'марсоход', x: 2.3, z: 3.9, rot: -35, parts: [
          { shape: 'box', p: [0, 0.62, 0], s: [1.1, 0.35, 1.7], color: '#e8e4dc' },
          { shape: 'cylinder', p: [-0.62, 0.3, 0.6], s: [0.5, 0.2, 0.5], r: [0, 0, 90], color: '#34373d' },
          { shape: 'cylinder', p: [0.62, 0.3, 0.6], s: [0.5, 0.2, 0.5], r: [0, 0, 90], color: '#34373d' },
          { shape: 'cylinder', p: [-0.62, 0.3, 0], s: [0.5, 0.2, 0.5], r: [0, 0, 90], color: '#34373d' },
          { shape: 'cylinder', p: [0.62, 0.3, 0], s: [0.5, 0.2, 0.5], r: [0, 0, 90], color: '#34373d' },
          { shape: 'cylinder', p: [-0.62, 0.3, -0.6], s: [0.5, 0.2, 0.5], r: [0, 0, 90], color: '#34373d' },
          { shape: 'cylinder', p: [0.62, 0.3, -0.6], s: [0.5, 0.2, 0.5], r: [0, 0, 90], color: '#34373d' },
          { shape: 'cylinder', p: [0.3, 1.2, 0.5], s: [0.08, 0.9, 0.08], color: '#8e949c', mat: 'metal' },
          { shape: 'box', p: [0.3, 1.7, 0.5], s: [0.4, 0.25, 0.2], color: '#e8e4dc' },
          { shape: 'cone', p: [-0.2, 1.05, -0.4], s: [0.7, 0.2, 0.7], r: [180, 0, 0], color: '#c9ccd2', mat: 'metal' },
          { shape: 'box', p: [0, 0.82, -0.2], s: [1.4, 0.04, 0.9], color: '#2f4f8a', mat: 'glossy' },
        ] },
        { id: 'tent1', type: 'tent', kind: 'camp', x: 3.4, z: 0.2, rot: -20, color: '#e2893a' },
        { id: 'tent2', type: 'tent', kind: 'camp', x: 5.8, z: 2.4, rot: -50, color: '#3f7fd0' },
        { id: 'solar', type: 'custom', name: 'солнечная панель', x: -1.2, z: 5.4, rot: 15, parts: [
          { shape: 'cylinder', p: [0, 0.5, 0], s: [0.1, 1.0, 0.1], color: '#8e949c', mat: 'metal' },
          { shape: 'box', p: [0, 1.05, 0], s: [1.8, 0.05, 1.1], r: [-25, 0, 0], color: '#2f4f8a', mat: 'glossy' },
        ] },
        { id: 'crystal1', type: 'rock', kind: 'crystal', x: 6.6, z: -1.8, color: '#7fe3e8' },
        { id: 'crystal2', type: 'rock', kind: 'crystal', x: -7.2, z: -1.6, color: '#c58af0' },
        { id: 'crystal3', type: 'rock', kind: 'crystal', x: 0.8, z: -7.0, color: '#7fe3e8', s: 0.8 },
        { id: 'rock1', type: 'rock', kind: 'boulder', x: -6.0, z: 5.2, color: '#9a5a3e' },
        { id: 'rock2', type: 'rock', kind: 'boulder', x: 6.8, z: 4.6, color: '#8a4e36', s: 1.3 },
        { id: 'rock3', type: 'rock', kind: 'flat', x: 0.4, z: 7.2, color: '#9a5a3e' },
        { id: 'rock4', type: 'rock', kind: 'boulder', x: -1.4, z: -4.4, color: '#a86448', s: 0.7 },
        { id: 'flag', type: 'flag', x: -0.9, z: -1.6, color: '#3f7fd0' },
        { id: 'lamp1', type: 'lamp', kind: 'lantern', x: 1.1, z: 1.3, color: '#bfe8ff' },
        { id: 'astro1', type: 'person', kind: 'astronaut', x: 0.4, z: 2.8, anim: 'wave' },
        { id: 'astro2', type: 'person', kind: 'astronaut', x: -2.0, z: 0.9, anim: 'walk', speed: 0.6 },
        { id: 'astro3', type: 'person', kind: 'astronaut', x: 4.4, z: -1.6, rot: -70, color2: '#c9443a' },
        { id: 'ufo', type: 'ufo', x: 3.4, z: -3.2, y: 5.8, anim: 'bob' },
      ],
      hints: ['сделай ночь', 'пусть ракета взлетает', 'добавь ещё марсоход'],
    },
    {
      q: 'Пикник под сакурой',
      reply: 'Сакура в цвету, самовар на столе, кролик уже тут. Можно пить чай.',
      title: 'Пикник под сакурой', clear: true,
      env: { time: 'morning', weather: 'clear', ground: 'grass', sea: 0, wind: 0.3 },
      add: [
        { id: 'sakura1', type: 'tree', kind: 'sakura', x: -3.4, z: -3.0, s: 1.2 },
        { id: 'sakura2', type: 'tree', kind: 'sakura', x: 4.0, z: -3.8 },
        { id: 'sakura3', type: 'tree', kind: 'sakura', x: -6.6, z: 1.6, s: 0.9 },
        { id: 'sakura4', type: 'tree', kind: 'sakura', x: 6.6, z: 1.9, s: 0.85 },
        { id: 'pond', type: 'pond', kind: 'lilies', x: -0.6, z: -6.6, s: 0.9 },
        { id: 'bridge', type: 'bridge', kind: 'wood', x: 2.9, z: -6.8, rot: 60 },
        { id: 'table', type: 'table', kind: 'picnic', x: 0.3, z: 0.4, color2: '#f2d0d8' },
        { id: 'samovar', type: 'samovar', on: 'table', x: 0.3, z: 0.4 },
        { id: 'cake', type: 'gift', on: 'table', x: 0.3, z: 0.4, s: 0.6, color: '#f4f1ea', color2: '#ef8fb1' },
        { id: 'umbrella', type: 'umbrella', kind: 'cafe', x: 2.6, z: 1.6, color: '#d9534a' },
        { id: 'bench', type: 'bench', x: -3.1, z: 2.9, rot: 35 },
        { id: 'lantern1', type: 'lamp', kind: 'paper', x: -3.9, z: 0.4, color: '#e2503a' },
        { id: 'lantern2', type: 'lamp', kind: 'paper', x: 4.6, z: -1.0, color: '#f2c94c' },
        { id: 'sign', type: 'sign', kind: 'post', x: -5.4, z: 4.2, rot: 30, text: 'Пикник' },
        { id: 'tulips1', type: 'flowers', kind: 'tulips', x: 4.8, z: 4.6 },
        { id: 'tulips2', type: 'flowers', kind: 'tulips', x: -4.2, z: 5.6 },
        { id: 'meadow1', type: 'flowers', kind: 'meadow', x: 1.2, z: 5.8 },
        { id: 'bush1', type: 'bush', kind: 'rose', x: 6.2, z: -1.6 },
        { id: 'bush2', type: 'bush', kind: 'round', x: -7.2, z: -2.2 },
        { id: 'granny', type: 'person', kind: 'grandma', on: 'bench', x: -3.1, z: 2.9, rot: 35 },
        { id: 'mom', type: 'person', kind: 'woman', x: -1.3, z: 1.5, rot: 40, anim: 'wave' },
        { id: 'dad', type: 'person', kind: 'man', x: 1.9, z: -0.8, rot: -110, color: '#6e8b6a' },
        { id: 'kid', type: 'person', kind: 'child', x: 1.5, z: 3.1, anim: 'dance' },
        { id: 'rabbit', type: 'animal', kind: 'rabbit', x: -5.0, z: -0.8, anim: 'hop' },
        { id: 'cat', type: 'animal', kind: 'cat', x: 3.3, z: 3.6, anim: 'sleep', color: '#8c8a86' },
        { id: 'dog', type: 'animal', kind: 'dog', x: -0.8, z: 4.0, anim: 'walk' },
        { id: 'duck', type: 'animal', kind: 'duck', on: 'pond', x: -0.6, z: -6.6, anim: 'swim' },
        { id: 'birds', type: 'bird', kind: 'songbird', n: 3, x: 2, z: -2, y: 7, anim: 'fly' },
        { id: 'cloud1', type: 'cloud', x: -4.5, z: -6, y: 10 },
      ],
      hints: ['добавь радугу', 'сделай вечер', 'пусть все танцуют'],
    },
  ];

  // ---------- правки без нейросети ----------
  const NOUNS = [
    [/кот|кош|котён|котик/, 'animal', 'cat'], [/собак|пёс|пес|щен/, 'animal', 'dog'], [/коров|бык/, 'animal', 'cow'], [/овц|овеч|баран/, 'animal', 'sheep'],
    [/свин|порос|хрюш/, 'animal', 'pig'], [/лошад|кон[ья]/, 'animal', 'horse'], [/кролик|заяц|зайц|зайк/, 'animal', 'rabbit'], [/лис/, 'animal', 'fox'],
    [/медвед|мишк/, 'animal', 'bear'], [/олен/, 'animal', 'deer'], [/кур|петух|цыпл/, 'animal', 'chicken'], [/утк|уточ|утят/, 'animal', 'duck'],
    [/лягуш/, 'animal', 'frog'], [/ёж|ежик|ёжик|ежа/, 'animal', 'hedgehog'], [/пингвин/, 'animal', 'penguin'],
    [/замок|замк/, 'house', 'castle'], [/башн|церк/, 'house', 'tower'], [/амбар|сарай/, 'house', 'barn'], [/лавк|магазин/, 'house', 'shop'], [/изб|хат/, 'house', 'izba'], [/дом/, 'house', 'cottage'],
    [/ёлк|елк|ель|ели/, 'tree', 'fir'], [/сосн/, 'tree', 'pine'], [/берёз|берез/, 'tree', 'birch'], [/пальм/, 'tree', 'palm'], [/сакур/, 'tree', 'sakura'], [/яблон/, 'tree', 'apple'], [/клён|клен/, 'tree', 'autumn'], [/дуб|дерев/, 'tree', 'oak'],
    [/куст/, 'bush', 'round'], [/тюльпан/, 'flowers', 'tulips'], [/подсолн/, 'flowers', 'sunflowers'], [/цвет/, 'flowers', 'meadow'], [/гриб|мухомор/, 'mushroom', 'amanita'],
    [/кристал/, 'rock', 'crystal'], [/камн|камен|валун/, 'rock', 'boulder'], [/скал|утёс|утес/, 'cliff', 'rock'], [/вулкан/, 'mountain', 'volcano'], [/гор[аыу]/, 'mountain', 'snowy'],
    [/пруд|озер|озёр/, 'pond', 'lilies'], [/маяк/, 'lighthouse', 'classic'], [/мельниц/, 'windmill', 'classic'], [/колод/, 'well', 'classic'], [/забор|ограда/, 'fence', 'picket'],
    [/мост/, 'bridge', 'wood'], [/шат[её]р|цирк/, 'tent', 'circus'], [/палат/, 'tent', 'camp'], [/кост[её]р|огон/, 'campfire', 'classic'], [/фонар/, 'lamp', 'street'],
    [/скам|лавочк/, 'bench', 'wood'], [/стол/, 'table', 'wood'], [/стул/, 'chair', 'wood'], [/самовар/, 'samovar', 'brass'], [/бочк/, 'barrel', 'wood'], [/ящик/, 'crate', 'wood'], [/сено|стог/, 'crate', 'hay'],
    [/грузовик/, 'car', 'truck'], [/автобус/, 'car', 'bus'], [/машин|автомоб/, 'car', 'sedan'], [/корабл/, 'boat', 'ship'], [/парус|яхт/, 'boat', 'sail'], [/лодк/, 'boat', 'rowboat'],
    [/шар/, 'balloon', 'hot'], [/ракет/, 'rocket', 'retro'], [/нло|тарелк|пришел/, 'ufo', 'saucer'], [/снегов/, 'snowman', 'classic'], [/табличк|вывеск|указат/, 'sign', 'post'],
    [/флаг/, 'flag', 'cloth'], [/зонт/, 'umbrella', 'beach'], [/подар/, 'gift', 'box'],
    [/бабушк|бабк|старушк/, 'person', 'grandma'], [/дед|старик/, 'person', 'grandpa'], [/рыбак/, 'person', 'fisher'], [/волшеб|маг[аи ]|колдун/, 'person', 'wizard'], [/рыцар/, 'person', 'knight'],
    [/космонавт|астронавт/, 'person', 'astronaut'], [/повар/, 'person', 'chef'], [/ребён|ребен|дет[ией]|мальчик|девочк/, 'person', 'child'], [/женщин|девушк|мам/, 'person', 'woman'], [/человек|мужчин|парн|пап|люд/, 'person', 'man'],
    [/чайк/, 'bird', 'gull'], [/ворон|грач/, 'bird', 'crow'], [/птиц|воробь|снегир/, 'bird', 'songbird'], [/дельфин/, 'fish', 'dolphin'], [/рыб/, 'fish', 'carp'],
    [/облак|туч/, 'cloud', 'puffy'], [/радуг/, 'rainbow', 'arc'],
  ];
  const COLORS = [[/красн/, '#d9443a'], [/оранж/, '#ec8a2f'], [/жёлт|желт/, '#f2c94c'], [/зелён|зелен/, '#5c9e48'], [/голуб/, '#8cc4ec'], [/син/, '#3f7fd0'],
    [/фиолет|сирен/, '#8356b8'], [/розов/, '#ef8fb1'], [/коричн/, '#8a5a3b'], [/бел/, '#f4f1ea'], [/чёрн|черн/, '#2e2c30'], [/сер/, '#8c8a86'], [/золот/, '#d8a93a']];
  const ANIMS = [[/крут|вращ|верт/, 'spin'], [/танц|пляш|пляс/, 'dance'], [/прыг|скач/, 'hop'], [/маш/, 'wave'], [/спя|спит|усн|засн|спать/, 'sleep'], [/лета|полет|полёт|кружи/, 'fly'],
    [/гуля|ход|бега|езд|ката/, 'walk'], [/плав/, 'swim'], [/мига|мерца/, 'blink'], [/кача/, 'sway'], [/пульс/, 'pulse'], [/замр|стоп|останов|перестан/, 'none']];
  const COUNT = [[/\b(два|две|пару|пара|2)\b/, 2], [/\b(три|3)\b/, 3], [/\b(четыре|4)\b/, 4], [/\b(пять|5)\b/, 5], [/несколько|много|стая|стаю|лес|рощ/, 4]];

  function nounOf(t) { for (const [re, type, kind] of NOUNS) if (re.test(t)) return { type, kind }; return null; }
  function matches(o, n) { return o.type === n.type && (n.type === 'house' || n.type === 'tree' || n.type === 'person' || n.type === 'bird' || n.type === 'cloud' || n.type === 'flowers' || n.type === 'rock' || n.type === 'bush' || n.kind === o.kind || !L().TYPES[n.type].kinds.includes(o.kind)); }
  const L = () => S3.lang;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // Разбор фразы → ответ в формате нейросети или null
  D.respond = function (text, scene, fresh) {
    const t = ' ' + text.toLowerCase().replace(/ё/g, 'е').replace(/[«»"!?.,]/g, ' ') + ' ';
    const tt = ' ' + text.toLowerCase() + ' ';
    // заготовленная сцена?
    let best = null, bestScore = 0;
    for (const sc of D.scenes) {
      const words = sc.q.toLowerCase().replace(/ё/g, 'е').split(/[\s,]+/).filter((w) => w.length > 3);
      const score = words.filter((w) => t.includes(w.slice(0, Math.max(4, w.length - 2)))).length;
      if (score > bestScore) { bestScore = score; best = sc; }
    }
    if (best && (bestScore >= 2 || (fresh && bestScore >= 1))) return best;
    const resp = { env: {}, add: [], remove: [], update: [] }, said = [];
    const objs = scene.objects;
    // время и погода
    if (/ноч|полноч/.test(t)) { resp.env.time = 'night'; said.push('ночь'); }
    else if (/утр|рассвет/.test(t)) { resp.env.time = 'morning'; said.push('утро'); }
    else if (/закат|вечер/.test(t)) { resp.env.time = 'sunset'; said.push('закат'); }
    else if (/\bден|днем|полдень/.test(t)) { resp.env.time = 'day'; said.push('день'); }
    if (/гроз|шторм|молни/.test(t) && !/убер|без/.test(t)) { resp.env.weather = 'storm'; said.push('гроза'); }
    else if (/дожд|ливен|ливн/.test(t) && !/убер|без|останов/.test(t)) { resp.env.weather = 'rain'; said.push('дождь'); }
    else if (/снег|снеж|метел|зим/.test(t) && !/снегов/.test(t)) { resp.env.weather = 'snow'; if (/зим/.test(t)) resp.env.ground = 'snow'; said.push('снег'); }
    else if (/туман/.test(t)) { resp.env.weather = 'fog'; said.push('туман'); }
    else if (/пасмур|облачн/.test(t)) { resp.env.weather = 'cloudy'; said.push('облака'); }
    else if (/ясн|солнеч|убер.*(дожд|шторм|снег|туман)|без (дожд|шторм|снег)|останов.*дожд/.test(t)) { resp.env.weather = 'clear'; said.push('ясно'); }
    if (/остров|море|океан/.test(t) && !/без мор|убер.*мор/.test(t)) { resp.env.sea = 0.5; said.push('море'); }
    if (/без мор|убер.*мор|осуш/.test(t)) { resp.env.sea = 0; said.push('суша'); }
    if (/марс/.test(t)) { resp.env.ground = 'mars'; resp.env.sky = ['#3a2244', '#e2946a']; }
    else if (/луна|лунн/.test(t)) resp.env.ground = 'moon';
    else if (/пустын/.test(t)) resp.env.ground = 'desert';
    else if (/пляж|песок|песч/.test(t)) resp.env.ground = 'sand';
    else if (/осен/.test(t)) resp.env.ground = 'autumn';
    else if (/весн|лето|летн|трав/.test(t) && !/убер/.test(t)) resp.env.ground = 'grass';
    // объекты
    const noun = nounOf(t);
    let count = 1;
    for (const [re, n] of COUNT) if (re.test(t)) { count = n; break; }
    const removing = /убер|удал|убира|прогони|без /.test(t);
    const adding = /добав|постав|посад|пусть будет|еще|ещё|нужн|хочу|появ|построй|нарисуй|сделай.*(дом|замок)/.test(t);
    const anim = ANIMS.find(([re]) => re.test(t));
    const color = COLORS.find(([re]) => re.test(t));
    const bigger = /больше|крупнее|выше|огромн/.test(t) && !adding, smaller = /меньше|мельче|ниже|крошечн/.test(t);
    const faster = /быстре/.test(t), slower = /медленн/.test(t);
    const everyone = /вс[её]|каждый|люди/.test(t);
    const targets = noun ? objs.filter((o) => matches(o, noun)) : everyone ? objs.filter((o) => o.type === 'person' || o.type === 'animal') : [];
    if (removing && noun) {
      if (noun.type === 'cloud' && !targets.length) { resp.env.weather = 'clear'; }
      for (const o of targets) resp.remove.push(o.id);
      if (targets.length) said.push('убрал');
    } else if (noun && (adding || (!anim && !color && !bigger && !smaller && !Object.keys(resp.env).length))) {
      const k = Math.min(noun.type === 'bird' ? 1 : count, 6);
      const near = targets[0];
      for (let i = 0; i < k; i++) {
        const o = { type: noun.type, kind: noun.kind };
        if (near && noun.type !== 'bird' && noun.type !== 'cloud') { o.x = near.x + Math.cos(i * 2.1 + 1) * 2.2; o.z = near.z + Math.sin(i * 2.1 + 1) * 2.2; }
        if (noun.type === 'bird') { o.n = Math.max(3, count); o.anim = 'fly'; o.y = 7; }
        if (noun.type === 'cloud') o.y = 9 + i * 0.5;
        if (noun.type === 'fish' || noun.type === 'boat') { if (!(scene.env.sea > 0.05)) resp.env.sea = 0.5; o.anim = noun.type === 'boat' ? 'bob' : 'none'; }
        if (/крыльц/.test(t)) { const h = objs.find((q) => q.type === 'house'); if (h) o.on = h.id; }
        if (/на стол/.test(t)) { const h = objs.find((q) => q.type === 'table'); if (h) o.on = h.id; }
        if (anim) o.anim = anim[1];
        if (color) o.color = color[1];
        resp.add.push(o);
      }
      said.push('добавил');
    } else if (targets.length || (anim && !noun)) {
      const list = targets.length ? targets : objs.filter((o) => (anim[1] === 'spin' ? o.type === 'windmill' || o.type === 'lighthouse' || o.type === 'ufo' : o.type === 'person' || o.type === 'animal'));
      for (const o of list) {
        const u = { id: o.id };
        if (anim) u.anim = anim[1] === 'fly' && o.type !== 'bird' && o.type !== 'balloon' && o.type !== 'ufo' && o.type !== 'rocket' ? 'hop' : anim[1];
        if (color) u.color = color[1];
        if (bigger) u.s = Math.min(2.5, (o.s || 1) * 1.4);
        if (smaller) u.s = Math.max(0.4, (o.s || 1) * 0.7);
        if (faster) { u.speed = Math.min(3, (o.speed || 1) * 2); if (!u.anim && (!o.anim || o.anim === 'none')) u.anim = o.type === 'windmill' ? 'spin' : 'walk'; }
        if (slower) u.speed = Math.max(0.3, (o.speed || 1) * 0.5);
        if (Object.keys(u).length > 1) resp.update.push(u);
      }
      if (resp.update.length) said.push('поправил');
    }
    if (!said.length && !resp.add.length && !resp.remove.length && !resp.update.length && !Object.keys(resp.env).length) return null;
    resp.reply = replyFor(resp, said);
    return resp;
  };

  function replyFor(r, said) {
    const e = r.env;
    if (e.time === 'night') return pick(['Ночь опустилась. Окна зажглись сами — я только подкрутил фитили.', 'Выключил солнце. Звёзды — за счёт заведения.']);
    if (e.weather === 'rain') return pick(['Дождик пошёл. Зонты у жителей свои.', 'Полил остров. Цветы довольны, кот — нет.']);
    if (e.weather === 'storm') return 'Гроза на месте. Громко, мокро, красиво.';
    if (e.weather === 'snow') return pick(['Снег пошёл. Лепить снеговиков разрешаю.', 'Подсыпал снега. Следы — на вашей совести.']);
    if (e.weather === 'fog') return 'Напустил туману. Теперь у острова есть тайна.';
    if (e.time === 'sunset') return 'Закат. Всё стало тёплым и немного драматичным.';
    if (e.time === 'morning') return 'Доброе утро, остров. Роса — бесплатно.';
    if (e.time === 'day') return 'Полдень. Солнце на месте, тени короткие.';
    if (r.add.length) return pick(['Готово — упало точно в цель.', 'Поставил. Держится крепко, проверял.', 'Добавил. Соседи уже знакомятся.']);
    if (r.remove.length) return pick(['Убрал. Никто и не заметил.', 'Нет больше. Место свободно.']);
    if (r.update.some((u) => u.anim === 'dance')) return 'Танцуют все! Даже те, кто не умеет.';
    if (r.update.length) return 'Поправил. Так, пожалуй, лучше.';
    return said.length ? 'Сделано.' : '';
  }

  D.edits = ['сделай ночь', 'добавь дождь', 'пусть все танцуют', 'добавь снег', 'добавь кота на крыльцо', 'сделай закат', 'убери облака'];
  S3.demo = D;
})();
