/**
 * [플랫포머 게임 통합 엔진 - 전투 및 유틸리티 강화 버전]
 */

// [SECTION 1] 설정 및 전역 변수
// [SECTION 1] 설정 및 전역 변수
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1920;
canvas.height = 1080;
const SCALE = 1.5;
let currentMapIndex = 0;
const world = { width: 3000, height: 720 };
const camera = { x: 0 };

// tutorial 객체 - SECTION 6보다 먼저 선언해야 참조 오류 없음
const tutorial = {
    active:      false,
    pages:       [],
    currentPage: 0
};
// [SECTION 2] 자산 관리 (Asset Management)
// [SECTION 2] 자산 관리 (Asset Management)
const ASSETS = {
    PLAYER_STAND:    './assets/images/player_stand.png',
    PLAYER_MOVE1:    './assets/images/player_move1.png',
    PLAYER_MOVE2:    './assets/images/player_move2.png',
    PLAYER_JUMP1:    './assets/images/player_jump1.png',
    PLAYER_JUMP2:    './assets/images/player_jump2.png',
    ATTACK1:         './assets/images/player_attack1.png',
    ATTACK2:         './assets/images/player_attack2.png',
    JUMP_ATTACK1:    './assets/images/player_jump_attack1.png',
    JUMP_ATTACK2:    './assets/images/player_jump_attack2.png',
    STORY1:          './assets/images/player_story1.png',
    NPC1_STORY:      './assets/images/npc1_story.png',
    PROJECTILE:      './assets/images/player_projectile.png',
    ENEMY1_STAND:    './assets/images/enemy1_stand.png',
    ENEMY1_MOVE:     './assets/images/enemy1_move.png',
    ENEMY1_ATTACK1:  './assets/images/enemy1_attack1.png',
    ENEMY1_ATTACK2:  './assets/images/enemy1_attack2.png',
    BOSS_STORY1:     './assets/images/boss_story1.png',
    ENEMY1_ATTACK3: './assets/images/enemy1_attack3.png',
    ENEMY2_STAND:      './assets/images/enemy2_stand.png',
    ENEMY2_MOVE:      './assets/images/enemy2_move.png',
    ENEMY2_ATTACK1:    './assets/images/enemy2_attack1.png',
    ENEMY2_ATTACK2:    './assets/images/enemy2_attack2.png'
};

const SOUNDS = {
    JUMP:           { src: './assets/audio/player_jump.wav',      volume: 0.2 },
    ATTACK1:        { src: './assets/audio/player_attack1.wav',   volume: 0.5 },
    ATTACK2:        { src: './assets/audio/player_attack2.wav',   volume: 0.5 },
    DASH:           { src: './assets/audio/player_dash.wav',      volume: 0.5 },
    TELEPORT:       { src: './assets/audio/player_teleport.wav',  volume: 0.5 },
    ULT_1:   { src: './assets/audio/ult_1.wav',     volume: 0.5 },
    ULT_FINAL: { src: './assets/audio/ult_final.wav', volume: 0.5 }, 
    ENEMY1_ATTACK1: { src: './assets/audio/enemy1_attack1.wav',   volume: 0.5 },
    ENEMY1_ATTACK2: { src: './assets/audio/enemy1_attack2.wav',   volume: 0.5 },
    ENEMY2_ATTACK1: { src: './assets/audio/enemy2_attack1.wav', volume: 0.5 }
};

const BGM = {
    BGM1: './assets/audio/bgm1.mp3'
};

const sprites = {};
const sounds  = {};

// BGM 플레이어 - 나중에 맵/이벤트별 전환을 여기서 관리
const bgmPlayer = {
    current: null,   // 현재 재생 중인 Audio 객체
    currentKey: '',  // 현재 재생 중인 BGM 키

    play(key, fadeIn = false) {
        if (this.currentKey === key) return; // 이미 같은 곡이면 무시
        const src = BGM[key];
        if (!src) return;

        this.stop();

        const audio = new Audio(src);
        audio.loop   = true;
        audio.volume = fadeIn ? 0 : 0.6;
        audio.play().catch(() => {});

        if (fadeIn) {
            let vol = 0;
            const fade = setInterval(() => {
                vol = Math.min(vol + 0.05, 0.6);
                audio.volume = vol;
                if (vol >= 0.6) clearInterval(fade);
            }, 50);
        }

        this.current    = audio;
        this.currentKey = key;
    },

    stop(fadeOut = false) {
        if (!this.current) return;
        if (fadeOut) {
            const target = this.current;
            const fade = setInterval(() => {
                target.volume = Math.max(target.volume - 0.05, 0);
                if (target.volume <= 0) {
                    target.pause();
                    clearInterval(fade);
                }
            }, 50);
        } else {
            this.current.pause();
        }
        this.current    = null;
        this.currentKey = '';
    },

    // 다른 곡으로 전환 (페이드 아웃 후 페이드 인)
    crossfade(key) {
        this.stop(true);
        setTimeout(() => this.play(key, true), 600);
    }
};

function loadAssets(callback) {
    const imgKeys = Object.keys(ASSETS);
    const sndKeys = Object.keys(SOUNDS);
    let loaded = 0;
    const total = imgKeys.length + sndKeys.length;

    imgKeys.forEach(key => {
        const img = new Image();
        img.src = ASSETS[key];
        img.decode().then(() => {
            sprites[key] = img;
            loaded++;
            if (loaded === total) callback();
        }).catch(() => {
            sprites[key] = img;
            loaded++;
            if (loaded === total) callback();
        });
    });

    sndKeys.forEach(key => {
        const { src, volume } = SOUNDS[key];
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.volume  = volume;
        sounds[key]   = audio;
        audio.addEventListener('canplaythrough', () => {
            loaded++;
            if (loaded === total) callback();
        }, { once: true });
        audio.addEventListener('error', () => {
            loaded++;
            if (loaded === total) callback();
        }, { once: true });
        audio.load();
    });
}

function playSound(key) {
    const snd = sounds[key];
    if (!snd) return;
    snd.currentTime = 0;
    snd.play().catch(() => {});
}
// [SECTION 3] 입력 감지 (Input Control)
const keys = { a: false, d: false, s: false, w: false, space: false, spacePressed: false, mouseLeft: false, mouseLeftPressed: false, q: false, qPressed: false };

let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    Object.values(sounds).forEach(snd => {
        const v = snd.volume;
        snd.volume = 0;
        snd.play().then(() => {
            snd.pause();
            snd.currentTime = 0;
            snd.volume = v;
        }).catch(() => {});
    });
    // 언락 후 BGM 시작
    bgmPlayer.play('BGM1');
}

window.addEventListener('mousedown', (e) => {
    unlockAudio();
    if (e.button === 0) {
        keys.mouseLeft = true;
        keys.mouseLeftPressed = true;
    }
    if (e.button === 2) {
        const now = Date.now();
        if (!player.isDashing && now - player.lastDashTime > player.dashCooldown) {
            player.isAttacking = false;
            player.attackTimer = 0;
            startDash();
        }
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        keys.mouseLeft = false;
        keys.mouseLeftPressed = false;
    }
});
window.addEventListener('keydown', (e) => {
    unlockAudio();
    const key = e.key.toLowerCase();
    if (key === 'a') keys.a = true;
    if (key === 'd') keys.d = true;
    if (key === 's') keys.s = true;
    if (key === 'w') keys.w = true;
    if (key === ' ' && !keys.spacePressed) {
        keys.space = true;
        keys.spacePressed = true;
    }
    if (key === 'e') handleEKey();
    if (key === 'f') handleFKey();
    if (key === 'q' && !keys.qPressed) { keys.q = true; keys.qPressed = true; handleQKey(); }
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'a') keys.a = false;
    if (key === 'd') keys.d = false;
    if (key === 's') keys.s = false;
    if (key === 'w') keys.w = false;
    if (key === ' ') { keys.space = false; keys.spacePressed = false; }
    if (key === 'q') { keys.q = false; keys.qPressed = false; }
});
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
const player = {
    x: 100, y: 500, width: 60, height: 60,
    dx: 0, dy: 0,
    speed: 7, jumpForce: 16, gravity: 0.8, friction: 0.8,
    grounded: false, jumpCount: 0, maxJumps: 2,
    isDescending: false, isDashing: false,
    state: 'idle', direction: 'right',
    isAttacking: false, attackFrame: 1, attackTimer: 0, hasAirAttacked: false,
    jumpTimer: 0, moveTimer: 0, moveFrame: 1,
    dashSpeed: 18, dashDuration: 120, dashCooldown: 500, lastDashTime: 0,
    teleportCooldown: 3000, lastTeleportTime: 0,
    isInvincible: false,
    invincibleTimer: 0,
    hp: 100, maxHp: 100,
    attackPower: 20,
    airAttackOriginY: 0,
    gauge: 0, maxGauge: 100,
    gaugePerHit: 10,

    // 필살기 연출 상태
    ultPhase: 'none',   // 'none' | 'vanish' | 'hidden' | 'camMove' | 'fire'
    ultTimer: 0,
    ultTargetX: 0,
    ultTargetY: 0,
    ultCamStartX: 0,
    ultCamDuration: 33,
    ultVanishDuration: 9,
    ultHiddenDuration: 5,
};

