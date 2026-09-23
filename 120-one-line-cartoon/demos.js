/* ================================================================
   demos.js — заготовленные сценарии на том же языке сцен.
   Работают без нейросети (демо-режим) и дают обложку.
   ================================================================ */
(function () {
  'use strict';
  window.DEMOS = [
    {
      title: 'Кот и Луна',
      phrase: 'кот влюбился в луну',
      mood: 'romantic',
      cast: [
        { id: 'kot', kind: 'cat', name: 'Барсик' },
        { id: 'luna', kind: 'moon', name: 'Луна' },
        { id: 'vorobey', kind: 'bird', name: 'Воробей' },
      ],
      scenes: [
        {
          place: 'roof', time: 'night', mood: 'mystery',
          cast: [{ id: 'kot', x: 14, emotion: 'neutral' }, { id: 'luna', x: 74, y: 62, emotion: 'neutral', face: 'left' }],
          beats: [
            { who: 'kot', do: 'walk', to: 38 },
            { who: 'kot', do: 'look', to: 'luna', emotion: 'surprised' },
            { who: 'kot', do: 'say', text: 'Ого… Какая круглая!', emotion: 'love' },
            { who: 'luna', do: 'wave', to: 'kot', emotion: 'happy' },
            { who: 'kot', do: 'jump', emotion: 'love' },
          ],
        },
        {
          place: 'roof', time: 'night', mood: 'romantic',
          cast: [{ id: 'kot', x: 36, emotion: 'love' }, { id: 'luna', x: 74, y: 62, face: 'left' }],
          beats: [
            { who: 'kot', do: 'sing', text: 'Мяу-у! Ты ярче всех фонарей!' },
            { who: 'luna', do: 'say', text: 'Спасибо, котик. Но я на работе — свечу.', emotion: 'happy' },
            { who: 'kot', do: 'say', text: 'Спускайся! У меня есть сметана!', emotion: 'happy' },
            { who: 'luna', do: 'laugh' },
          ],
        },
        {
          place: 'roof', time: 'night', mood: 'silly',
          cast: [{ id: 'kot', x: 26, emotion: 'happy' }, { id: 'luna', x: 74, y: 62, face: 'left' }],
          beats: [
            { who: 'kot', do: 'run', to: 50 },
            { who: 'kot', do: 'jump', y: 70 },
            { who: 'kot', do: 'fall', emotion: 'sad' },
            { who: 'vorobey', do: 'enter', to: 76 },
            { who: 'vorobey', do: 'say', text: 'Ты чего, кот? Луна же в небе живёт!', to: 'kot', emotion: 'surprised' },
            { who: 'kot', do: 'say', text: 'Любовь не меряют этажами.', emotion: 'sad' },
            { who: 'kot', do: 'cry' },
          ],
        },
        {
          place: 'roof', time: 'night', mood: 'romantic',
          cast: [{ id: 'kot', x: 40, emotion: 'sad' }, { id: 'luna', x: 74, y: 62, emotion: 'sad', face: 'left' }, { id: 'vorobey', x: 88, emotion: 'neutral', face: 'left' }],
          beats: [
            { who: 'luna', do: 'say', text: 'Ладно. Пять минут, пока никто не видит.', emotion: 'love' },
            { who: 'luna', do: 'fly', to: 60, y: 4 },
            { who: 'kot', do: 'look', to: 'luna', emotion: 'surprised' },
            { who: 'kot', do: 'hug', to: 'luna', emotion: 'love' },
            { who: 'vorobey', do: 'say', text: 'Эх, романтика…', emotion: 'love', with: true },
          ],
        },
        {
          place: 'roof', time: 'night', mood: 'calm',
          cast: [{ id: 'kot', x: 42, emotion: 'love' }, { id: 'luna', x: 58, y: 4, emotion: 'love', face: 'left' }],
          beats: [
            { who: 'luna', do: 'fly', to: 72, y: 60 },
            { who: 'luna', do: 'say', text: 'Спи, котик. Я буду светить тебе каждую ночь.', emotion: 'love' },
            { who: 'kot', do: 'sleep', emotion: 'happy' },
          ],
        },
      ],
    },
    {
      title: 'Последняя батарейка',
      phrase: 'два робота делят последнюю батарейку',
      mood: 'silly',
      cast: [
        { id: 'bolt', kind: 'robot', name: 'Болт' },
        { id: 'gayka', kind: 'robot', name: 'Гайка', look: 'bow' },
        { id: 'solnce', kind: 'sun', name: 'Солнце' },
      ],
      scenes: [
        {
          place: 'junkyard', time: 'day', mood: 'mystery',
          props: [{ id: 'bat', kind: 'battery', x: 50 }],
          cast: [{ id: 'bolt', x: 16, emotion: 'tired' }, { id: 'gayka', x: 84, emotion: 'tired' }],
          beats: [
            { who: 'bolt', do: 'look', to: 50, emotion: 'surprised' },
            { who: 'gayka', do: 'look', to: 50, emotion: 'surprised', with: true },
            { who: 'bolt', do: 'say', text: 'Батарейка! Последняя на всей свалке!', emotion: 'happy' },
            { who: 'gayka', do: 'say', text: 'Моя! Я первая её увидела!', emotion: 'angry' },
          ],
        },
        {
          place: 'junkyard', time: 'day', mood: 'chase',
          props: [{ id: 'bat', kind: 'battery', x: 50 }],
          cast: [{ id: 'bolt', x: 16, emotion: 'angry' }, { id: 'gayka', x: 84, emotion: 'angry' }],
          beats: [
            { who: 'bolt', do: 'run', to: 42 },
            { who: 'gayka', do: 'run', to: 60, with: true },
            { who: 'bolt', do: 'take', what: 'battery', emotion: 'sly' },
            { who: 'gayka', do: 'push', to: 'bolt', emotion: 'angry' },
            { who: 'bolt', do: 'say', text: 'Эй! Так нечестно!', emotion: 'angry' },
            { who: 'gayka', do: 'chase', to: 'bolt' },
          ],
        },
        {
          place: 'junkyard', time: 'evening', mood: 'sad',
          cast: [{ id: 'bolt', x: 34, emotion: 'tired' }, { id: 'gayka', x: 60, emotion: 'tired' }],
          beats: [
            { who: 'gayka', do: 'fall', emotion: 'tired' },
            { who: 'gayka', do: 'say', text: 'Заряд… два процента…', emotion: 'tired' },
            { who: 'bolt', do: 'look', to: 'gayka', emotion: 'sad' },
            { who: 'bolt', do: 'think', text: 'Без неё тут совсем скучно.' },
            { who: 'bolt', do: 'give', to: 'gayka', what: 'battery', emotion: 'love' },
            { who: 'gayka', do: 'say', text: 'Ты отдаёшь мне последнюю?', emotion: 'surprised' },
            { who: 'bolt', do: 'sleep', emotion: 'tired' },
          ],
        },
        {
          place: 'junkyard', time: 'day', mood: 'happy',
          cast: [{ id: 'bolt', x: 38, emotion: 'tired' }, { id: 'gayka', x: 58, emotion: 'happy', face: 'left' }],
          beats: [
            { who: 'solnce', do: 'appear', to: 78, y: 60 },
            { who: 'solnce', do: 'say', text: 'Эй, железные! Зарядка бесплатно — с утра до вечера!', emotion: 'happy' },
            { who: 'bolt', do: 'jump', emotion: 'happy' },
            { who: 'gayka', do: 'hug', to: 'bolt', emotion: 'love' },
            { who: 'bolt', do: 'dance', emotion: 'happy' },
            { who: 'gayka', do: 'dance', emotion: 'happy', with: true },
          ],
        },
      ],
    },
    {
      title: 'Сыр раздора',
      phrase: 'мышка ночью пробралась на кухню за сыром',
      mood: 'mystery',
      cast: [
        { id: 'pik', kind: 'mouse', name: 'Пик' },
        { id: 'vaska', kind: 'cat', name: 'Васька', look: 'mustache' },
      ],
      scenes: [
        {
          place: 'kitchen', time: 'night', mood: 'mystery',
          props: [{ id: 'syr', kind: 'cheese', x: 74 }],
          cast: [{ id: 'vaska', x: 36, emotion: 'tired', face: 'left' }],
          beats: [
            { who: 'vaska', do: 'sleep' },
            { who: 'pik', do: 'enter', to: 12, emotion: 'sly' },
            { who: 'pik', do: 'say', text: 'Тс-с. Операция «Сыр» начинается.', emotion: 'sly' },
            { who: 'pik', do: 'walk', to: 66 },
            { who: 'pik', do: 'take', what: 'cheese', emotion: 'happy' },
          ],
        },
        {
          place: 'kitchen', time: 'night', mood: 'tense',
          cast: [{ id: 'vaska', x: 34, emotion: 'sly' }, { id: 'pik', x: 66, emotion: 'happy', face: 'right' }],
          beats: [
            { who: 'pik', do: 'dance' },
            { who: 'vaska', do: 'say', text: 'Кхм. Приятного аппетита.', emotion: 'sly' },
            { who: 'pik', do: 'turn', emotion: 'scared' },
            { who: 'pik', do: 'shake' },
            { who: 'pik', do: 'say', text: 'Это… это вам! Подарок!', emotion: 'scared' },
            { who: 'vaska', do: 'chase', to: 'pik', emotion: 'angry' },
          ],
        },
        {
          place: 'kitchen', time: 'night', mood: 'silly',
          cast: [{ id: 'pik', x: 80, emotion: 'scared', face: 'left' }, { id: 'vaska', x: 22, emotion: 'angry' }],
          beats: [
            { who: 'vaska', do: 'run', to: 56 },
            { who: 'vaska', do: 'fall', emotion: 'sad' },
            { who: 'vaska', do: 'cry' },
            { who: 'pik', do: 'look', to: 'vaska', emotion: 'sad' },
            { who: 'pik', do: 'give', to: 'vaska', what: 'cheese', emotion: 'love' },
            { who: 'vaska', do: 'say', text: 'Ты делишься? Со мной?!', emotion: 'surprised' },
          ],
        },
        {
          place: 'kitchen', time: 'day', mood: 'happy',
          cast: [{ id: 'vaska', x: 40, emotion: 'happy' }, { id: 'pik', x: 60, emotion: 'sly', face: 'left' }],
          beats: [
            { who: 'pik', do: 'say', text: 'Завтра — торт. Ты караулишь, я несу.', emotion: 'sly' },
            { who: 'vaska', do: 'laugh' },
            { who: 'vaska', do: 'hug', to: 'pik', emotion: 'love' },
          ],
        },
      ],
    },
    {
      title: 'Пришелец без адреса',
      phrase: 'инопланетянин потерялся и ищет дорогу домой',
      mood: 'mystery',
      cast: [
        { id: 'zorg', kind: 'alien', name: 'Зорг' },
        { id: 'dasha', kind: 'girl', name: 'Даша' },
        { id: 'sharik', kind: 'dog', name: 'Шарик' },
      ],
      scenes: [
        {
          place: 'space', time: 'night', mood: 'mystery',
          cast: [{ id: 'zorg', x: 32, emotion: 'happy' }],
          beats: [
            { who: 'zorg', do: 'dance' },
            { who: 'zorg', do: 'say', text: 'Пи-пи! Лечу на экскурсию к Земле!', emotion: 'happy' },
            { who: 'zorg', do: 'jump', to: 62 },
            { who: 'zorg', do: 'vanish' },
          ],
        },
        {
          place: 'meadow', time: 'evening', mood: 'tense',
          cast: [{ id: 'dasha', x: 70, emotion: 'neutral', face: 'left' }, { id: 'sharik', x: 84, emotion: 'happy', face: 'left' }],
          beats: [
            { who: 'zorg', do: 'appear', to: 24, emotion: 'surprised' },
            { who: 'sharik', do: 'say', text: 'Гав! Гав! Зелёный!', emotion: 'angry' },
            { who: 'zorg', do: 'shake', emotion: 'scared' },
            { who: 'dasha', do: 'walk', to: 'zorg' },
            { who: 'dasha', do: 'say', text: 'Не бойся, он не кусается. Ты откуда?', emotion: 'happy' },
            { who: 'zorg', do: 'say', text: 'Я потерял звезду. Она показывает дорогу домой.', emotion: 'sad' },
          ],
        },
        {
          place: 'meadow', time: 'night', mood: 'romantic',
          props: [{ id: 'zvezda', kind: 'star', x: 88 }],
          cast: [{ id: 'zorg', x: 26, emotion: 'sad' }, { id: 'dasha', x: 42, emotion: 'neutral', face: 'left' }, { id: 'sharik', x: 60, emotion: 'happy' }],
          beats: [
            { who: 'sharik', do: 'take', what: 'star', emotion: 'happy' },
            { who: 'sharik', do: 'give', to: 'zorg', what: 'star' },
            { who: 'zorg', do: 'jump', emotion: 'happy' },
            { who: 'zorg', do: 'hug', to: 'sharik', emotion: 'love' },
            { who: 'zorg', do: 'say', text: 'Прилечу в гости. Держите мне косточку!', emotion: 'happy' },
            { who: 'zorg', do: 'vanish' },
            { who: 'dasha', do: 'wave', emotion: 'happy' },
          ],
        },
      ],
    },
  ];
})();
