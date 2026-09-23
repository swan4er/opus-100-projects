/* Примеры страниц для движка. Каждый — HTML, CSS и элемент, выбранный в инспекторе при загрузке. */
window.PRESETS = {
  article: {
    select: '.card.accent',
    html: `<header class="top">
  <div class="logo">Коробка</div>
  <nav>
    <a href="#">Разбор</a>
    <a href="#">Каскад</a>
    <a href="#">Раскладка</a>
  </nav>
</header>
<main>
  <section class="hero">
    <p class="kicker">Выпуск №&nbsp;1</p>
    <h1>Всё на странице — это коробки</h1>
    <p class="lead">Браузер читает HTML, подбирает каждому узлу правила CSS, раскладывает <em>прямоугольники</em> и только потом рисует пиксели. Этот движок делает то же самое — с нуля и у вас на глазах.</p>
  </section>
  <section class="cards">
    <article class="card">
      <h3>Разбор</h3>
      <p>Текст превращается в дерево узлов: теги, атрибуты, строки.</p>
    </article>
    <article class="card accent">
      <h3>Каскад</h3>
      <p>Побеждает правило с большей <strong>специфичностью</strong>.</p>
    </article>
    <article class="card">
      <h3>Раскладка</h3>
      <p>Флексбокс делит свободное место между карточками.</p>
    </article>
  </section>
</main>
<footer>Нажмите на любой блок — в инспекторе появятся все правила, которые к нему применились.</footer>
`,
    css: `body {
  margin: 0;
  font-family: "IBM Plex Sans", sans-serif;
  color: #1d1b17;
  background: #f4efe6;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 28px;
  background: #1d1b17;
  color: #f4efe6;
}
.logo {
  font-family: "Unbounded";
  font-weight: 700;
  font-size: 18px;
}
nav { display: flex; gap: 20px; }
nav a {
  color: #f4efe6;
  text-decoration: none;
  font-size: 14px;
}
.hero { padding: 34px 28px 18px; }
.kicker {
  margin: 0;
  color: #d9480f;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
}
h1 {
  font-family: "PT Serif", serif;
  font-size: 40px;
  line-height: 1.05;
  margin: 10px 0 14px;
}
.lead {
  margin: 0;
  max-width: 560px;
  font-size: 17px;
  line-height: 1.5;
  color: #4a453d;
}
.cards {
  display: flex;
  gap: 16px;
  padding: 12px 28px 30px;
}
.card {
  flex: 1;
  padding: 18px 20px;
  background: #fffaf2;
  border: 1px solid #e3d9c8;
  border-radius: 12px;
}
.card h3 { margin: 0 0 8px; font-size: 18px; }
.card p {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: #4a453d;
}
.card.accent {
  background: #d9480f;
  border-color: #d9480f;
  color: #fff4ea;
}
.card.accent p { color: #ffe3d0; }
footer {
  padding: 16px 28px;
  border-top: 1px solid #e3d9c8;
  font-size: 13px;
  color: #7a7266;
}
@media (max-width: 560px) {
  .cards { flex-direction: column; }
  h1 { font-size: 30px; }
}
`,
  },

  cascade: {
    select: '#alarm',
    html: `<div class="page">
  <h2>Кто победит?</h2>
  <p>Обычный абзац: к нему применяется только правило для тега <code>p</code>.</p>
  <p class="note">У этого абзаца есть класс <code>.note</code> — класс сильнее тега.</p>
  <p class="note" id="winner">Здесь ещё и <code>#winner</code>: идентификатор бьёт любое число классов.</p>
  <p class="note loud" id="alarm">А правило с <code>!important</code> побеждает даже идентификатор.</p>
  <div class="box">
    <p>Абзац внутри <code>.box</code>: селектор <code>.box p</code> специфичнее, чем <code>p</code>.</p>
  </div>
</div>
`,
    css: `body {
  margin: 0;
  background: #11131a;
  font-family: "IBM Plex Sans", sans-serif;
}
.page { padding: 28px 32px; color: #e9e5dc; }
h2 {
  font-family: "Unbounded";
  font-size: 26px;
  margin: 0 0 18px;
  color: #ffd23f;
}
p {
  margin: 0 0 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #1c2029;
  color: #a3a9b6;
  font-size: 15px;
  line-height: 1.45;
}
.note { color: #3ddc97; background: #16241f; }
#winner { color: #ff9f1c; background: #2a1d10; }
#alarm { color: #ff9f1c; background: #2a1512; }
.loud { color: #ff5f45 !important; }
.box {
  border: 1px dashed #3a4150;
  border-radius: 10px;
  padding: 10px;
}
.box p { color: #6c8cff; background: #171c2c; margin: 0; }
code {
  font-family: "JetBrains Mono";
  font-size: 13px;
  background: #262b36;
  color: #e9e5dc;
  padding: 0 3px;
}
`,
  },

  flex: {
    select: '.row.grow',
    html: `<section class="demo">
  <h3>justify-content: space-between</h3>
  <div class="row between"><div class="chip">А</div><div class="chip">Б</div><div class="chip">В</div></div>
  <h3>justify-content: center + gap</h3>
  <div class="row center"><div class="chip">А</div><div class="chip">Б</div><div class="chip">В</div></div>
  <h3>flex-grow: 1, 2, 1</h3>
  <div class="row grow"><div class="chip g1">1</div><div class="chip g2">2</div><div class="chip g1">1</div></div>
  <h3>align-items: flex-end</h3>
  <div class="row end"><div class="chip tall">высокий</div><div class="chip">А</div><div class="chip mid">средний</div></div>
  <h3>flex-wrap: wrap</h3>
  <div class="row wrap"><div class="chip">Меркурий</div><div class="chip">Венера</div><div class="chip">Земля</div><div class="chip">Марс</div><div class="chip">Юпитер</div><div class="chip">Сатурн</div><div class="chip">Уран</div><div class="chip">Нептун</div></div>
</section>
`,
    css: `body {
  margin: 0;
  background: #0f1720;
  color: #dbe7f0;
  font-family: "IBM Plex Sans", sans-serif;
}
.demo { padding: 22px 26px 28px; }
h3 {
  margin: 16px 0 8px;
  font-family: "JetBrains Mono";
  font-size: 13px;
  font-weight: 400;
  color: #7fb3d5;
}
.row {
  display: flex;
  padding: 10px;
  background: #16222e;
  border: 1px solid #243646;
  border-radius: 10px;
}
.between { justify-content: space-between; }
.center { justify-content: center; gap: 10px; }
.grow { gap: 8px; }
.end { align-items: flex-end; gap: 8px; height: 110px; }
.wrap { flex-wrap: wrap; gap: 8px; }
.chip {
  padding: 10px 16px;
  border-radius: 8px;
  background: #ffb03a;
  color: #1b1206;
  font-weight: 600;
  text-align: center;
}
.g1 { flex-grow: 1; background: #3ddc97; }
.g2 { flex-grow: 2; background: #2ec4f1; }
.tall { padding: 34px 16px; background: #b084f5; }
.mid { padding: 20px 16px; background: #f25f9c; }
.wrap .chip { background: #6c8cff; color: #0d1330; }
`,
  },

  wrap: {
    select: '.col p',
    html: `<article class="col">
  <h2>Как текст делится на строки</h2>
  <p>Абзац — это <strong>поток слов</strong>. Движок берёт слово, меряет его ширину шрифтом и кладёт на текущую строку. Не влезло — начинает новую. У каждого слова свой стиль: <em>курсив</em>, <code>моноширинный</code>, <mark>подсветка</mark> и <a href="#">ссылка</a>, но все они живут в одних строчных коробках.<br>Тег br обрывает строку насильно.</p>
  <p class="center">Выравнивание по центру сдвигает каждую строку на половину свободного места.</p>
  <p class="right">А это — по правому краю.</p>
</article>
`,
    css: `body {
  margin: 0;
  background: #f7f3ea;
  font-family: "PT Serif", serif;
  color: #26221c;
}
.col {
  max-width: 380px;
  margin: 0 auto;
  padding: 28px 24px;
  background: #fffdf8;
  border-left: 1px solid #e8dfcf;
  border-right: 1px solid #e8dfcf;
}
h2 {
  margin: 0 0 14px;
  font-family: "Unbounded";
  font-size: 20px;
  line-height: 1.2;
}
p { margin: 0 0 14px; font-size: 17px; line-height: 1.55; }
code {
  font-family: "JetBrains Mono";
  font-size: 14px;
  background: #efe6d3;
  padding: 0 3px;
}
mark { background: #ffd966; }
a { color: #b3261e; }
.center { text-align: center; color: #7a6f60; font-size: 15px; }
.right { text-align: right; color: #7a6f60; font-size: 15px; }
`,
  },

  responsive: {
    select: '.plans',
    html: `<div class="wrap">
  <h2>Тарифы</h2>
  <p class="sub">Потяните ползунок «Ширина окна» уже 620&nbsp;px — сработает правило @media, и колонки встанут друг под друга.</p>
  <div class="plans">
    <div class="plan"><h3>Старт</h3><p class="price">0&nbsp;₽</p><p>Один проект, базовые шаблоны.</p></div>
    <div class="plan pro"><h3>Про</h3><p class="price">490&nbsp;₽</p><p>Безлимитные проекты и свой домен.</p></div>
    <div class="plan"><h3>Команда</h3><p class="price">1&nbsp;900&nbsp;₽</p><p>Общие папки и роли участников.</p></div>
  </div>
</div>
`,
    css: `body {
  margin: 0;
  background: #101218;
  color: #e8e6f0;
  font-family: "IBM Plex Sans", sans-serif;
}
.wrap { padding: 28px 30px; }
h2 { font-family: "Unbounded"; margin: 0; font-size: 26px; }
.sub { color: #9a9fb0; margin: 8px 0 20px; line-height: 1.45; max-width: 520px; }
.plans { display: flex; gap: 14px; }
.plan {
  flex: 1;
  padding: 18px 20px;
  border-radius: 14px;
  background: #1a1d27;
  border: 1px solid #2b3040;
}
.plan h3 { margin: 0; font-size: 16px; color: #b8bdd0; }
.price {
  margin: 6px 0 8px;
  font-family: "Unbounded";
  font-size: 26px;
  color: #ffffff;
}
.plan p { margin: 0; line-height: 1.45; color: #9a9fb0; }
.pro { background: #6c5cff; border-color: #6c5cff; }
.pro h3, .pro p { color: #e5e1ff; }
@media (max-width: 620px) {
  .plans { flex-direction: column; }
  .wrap { padding: 20px 18px; }
}
`,
  },
};