// [SECTION 5] 지형 데이터 (Map / Platforms)
// [SECTION 5] 지형 데이터 (Map / Platforms)
const MAP_DATA = [
    {
        id: 0,
        worldWidth: 3000,
        worldHeight: 720,
        bgColor: '#87CEEB',
        platforms: [
            { x: 0,    y: 670, width: 3000, height: 50,  type: 'solid' },
            { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall'  },
            { x: 3000, y: 0,   width: 60,   height: 520, type: 'wall'  },
            { x: 300,  y: 520, width: 200,  height: 20,  type: 'platform' },
            { x: 600,  y: 400, width: 250,  height: 20,  type: 'platform' },
            { x: 1000, y: 300, width: 200,  height: 20,  type: 'platform' },
            { x: 1400, y: 450, width: 300,  height: 20,  type: 'platform' },
            { x: 1800, y: 350, width: 200,  height: 20,  type: 'platform' }
        ],
        signs: [
            {
                x: 350, y: 630,
                width: 30, height: 40,
                interactRange: 80,
                cast: ['STORY1'],
                dialogue: [
                    { speaker: '플레이어', text: '너탁경구',            speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: '플레이어', text: '비행탁경구',           speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: '플레이어', text: '...어떻게사람이름이',  speakerType: 'player', illustKey: 'STORY1' }
                ]
            },
            {
                x: 800, y: 630,
                width: 30, height: 40,
                interactRange: 80,
                cast: ['STORY1', 'NPC1_STORY'],
                dialogue: [
                    { speaker: '플레이어', text: '당신은탁경구입니다.',        speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: 'NPC',      text: '정말?',                     speakerType: 'npc',    illustKey: 'NPC1_STORY' },
                    { speaker: '플레이어', text: '탁구치는탁경구탁쳐서떨구기', speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: 'NPC',      text: '저는탁경구입니다.',           speakerType: 'npc',    illustKey: 'NPC1_STORY' }
                ]
            }
        ],
        spikes: [
            { x: 500,  y: 650, width: 60, height: 20, damage: 10 },
            { x: 1200, y: 650, width: 60, height: 20, damage: 10 }
        ],
        enemies: [
            { type: 'enemy1', x: 900,  y: 610 },
            { type: 'enemy1', x: 1600, y: 610 },
            { type: 'enemy2', x: 2300, y: 430 },
            { type: 'enemy2', x: 2650, y: 300 }
        ],
        dummies: [
            { x: 200, y: 670 },
            { x: 1100, y: 670 }
        ],
        transitions: [
            {
                x: 2990, y: 520,
                width: 80, height: 150,
                toMap: 1, spawnX: 100, spawnY: 610, direction: 'right'
            }
        ]
    },
    {
        id: 1,
        worldWidth: 3000,
        worldHeight: 720,
        bgColor: '#4a5568',
        platforms: [
            { x: 0,    y: 670, width: 3000, height: 50,  type: 'solid' },
            { x: -60,  y: 0,   width: 60,   height: 520, type: 'wall'  },
            { x: 3000, y: 0,   width: 60,   height: 720, type: 'wall'  },
            { x: 400,  y: 500, width: 200,  height: 20,  type: 'platform' },
            { x: 800,  y: 380, width: 250,  height: 20,  type: 'platform' },
            { x: 1300, y: 280, width: 200,  height: 20,  type: 'platform' }
        ],
        signs: [],
        spikes: [],
        enemies: [
            { type: 'enemy1', x: 600, y: 610 }
        ],
        dummies: [],
        // 맵 진입 시 자동 실행 이벤트
        onEnter: () => {
            dialogue.active      = true;
            dialogue.cast        = ['STORY1', 'BOSS_STORY1'];
            dialogue.lines       = [
                { speaker: '???',    text: '...허',           speakerType: 'npc',    illustKey: 'BOSS_STORY1' },
                { speaker: '플레이어', text: '당신은...',  speakerType: 'player', illustKey: 'STORY1' },
                { speaker: '???',    text: '당황하는대사',      speakerType: 'npc',    illustKey: 'BOSS_STORY1' },
                { speaker: '???',    text: '탁경구',      speakerType: 'npc',    illustKey: 'BOSS_STORY1' },
                { speaker: '???',    text: '탁경구탁',      speakerType: 'npc',    illustKey: 'BOSS_STORY1' },
                { speaker: '플레이어', text: '결국.',      speakerType: 'player', illustKey: 'STORY1' },
                { speaker: '???',    text: '그래. 탁경구',      speakerType: 'npc',    illustKey: 'BOSS_STORY1' }
            ];
            dialogue.currentLine = 0;
            dialogue.speakerName = dialogue.lines[0].speaker;
            dialogue.speakerType = dialogue.lines[0].speakerType;
            dialogue.illustKey   = dialogue.lines[0].illustKey;
            dialogue.displayText = '';
            dialogue.charIndex   = 0;
            dialogue.typingTimer = 0;
            dialogue.isFinished  = false;
        },
        transitions: [
            {
                x: -70, y: 520,
                width: 80, height: 150,
                toMap: 0, spawnX: 2870, spawnY: 610, direction: 'left'
            }
        ]
    }
];

let platforms = [];
let signs     = [];
let spikes    = [];
let enemies   = [];
let dummies   = [];

function loadMap(mapIndex) {
    const map       = MAP_DATA[mapIndex];
    currentMapIndex = mapIndex;
    world.width     = map.worldWidth;
    world.height    = map.worldHeight;
    platforms       = map.platforms;
    signs           = map.signs;
    spikes          = map.spikes || [];
    enemies         = (map.enemies || []).map(e => createEnemy(e.type, e.x, e.y));
    dummies         = (map.dummies || []).map(d => createDummy(d.x, d.y));

    // 맵 진입 이벤트 실행
    if (map.onEnter) map.onEnter();
}
// [SECTION 6] 물리 연산 및 업데이트 (Update Logic)
// [SECTION 6] 물리 연산 및 업데이트
function update() {
    updateDialogue();
    updateAfterimages();
    if (player.isDashing) createAfterimage();

    if (mapTransition.active) {
        updateMapTransition();
        draw();
        requestAnimationFrame(update);
        return;
    }
    // 필살기 연출 중 — 입력/물리 정지
    if (player.ultPhase !== 'none') {
        updateUltimatePhase();
        draw();
        requestAnimationFrame(update);
        return;
    }

    if (dialogue.active || tutorial.active) {
        player.dx = 0;
        draw();
        requestAnimationFrame(update);
        return;
    }

    // 6-1: 공격 처리
    if (keys.mouseLeft && !player.isDashing) {
        if (player.grounded) {
            player.isAttacking = true;
            player.dx *= 0.3;
            if (player.attackTimer <= 0) {
                player.attackFrame = (player.attackFrame === 1) ? 2 : 1;
                player.attackTimer = 10;
                playSound(player.attackFrame === 1 ? 'ATTACK1' : 'ATTACK2');
                checkPlayerAttackHit();
            }
        } else if (!player.hasAirAttacked && keys.mouseLeftPressed) {
            player.isAttacking       = true;
            player.hasAirAttacked    = true;
            player.airAttackOriginY  = player.y;   // 발동 시점 y 저장
            if (player.jumpTimer > 6) player.dy = -9;
            player.dx         *= 0.2;
            player.attackFrame  = 2;
            player.attackTimer  = 15;
            keys.mouseLeftPressed = false;
            playSound('ATTACK1');
            checkPlayerAttackHit();
        }
    }

    if (player.attackTimer > 0) {
        player.attackTimer--;
        if (!player.isDashing) player.dx *= 0.5;
    } else {
        player.isAttacking = false;
    }

    // 6-2: 수평 이동
    if (player.isDashing) {
        const dashDir = (player.direction === 'right' ? 1 : -1);
        player.dx = dashDir * player.dashSpeed;
    } else {
        if (keys.a) {
            player.dx = player.isAttacking ? -player.speed * 0.5 : -player.speed;
            player.direction = 'left';
        } else if (keys.d) {
            player.dx = player.isAttacking ? player.speed * 0.5 : player.speed;
            player.direction = 'right';
        } else {
            player.dx *= player.friction;
            if (Math.abs(player.dx) < 0.5) player.dx = 0;
        }
    }

    // 6-3: 애니메이션 상태
    if (player.isAttacking) {
        player.state = player.grounded
            ? `attack${player.attackFrame}`
            : `jump_attack${(player.attackTimer > 7) ? 1 : 2}`;
    } else if (player.isDashing) {
        player.state = 'walk';
    } else if (!player.grounded) {
        player.state = (player.dy < 0) ? 'jump1' : 'jump2';
    } else {
        player.state = (keys.a || keys.d) ? 'walk' : 'idle';
    }

    // 6-4: 수직 이동 및 중력
    if (!player.isDashing) {
        if (keys.space && player.jumpCount < player.maxJumps) {
            if (keys.s && player.grounded) {
                const onSolid = platforms.some(plat =>
                    (plat.type || 'platform') === 'solid' &&
                    player.x + player.width > plat.x &&
                    player.x < plat.x + plat.width &&
                    Math.abs((player.y + player.height) - plat.y) <= 12
                );
                if (!onSolid) {
                    player.isDescending = true;
                    player.grounded     = false;
                    player.y           += 10;
                }
            } else {
                player.dy = -player.jumpForce;
                player.jumpCount++;
                player.grounded       = false;
                player.jumpTimer      = 0;
                keys.mouseLeftPressed = false;
                playSound('JUMP');
            }
            keys.space = false;
        }
        if (!player.grounded) player.jumpTimer++;
        const gravityForce = (player.isAttacking && player.dy >= 0) ? player.gravity * 0.4 : player.gravity;
        player.dy += gravityForce;
        if (player.dy > 20) player.dy = 20;
    } else {
        player.dy      = 0;
        player.jumpTimer = 0;
    }

    player.x += player.dx;
    player.y += player.dy;

    // 6-5: 지형 충돌
    player.grounded = false;
    platforms.forEach(plat => {
        const type = plat.type || 'platform';
        if (type === 'wall') {
            if (player.x + player.width  > plat.x &&
                player.x                 < plat.x + plat.width &&
                player.y + player.height > plat.y &&
                player.y                 < plat.y + plat.height) {
                if (player.dx > 0) player.x = plat.x - player.width;
                else if (player.dx < 0) player.x = plat.x + plat.width;
                player.dx = 0;
            }
        } else if (type === 'solid') {
            if (player.x + player.width  > plat.x &&
                player.x                 < plat.x + plat.width &&
                player.y + player.height >= plat.y &&
                player.y + player.height <= plat.y + 20 &&
                player.dy >= 0) {
                player.y        = plat.y - player.height;
                player.dy       = 0;
                player.grounded = true;
                player.jumpCount = 0;
                player.jumpTimer = 0;
                player.hasAirAttacked = false;
                player.isDescending   = false;
            }
        } else {
            if (player.x + player.width  > plat.x &&
                player.x                 < plat.x + plat.width &&
                player.y + player.height >= plat.y &&
                player.y + player.height <= plat.y + 20 &&
                player.dy >= 0) {
                if (!player.isDescending) {
                    player.y        = plat.y - player.height;
                    player.dy       = 0;
                    player.grounded = true;
                    player.jumpCount = 0;
                    player.jumpTimer = 0;
                    player.hasAirAttacked = false;
                }
            }
        }
    });
    if (player.dy > 5) player.isDescending = false;

    // 6-6: 가시 충돌
    checkSpikes();

    // 6-7: 무적 시간 업데이트
    if (player.isInvincible && !player.isDashing) {
        player.invincibleTimer--;
        if (player.invincibleTimer <= 0) {
            player.isInvincible    = false;
            player.invincibleTimer = 0;
        }
    }

    // 6-8: 적 업데이트
    updateEnemies();
    updateDummies();

    // 6-9: 맵 전환 트리거 체크
    checkMapTransitions();

    // 6-10: 카메라 및 경계
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > world.width) player.x = world.width - player.width;
    const logicalW = canvas.width / SCALE;
    camera.x = player.x - logicalW / 2 + player.width / 2;
    if (camera.x < 0) camera.x = 0;
    if (camera.x > world.width - logicalW) camera.x = world.width - logicalW;

    projectile.update();
    draw();
    requestAnimationFrame(update);
}

