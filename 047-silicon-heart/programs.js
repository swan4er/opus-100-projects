/* Программы для КС-8. Каждая написана на ассемблере этой машины и собирается в браузере. */
(function (root) {
  'use strict';

  const LIFE = `; ═══ «Жизнь» Конвея на торе 32×32 ═══
; Байт клетки: биты 0–3 — цвет, бит 4 — живая сейчас,
; бит 5 — будет живой в следующем поколении.
; Цвет — возраст: новорождённые жёлтые, старожилы синие,
; умершие оставляют угасающий след. Пробел — засеять заново.

GEN   = 0xA00          ; счётчик поколений
SEEDN = 80             ; порог засева: 80 из 256 ≈ 31 % живых

start:  CALL seed
loop:   CALL step
        LD   R0, [GEN]
        INC  R0
        ST   [GEN], R0
        OUT  2, R0             ; номер поколения — на табло
        OUT  4, R0             ; и в двоичном виде на линейку
        MOV  R1, R0
        AND  R1, 31            ; каждые 32 поколения — гость-планер
        JNZ  nog
        CALL glider
nog:    WAIT
        IN   R0, 0
        CMP  R0, 5             ; пробел?
        JNZ  loop
        CALL seed
        JMP  loop

; ── случайный засев ──
seed:   MOV  R1, 0
sy:     MOV  R0, 0
sx:     IN   R2, 1             ; случайный байт
        MOV  R3, 0
        CMP  R2, SEEDN
        JNC  sdead             ; R2 ≥ SEEDN → пусто
        MOV  R3, 0x1A          ; живая (бит 4) + жёлтый (10)
sdead:  VID  R0, R1
        ST   [I], R3
        INC  R0
        CMP  R0, 32
        JNZ  sx
        INC  R1
        CMP  R1, 32
        JNZ  sy
        MOV  R0, 0
        ST   [GEN], R0
        RET

; ── одно поколение: сначала считаем, потом переносим ──
step:   MOV  R1, 0             ; y
py:     MOV  R0, 0             ; x
px:     MOV  R2, 0             ; число живых соседей
        MOV  R4, R1
        DEC  R4                ; y−1 (VID сам заворачивает края)
        MOV  R3, R0
        DEC  R3                ; x−1
        CALL chk
        INC  R3
        CALL chk
        INC  R3
        CALL chk               ; верхний ряд
        INC  R4
        CALL chk               ; справа
        SUB  R3, 2
        CALL chk               ; слева
        INC  R4
        CALL chk
        INC  R3
        CALL chk
        INC  R3
        CALL chk               ; нижний ряд
        VID  R0, R1            ; правило B3/S23
        LD   R5, [I]
        MOV  R6, R5
        AND  R6, 0x10
        JZ   born
        CMP  R2, 2
        JZ   live
        CMP  R2, 3
        JZ   live
        JMP  nextc
born:   CMP  R2, 3
        JNZ  nextc
live:   OR   R5, 0x20
        ST   [I], R5
nextc:  INC  R0
        CMP  R0, 32
        JNZ  px
        INC  R1
        CMP  R1, 32
        JNZ  py

        MOV  R1, 0             ; второй проход
qy:     MOV  R0, 0
qx:     VID  R0, R1
        LD   R5, [I]
        MOV  R6, R5
        AND  R6, 15            ; текущий цвет
        AND  R5, 0x20
        JZ   qdead
        LDI  ALIVE             ; живая: цвет по возрасту
        ADDI R6
        LD   R6, [I]
        OR   R6, 0x10
        JMP  qput
qdead:  LDI  FADE              ; мёртвая: след угасает
        ADDI R6
        LD   R6, [I]
qput:   VID  R0, R1
        ST   [I], R6
        INC  R0
        CMP  R0, 32
        JNZ  qx
        INC  R1
        CMP  R1, 32
        JNZ  qy
        RET

; сосед (R3, R4) живой? → R2++
chk:    VID  R3, R4
        LD   R5, [I]
        AND  R5, 0x10
        JZ   chk0
        INC  R2
chk0:   RET

; ── планер в случайном месте ──
glider: IN   R0, 1
        IN   R1, 1
        MOV  R6, 0x1F          ; живая + персиковый: гость
        INC  R0
        VID  R0, R1
        ST   [I], R6           ; .X.
        INC  R0
        INC  R1
        VID  R0, R1
        ST   [I], R6           ; ..X
        INC  R1
        VID  R0, R1
        ST   [I], R6
        DEC  R0
        VID  R0, R1
        ST   [I], R6
        DEC  R0
        VID  R0, R1
        ST   [I], R6           ; XXX
        RET

; цвет выжившей клетки по прежнему цвету (0–2: была пуста → жёлтая)
ALIVE:  .db 10, 10, 10, 10, 10, 10, 10, 10, 10, 14, 9, 10, 12, 12, 13, 9
; угасание следа: живые цвета → 2 → 1 → 0
FADE:   .db 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 2, 0, 2, 2, 2, 2
`;

  const SNAKE = `; ═══ «Змейка» ═══
; Стрелки — поворот. Края экрана сквозные.
; Каждые 4 яблока змейка ускоряется.

SX    = 0x800          ; кольцевой буфер X сегментов
SY    = 0x900          ; кольцевой буфер Y
HEAD  = 0xA00
TAIL  = 0xA01
DIR   = 0xA02          ; 0 ↑  1 →  2 ↓  3 ←
LASTD = 0xA03          ; направление последнего шага
SCORE = 0xA04
SPEED = 0xA05          ; кадров на шаг

C_HEAD = 10
C_BODY = 11
C_FOOD = 8

start:  CALL cls
        MOV  R0, 0
        ST   [SCORE], R0
        OUT  2, R0
        MOV  R0, 8
        ST   [SPEED], R0
        MOV  R0, 1
        ST   [DIR], R0
        ST   [LASTD], R0
        MOV  R0, 0             ; змейка из 4 сегментов
        ST   [TAIL], R0
        MOV  R1, 6
init:   LDI  SX
        ADDI R0
        ST   [I], R1
        LDI  SY
        ADDI R0
        MOV  R2, 16
        ST   [I], R2
        VID  R1, R2
        MOV  R3, C_BODY
        ST   [I], R3
        INC  R1
        INC  R0
        CMP  R0, 4
        JNZ  init
        DEC  R0
        ST   [HEAD], R0
        CALL food

game:   LD   R7, [SPEED]       ; ждём SPEED кадров и слушаем стрелки
gw:     WAIT
        IN   R0, 0
        JZ   gnk
        CMP  R0, 5
        JNC  gnk
        DEC  R0
        LD   R1, [LASTD]
        MOV  R2, R0
        XOR  R2, R1
        CMP  R2, 2             ; разворот на 180° запрещён
        JZ   gnk
        ST   [DIR], R0
gnk:    DEC  R7
        JNZ  gw
        MOV  R0, 0
        OUT  3, R0             ; звук выключаем

        LD   R0, [HEAD]        ; голова → R1, R2
        LDI  SX
        ADDI R0
        LD   R1, [I]
        LDI  SY
        ADDI R0
        LD   R2, [I]
        VID  R1, R2            ; бывшая голова становится телом
        MOV  R3, C_BODY
        ST   [I], R3
        LD   R3, [DIR]
        ST   [LASTD], R3
        LDI  DX
        ADDI R3
        LD   R4, [I]
        ADD  R1, R4
        AND  R1, 31
        LDI  DY
        ADDI R3
        LD   R4, [I]
        ADD  R2, R4
        AND  R2, 31
        VID  R1, R2            ; что впереди?
        LD   R5, [I]
        CMP  R5, C_FOOD
        JZ   eat
        CMP  R5, 0
        JNZ  die

        LD   R6, [TAIL]        ; обычный шаг: хвост стирается
        LDI  SX
        ADDI R6
        LD   R3, [I]
        LDI  SY
        ADDI R6
        LD   R4, [I]
        VID  R3, R4
        MOV  R5, 0
        ST   [I], R5
        INC  R6
        ST   [TAIL], R6
        JMP  move

eat:    LD   R5, [SCORE]
        INC  R5
        ST   [SCORE], R5
        OUT  2, R5
        MOV  R6, 31
        OUT  3, R6             ; «дзынь»
        AND  R5, 3             ; каждые 4 яблока — быстрее
        JNZ  nofast
        LD   R5, [SPEED]
        CMP  R5, 4
        JC   nofast
        DEC  R5
        ST   [SPEED], R5
nofast: CALL food

move:   LD   R0, [HEAD]
        INC  R0
        ST   [HEAD], R0
        LDI  SX
        ADDI R0
        ST   [I], R1
        LDI  SY
        ADDI R0
        ST   [I], R2
        VID  R1, R2
        MOV  R5, C_HEAD
        ST   [I], R5
        JMP  game

die:    MOV  R5, 3
        OUT  3, R5             ; низкий гул
        VID  R1, R2
        MOV  R5, C_FOOD
        ST   [I], R5
        MOV  R7, 50
dw:     WAIT
        DEC  R7
        JNZ  dw
        MOV  R5, 0
        OUT  3, R5
        JMP  start

; еда в случайной пустой клетке (R1, R2 сохраняются)
food:   PUSH R1
        PUSH R2
fr:     IN   R1, 1
        AND  R1, 31
        IN   R2, 1
        AND  R2, 31
        VID  R1, R2
        LD   R5, [I]
        JNZ  fr
        MOV  R5, C_FOOD
        ST   [I], R5
        POP  R2
        POP  R1
        RET

cls:    LDI  0xC00             ; очистка экрана: 4 × 256 байт
        MOV  R0, 0
        MOV  R1, 0
        MOV  R2, 4
cl:     ST   [I], R0
        INCI
        DEC  R1
        JNZ  cl
        DEC  R2
        JNZ  cl
        RET

DX:     .db 0, 1, 0, 255
DY:     .db 255, 0, 1, 0
`;

  const HEART = `; ═══ «Сердце» ═══
; Около 70 ударов в минуту: систола, остывание, диастола.
; Вокруг — искры, которые гаснут белым → серым.
; Если снизить частоту процессора, сердце начнёт «замирать».

BEATS = 0xA00

start:  CALL cls
beat:   MOV  R6, 8             ; систола: большое красное сердце
        CALL big
        MOV  R0, 12
        OUT  3, R0             ; «тук»
        MOV  R0, 0xFF
        OUT  4, R0
        MOV  R7, 7
        CALL frames
        MOV  R0, 0
        OUT  3, R0
        MOV  R6, 14            ; остывает до розового
        CALL big
        MOV  R0, 0x3C
        OUT  4, R0
        MOV  R7, 8
        CALL frames
        MOV  R6, 0             ; диастола: маленькое сердце
        CALL big
        MOV  R6, 8
        CALL small
        MOV  R0, 0x18
        OUT  4, R0
        MOV  R7, 36
        CALL frames
        MOV  R6, 0
        CALL small
        LD   R0, [BEATS]
        INC  R0
        ST   [BEATS], R0
        OUT  2, R0
        JMP  beat

; ждать R7 кадров, каждый кадр — искры
frames: CALL spark
        WAIT
        DEC  R7
        JNZ  frames
        RET

spark:  IN   R3, 1             ; новая искра в пустой клетке
        AND  R3, 31
        IN   R4, 1
        AND  R4, 31
        VID  R3, R4
        LD   R0, [I]
        JNZ  sp0
        MOV  R0, 7
        ST   [I], R0
sp0:    IN   R0, 2             ; гасим искры раз в 3 кадра
        AND  R0, 3
        JNZ  spx
        LDI  0xC00
        MOV  R1, 0
        MOV  R2, 4
sp1:    LD   R0, [I]
        CMP  R0, 5
        JC   sp2               ; < 5 — не искра
        CMP  R0, 8
        JNC  sp2               ; ≥ 8 — это сердце
        DEC  R0                ; 7 → 6 → 5 → погасла
        CMP  R0, 4
        JNZ  sp3
        MOV  R0, 0
sp3:    ST   [I], R0
sp2:    INCI
        DEC  R1
        JNZ  sp1
        DEC  R2
        JNZ  sp1
spx:    RET

big:    LDI  BIGMAP              ; большое сердце, строка 9
        MOV  R4, 9
        MOV  R5, 13
        JMP  draw
small:  LDI  SMALLMAP            ; маленькое, строка 11
        MOV  R4, 11
        MOV  R5, 9

; рисует битовую маску 16 × R5 цветом R6; I → маска, R4 — верхняя строка
draw:   LD   R2, [I]
        INCI
        LD   R3, [I]
        INCI
        PUSHI                  ; VID испортит I — сохраним
        MOV  R0, 8
        MOV  R1, 8
d1:     SHL  R2
        JNC  d1n
        VID  R0, R4
        ST   [I], R6
d1n:    INC  R0
        DEC  R1
        JNZ  d1
        MOV  R1, 8
d2:     SHL  R3
        JNC  d2n
        VID  R0, R4
        ST   [I], R6
d2n:    INC  R0
        DEC  R1
        JNZ  d2
        POPI
        INC  R4
        DEC  R5
        JNZ  draw
        RET

cls:    LDI  0xC00
        MOV  R0, 0
        MOV  R1, 0
        MOV  R2, 4
cl:     ST   [I], R0
        INCI
        DEC  R1
        JNZ  cl
        DEC  R2
        JNZ  cl
        RET

BIGMAP: .db 0x38, 0x38, 0x7C, 0x7C, 0xFE, 0xFE, 0xFF, 0xFE
        .db 0xFF, 0xFE, 0xFF, 0xFE, 0x7F, 0xFC, 0x3F, 0xF8
        .db 0x1F, 0xF0, 0x0F, 0xE0, 0x07, 0xC0, 0x03, 0x80
        .db 0x01, 0x00
SMALLMAP: .db 0x0C, 0x60, 0x1E, 0xF0, 0x3F, 0xF8, 0x3F, 0xF8
        .db 0x1F, 0xF0, 0x0F, 0xE0, 0x07, 0xC0, 0x03, 0x80
        .db 0x01, 0x00
`;

  const STARS = `; ═══ «Звёзды» ═══
; Параллакс в три слоя: дальние звёзды ползут, ближние летят.
; Стрелки ↑ ↓ ведут корабль.

N     = 40
STX   = 0x800
STY   = 0x840
STL   = 0x880          ; слой звезды: 0 дальний, 1, 2 ближний
SHIPY = 0xA00

start:  CALL cls
        MOV  R0, 0
si:     IN   R1, 1
        AND  R1, 31
        LDI  STX
        ADDI R0
        ST   [I], R1
        IN   R1, 1
        AND  R1, 31
        LDI  STY
        ADDI R0
        ST   [I], R1
        IN   R1, 1
        AND  R1, 3
        CMP  R1, 3
        JNZ  sl
        MOV  R1, 0
sl:     LDI  STL
        ADDI R0
        ST   [I], R1
        INC  R0
        CMP  R0, N
        JNZ  si
        MOV  R0, 15
        ST   [SHIPY], R0

frame:  WAIT
        IN   R7, 2             ; номер кадра
        MOV  R6, 0
        CALL ship              ; стираем корабль
        IN   R0, 0
        LD   R1, [SHIPY]
        CMP  R0, 1
        JNZ  f1
        DEC  R1
f1:     CMP  R0, 3
        JNZ  f2
        INC  R1
f2:     CMP  R1, 2
        JNC  f3
        MOV  R1, 2
f3:     CMP  R1, 30
        JC   f4
        MOV  R1, 29
f4:     ST   [SHIPY], R1

        MOV  R0, 0
st:     LDI  STL
        ADDI R0
        LD   R3, [I]           ; слой
        LDI  MASK
        ADDI R3
        LD   R4, [I]
        AND  R4, R7
        JNZ  sdraw             ; в этом кадре слой стоит
        LDI  STX
        ADDI R0
        LD   R1, [I]
        LDI  STY
        ADDI R0
        LD   R2, [I]
        VID  R1, R2
        LD   R5, [I]
        CMP  R5, 8             ; не стираем корабль
        JNC  smove
        MOV  R5, 0
        ST   [I], R5
smove:  DEC  R1
        AND  R1, 31
        LDI  STX
        ADDI R0
        ST   [I], R1
        CMP  R1, 31            ; ушла за край — новая высота
        JNZ  sdraw
        IN   R2, 1
        AND  R2, 31
        LDI  STY
        ADDI R0
        ST   [I], R2
sdraw:  LDI  STX
        ADDI R0
        LD   R1, [I]
        LDI  STY
        ADDI R0
        LD   R2, [I]
        LDI  COL
        ADDI R3
        LD   R5, [I]
        VID  R1, R2
        LD   R4, [I]
        CMP  R4, 8             ; поверх корабля не рисуем
        JNC  snext
        ST   [I], R5
snext:  INC  R0
        CMP  R0, N
        JNZ  st

        MOV  R6, 1             ; рисуем корабль
        CALL ship
        JMP  frame

; корабль у левого края: R6 = 0 — стереть, иначе нарисовать
ship:   LD   R1, [SHIPY]
        MOV  R0, 2
        LDI  SHAPE
sh:     LD   R2, [I]           ; dx
        CMP  R2, 255
        JZ   shx
        INCI
        LD   R3, [I]           ; dy
        INCI
        LD   R4, [I]           ; цвет
        INCI
        PUSHI
        ADD  R2, R0
        ADD  R3, R1
        CMP  R6, 0
        JNZ  sh1
        MOV  R4, 0
sh1:    CMP  R4, 9             ; пламя мерцает
        JNZ  sh2
        MOV  R5, R7
        AND  R5, 2
        JZ   sh2
        MOV  R4, 10
sh2:    VID  R2, R3
        ST   [I], R4
        POPI
        JMP  sh
shx:    RET

cls:    LDI  0xC00
        MOV  R0, 0
        MOV  R1, 0
        MOV  R2, 4
cl:     ST   [I], R0
        INCI
        DEC  R1
        JNZ  cl
        DEC  R2
        JNZ  cl
        RET

MASK:   .db 3, 1, 0            ; дальний слой — раз в 4 кадра
COL:    .db 5, 6, 7
; корабль: тройки dx, dy, цвет; 255 — конец
SHAPE:  .db 0, 0, 9,  1, 255, 12, 2, 255, 12
        .db 1, 0, 12, 2, 0, 12, 3, 0, 12, 4, 0, 7
        .db 1, 1, 12, 2, 1, 12
        .db 255
`;

  const RAINBOW = `; ═══ «Радуга» ═══
; Цвет пикселя = (x² + y²) / 32 − t: кольца бегут от центра.
; Умножения у КС-8 нет — квадраты лежат в таблице.

T = 0xA00

frame:  LD   R6, [T]
        INC  R6
        ST   [T], R6
        OUT  4, R6
        MOV  R1, 0
ry:     LDI  SQ
        ADDI R1
        LD   R3, [I]           ; (y − 16)² / 4
        MOV  R0, 0
rx:     LDI  SQ
        ADDI R0
        LD   R2, [I]           ; (x − 16)² / 4
        ADD  R2, R3
        SHR  R2
        SHR  R2
        SHR  R2
        SUB  R2, R6
        AND  R2, 7
        LDI  PAL
        ADDI R2
        LD   R2, [I]
        VID  R0, R1
        ST   [I], R2
        INC  R0
        CMP  R0, 32
        JNZ  rx
        INC  R1
        CMP  R1, 32
        JNZ  ry
        WAIT
        WAIT
        JMP  frame

SQ:     .db 64, 56, 49, 42, 36, 30, 25, 20, 16, 12, 9, 6, 4, 2, 1, 0
        .db 0, 0, 1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 36, 42, 49, 56
PAL:    .db 8, 9, 10, 11, 12, 13, 14, 15
`;

  const PROGRAMS = [
    { id: 'life', name: 'Жизнь', src: LIFE, speed: 1000000,
      about: 'Клеточный автомат Конвея: ~100 тысяч команд на поколение. Пробел — новый засев.' },
    { id: 'snake', name: 'Змейка', src: SNAKE, speed: 1000000,
      about: 'Игра на 150 строках ассемблера. Стрелки — поворот, края сквозные.' },
    { id: 'heart', name: 'Сердце', src: HEART, speed: 1000000,
      about: 'Пульс с искрами. Снизьте частоту до 10 кГц — сердцу не хватит тактов.' },
    { id: 'stars', name: 'Звёзды', src: STARS, speed: 200000,
      about: 'Параллакс в три слоя. Стрелки ↑ ↓ ведут корабль.' },
    { id: 'rainbow', name: 'Радуга', src: RAINBOW, speed: 1000000,
      about: 'Кольца из таблицы квадратов: у процессора нет умножения.' },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = PROGRAMS;
  else root.KS8_PROGRAMS = PROGRAMS;
})(typeof window !== 'undefined' ? window : globalThis);