function checkPlayerAttackHit() {
    if (player.grounded && player.attackFrame !== 2) return;

    const atkDir   = player.direction === 'right' ? 1 : -1;
    const playerCX = player.x + player.width / 2;

    const frontRange = 80;
    const backRange  = 40;

    const atkXMin = playerCX - (atkDir === 1 ? backRange  : frontRange);
    const atkXMax = playerCX + (atkDir === 1 ? frontRange : backRange);

    const currentCY = player.y + player.height / 2;
    const originCY  = player.grounded ? currentCY : player.airAttackOriginY + player.height / 2;
    const upwardBonus = player.grounded ? 0 : player.height * 0.4;
    const atkYMin = Math.min(currentCY, originCY) - upwardBonus;
    const atkYMax = Math.max(currentCY, originCY);

    let hitCharged = false;  // 이번 공격에 게이지 충전 여부

    enemies.forEach(e => {
        if (e.isDead || e.isInvincible) return;

        const scaleW   = (e.type === 'enemy1' && (e.attackFrame === 2 || e.attackFrame === 3)) ? 1.25 : 1.0;
        const scaleH   = (e.type === 'enemy1' && e.attackFrame === 2) ? 1.15 : 1.0;
        const hitW     = e.width  * scaleW * 1.0;
        const hitH     = e.height * 1.4   * scaleH;
        const hitLeft  = e.x + (e.attack3OffsetX || 0) - (hitW - e.width) / 2;
        const hitRight = hitLeft + hitW;
        const hitBot   = e.y + e.height;
        const hitTop   = hitBot - hitH;

        const inX = atkXMax >= hitLeft && atkXMin <= hitRight;
        const inY = (atkYMax + player.height / 2) >= hitTop &&
                    (atkYMin - player.height / 2) <= hitBot;

        if (inX && inY) {
            e.takeDamage(player.attackPower);
            if (!hitCharged) {
                player.gauge = Math.min(player.gauge + player.gaugePerHit, player.maxGauge);
                hitCharged = true;
            }
        }
    });

    // 허수아비 피격 판정
    dummies.forEach(d => {
        if (d.hitTimer > 0) return;
        const inX = atkXMax >= d.x && atkXMin <= d.x + d.width;
        const inY = (atkYMax + player.height / 2) >= d.y &&
                    (atkYMin - player.height / 2) <= d.y + d.height;
        if (inX && inY) {
            d.hitTimer  = 20;
            d.hitEffect = 8;
            if (!hitCharged) {
                player.gauge = Math.min(player.gauge + player.gaugePerHit, player.maxGauge);
                hitCharged = true;
            }
        }
    });
}
function checkSpikes() {
    if (player.isInvincible) return;
    for (const spike of spikes) {
        if (player.x + player.width  > spike.x &&
            player.x                 < spike.x + spike.width &&
            player.y + player.height > spike.y &&
            player.y                 < spike.y + spike.height) {
            player.hp              = Math.max(player.hp - spike.damage, 0);
            player.dy              = -player.jumpForce * 0.8;
            player.grounded        = false;
            player.jumpCount       = 1;
            player.isInvincible    = true;
            player.invincibleTimer = 90;
            break;
        }
    }
}
// [SECTION 7] 렌더링 (Rendering)
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(SCALE, SCALE);
    ctx.translate(-camera.x, 0);

    // 7-1: 배경
    ctx.fillStyle = MAP_DATA[currentMapIndex].bgColor;
    ctx.fillRect(0, 0, world.width, world.height);

    // 7-2: 플랫폼
    platforms.forEach(plat => {
        ctx.fillStyle = (plat.type === 'solid' || plat.type === 'wall') ? '#654321' : '#4A4A4A';
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
    });

    // 7-3: 가시
    spikes.forEach(spike => {
        const col  = 6;
        const tipW = spike.width / col;
        for (let i = 0; i < col; i++) {
            const sx = spike.x + i * tipW;
            ctx.fillStyle = '#888888';
            ctx.beginPath();
            ctx.moveTo(sx,           spike.y + spike.height);
            ctx.lineTo(sx + tipW,    spike.y + spike.height);
            ctx.lineTo(sx + tipW/2,  spike.y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#555';
            ctx.lineWidth   = 0.5;
            ctx.stroke();
        }
        ctx.fillStyle = '#666';
        ctx.fillRect(spike.x, spike.y + spike.height * 0.7, spike.width, spike.height * 0.3);
    });

    // 7-4: 표지판
    signs.forEach(sign => {
        ctx.fillStyle   = '#8B5E3C';
        ctx.fillRect(sign.x + sign.width / 2 - 4, sign.y + sign.height * 0.5, 8, sign.height * 0.5);
        ctx.fillStyle   = '#C8A96E';
        ctx.strokeStyle = '#5C3A1E';
        ctx.lineWidth   = 2;
        ctx.fillRect(sign.x, sign.y, sign.width, sign.height * 0.6);
        ctx.strokeRect(sign.x, sign.y, sign.width, sign.height * 0.6);
        ctx.fillStyle = '#3B1F0A';
        ctx.font      = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', sign.x + sign.width / 2, sign.y + sign.height * 0.38);

        const playerCX = player.x + player.width / 2;
        const signCX   = sign.x + sign.width / 2;
        if (Math.abs(playerCX - signCX) < sign.interactRange) {
            ctx.fillStyle = 'white';
            ctx.font      = 'bold 13px monospace';
            ctx.fillText('[F]', signCX, sign.y - 10);
        }
    });
    ctx.textAlign = 'left';

    // 7-5: 잔상
    // 7-5: 잔상 (필살기 연출 중엔 숨김)
    if (typeof afterimages !== 'undefined' && player.ultPhase === 'none') {
        afterimages.forEach(img => {
            drawSprite(img.imageKey, img.x, img.y, img.width, img.height, img.direction, img.opacity);
        });
    }

    // 7-6: 플레이어 스프라이트
    let currentKey = 'PLAYER_STAND';
    if (player.isAttacking) {
        if (player.grounded) {
            currentKey = (player.attackFrame === 1) ? 'ATTACK1' : 'ATTACK2';
        } else {
            currentKey = (player.attackTimer > 7) ? 'JUMP_ATTACK1' : 'JUMP_ATTACK2';
        }
    } else if (!player.grounded) {
        currentKey = (player.dy < 0) ? 'PLAYER_JUMP1' : 'PLAYER_JUMP2';
    } else if (keys.a || keys.d) {
        player.moveTimer++;
        if (player.moveTimer > 8) {
            player.moveFrame = (player.moveFrame === 1) ? 2 : 1;
            player.moveTimer = 0;
        }
        currentKey   = `PLAYER_MOVE${player.moveFrame}`;
        player.state = 'walk';
    } else {
        currentKey       = 'PLAYER_STAND';
        player.moveTimer = 0;
        player.state     = 'idle';
    }

    // vanish/hidden/camMove 페이즈면 JUMP1 고정, fire 페이즈면 STAND
    if (player.ultPhase === 'vanish') {
        currentKey = 'PLAYER_JUMP1';
    } else if (player.ultPhase === 'fire') {
        currentKey = 'PLAYER_STAND';
    }
    player.currentDrawingKey = currentKey;

    let drawWidth  = player.width;
    let drawHeight = player.height * 1.3;
    if (player.isAttacking) {
        if (currentKey === 'ATTACK2' || currentKey === 'JUMP_ATTACK2') {
            drawWidth  *= 1.69;
            drawHeight *= 1.32;
        } else {
            drawWidth  *= 1.3;
            drawHeight *= 1.1;
        }
    } else if (player.state === 'walk') {
        drawWidth *= 1.3;
    }
    const drawX = player.x - (drawWidth  - player.width)  / 2;
    const drawY = (player.y + player.height) - drawHeight;

    // 페이즈별 렌더링 제어
    let blinkVisible;
    if (player.ultPhase === 'vanish') {
        blinkVisible = true;
    } else if (player.ultPhase === 'hidden' ||
               player.ultPhase === 'camMove' ||
               player.ultPhase === 'fire') {
        blinkVisible = false;
    } else if (player.ultPhase === 'appear') {
        blinkVisible = Math.floor(Date.now() / 40) % 2 === 0;
    } else {
        blinkVisible = !player.isInvincible ||
                        player.isDashing     ||
                        Math.floor(Date.now() / 80) % 2 === 0;
    }
    if (blinkVisible) {
        const alpha = (player.isInvincible && !player.isDashing && player.ultPhase === 'none') ? 0.6 : 1;
        drawSprite(currentKey, drawX, drawY, drawWidth, drawHeight, player.direction, alpha);
    }

    // 7-5-1: 순간이동 잔상
    updateTeleportTrails();
    drawTeleportTrails();
    drawUltParticles();
    drawSlashEffects();  // ← 추가

    // 7-6: 적 렌더링
    drawEnemies();
    drawDummies();
    // 7-6-1: 순간이동 잔상 (중복 호출 제거)
    // 7-7: 투사체
    projectile.draw();

    ctx.restore();

    // 7-8: UI / 대화창
    if (typeof drawUI       === 'function') drawUI();
    if (typeof drawDialogue === 'function') drawDialogue();
    if (typeof drawTutorial === 'function') drawTutorial();
    drawUltimate();

    // 7-9: 페이드 오버레이
    if (mapTransition.alpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${mapTransition.alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}
function drawSprite(key, x, y, w, h, dir, alpha) {
    const img         = sprites[key];
    const fallbackImg = sprites['PLAYER_STAND'];
    const targetImg   = (img && img.complete && img.naturalWidth !== 0) ? img : fallbackImg;
    if (targetImg && targetImg.complete) {
        ctx.save();
        ctx.globalAlpha = alpha;
        if (dir === 'right') {
            ctx.translate(x + w, y);
            ctx.scale(-1, 1);
            ctx.drawImage(targetImg, 0, 0, w, h);
        } else {
            ctx.drawImage(targetImg, x, y, w, h);
        }
        ctx.restore();
    } else {
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
        ctx.fillRect(x, y, w, h);
    }
}
// [SECTION 8] 투사체 시스템 (Projectile System)
const projectile = {
    active:    false,
    x:         0,
    y:         0,
    width:     28,
    height:    28,
    dx:        0,
    speed:     22,
    friction:  0.94,
    minSpeed:  0.3,
    angle:     0,
    spinSpeed: 0.55,
    minSpin:   0.04,
    direction: 1,

    fire(fromX, fromY, dir) {
        this.active    = true;
        this.x         = fromX;
        this.y         = fromY;
        this.direction = dir === 'left' ? -1 : 1;
        this.dx        = this.speed * this.direction;
        this.angle     = 0;
        this.spinSpeed = 0.55;
    },

    reset() {
        this.active = false;
        this.dx     = 0;
        this.angle  = 0;
    },

    checkCollision() {
        for (const plat of platforms) {
            const type = plat.type || 'platform';
            // platform 타입은 투사체 통과
            if (type === 'platform') continue;

            const overlapX = this.x + this.width  > plat.x &&
                             this.x                < plat.x + plat.width;
            const overlapY = this.y + this.height  > plat.y &&
                             this.y                < plat.y + plat.height;

            if (overlapX && overlapY) {
                const fromLeft  = (this.x + this.width)  - plat.x;
                const fromRight = (plat.x + plat.width)  - this.x;
                const fromTop   = (this.y + this.height)  - plat.y;
                const fromBot   = (plat.y + plat.height)  - this.y;
                const minX = Math.min(fromLeft, fromRight);
                const minY = Math.min(fromTop,  fromBot);

                if (minX < minY) {
                    this.dx = 0;
                    this.x  = fromLeft < fromRight
                        ? plat.x - this.width
                        : plat.x + plat.width;
                } else {
                    this.dx = 0;
                    this.y  = fromTop < fromBot
                        ? plat.y - this.height
                        : plat.y + plat.height;
                }
                return;
            }
        }
    },

    update() {
        if (!this.active) return;

        this.dx *= this.friction;
        this.x  += this.dx;

        this.checkCollision();

        const speedRatio = Math.abs(this.dx) / this.speed;
        this.spinSpeed   = this.minSpin + (0.55 - this.minSpin) * speedRatio;
        this.angle      += this.spinSpeed * this.direction;

        if (this.x < -100 || this.x > world.width + 100) {
            this.reset();
        }
    },

    draw() {
        if (!this.active) return;

        const img  = sprites['PROJECTILE'];
        const size = this.width;
        const cx   = this.x + size / 2;
        const cy   = this.y + size / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);

        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
        } else {
            ctx.fillStyle = 'yellow';
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
};
// [SECTION 9] 대시 및 순간이동 (Skills)
function startDash() {
    player.isDashing    = true;
    player.isInvincible = true;
    player.lastDashTime = Date.now();
    if (player.ultPhase === 'none') playSound('DASH');

    const dashDir = (player.direction === 'right' ? 1 : -1);
    player.dx = dashDir * player.dashSpeed;

    setTimeout(() => {
        player.isDashing    = false;
        player.isInvincible = false;
    }, player.dashDuration);
}

function handleEKey() {
    const now = Date.now();
    if (projectile.active) {
        // 출발~도착 사이에 잔상 스프라이트 생성
        spawnTeleportAfterimages(
            player.x, player.y,
            projectile.x, projectile.y
        );
        player.x = projectile.x;
        player.y = projectile.y;
        player.dy = 0;
        projectile.active = false;
        playSound('TELEPORT');
    } else if (now - player.lastTeleportTime > player.teleportCooldown) {
        projectile.fire(player.x, player.y, player.direction);
        player.lastTeleportTime = now;
        playSound('TELEPORT');
    }
}
// [SECTION 10] 잔상 시스템 (Afterimages)
const afterimages = [];

function createAfterimage() {
    // 현재 플레이어가 출력 중인 크기(보정값 포함)를 그대로 잔상으로 남김
    let drawWidth = player.width;
    let drawHeight = player.height * 1.3;

    // 대시 중에는 보통 walk 모션이므로 가로 1.2배 적용
    if (player.state === 'walk') drawWidth *= 1.2;

    afterimages.push({
        x: player.x - (drawWidth - player.width) / 2,
        y: (player.y + player.height) - drawHeight,
        width: drawWidth,
        height: drawHeight,
        opacity: 0.5,
        direction: player.direction,
        // 현재 렌더링 중인 이미지 키(PLAYER_MOVE1 등)를 저장
        imageKey: player.currentDrawingKey || 'PLAYER_MOVE1' 
    });
}

function updateAfterimages() {
    for (let i = afterimages.length - 1; i >= 0; i--) {
        afterimages[i].opacity -= 0.05; // 잔상 사라지는 속도
        if (afterimages[i].opacity <= 0) {
            afterimages.splice(i, 1);
        }
    }
}
// [SECTION 11] 대화 시스템 (Dialogue System)
const DIALOGUE_FONT = '"S-Core Dream", "Malgun Gothic", sans-serif';

const dialogue = {
    active: false,
    lines: [],
    currentLine: 0,
    displayText: '',
    charIndex: 0,
    typingSpeed: 2,
    typingTimer: 0,
    isFinished: false,
    speakerName: '',
    speakerType: 'player',
    illustKey: 'STORY1',
    cast: []
};

function handleFKey() {
    if (dialogue.active) {
        if (!dialogue.isFinished) {
            dialogue.displayText = dialogue.lines[dialogue.currentLine].text;
            dialogue.charIndex = dialogue.displayText.length;
            dialogue.isFinished = true;
        } else {
            dialogue.currentLine++;
            if (dialogue.currentLine >= dialogue.lines.length) {
                dialogue.active = false;
            } else {
                const line = dialogue.lines[dialogue.currentLine];
                dialogue.speakerName = line.speaker || '';
                dialogue.speakerType = line.speakerType || 'player';
                dialogue.illustKey   = line.illustKey || 'STORY1';
                dialogue.displayText = '';
                dialogue.charIndex   = 0;
                dialogue.isFinished  = false;
            }
        }
        return;
    }

    const playerCX     = player.x + player.width / 2;
    const playerBottom = player.y + player.height;

    for (const sign of signs) {
        const signCX     = sign.x + sign.width / 2;
        const signBottom = sign.y + sign.height;
        const inRangeX   = Math.abs(playerCX - signCX) < sign.interactRange;
        const inRangeY   = playerBottom >= sign.y && playerBottom <= signBottom + 120;

        if (inRangeX && inRangeY) {
            const firstLine      = sign.dialogue[0];
            dialogue.active      = true;
            dialogue.lines       = sign.dialogue;
            dialogue.cast        = sign.cast || ['STORY1'];
            dialogue.currentLine = 0;
            dialogue.speakerName = firstLine.speaker || '';
            dialogue.speakerType = firstLine.speakerType || 'player';
            dialogue.illustKey   = firstLine.illustKey || 'STORY1';
            dialogue.displayText = '';
            dialogue.charIndex   = 0;
            dialogue.typingTimer = 0;
            dialogue.isFinished  = false;
            break;
        }
    }
}

function updateDialogue() {
    if (!dialogue.active || dialogue.isFinished) return;
    dialogue.typingTimer++;
    if (dialogue.typingTimer >= dialogue.typingSpeed) {
        dialogue.typingTimer = 0;
        const fullText = dialogue.lines[dialogue.currentLine].text;
        if (dialogue.charIndex < fullText.length) {
            dialogue.displayText += fullText[dialogue.charIndex];
            dialogue.charIndex++;
        }
        if (dialogue.charIndex >= fullText.length) dialogue.isFinished = true;
    }
}

function drawDialogue() {
    if (!dialogue.active) return;

    const boxH = 300;
    const boxY = canvas.height - boxH;
    const boxW = canvas.width;

    const illustH  = 1080;
    const illustW  = 585;
    const dimAlpha = 0.35;
    const isSolo   = dialogue.cast.length === 1;
    const isPlayer = dialogue.speakerType === 'player';

    // --- 왼쪽 스탠딩 ---
    const leftIllust = sprites['STORY1'];
    const leftAlpha  = isSolo ? 1 : (isPlayer ? 1 : dimAlpha);
    const leftX = 60;
    const leftY = canvas.height - illustH;

    if (leftIllust && leftIllust.complete && leftIllust.naturalWidth !== 0) {
        ctx.save();
        ctx.globalAlpha = leftAlpha;
        ctx.drawImage(leftIllust, leftX, leftY, illustW, illustH);
        ctx.restore();
    } else {
        ctx.save();
        ctx.globalAlpha = leftAlpha;
        ctx.fillStyle = 'rgba(80, 60, 120, 0.5)';
        ctx.fillRect(leftX, leftY, illustW, illustH);
        ctx.restore();
    }

    // --- 오른쪽 스탠딩 (2인 대화일 때만) ---
    if (!isSolo) {
        const rightIllust = sprites[dialogue.cast[1]];
        const rightAlpha  = isPlayer ? dimAlpha : 1;
        const rightX = canvas.width - illustW - 60;
        const rightY = canvas.height - illustH;

        if (rightIllust && rightIllust.complete && rightIllust.naturalWidth !== 0) {
            ctx.save();
            ctx.globalAlpha = rightAlpha;
            ctx.translate(rightX + illustW, rightY);
            ctx.scale(-1, 1);
            ctx.drawImage(rightIllust, 0, 0, illustW, illustH);
            ctx.restore();
        } else {
            ctx.save();
            ctx.globalAlpha = rightAlpha;
            ctx.fillStyle = 'rgba(60, 80, 120, 0.5)';
            ctx.fillRect(rightX, rightY, illustW, illustH);
            ctx.restore();
        }
    }

    // --- 대화창 배경 ---
    ctx.fillStyle = 'rgba(8, 8, 18, 0.92)';
    ctx.fillRect(0, boxY, boxW, boxH);

    ctx.strokeStyle = 'rgba(160, 130, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, boxY);
    ctx.lineTo(boxW, boxY);
    ctx.stroke();

    // --- 화자 이름 박스 ---
    if (dialogue.speakerName) {
        const nameBoxPadX = 24;
        const nameBoxPadY = 12;
        const nameBoxY    = boxY - 54;
        ctx.font = `bold 30px ${DIALOGUE_FONT}`;
        const nameW = ctx.measureText(dialogue.speakerName).width + nameBoxPadX * 2;

        const nameBoxX = (isSolo || isPlayer)
            ? 90
            : canvas.width - 90 - nameW;

        ctx.fillStyle = 'rgba(8, 8, 18, 0.95)';
        ctx.strokeStyle = 'rgba(160, 130, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(nameBoxX, nameBoxY, nameW, 51, [9, 9, 0, 0]);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(210, 190, 255, 1)';
        ctx.textAlign = 'left';
        ctx.fillText(dialogue.speakerName, nameBoxX + nameBoxPadX, nameBoxY + nameBoxPadY + 20);
        ctx.textAlign = 'left';
    }

    // --- 대사 텍스트 ---
    // 스탠딩 일러스트와 무관하게 고정 여백으로 시작, 충분히 넓은 영역 확보
    const textMarginL = 300;   // 왼쪽 여백 (스탠딩 하단이 좁아도 텍스트는 여기서 시작)
    const textMarginR = isSolo ? 200 : 680;  // 오른쪽 여백 (2인 대화 시 오른쪽 스탠딩 회피)
    const textX    = textMarginL;
    const textMaxW = canvas.width - textMarginL - textMarginR;
    const textY    = boxY + 80;

    ctx.fillStyle = 'rgba(235, 230, 245, 1)';
    ctx.font = `42px ${DIALOGUE_FONT}`;
    wrapText(ctx, dialogue.displayText, textX, textY, textMaxW, 64);

    // --- 진행 표시 ▼ ---
    if (dialogue.isFinished) {
        const blink = Math.floor(Date.now() / 500) % 2 === 0;
        if (blink) {
            ctx.fillStyle = 'rgba(200, 175, 255, 0.9)';
            ctx.font = '19px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('▼', boxW - 45, canvas.height - 30);
            ctx.textAlign = 'left';
        }
    }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split('');
    let line = '';
    let currentY = y;
    for (const char of words) {
        const test = line + char;
        if (ctx.measureText(test).width > maxWidth) {
            ctx.fillText(line, x, currentY);
            line = char;
            currentY += lineHeight;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, x, currentY);
}

// [SECTION 12] 맵 전환 시스템 (Map Transition)
// [SECTION 12] 맵 전환 시스템 (Map Transition)
const mapTransition = {
    active: false,
    alpha:  0,
    phase:  'none',
    speed:  0.06,
    toMap:  0,
    spawnX: 100,
    spawnY: 500
};

function checkMapTransitions() {
    if (mapTransition.active) return;

    const map = MAP_DATA[currentMapIndex];
    if (!map.transitions) return;

    for (const tr of map.transitions) {
        if (
            player.x + player.width  > tr.x &&
            player.x                 < tr.x + tr.width &&
            player.y + player.height > tr.y &&
            player.y                 < tr.y + tr.height
        ) {
            mapTransition.active = true;
            mapTransition.phase  = 'fadeOut';
            mapTransition.alpha  = 0;
            mapTransition.toMap  = tr.toMap;
            mapTransition.spawnX = tr.spawnX;
            mapTransition.spawnY = tr.spawnY;
            break;
        }
    }
}

function updateMapTransition() {
    if (!mapTransition.active) return;

    if (mapTransition.phase === 'fadeOut') {
        mapTransition.alpha += mapTransition.speed;
        if (mapTransition.alpha >= 1) {
            mapTransition.alpha = 1;

            // 투사체 초기화 및 쿨타임 리셋
            projectile.reset();
            player.lastTeleportTime = 0;

            loadMap(mapTransition.toMap);
            player.x  = mapTransition.spawnX;
            player.y  = mapTransition.spawnY;
            player.dx = 0;
            player.dy = 0;

            const logicalW = canvas.width / SCALE;
            camera.x = player.x - logicalW / 2 + player.width / 2;
            if (camera.x < 0) camera.x = 0;
            if (camera.x > world.width - logicalW) camera.x = world.width - logicalW;

            mapTransition.phase = 'fadeIn';
        }
    } else if (mapTransition.phase === 'fadeIn') {
        mapTransition.alpha -= mapTransition.speed;
        if (mapTransition.alpha <= 0) {
            mapTransition.alpha  = 0;
            mapTransition.phase  = 'none';
            mapTransition.active = false;
        }
    }
}

// [SECTION 13] UI (HUD)
function drawUI() {
    const barX    = 40;
    const barY    = 50;
    const barW    = 570;
    const barH    = 45;
    const radius  = 6;
    const hpRatio = Math.max(player.hp, 0) / player.maxHp;

    // HP 라벨 (검은 테두리)
    ctx.font = `bold 30px ${DIALOGUE_FONT}`;
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    ctx.lineWidth = 6;       // 4 → 6
    ctx.lineJoin = 'round';
    ctx.strokeText('HP', barX, barY + barH - 9);
    ctx.fillStyle = 'rgba(220, 80, 80, 1)';
    ctx.fillText('HP', barX, barY + barH - 9);

    const labelW = ctx.measureText('HP').width + 18;
    const fillX  = barX + labelW;
    const fillW  = barW - labelW;

    // 바 검은 테두리
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    roundRect(ctx, fillX - 4, barY - 4, fillW + 8, barH + 8, radius + 2);  // 2→4, 4→8
    ctx.fill();

    // 바 배경
    ctx.fillStyle = 'rgba(80, 15, 15, 0.9)';
    roundRect(ctx, fillX, barY, fillW, barH, radius);
    ctx.fill();

    // 체력 바
    if (hpRatio > 0) {
        const currentW = (fillW - 6) * hpRatio;
        const grad = ctx.createLinearGradient(fillX, barY, fillX, barY + barH);
        grad.addColorStop(0,   'rgba(230, 80,  60, 1)');
        grad.addColorStop(0.5, 'rgba(200, 40,  30, 1)');
        grad.addColorStop(1,   'rgba(160, 20,  20, 1)');
        ctx.fillStyle = grad;
        roundRect(ctx, fillX + 3, barY + 3, currentW, barH - 6, radius - 1);
        ctx.fill();

        // 광택
        ctx.fillStyle = 'rgba(255, 150, 130, 0.25)';
        roundRect(ctx, fillX + 3, barY + 3, currentW, (barH - 6) * 0.4, radius - 1);
        ctx.fill();
    }

    // 바 안쪽 테두리
    ctx.strokeStyle = 'rgba(160, 40, 40, 0.9)';
    ctx.lineWidth = 2;
    roundRect(ctx, fillX, barY, fillW, barH, radius);
    ctx.stroke();

    // HP 수치 텍스트 (검은 테두리)
    const hpText = `${Math.max(player.hp, 0)} / ${player.maxHp}`;
    ctx.font = `bold 22px ${DIALOGUE_FONT}`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = 4;       // 3 → 4
    ctx.lineJoin = 'round';
    ctx.strokeText(hpText, fillX + fillW / 2, barY + barH - 12);
    ctx.fillStyle = 'rgba(255, 220, 220, 0.95)';
    ctx.fillText(hpText, fillX + fillW / 2, barY + barH - 12);
    ctx.textAlign = 'left';

    // ── 필살기 게이지 바 ──────────────────────────────────────────
    const gBarY     = barY + barH + 14;
    const gBarH     = 30;
    const gBarW     = fillW * 0.85;          // HP바보다 약간 짧게
    const gBarX     = fillX;
    const gRatio    = player.gauge / player.maxGauge;
    const gFull     = gRatio >= 1;

    // 라벨
    ctx.font = `bold 22px ${DIALOGUE_FONT}`;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth   = 6;
    ctx.lineJoin    = 'round';
    ctx.strokeText('SP', barX, gBarY + gBarH - 7);
    ctx.fillStyle = gFull ? 'rgba(140, 200, 255, 1)' : 'rgba(80, 140, 220, 1)';
    ctx.fillText('SP', barX, gBarY + gBarH - 7);

    // 바 외곽
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    roundRect(ctx, gBarX - 4, gBarY - 4, gBarW + 8, gBarH + 8, 5);
    ctx.fill();

    // 바 배경
    ctx.fillStyle = 'rgba(10, 20, 60, 0.9)';
    roundRect(ctx, gBarX, gBarY, gBarW, gBarH, 4);
    ctx.fill();

    // 게이지 채움
    if (gRatio > 0) {
        const gFillW = (gBarW - 6) * Math.min(gRatio, 1);
        const gGrad = ctx.createLinearGradient(gBarX, gBarY, gBarX, gBarY + gBarH);
        if (gFull) {
            // 가득 찼을 때 밝은 시안 계열 + 반짝임
            const pulse = 0.75 + 0.25 * Math.sin(Date.now() * 0.008);
            gGrad.addColorStop(0,   `rgba(${Math.floor(100 + 80*pulse)}, 210, 255, 1)`);
            gGrad.addColorStop(0.5, 'rgba(60, 180, 255, 1)');
            gGrad.addColorStop(1,   'rgba(30, 120, 220, 1)');
        } else {
            gGrad.addColorStop(0,   'rgba(90, 180, 255, 1)');
            gGrad.addColorStop(0.5, 'rgba(60, 140, 230, 1)');
            gGrad.addColorStop(1,   'rgba(30,  90, 190, 1)');
        }
        ctx.fillStyle = gGrad;
        roundRect(ctx, gBarX + 3, gBarY + 3, gFillW, gBarH - 6, 3);
        ctx.fill();

        // 광택
        ctx.fillStyle = 'rgba(180, 230, 255, 0.22)';
        roundRect(ctx, gBarX + 3, gBarY + 3, gFillW, (gBarH - 6) * 0.4, 3);
        ctx.fill();
    }

    // 바 안쪽 테두리
    ctx.strokeStyle = gFull ? 'rgba(120, 200, 255, 0.9)' : 'rgba(40, 100, 200, 0.7)';
    ctx.lineWidth = 2;
    roundRect(ctx, gBarX, gBarY, gBarW, gBarH, 4);
    ctx.stroke();

    // 가득 찼을 때 [Q] 힌트
    if (gFull) {
        const hint = '[Q] 필살기';
        ctx.font = `bold 20px ${DIALOGUE_FONT}`;
        const hintBlink = Math.floor(Date.now() / 500) % 2 === 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.lineWidth   = 4;
        ctx.lineJoin    = 'round';
        ctx.textAlign   = 'center';
        if (hintBlink) {
            ctx.strokeText(hint, gBarX + gBarW / 2, gBarY + gBarH - 7);
            ctx.fillStyle = 'rgba(220, 240, 255, 1)';
            ctx.fillText(hint, gBarX + gBarW / 2, gBarY + gBarH - 7);
        }
        ctx.textAlign = 'left';
    }
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// [SECTION 15] 순간이동 잔상 (Teleport Afterimages)
const teleportTrails = [];

function spawnTeleportAfterimages(fromX, fromY, toX, toY) {
    const dx    = toX - fromX;
    const dy    = toY - fromY;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(Math.floor(dist / 100), 2); // 50px 간격

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        teleportTrails.push({
            x:         fromX + dx * t,
            y:         fromY + dy * t,
            imageKey:  player.currentDrawingKey || 'PLAYER_STAND',
            width:     player.width,
            height:    player.height,
            direction: player.direction,
            opacity:   0.6 * (1 - t * 0.3),
            timer:     0,
            duration:  14 + Math.floor(t * 6)
        });
    }
}

function updateTeleportTrails() {
    for (let i = teleportTrails.length - 1; i >= 0; i--) {
        teleportTrails[i].timer++;
        teleportTrails[i].opacity *= 0.82;
        if (teleportTrails[i].timer >= teleportTrails[i].duration) {
            teleportTrails.splice(i, 1);
        }
    }
}

function drawTeleportTrails() {
    const logicalW = canvas.width  / SCALE;
    const logicalH = canvas.height / SCALE;

    teleportTrails.forEach(t => {
        if (t.opacity < 0.02) return;

        // 화면 밖 잔상 렌더링 스킵 (카메라 기준 논리 좌표로 판단)
        const screenX = t.x - camera.x;
        if (screenX + t.width  < 0 || screenX > logicalW) return;
        if (t.y + t.height     < 0 || t.y       > logicalH) return;

        const img       = sprites[t.imageKey];
        const fallback  = sprites['PLAYER_STAND'];
        const targetImg = (img && img.complete && img.naturalWidth !== 0) ? img : fallback;
        if (!targetImg) return;

        const drawWidth  = t.width;
        const drawHeight = t.height * 1.3;
        const drawX      = t.x - (drawWidth - t.width) / 2;
        const drawY      = (t.y + t.height) - drawHeight;

        ctx.save();
        ctx.globalAlpha = t.opacity;
        ctx.filter      = 'hue-rotate(180deg) brightness(1.8)';

        if (t.direction === 'right') {
            ctx.translate(drawX + drawWidth, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(targetImg, 0, 0, drawWidth, drawHeight);
        } else {
            ctx.drawImage(targetImg, drawX, drawY, drawWidth, drawHeight);
        }

        ctx.restore();
    });
}
// [SECTION 16-A] 허수아비 시스템 (Dummy System)
function createDummy(x, y) {
    const width  = 44;
    const height = 80;
    return {
        x: x - width / 2,
        y: y - height,
        width,
        height,
        hitTimer:  0,
        hitEffect: 0,
        wobble:    0,
        wobbleDir: 1
    };
}

function updateDummies() {
    dummies.forEach(d => {
        if (d.hitTimer  > 0) d.hitTimer--;
        if (d.hitEffect > 0) {
            d.hitEffect--;
            d.wobble += d.wobbleDir * 0.18;
            if (Math.abs(d.wobble) > 0.22) d.wobbleDir *= -1;
        } else {
            d.wobble *= 0.75;
        }
    });
}

function drawDummies() {
    dummies.forEach(d => {
        const cx = d.x + d.width / 2;

        ctx.save();
        ctx.translate(cx, d.y + d.height);
        ctx.rotate(d.wobble);

        // 몸통
        ctx.fillStyle = '#c8a06a';
        ctx.fillRect(-d.width / 2, -d.height, d.width, d.height * 0.7);

        // 머리
        const headR = d.width * 0.44;
        ctx.fillStyle = '#dbb97a';
        ctx.beginPath();
        ctx.arc(0, -d.height + headR * 0.8, headR, 0, Math.PI * 2);
        ctx.fill();

        // 눈 (X 표시)
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth   = 2.5;
        const ex = headR * 0.35;
        const ey = -d.height + headR * 0.7;
        const es = headR * 0.18;
        ctx.beginPath();
        ctx.moveTo(-ex - es, ey - es); ctx.lineTo(-ex + es, ey + es);
        ctx.moveTo(-ex + es, ey - es); ctx.lineTo(-ex - es, ey + es);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex - es, ey - es); ctx.lineTo(ex + es, ey + es);
        ctx.moveTo(ex + es, ey - es); ctx.lineTo(ex - es, ey + es);
        ctx.stroke();

        // 가로 봉 (팔)
        ctx.fillStyle = '#8B5E3C';
        ctx.fillRect(-d.width * 0.78, -d.height * 0.62, d.width * 1.56, 6);

        // 세로 기둥
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(-4, -d.height * 0.3, 8, d.height * 0.35);

        // 피격 이펙트
        if (d.hitEffect > 0) {
            ctx.globalAlpha = (d.hitEffect / 8) * 0.45;
            ctx.fillStyle   = '#ff3333';
            ctx.fillRect(-d.width / 2, -d.height, d.width, d.height * 0.7);
        }

        ctx.restore();

        // 피격 데미지 숫자
        if (d.hitEffect > 0) {
            ctx.save();
            ctx.globalAlpha = d.hitEffect / 8;
            ctx.fillStyle   = '#ffe066';
            ctx.font        = `bold ${14 + (8 - d.hitEffect)}px monospace`;
            ctx.textAlign   = 'center';
            ctx.fillText(`-${player.attackPower}`, cx, d.y - 4 - (8 - d.hitEffect) * 2);
            ctx.textAlign   = 'left';
            ctx.restore();
        }
    });
}

// [SECTION 16] 적 시스템 (Enemy System)
const ENEMY_TYPES = {
    enemy1: {
        width:        90,
        height:       97.5,
        hp:           80,
        speed:        4,
        gravity:      0.8,
        detectRange:  300,
        loseRange:    500,
        attackRange:  65,
        attackDamage: 8,
        attackCooldown: 90,
        imgStand:   'ENEMY1_STAND',
        imgMove:    'ENEMY1_MOVE',
        imgAttack1: 'ENEMY1_ATTACK1',
        imgAttack2: 'ENEMY1_ATTACK2',
        imgAttack3: 'ENEMY1_ATTACK3',
    },
    enemy2: {
        width:        50,
        height:       65,
        hp:           50,
        speed:        1.2,
        speedY:       0.6,
        gravity:      0,
        detectRange:  400,
        loseRange:    600,
        attackRange:  110,
        attackDamage: 6,
        attackCooldown: 120,
        attackWindup:  25,       // attack1 유지 프레임 (예비동작)
        attackDuration: 30,      // attack2 돌진 프레임
        attackDashSpeed: 3.5,    // 돌진 속도
        imgStand:   'ENEMY2_STAND',
        imgMove: 'ENEMY2_MOVE',
        imgAttack1: 'ENEMY2_ATTACK1',
        imgAttack2: 'ENEMY2_ATTACK2',
    }
};

function createEnemy(type, x, y) {
    const def = ENEMY_TYPES[type];
    const base = {
        type,
        x,
        y: y - def.height,
        width:    def.width,
        height:   def.height,
        dx: 0, dy: 0,
        hp:    def.hp,
        maxHp: def.hp,
        hpVisible: false,

        speed:          def.speed,
        gravity:        def.gravity,
        detectRange:    def.detectRange,
        loseRange:      def.loseRange,
        attackRange:    def.attackRange,
        attackDamage:   def.attackDamage,
        attackCooldown: def.attackCooldown,

        direction:        'left',
        state:            'idle',
        attackTimer:      0,
        attackFrame:      1,
        prevAttackFrame:  0,
        cooldownTimer:    0,
        grounded:         false,
        isDead:           false,
        isInvincible:     false,
        invincibleTimer:  0,
        deadTimer:        0,
        isAggro:          false,

        takeDamage(dmg) {
            if (this.isInvincible || this.isDead) return;
            this.hp              = Math.max(this.hp - dmg, 0);
            this.hpVisible       = true;
            this.isInvincible    = true;
            this.invincibleTimer = 20;
            this.isAggro         = true;
            if (this.hp <= 0) this.isDead = true;
        }
    };

    if (type === 'enemy1') {
        return Object.assign(base, {
            imgStand:   def.imgStand,
            imgMove:    def.imgMove,
            imgAttack1: def.imgAttack1,
            imgAttack2: def.imgAttack2,
            imgAttack3: def.imgAttack3,
            patrolOriginX:   x,
            patrolRange:     180,
            patrolDir:       Math.random() < 0.5 ? 1 : -1,
            patrolTimer:     0,
            patrolRestTimer: 0,
            attack3OffsetX:  0,
        });
    }

    if (type === 'enemy2') {
        return Object.assign(base, {
            speedY:          def.speedY,
            attackDuration:  def.attackDuration,
            attackWindup:    def.attackWindup,
            attackDashSpeed: def.attackDashSpeed,
            imgStand:   def.imgStand,
            imgMove:    def.imgMove,
            imgAttack1: def.imgAttack1,
            imgAttack2: def.imgAttack2,
            floatTimer:     0,
            attackDirX:     0,
            attackDirY:     0,
            windupTimer:    0,
            isWindup:       false,
            hasHitPlayer:   false,
        });
    }

    return base;
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];

        if (e.isDead) {
            e.deadTimer++;
            if (e.deadTimer > 40) enemies.splice(i, 1);
            continue;
        }

        if (e.isInvincible) {
            e.invincibleTimer--;
            if (e.invincibleTimer <= 0) e.isInvincible = false;
        }

        if (e.cooldownTimer > 0) e.cooldownTimer--;

        const px = player.x + player.width  / 2;
        const py = player.y + player.height / 2;
        const ex = e.x + e.width  / 2;
        const ey = e.y + e.height / 2;
        const distX = px - ex;
        const distY = py - ey;
        const dist  = Math.sqrt(distX * distX + distY * distY);

        if (!e.isAggro && dist < e.detectRange) e.isAggro = true;
        else if (e.isAggro && dist > e.loseRange) e.isAggro = false;

        // ── enemy1 ───────────────────────────────────────────────
        if (e.type === 'enemy1') {
            const inAttackRangeX = Math.abs(distX) < e.attackRange;
            const inAttackRangeY = Math.abs(distY) < e.height * 1.2;
            const canAttack      = inAttackRangeX && inAttackRangeY;

            if (e.attackTimer > 0) {
                e.attackTimer--;
                e.state = 'attack';
                e.dx    = 0;

                e.prevAttackFrame = e.attackFrame;
                if      (e.attackTimer > 19) e.attackFrame = 1;
                else if (e.attackTimer > 16) e.attackFrame = 2;
                else                         e.attackFrame = 3;

                if (e.prevAttackFrame !== 3 && e.attackFrame === 3) {
                    e.attack3OffsetX = (e.direction === 'right' ? 1 : -1) * 20;
                }

                if (e.prevAttackFrame !== e.attackFrame) {
                    if (e.attackFrame === 1) playSound('ENEMY1_ATTACK1');
                    if (e.attackFrame === 2) playSound('ENEMY1_ATTACK2');
                }

                if (e.attackFrame === 2 && !player.isInvincible) {
                    const inRange = Math.abs(distX) < e.attackRange &&
                                    Math.abs(distY) < e.height;
                    if (inRange) {
                        player.hp              = Math.max(player.hp - e.attackDamage, 0);
                        player.isInvincible    = true;
                        player.invincibleTimer = 60;
                        player.dx = (distX > 0 ? -1 : 1) * 5;
                        player.dy = -6;
                    }
                }

            } else {
                if (e.attack3OffsetX !== 0) e.attack3OffsetX = 0;

                if (e.isAggro && canAttack && e.cooldownTimer <= 0) {
                    e.direction      = distX > 0 ? 'right' : 'left';
                    e.state          = 'attack';
                    e.attackTimer    = 45;
                    e.attackFrame    = 1;
                    e.prevAttackFrame = 0;
                    e.cooldownTimer  = e.attackCooldown;
                    e.dx = 0;
                } else if (e.isAggro) {
                    e.direction = distX > 0 ? 'right' : 'left';
                    if (inAttackRangeX) {
                        e.state = 'idle';
                        e.dx    = 0;
                    } else {
                        e.state = 'walk';
                        e.dx    = (distX > 0 ? 1 : -1) * e.speed;
                    }
                } else {
                    if (e.patrolRestTimer > 0) {
                        e.patrolRestTimer--;
                        e.state = 'idle';
                        e.dx    = 0;
                    } else {
                        if (e.patrolTimer <= 0) {
                            const canGoRight = (e.x + e.width / 2) < e.patrolOriginX + e.patrolRange;
                            const canGoLeft  = (e.x + e.width / 2) > e.patrolOriginX - e.patrolRange;
                            if (canGoRight && canGoLeft) {
                                e.patrolDir = Math.random() < 0.5 ? 1 : -1;
                            } else if (!canGoRight) {
                                e.patrolDir = -1;
                            } else {
                                e.patrolDir = 1;
                            }
                            e.patrolTimer     = 60 + Math.floor(Math.random() * 80);
                            e.patrolRestTimer = 0;
                        }
                        e.state     = 'walk';
                        e.direction = e.patrolDir > 0 ? 'right' : 'left';
                        e.dx        = e.patrolDir * e.speed * 0.6;
                        e.patrolTimer--;
                        if (e.patrolTimer <= 0) {
                            e.patrolRestTimer = 40 + Math.floor(Math.random() * 60);
                        }
                    }
                }
            }

            e.dy += e.gravity;
            if (e.dy > 20) e.dy = 20;
            e.x += e.dx;
            e.y += e.dy;

            e.grounded = false;
            platforms.forEach(plat => {
                const type = plat.type || 'platform';
                if (type === 'wall') {
                    if (e.x + e.width  > plat.x && e.x < plat.x + plat.width &&
                        e.y + e.height > plat.y && e.y < plat.y + plat.height) {
                        if (e.dx > 0) e.x = plat.x - e.width;
                        else          e.x = plat.x + plat.width;
                        e.dx = 0;
                        e.patrolDir   = -e.patrolDir;
                        e.patrolTimer = 0;
                    }
                } else if (type === 'solid') {
                    if (e.x + e.width  > plat.x &&
                        e.x            < plat.x + plat.width &&
                        e.y + e.height >= plat.y &&
                        e.y + e.height <= plat.y + Math.max(20, e.dy + 1) &&
                        e.dy >= 0) {
                        e.y        = plat.y - e.height;
                        e.dy       = 0;
                        e.grounded = true;
                    }
                }
            });
        }

        // ── enemy2 ───────────────────────────────────────────────
        // ── enemy2 ───────────────────────────────────────────────
        if (e.type === 'enemy2') {

            
            if (e.isWindup) {
                // 예비동작(attack1): 제자리 정지
                e.dx = 0;
                e.dy = 0;
                e.state       = 'attack';
                e.attackFrame = 1;
                e.windupTimer--;

                if (e.windupTimer <= 0) {
                    // windup 끝 → 돌진 시작
                    e.isWindup     = false;
                    e.attackTimer  = e.attackDuration;
                    e.hasHitPlayer = false;
                }

            } else if (e.attackTimer > 0) {
                // 돌진(attack2)
                e.attackTimer--;
                e.state       = 'attack';
                e.attackFrame = 2;

                e.x += e.attackDirX * e.attackDashSpeed;
                e.y += e.attackDirY * e.attackDashSpeed;

                // 피격 판정 (1회)
                if (!e.hasHitPlayer && !player.isInvincible) {
                    const ex2 = e.x + e.width  / 2;
                    const ey2 = e.y + e.height / 2;
                    const px2 = player.x + player.width  / 2;
                    const py2 = player.y + player.height / 2;
                    // 크기 기준 판정
                    if (Math.abs(px2 - ex2) < e.width  &&
                        Math.abs(py2 - ey2) < e.height) {
                        player.hp              = Math.max(player.hp - e.attackDamage, 0);
                        player.isInvincible    = true;
                        player.invincibleTimer = 60;
                        player.dx = e.attackDirX * 6;
                        player.dy = -7;
                        e.hasHitPlayer = true;
                    }
                }

            } else {
                if (e.isAggro && e.cooldownTimer <= 0) {
                    // 공격 시작 → windup 진입
                    const d = Math.sqrt(distX * distX + distY * distY);
                    e.isWindup     = true;
                    e.windupTimer  = e.attackWindup;
                    e.cooldownTimer = e.attackCooldown;
                    e.attackDirX   = d > 0 ? distX / d : 0;
                    e.attackDirY   = d > 0 ? distY / d : 0;
                    e.direction    = distX > 0 ? 'right' : 'left';
                    e.dx = 0;
                    e.dy = 0;
                } else if (e.isAggro) {
                    e.state     = 'walk';
                    e.direction = distX > 0 ? 'right' : 'left';
                    e.dx = (distX > 0 ? 1 : -1) * e.speed;
                    e.dy = (distY > 0 ? 1 : -1) * e.speedY;
                    if (Math.abs(distX) < 20) e.dx = 0;
                    if (Math.abs(distY) < 10) e.dy = 0;
                    e.x += e.dx;
                    e.y += e.dy;
                } else {
                    e.state = 'idle';
                    e.floatTimer++;
                    e.x += Math.sin(e.floatTimer * 0.02) * 0.5;
                    e.y += Math.sin(e.floatTimer * 0.015) * 0.3;
                }
            }
        }
    }
}

function drawEnemies() {
    enemies.forEach(e => {
        const deadAlpha = e.isDead ? Math.max(0, 1 - e.deadTimer / 40) : 1;
        if (deadAlpha <= 0) return;

        const blinkVisible = !e.isInvincible || Math.floor(Date.now() / 80) % 2 === 0;
        if (!blinkVisible) return;

        // ── enemy2 전용 렌더링 ────────────────────────────────────
        if (e.type === 'enemy2') {
            let imgKey2 = e.imgStand;
            if (e.state === 'walk' || e.state === 'idle') {
                imgKey2 = e.imgMove;
            } else if (e.state === 'attack') {
                imgKey2 = e.attackFrame === 2 ? e.imgAttack2 : e.imgMove;  // windup은 move 이미지
            }

            const isAttacking = e.state === 'attack';
            const isSpinning  = isAttacking && e.attackFrame === 2;
            const drawW2 = isSpinning ? 52 : (isAttacking ? 65 : e.width);
            const drawH2 = isSpinning ? 65 : e.height * 1.2;
            const drawX2 = e.x - (drawW2 - e.width) / 2;
            const drawY2 = (e.y + e.height) - drawH2;
            const img2   = sprites[imgKey2];
            const cx2    = drawX2 + drawW2 / 2;
            const cy2    = drawY2 + drawH2 / 2;

            ctx.save();
            ctx.globalAlpha = deadAlpha;

            if (isSpinning) {
                // attack2: 랜덤 각도 전환
                if (!e._randAngle || Date.now() - (e._randAngleTime || 0) > 80) {
                    e._randAngle     = Math.random() * Math.PI * 2;
                    e._randAngleTime = Date.now();
                }
                ctx.translate(cx2, cy2);
                ctx.rotate(e._randAngle);
                if (img2 && img2.complete && img2.naturalWidth !== 0) {
                    ctx.drawImage(img2, -drawW2 / 2, -drawH2 / 2, drawW2, drawH2);
                } else {
                    ctx.fillStyle = '#cc44cc';
                    ctx.beginPath();
                    for (let n = 0; n < 6; n++) {
                        const angle = (Math.PI / 3) * n - Math.PI / 6;
                        const r = drawW2 / 2;
                        n === 0
                            ? ctx.moveTo(r * Math.cos(angle), r * Math.sin(angle))
                            : ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = 'white';
                    ctx.font = '10px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('atk2', 0, 4);
                    ctx.textAlign = 'left';
                }
            } else {
                // 이동/대기/windup: 방향 반전 + windup 시 뒤로 기울기
                const windupTilt = (isAttacking && e.attackFrame === 1)
                    ? (e.direction === 'right' ? -0.3 : 0.3)
                    : 0;

                if (windupTilt !== 0) {
                    ctx.translate(cx2, cy2);
                    ctx.rotate(windupTilt);
                    ctx.translate(-cx2, -cy2);
                }

                if (e.direction === 'right') {
                    ctx.translate(drawX2 + drawW2, drawY2);
                    ctx.scale(-1, 1);
                    if (img2 && img2.complete && img2.naturalWidth !== 0) {
                        ctx.drawImage(img2, 0, 0, drawW2, drawH2);
                    } else {
                        ctx.fillStyle = isAttacking ? '#993399' :
                                        e.state === 'walk' ? '#aa44bb' : '#774499';
                        ctx.beginPath();
                        for (let n = 0; n < 6; n++) {
                            const angle = (Math.PI / 3) * n - Math.PI / 6;
                            const r = drawW2 / 2;
                            n === 0
                                ? ctx.moveTo(drawW2 / 2 + r * Math.cos(angle), drawH2 / 2 + r * Math.sin(angle))
                                : ctx.lineTo(drawW2 / 2 + r * Math.cos(angle), drawH2 / 2 + r * Math.sin(angle));
                        }
                        ctx.closePath();
                        ctx.fill();
                        ctx.fillStyle = 'white';
                        ctx.font = '10px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText(e.state, drawW2 / 2, drawH2 / 2 + 4);
                        ctx.textAlign = 'left';
                    }
                } else {
                    if (img2 && img2.complete && img2.naturalWidth !== 0) {
                        ctx.drawImage(img2, drawX2, drawY2, drawW2, drawH2);
                    } else {
                        const cx = e.x + e.width  / 2;
                        const cy = e.y + e.height / 2;
                        const r  = drawW2 / 2;
                        ctx.fillStyle = isAttacking ? '#993399' :
                                        e.state === 'walk' ? '#aa44bb' : '#774499';
                        ctx.beginPath();
                        for (let n = 0; n < 6; n++) {
                            const angle = (Math.PI / 3) * n - Math.PI / 6;
                            n === 0
                                ? ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
                                : ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
                        }
                        ctx.closePath();
                        ctx.fill();
                        ctx.fillStyle = 'white';
                        ctx.font = '10px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText(e.state, cx, cy + 4);
                        ctx.textAlign = 'left';
                    }
                }
            }

            ctx.restore();

            if (e.hpVisible && !e.isDead) {
                const barW  = e.width;
                const barH  = 5;
                const barX  = e.x;
                const barY  = e.y - 12;
                const ratio = e.hp / e.maxHp;
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
                ctx.fillStyle = ratio > 0.5 ? '#44cc44' :
                                ratio > 0.25 ? '#ccaa00' : '#cc3333';
                ctx.fillRect(barX, barY, barW * ratio, barH);
            }
            return;  // enemy2 렌더링 종료
        }

        // ── enemy1 렌더링 ─────────────────────────────────────────
        let imgKey = e.imgStand;

        if (e.type === 'enemy1') {
            if (e.state === 'walk') {
                imgKey = e.imgMove;
            } else if (e.state === 'attack') {
                if      (e.attackFrame === 1) imgKey = e.imgAttack1;
                else if (e.attackFrame === 2) imgKey = e.imgAttack2;
                else                          imgKey = e.imgAttack3;
            }
        }

        const img = sprites[imgKey];

        let scaleW = 1.0, scaleH = 1.0;
        if (e.type === 'enemy1') {
            scaleW = (e.attackFrame === 2 || e.attackFrame === 3) ? 1.25 : 1.0;
            scaleH = e.attackFrame === 2 ? 1.15 : 1.0;
        }

        const drawW   = e.width  * scaleW;
        const drawH   = e.height * 1.4 * scaleH;
        const offsetX = e.attack3OffsetX || 0;
        const drawX   = e.x + offsetX - (drawW - e.width) / 2;
        const drawY   = (e.y + e.height) - drawH;

        ctx.save();
        ctx.globalAlpha = deadAlpha;

        if (img && img.complete && img.naturalWidth !== 0) {
            if (e.direction === 'right') {
                ctx.translate(drawX + drawW, drawY);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, drawW, drawH);
            } else {
                ctx.drawImage(img, drawX, drawY, drawW, drawH);
            }
        } else {
            ctx.fillStyle = e.state === 'attack' ? '#cc3333' :
                            e.state === 'walk'   ? '#aa4444' : '#883333';
            ctx.fillRect(e.x, e.y, e.width, e.height);
            ctx.fillStyle = 'white';
            ctx.font      = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(e.state, e.x + e.width / 2, e.y + e.height / 2);
            ctx.textAlign = 'left';
        }

        ctx.restore();

        if (e.hpVisible && !e.isDead) {
            const barW  = e.width;
            const barH  = 5;
            const barX  = e.x;
            const barY  = e.y - 12;
            const ratio = e.hp / e.maxHp;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
            ctx.fillStyle = ratio > 0.5 ? '#44cc44' :
                            ratio > 0.25 ? '#ccaa00' : '#cc3333';
            ctx.fillRect(barX, barY, barW * ratio, barH);
        }
    });
}
// [SECTION 17] 필살기 시스템 (Ultimate Skill)
const ultimate = {
    active:   false,
    timer:    0,
    duration: 40,
    alpha:    0
};

// 필살기 파티클
const ultParticles = [];

// 참격 이펙트 목록
const slashEffects = [];

// 필살기 타임라인 (handleQKey에서 동적 생성)
let ULT_TIMELINE = [];
const ULT_FIRE_DURATION = 64;

function spawnUltParticles(count) {
    const backDir = player.direction === 'right' ? -1 : 1;
    const cx = player.x + player.width  / 2;
    const cy = player.y + player.height / 2;
    for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * 3.2;
        const speed  = 4 + Math.random() * 7;
        const angle  = Math.atan2(spread, backDir);
        ultParticles.push({
            x:     cx,
            y:     cy,
            dx:    Math.cos(angle) * speed,
            dy:    Math.sin(angle) * speed - Math.random() * 3,
            life:  1.0,
            decay: 0.03 + Math.random() * 0.025,
            size:  4 + Math.random() * 7,
            color: Math.random() < 0.6 ? '#88ccff'
                 : Math.random() < 0.5 ? '#ffffff' : '#aaddff'
        });
    }
}

function updateUltParticles() {
    for (let i = ultParticles.length - 1; i >= 0; i--) {
        const p = ultParticles[i];
        p.x    += p.dx;
        p.y    += p.dy;
        p.dy   += 0.18;
        p.dx   *= 0.88;
        p.life -= p.decay;
        if (p.life <= 0) ultParticles.splice(i, 1);
    }
}

function drawUltParticles() {
    ultParticles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function spawnSlash(cx, cy, angleDeg) {
    slashEffects.push({
        type:         'slash',
        cx, cy,
        angle:        angleDeg * Math.PI / 180,
        length:       280 + Math.random() * 60,
        life:         1.0,
        decay:        0.055,
        width:        22,
        color:        '#ffe066',
        glow:         '#ffaa00',
        drawProgress: 0,
        drawSpeed:    0.18
    });
}

function spawnCross(cx, cy) {
    slashEffects.push({
        type:         'cross',
        cx, cy,
        angle:        0,
        length:       1600,
        life:         1.0,
        decay:        0.032,
        width:        32,
        color:        '#fff0a0',
        glow:         '#ffcc00',
        drawProgress: 0,
        drawSpeed:    0.14
    });
}

function updateSlashEffects() {
    for (let i = slashEffects.length - 1; i >= 0; i--) {
        const s = slashEffects[i];
        if (s.drawProgress < 1) {
            s.drawProgress = Math.min(s.drawProgress + s.drawSpeed, 1);
        } else {
            s.life -= s.decay;
        }
        if (s.life <= 0) slashEffects.splice(i, 1);
    }
}

function drawSingleSlash(s) {
    const fullHalf = s.length / 2;
    const isCross  = s.type === 'cross';
    const bend     = isCross ? 0 : fullHalf * 2 * 0.28;

    // 오른쪽 끝에서 왼쪽으로 그려지도록
    const startX = fullHalf;
    const endX   = fullHalf - fullHalf * 2 * s.drawProgress;

    ctx.save();
    ctx.rotate(s.angle || 0);

    const arcPath = (w) => {
        if (s.drawProgress < 0.01) return;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.quadraticCurveTo(
            startX - (startX - endX) * 0.5,
            -bend * s.drawProgress - w * 0.5,
            endX, 0
        );
        ctx.quadraticCurveTo(
            startX - (startX - endX) * 0.5,
            -bend * s.drawProgress + w * 0.5,
            startX, 0
        );
        ctx.closePath();
    };

    const straightPath = (w) => {
        if (s.drawProgress < 0.01) return;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.quadraticCurveTo(
            startX - (startX - endX) * 0.5,
            -w * 0.55,
            endX, 0
        );
        ctx.quadraticCurveTo(
            startX - (startX - endX) * 0.5,
            w * 0.55,
            startX, 0
        );
        ctx.closePath();
    };

    const pathFn = isCross ? straightPath : arcPath;

    if (isCross) {
        const layers = [
            { w: 1.8,  color: s.glow,    alpha: 0.18 },
            { w: 1.3,  color: s.glow,    alpha: 0.35 },
            { w: 1.1,  color: s.glow,    alpha: 0.6  },
            { w: 0.72, color: s.color,   alpha: 1.0  },
            { w: 0.22, color: '#ffffff', alpha: 0.7  }
        ];
        layers.forEach(l => {
            ctx.save();
            ctx.globalAlpha *= l.alpha;
            ctx.fillStyle = l.color;
            pathFn(s.width * l.w);
            ctx.fill();
            ctx.restore();
        });
    } else {
        // 글로우
        ctx.save();
        ctx.shadowColor = s.glow;
        ctx.shadowBlur  = 36;
        ctx.strokeStyle = s.glow;
        ctx.lineWidth   = s.width * 2.2;
        ctx.lineCap     = 'round';
        ctx.globalAlpha *= 0.25;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.quadraticCurveTo(
            startX - (startX - endX) * 0.5,
            -bend * s.drawProgress,
            endX, 0
        );
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle   = s.glow;
        ctx.shadowColor = s.glow;
        ctx.shadowBlur  = 22;
        pathFn(s.width * 1.1);
        ctx.fill();

        ctx.fillStyle  = s.color;
        ctx.shadowBlur = 8;
        pathFn(s.width * 0.72);
        ctx.fill();

        ctx.fillStyle   = '#ffffff';
        ctx.shadowBlur  = 0;
        ctx.globalAlpha *= 0.7;
        pathFn(s.width * 0.22);
        ctx.fill();
    }

    ctx.restore();
}

function drawSlashEffects() {
    slashEffects.forEach(s => {
        ctx.save();
        ctx.globalAlpha = s.drawProgress < 1 ? 1 : s.life * s.life;
        ctx.translate(s.cx, s.cy);

        if (s.type === 'slash') {
            drawSingleSlash(s);
        } else if (s.type === 'cross') {
            ctx.save();
            ctx.rotate(30 * Math.PI / 180);
            drawSingleSlash(s);
            ctx.restore();
            ctx.save();
            ctx.rotate(-30 * Math.PI / 180);
            drawSingleSlash(s);
            ctx.restore();
        }

        ctx.restore();
    });
}

function doUltHit(isCross) {
    const atkRange = isCross ? 380 : 200;
    const damage   = isCross ? player.attackPower * 2 : player.attackPower * 1;
    const px = player.x + player.width  / 2;
    const py = player.y + player.height / 2;
    enemies.forEach(e => {
        if (e.isDead) return;
        const ex = e.x + e.width  / 2;
        const ey = e.y + e.height / 2;
        if (Math.abs(px - ex) < atkRange && Math.abs(py - ey) < atkRange) {
            e.hp              = Math.max(e.hp - damage, 0);
            e.hpVisible       = true;
            e.isAggro         = true;
            e.isInvincible    = true;
            e.invincibleTimer = 20;
            if (e.hp <= 0) e.isDead = true;
        }
    });
}

function handleQKey() {
    if (dialogue.active || tutorial.active) return;
    if (player.gauge < player.maxGauge) return;
    if (player.ultPhase !== 'none') return;

    player.gauge = 0;

    if (projectile.active) {
        player.ultTargetX = projectile.x;
        player.ultTargetY = projectile.y;
        projectile.reset();
    } else {
        player.ultTargetX = player.x;
        player.ultTargetY = player.y;
    }

    const diffX = player.ultTargetX - player.x;
    if (Math.abs(diffX) > 10) {
        player.direction = diffX > 0 ? 'right' : 'left';
    }

    // 매 발동마다 랜덤 각도로 타임라인 생성
    ULT_TIMELINE = [
        { frame: 5,  type: 'slash', angle: Math.random() * 360, done: false },
        { frame: 12, type: 'slash', angle: Math.random() * 360, done: false },
        { frame: 19, type: 'slash', angle: Math.random() * 360, done: false },
        { frame: 26, type: 'slash', angle: Math.random() * 360, done: false },
        { frame: 39, type: 'cross', done: false }
    ];

    player.ultCamStartX = camera.x;
    player.ultPhase     = 'vanish';
    player.ultTimer     = player.ultVanishDuration;
    player.dx           = 0;
    player.dy           = 0;
    player.isAttacking  = false;
}

function updateUltimatePhase() {
    player.ultTimer--;

    if (player.ultPhase === 'vanish') {
        if (player.ultTimer <= 0) {
            player.ultPhase = 'hidden';
            player.ultTimer = player.ultHiddenDuration;
            spawnUltParticles(40);
        }

    } else if (player.ultPhase === 'hidden') {
        updateUltParticles();
        if (player.ultTimer <= 0) {
            player.ultPhase = 'camMove';
            player.ultTimer = player.ultCamDuration;
        }

    } else if (player.ultPhase === 'camMove') {
        updateUltParticles();
        const t    = 1 - player.ultTimer / player.ultCamDuration;
        const ease = t * t * (3 - 2 * t);
        const logicalW   = canvas.width / SCALE;
        const targetCamX = Math.max(0,
            Math.min(player.ultTargetX - logicalW / 2 + player.width / 2,
                     world.width - logicalW));
        camera.x = player.ultCamStartX + (targetCamX - player.ultCamStartX) * ease;

        if (player.ultTimer <= 0) {
            player.x  = player.ultTargetX;
            player.y  = player.ultTargetY;
            player.dy = 0;

            player.ultPhase   = 'fire';
            player.ultTimer   = ULT_FIRE_DURATION;
            ultimate.active   = true;
            ultimate.timer    = ULT_FIRE_DURATION;
            ultimate.duration = ULT_FIRE_DURATION;
            ultimate.alpha    = 0;

            ULT_TIMELINE.forEach(e => e.done = false);
        }

    } else if (player.ultPhase === 'fire') {
        updateUltParticles();
        updateSlashEffects();

        const elapsed = ULT_FIRE_DURATION - player.ultTimer;

        ULT_TIMELINE.forEach(entry => {
            if (!entry.done && elapsed >= entry.frame) {
                entry.done = true;
                const cx = player.x + player.width  / 2;
                const cy = player.y + player.height / 2;
                if (entry.type === 'slash') {
                    spawnSlash(cx, cy, entry.angle);
                    doUltHit(false);
                    spawnUltParticles(8);
                    playSound('ULT_1');
                } else if (entry.type === 'cross') {
                    spawnCross(cx, cy);
                    doUltHit(true);
                    spawnUltParticles(20);
                    playSound('ULT_FINAL');
                    ultimate.alpha = 1;
                }
            }
        });

        ultimate.timer--;
        const crossDone = ULT_TIMELINE[ULT_TIMELINE.length - 1].done;
        ultimate.alpha = crossDone
            ? Math.max(0, ultimate.timer / ULT_FIRE_DURATION)
            : 0;

        if (player.ultTimer <= 0) {
            ultimate.active = false;
            player.ultPhase = 'appear';
            player.ultTimer = 10;
        }

    } else if (player.ultPhase === 'appear') {
        updateUltParticles();
        updateSlashEffects();
        player.ultTimer--;
        if (player.ultTimer <= 0) {
            player.ultPhase = 'none';
            slashEffects.length = 0;   // 잔상 강제 제거
            ultParticles.length = 0;
        }
    }
}

function drawUltimate() {
    if (!ultimate.active || ultimate.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = ultimate.alpha * 0.55;
    ctx.fillStyle   = '#ffdd88';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}
// [START] 게임 엔진 구동
document.fonts.ready.then(() => {
    loadAssets(() => {
        loadMap(0); // 맵 1부터 시작
        update();
    });
});