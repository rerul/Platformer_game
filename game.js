/**
 * [플랫포머 게임 통합 엔진 - 전투 및 유틸리티 강화 버전]
 */

// [SECTION 1] 설정 및 전역 변수
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// HiDPI/레티나 대응: 물리 픽셀 해상도로 캔버스를 키우고 CSS 크기는 그대로 유지
const DPR = window.devicePixelRatio || 1;
canvas.width  = 1920 * DPR;
canvas.height = 1080 * DPR;
canvas.style.width  = '100%';
canvas.style.height = '100%';
ctx.imageSmoothingEnabled = false;   // 픽셀 선명도 유지

// UI 코드에서 논리 해상도(1920×1080)를 그대로 쓸 수 있도록 별칭 제공
const LOGICAL_W = 1920;
const LOGICAL_H = 1080;

let SCALE = 1.5 * DPR;
const BASE_SCALE = 1.5 * DPR;
const ULT_ZOOM_SCALE = 3.0 * DPR;
let cameraY = 0;
let currentMapIndex = 0;
const world = { width: 3000, height: 720 };
const camera = { x: 0 };

// tutorial 객체 - SECTION 6보다 먼저 선언해야 참조 오류 없음
const tutorial = {
    active:      false,
    pages:       [],
    currentPage: 0
};

// 위치 트리거 힌트 (튜토리얼 맵 전용)
const tutHint = {
    active:     false,
    shown:      false,
    text:       'Space(공중)  —  2단 점프',
    blinkTimer: 0,
    triggerX:   1800,    // barrier(x=2200) 400px 앞에서 표시
    hideX:      3500,    // 덩굴(x=3630) 앞에서 숨김
};

// 대시 힌트 (가시덩굴 앞에서 표시)
const dashHint = {
    active:     false,
    shown:      false,
    blinkTimer: 0,
    triggerX:   3450,    // 덩굴(x=3630) 180px 앞에서 표시
    hideX:      3660,    // 덩굴에 닿으면 사라짐
};

// 순간이동 힌트 (telewall 앞에서 표시) — teleMonologue(5150) 이후에 표시
const teleHint = {
    active:     false,
    shown:      false,
    blinkTimer: 0,
    triggerX:   5200,    // teleMonologue 독백 끝난 뒤 가까이서 표시
    hideX:      5410,    // telewall에 닿으면 사라짐
};

// ── 맵2 이벤트 영구 플래그 (맵 재진입해도 리셋되지 않음) ──────────────
const map2Events = {
    tutHintShown:            false,
    moveHintActive:          false,
    dashHintShown:           false,
    teleHintShown:           false,
    thornMonologueShown:     false,
    teleMonologueShown:      false,
    teleAfterMonologueShown: false,
    dialogueShown:           false,
    cutTriggered:            false,
    killMonologueDone:       false,
    introPlayed:             false,
};

// 덩굴 직전 독백 트리거
const thornMonologue = {
    shown:    false,
    triggerX: 3380,   // 덩굴(x=3630) 250px 앞
};

// telewall 직전 독백 트리거
const teleMonologue = {
    shown:    false,
    triggerX: 5150,   // telewall(x=5400) 250px 앞
};

// telewall 통과 직후 독백 트리거
const teleAfterMonologue = {
    shown:    false,
    triggerX: 5460,   // telewall(x=5400+40=5440) 통과 직후
};
const moveHint = {
    active:     false,
    blinkTimer: 0,
    hideX:      1300,   // tutHint.triggerX 보다 조금 앞에서 사라짐
};

// 전투 튜토리얼 상태 (튜토리얼 맵 전용)
const combatTutorial = {
    // ── 기존 ──
    dialogueShown:  false,
    hintActive:     false,
    hintShown:      false,
    blinkTimer:     0,
    triggerDistX:   400,     // 대화 발동 거리

    // ── 컷신 (적 발견 연출) ──
    // phase: 'idle' | 'freeze' | 'zoomToEnemy' | 'hold' | 'zoomBack' | 'monologue' | 'done'
    cutPhase:       'idle',
    cutTimer:       0,
    cutTriggerX:    6000,    // 이 X에 플레이어가 도달하면 컷신 시작 (적 x=6600, 화면 밖)
    cutTriggered:   false,

    // 줌·카메라 보간용
    cutScale:       1,
    cutCamX:        0,
    cutCamY:        0,
    savedScale:     1,       // 컷신 전 원래 SCALE
    savedCamX:      0,
    savedCamY:      0,
    targetCamX:     0,       // 적 위치 기준 목표 카메라
    targetCamY:     0,
    zoomInScale:    0,       // BASE_SCALE * 1.6 (진입 시 계산)

    // 각 페이즈 지속 프레임
    FREEZE_DUR:     18,
    ZOOM_IN_DUR:    40,
    HOLD_DUR:       90,
    ZOOM_OUT_DUR:   40,

    // ── 처치 후 독백 ──
    killMonologueDone: false,
};
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
    PLAYER_FALL_DOWN: './assets/images/player_fall_down.png',
    PLAYER_WAKE_UP:   './assets/images/player_wake_up.png',
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
    ENEMY2_ATTACK2:    './assets/images/enemy2_attack2.png',
    ENEMY3_STAND:    './assets/images/enemy3_stand.png',
    ENEMY3_ATTACK1:  './assets/images/enemy3_attack1.png',
    ENEMY3_ATTACK2:  './assets/images/enemy3_attack2.png',
    ENEMY3_ATTACK3:  './assets/images/enemy3_attack3.png',
    ENEMY3_ATTACK4:  './assets/images/enemy3_attack4.png',
    ENEMY3_ARROW:    './assets/images/enemy3_arrow.png',
    ENEMY1_STORY:    './assets/images/enemy1_story.png',
    BG_FOREST:       './assets/images/background_forest.png',
    BG_FOREST2:      './assets/images/background_forest2.png',
    BG_CLIFF:        './assets/images/background_cliff.png'
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
    ENEMY2_ATTACK:  { src: './assets/audio/enemy2_attack.wav',  volume: 0.5 },
    ENEMY3_ATTACK1: { src: './assets/audio/enemy3_attack1.wav', volume: 0.5 },
    ENEMY3_ATTACK2: { src: './assets/audio/enemy3_attack2.wav', volume: 0.5 }
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

// cloneNode를 사용해 재생 지연 없이 즉시 출력 (발사 타이밍 싱크용)
function playSoundImmediate(key) {
    const snd = sounds[key];
    if (!snd) return;
    const clone = snd.cloneNode();
    clone.volume = snd.volume;
    clone.play().catch(() => {});
}
// [SECTION 3] 입력 감지 (Input Control)
const keys = { a: false, d: false, s: false, w: false, space: false, spacePressed: false, mouseLeft: false, mouseLeftPressed: false, q: false, qPressed: false, u: false, uPressed: false, i: false, iPressed: false };

let audioUnlocked = false;
let audioMuted    = true;
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
    // 언락 후 BGM 시작 (뮤트 상태 반영)
    bgmPlayer.play('BGM1');
    if (bgmPlayer.current) bgmPlayer.current.muted = audioMuted;
    Object.values(sounds).forEach(snd => { snd.muted = audioMuted; });
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
    // 테스트용 단축키: 1 = 튜토리얼 맵(2번)으로 즉시 이동
    if (key === '1') {
        projectile.reset();
        introSeq.phase = 'idle';   // 혹시 이전 인트로 상태 초기화
        SCALE = BASE_SCALE;
        loadMap(2);
        // onEnter에서 player 위치 및 startTutorialIntro() 처리
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: 2 = 맵3으로 즉시 이동
    if (key === '2') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(3);
        _snapCameraToPlayer();
    }
    if (key === 'q' && !keys.qPressed) { keys.q = true; keys.qPressed = true; handleQKey(); }
    if (key === 'm') {
        audioMuted = !audioMuted;
        if (bgmPlayer.current) bgmPlayer.current.muted = audioMuted;
        Object.values(sounds).forEach(snd => { snd.muted = audioMuted; });
    }
    // U = 좌클릭과 동일
    if (key === 'u' && !keys.uPressed) {
        keys.u = true;
        keys.uPressed    = true;
        keys.mouseLeft   = true;
        keys.mouseLeftPressed = true;
    }
    // I = 우클릭과 동일 (대시)
    if (key === 'i' && !keys.iPressed) {
        keys.i = true;
        keys.iPressed = true;
        const now = Date.now();
        if (!player.isDashing && now - player.lastDashTime > player.dashCooldown) {
            player.isAttacking = false;
            player.attackTimer = 0;
            startDash();
        }
    }
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'a') keys.a = false;
    if (key === 'd') keys.d = false;
    if (key === 's') keys.s = false;
    if (key === 'w') keys.w = false;
    if (key === ' ') { keys.space = false; keys.spacePressed = false; }
    if (key === 'q') { keys.q = false; keys.qPressed = false; }
    // U 떼면 좌클릭도 해제
    if (key === 'u') {
        keys.u = false;
        keys.uPressed = false;
        // mouseLeft는 실제 마우스가 안눌려있을 때만 해제
        keys.mouseLeft        = false;
        keys.mouseLeftPressed = false;
    }
    if (key === 'i') { keys.i = false; keys.iPressed = false; }
});
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
// [SECTION 4] 플레이어 객체 (Player Object)
const player = {
    x: 100, y: 2280, width: 60, height: 80,
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
    thornsPushTimer: 0,   // 덩굴에 튕긴 직후 오른쪽 이동 억제 타이머

    // 필살기 연출 상태
    ultPhase: 'none',   // 'none' | 'vanish' | 'hidden' | 'camMove' | 'fire'
    ultTimer: 0,
    ultTargetX: 0,
    ultTargetY: 0,
    ultCamStartX: 0,
    ultCamDuration: 33,
    ultVanishDuration: 15,
    ultHiddenDuration: 9,
};

// [SECTION 5] 지형 데이터 (Map / Platforms)
const MAP_DATA = [
    {
        id: 0,
        worldWidth: 3000,
        worldHeight: 2400,   // ★ 기존 720 → 2400 (세로 3.3배 확장)
        bgColor: '#87CEEB',
        platforms: [
            // ── 바닥 및 벽 ──────────────────────────────────────────
            { x: 0,    y: 2350, width: 3000, height: 50,  type: 'solid' },   // 바닥
            { x: -60,  y: 0,    width: 60,   height: 2400, type: 'wall' },   // 왼쪽 벽
            { x: 3000, y: 0,    width: 60,   height: 2400, type: 'wall' },   // 오른쪽 벽

            // ── 기존 하단 플랫폼 (y 기준점을 바닥 2350에 맞춰 재배치) ──
            { x: 300,  y: 2200, width: 200,  height: 20,  type: 'platform' },
            { x: 600,  y: 2080, width: 250,  height: 20,  type: 'platform' },
            { x: 1000, y: 1980, width: 200,  height: 20,  type: 'platform' },
            { x: 1400, y: 2130, width: 300,  height: 20,  type: 'platform' },
            { x: 1800, y: 2030, width: 200,  height: 20,  type: 'platform' },

            // ── 중층 플랫폼 (높이 테스트) ────────────────────────────
            { x: 200,  y: 1800, width: 200,  height: 20,  type: 'platform' },
            { x: 500,  y: 1600, width: 220,  height: 20,  type: 'platform' },
            { x: 850,  y: 1420, width: 180,  height: 20,  type: 'platform' },
            { x: 1150, y: 1250, width: 200,  height: 20,  type: 'platform' },
            { x: 1450, y: 1080, width: 220,  height: 20,  type: 'platform' },
            { x: 1750, y: 900,  width: 200,  height: 20,  type: 'platform' },
            { x: 2050, y: 1300, width: 180,  height: 20,  type: 'platform' },
            { x: 2300, y: 1500, width: 200,  height: 20,  type: 'platform' },
            { x: 2550, y: 1700, width: 200,  height: 20,  type: 'platform' },

            // ── 상층 플랫폼 (카메라 추적 테스트용 고층) ───────────────
            { x: 400,  y: 700,  width: 250,  height: 20,  type: 'platform' },
            { x: 750,  y: 520,  width: 200,  height: 20,  type: 'platform' },
            { x: 1100, y: 350,  width: 220,  height: 20,  type: 'platform' },
            { x: 1450, y: 200,  width: 200,  height: 20,  type: 'platform' },
            { x: 1800, y: 80,   width: 300,  height: 20,  type: 'platform' },  // 최상단
        ],
        signs: [
            {
                x: 350, y: 2310,
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
                x: 800, y: 2310,
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
            { x: 500,  y: 2330, width: 60, height: 20, damage: 10 },
            { x: 1200, y: 2330, width: 60, height: 20, damage: 10 }
        ],
        enemies: [
            { type: 'enemy1', x: 900,  y: 2310 },
            { type: 'enemy1', x: 1600, y: 2310 },
            { type: 'enemy2', x: 2300, y: 2110 },
            { type: 'enemy2', x: 2650, y: 1980 },
            { type: 'enemy3', x: 2200, y: 2350 }
        ],
        dummies: [
            { x: 200,  y: 2350 },
            { x: 1100, y: 2350 }
        ],
        transitions: [
            {
                x: 2990, y: 2200,
                width: 80, height: 150,
                toMap: 1, spawnX: 100, spawnY: 610, direction: 'right',
                requireClear: true
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
                toMap: 0, spawnX: 2870, spawnY: 2200, direction: 'left'
            }
        ]
    }
];

// ── 튜토리얼 맵 (맵 2) ────────────────────────────────────────────
// MAP_DATA[2]로 직접 접근. 배열 리터럴 밖에 push해서 onEnter 함수 참조 문제를 방지
MAP_DATA.push({
    id: 2,
    worldWidth:  8000,
    worldHeight: 800,
    bgColor: '#d4e8f5',
    spawnX: 820,
    spawnY: 560,                 // 바닥y=640, 플레이어 높이=80

    platforms: [
        { x: 0,    y: 640, width: 8000, height: 160, type: 'solid' },   // 바닥
        { x: -60,  y: 0,   width: 60,   height: 800, type: 'wall'  },   // 왼쪽 벽
        { x: 8000, y: 0,   width: 60,   height: 800, type: 'wall'  },   // 오른쪽 벽

        // ── 2단점프 전용 고벽 (barrier) ─────────────────────────────
        { x: 2200, y: 440, width: 80, height: 200, type: 'barrier' },

        // ══ 구간 2→3 (barrier~덩굴) 사이 ════════════════════════════
        { x: 2600, y: 510, width: 140, height: 18,  type: 'platform' },
        // 낮은 통나무 — 1단 점프로 넘을 수 있는 높이
        { x: 2900, y: 520, width: 90,  height: 120, type: 'log' },
        { x: 3180, y: 490, width: 130, height: 18,  type: 'platform' },

        // ══ 구간 3→4 (덩굴~telewall) 사이 ═══════════════════════════
        { x: 3900, y: 500, width: 140, height: 18,  type: 'platform' },
        { x: 4560, y: 480, width: 130, height: 18,  type: 'platform' },
        { x: 5150, y: 500, width: 140, height: 18,  type: 'platform' },

        // ── 순간이동 전용 벽 (telewall) ──────────────────────────────
        { x: 5400, y: -200, width: 40, height: 1000, type: 'telewall' },

        // ══ 구간 5: telewall 통과 후 → enemy1 → 출구 ════════════════
        { x: 5700, y: 500, width: 160, height: 18,  type: 'platform' },
        { x: 6200, y: 480, width: 160, height: 18,  type: 'platform' },
        { x: 6900, y: 500, width: 160, height: 18,  type: 'platform' },
        { x: 7350, y: 480, width: 160, height: 18,  type: 'platform' },
        { x: 7760, y: 500, width: 200, height: 18,  type: 'platform' },   // 출구 앞 발판
    ],

    signs: [],
    spikes: [
        // 가시덩굴: y=-200(맵 위 경계 밖)부터 height=1000으로 아래까지 완전 차단
        { x: 3630, y: -200, width: 30, height: 1000, damage: 3, isThorns: true },
    ],
    enemies: [
        // telewall(x=5400) 통과 후 충분한 거리에 배치된 전투 튜토리얼용 enemy1
        { type: 'enemy1', x: 6600, y: 640, isTutorialEnemy: true },
    ],
    dummies: [],
    transitions: [
        {
            x: 7990, y: 400,
            width: 80, height: 240,
            toMap: 3, spawnX: 100, spawnY: 3070,
            direction: 'right',
            requireTutorialKill: true   // 튜토리얼 enemy1 처치 전까지 잠김
        }
    ],
    onEnter: () => {
        player.x       = MAP_DATA[2].spawnX;
        player.y       = MAP_DATA[2].spawnY;
        player.dx      = 0;
        player.dy      = 0;
        player.grounded = true;
        startTutorialIntro();
    }
});
let signs     = [];
let spikes    = [];
let enemies   = [];
let dummies   = [];

// 한 번 클리어한 맵은 영구 기록 (리젠돼도 출입구 유지)
const clearedMaps = new Set();

function isMapCleared(mapIndex) {
    if (clearedMaps.has(mapIndex)) return true;
    // 현재 맵 기준: 살아있는 적(isDead=false)이 없으면 클리어
    const alive = enemies.filter(e => !e.isDead).length;
    if (alive === 0 && enemies.length > 0) {
        clearedMaps.add(mapIndex);
        return true;
    }
    return false;
}

function loadMap(mapIndex) {
    const map       = MAP_DATA[mapIndex];
    currentMapIndex = mapIndex;
    world.width     = map.worldWidth;
    world.height    = map.worldHeight;
    platforms       = map.platforms;
    signs           = map.signs;
    spikes          = map.spikes || [];

    // 맵2는 한 번 클리어하면 적 리스폰 없음
    if (mapIndex === 2 && map2Events.killMonologueDone) {
        enemies = [];
    } else {
        enemies = (map.enemies || []).map(e => createEnemy(e.type, e.x, e.y, e));
    }

    dummies = (map.dummies || []).map(d => createDummy(d.x, d.y));

    // 튜토리얼 힌트 리셋 (맵2는 map2Events로 복원)
    tutHint.active     = false;
    tutHint.shown      = false;
    tutHint.blinkTimer = 0;
    moveHint.active    = false;
    moveHint.blinkTimer = 0;
    dashHint.active    = false;
    dashHint.shown     = false;
    dashHint.blinkTimer = 0;
    teleHint.active    = false;
    teleHint.shown     = false;
    teleHint.blinkTimer = 0;
    thornMonologue.shown = false;
    teleMonologue.shown  = false;
    teleAfterMonologue.shown = false;

    // 전투 튜토리얼 리셋
    combatTutorial.dialogueShown = false;
    combatTutorial.hintActive    = false;
    combatTutorial.hintShown     = false;
    combatTutorial.blinkTimer    = 0;
    combatTutorial.cutPhase      = 'idle';
    combatTutorial.cutTimer      = 0;
    combatTutorial.cutTriggered  = false;
    combatTutorial.killMonologueDone = false;

    // 맵2 진입 시 영구 플래그에서 상태 복원 (이미 발생한 이벤트는 재발동 안 함)
    if (mapIndex === 2) {
        tutHint.shown            = map2Events.tutHintShown;
        moveHint.active          = map2Events.moveHintActive;
        dashHint.shown           = map2Events.dashHintShown;
        teleHint.shown           = map2Events.teleHintShown;
        thornMonologue.shown     = map2Events.thornMonologueShown;
        teleMonologue.shown      = map2Events.teleMonologueShown;
        teleAfterMonologue.shown = map2Events.teleAfterMonologueShown;
        combatTutorial.dialogueShown     = map2Events.dialogueShown;
        combatTutorial.cutTriggered      = map2Events.cutTriggered;
        combatTutorial.killMonologueDone = map2Events.killMonologueDone;
        // 컷신이 이미 발동됐으면 done 상태로 복원
        if (map2Events.cutTriggered) {
            combatTutorial.cutPhase = 'done';
        }
    }

    // 맵 진입 이벤트 실행
    if (map.onEnter) map.onEnter();
}
// [SECTION 6] 물리 연산 및 업데이트 (Update Logic)
function update() {
    updateDialogue();
    updateAfterimages();
    if (player.isDashing) createAfterimage();

    // 튜토리얼 인트로 연출 업데이트 (항상 실행)
    updateTutorialIntro();
    // 전투 컷신 업데이트 (항상 실행 — SCALE·카메라 제어)
    updateCombatCutscene();

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

    // 전투 컷신 freeze/zoomToEnemy/hold/zoomBack 중 — 플레이어 입력·이동 차단
    const _cutActive = combatTutorial.cutPhase === 'freeze'      ||
                       combatTutorial.cutPhase === 'zoomToEnemy' ||
                       combatTutorial.cutPhase === 'hold'        ||
                       combatTutorial.cutPhase === 'zoomBack';
    if (_cutActive) {
        player.dx          = 0;
        player.isAttacking = false;
        player.attackTimer = 0;
        player.dy += player.gravity;
        if (player.dy > 20) player.dy = 20;
        player.y += player.dy;
        player.grounded = false;
        platforms.forEach(plat => {
            const type = plat.type || 'platform';
            if (type === 'solid' || type === 'platform' || type === 'barrier' || type === 'log') {
                if (player.x + player.width  > plat.x &&
                    player.x                 < plat.x + plat.width &&
                    player.y + player.height >= plat.y &&
                    player.y + player.height <= plat.y + 20 &&
                    player.dy >= 0) {
                    if (type !== 'platform' || !player.isDescending) {
                        player.y        = plat.y - player.height;
                        player.dy       = 0;
                        player.grounded = true;
                        player.jumpCount = 0;
                        player.jumpTimer = 0;
                    }
                }
            }
        });
        player.state = player.grounded ? 'idle' : 'jump2';
        draw();
        requestAnimationFrame(update);
        return;
    }

    if (dialogue.active || tutorial.active) {
        // 입력/이동/공격은 차단하되 중력과 지형 충돌은 그대로 처리
        player.dx          = 0;
        player.isAttacking = false;
        player.attackTimer = 0;

        // 중력
        player.dy += player.gravity;
        if (player.dy > 20) player.dy = 20;
        player.y += player.dy;

        // 지형 충돌 (착지 판정)
        player.grounded = false;
        platforms.forEach(plat => {
            const type = plat.type || 'platform';
            if (type === 'solid' || type === 'platform' || type === 'barrier' || type === 'log') {
                if (player.x + player.width  > plat.x &&
                    player.x                 < plat.x + plat.width &&
                    player.y + player.height >= plat.y &&
                    player.y + player.height <= plat.y + 20 &&
                    player.dy >= 0) {
                    if (type !== 'platform' || !player.isDescending) {
                        player.y         = plat.y - player.height;
                        player.dy        = 0;
                        player.grounded  = true;
                        player.jumpCount = 0;
                        player.jumpTimer = 0;
                    }
                }
            }
        });

        // 스프라이트: 공중이면 낙하, 바닥이면 idle
        player.state = player.grounded ? 'idle' : 'jump2';

        draw();
        requestAnimationFrame(update);
        return;
    }

    // 인트로 연출 중 — 물리/입력 차단 (대화창은 위에서 처리)
    if (isIntroActive()) {
        player.dx = 0;
        player.dy = 0;
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
    if (player.thornsPushTimer > 0) player.thornsPushTimer--;

    if (player.isDashing) {
        const dashDir = (player.direction === 'right' ? 1 : -1);
        player.dx = dashDir * player.dashSpeed;
    } else {
        if (keys.a) {
            player.dx = player.isAttacking ? -player.speed * 0.5 : -player.speed;
            player.direction = 'left';
        } else if (keys.d && player.thornsPushTimer <= 0) {
            // 덩굴 튕김 직후에는 D키 오른쪽 이동 무시
            player.dx = player.isAttacking ? player.speed * 0.5 : player.speed;
            player.direction = 'right';
        } else if (!keys.a) {
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
        } else if (type === 'barrier' || type === 'log') {
            // barrier/log: 위에서 착지 가능 + 좌우 벽처럼 막음
            // ① 위에서 착지
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
            // ② 좌우 진입 차단 (발판 위에 서있는 경우는 제외: player.y+height > plat.y+20)
            const overlapY = player.y + player.height > plat.y + 20 &&
                             player.y < plat.y + plat.height;
            if (overlapY) {
                const overlapX = player.x + player.width > plat.x &&
                                 player.x                < plat.x + plat.width;
                if (overlapX) {
                    const fromLeft  = (player.x + player.width) - plat.x;
                    const fromRight = (plat.x + plat.width) - player.x;
                    if (fromLeft < fromRight) {
                        player.x  = plat.x - player.width;
                    } else {
                        player.x  = plat.x + plat.width;
                    }
                    player.dx = 0;
                }
            }
        } else if (type === 'telewall') {
            // telewall: 플레이어는 좌우 진입 차단, 투사체만 통과 가능
            if (player.x + player.width  > plat.x &&
                player.x                 < plat.x + plat.width &&
                player.y + player.height > plat.y &&
                player.y                 < plat.y + plat.height) {
                const fromLeft  = (player.x + player.width) - plat.x;
                const fromRight = (plat.x + plat.width) - player.x;
                if (fromLeft < fromRight) {
                    player.x = plat.x - player.width;
                } else {
                    player.x = plat.x + plat.width;
                }
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

    // 6-9-1: 튜토리얼 위치 트리거 힌트
    updateTutHint();

    // 6-10: 카메라 및 경계
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > world.width) player.x = world.width - player.width;
    const logicalW = canvas.width  / SCALE;
    const logicalH = canvas.height / SCALE;

    // 수평 카메라
    // 맵3: 너비가 화면 1개와 동일하므로 x 고정 (0)
    if (currentMapIndex === 3) {
        camera.x = 0;
    } else {
        camera.x = player.x - logicalW / 2 + player.width / 2;
        if (camera.x < 0) camera.x = 0;
        if (camera.x > world.width - logicalW) camera.x = world.width - logicalW;
    }

    // 수직 카메라 — 플레이어 중심이 화면 중앙에 오도록 부드럽게 추적
    const targetCamY = player.y - logicalH / 2 + player.height / 2;
    cameraY += (targetCamY - cameraY) * 0.12;   // 0.12 = 추적 부드러움 (1.0이면 즉시)
    if (cameraY < 0) cameraY = 0;
    if (cameraY > world.height - logicalH) cameraY = world.height - logicalH;

    projectile.update();
    draw();
    requestAnimationFrame(update);
}

function checkPlayerAttackHit() {
    if (player.grounded && player.attackFrame !== 2) return;

    const atkDir   = player.direction === 'right' ? 1 : -1;
    const playerCX = player.x + player.width / 2;

    // 공격 프레임·상태별로 이미지 크기에 맞춰 범위 조정
    let frontRange, backRange;
    const isJumpAtk2 = !player.grounded && player.attackFrame === 2;
    if (player.grounded && player.attackFrame === 2) {
        // ATTACK2: drawWidth 2.1배 반영
        frontRange = 118;
        backRange  = 50;
    } else if (isJumpAtk2) {
        // JUMP_ATTACK2: 앞쪽+위쪽 궤적이 큰 이미지에 맞춤
        frontRange = 120;
        backRange  = 30;
    } else {
        // JUMP_ATTACK1
        frontRange = 95;
        backRange  = 25;
    }

    const atkXMin = playerCX - (atkDir === 1 ? backRange  : frontRange);
    const atkXMax = playerCX + (atkDir === 1 ? frontRange : backRange);

    const currentCY   = player.y + player.height / 2;
    const originCY    = player.grounded ? currentCY : player.airAttackOriginY + player.height / 2;
    // 점프공격2는 위쪽 궤적이 크므로 upwardBonus 대폭 증가
    const upwardBonus = player.grounded ? 0
                      : isJumpAtk2      ? player.height * 1.1
                      :                   player.height * 0.6;
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
    for (const spike of spikes) {
        if (spike.isThorns) {
            // ── 가시덩굴 처리 ──────────────────────────────────────
            // 대시 중이면 완전 통과 (충돌 자체 없음)
            if (player.isDashing) continue;

            const inX = player.x + player.width > spike.x &&
                        player.x                < spike.x + spike.width;
            const inY = player.y + player.height > spike.y &&
                        player.y                < spike.y + spike.height;

            if (inX && inY) {
                // 항상 덩굴 왼쪽 밖으로 밀어냄 (오른쪽에서 닿아도 동일)
                player.x         = spike.x - player.width;
                // D를 누르고 있어도 덮어쓰도록 강한 왼쪽 속도 고정 (위 튕김 없음)
                player.dx             = -10;
                player.direction      = 'left';
                player.thornsPushTimer = 18;  // 약 0.3초간 오른쪽 이동 억제

                // 무적 중이 아닐 때만 데미지
                if (!player.isInvincible) {
                    player.hp              = Math.max(player.hp - spike.damage, 0);
                    player.isInvincible    = true;
                    player.invincibleTimer = 90;
                }
            }
        } else {
            // ── 일반 가시 처리 ─────────────────────────────────────
            if (player.isInvincible) continue;
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
}
// [SECTION 7] 렌더링 (Rendering)
// ── 맵2 오른쪽 끝 절벽 배경 장식 ────────────────────────────────────
// 역삼각형: 위(꼭대기)가 넓고 아래(바닥)로 갈수록 좁아짐
// 빛 받는 면(밝음)과 그림자 면(어둠)의 색상 대비로 절벽 입체감 표현
// 중간에 살짝 꺾이는 능선 포함, 윤곽은 각진 느낌의 완만한 꺾임
function drawMap2CliffDecoration() {
    const mapH = world.height;
    const mapW = world.width;

    // ── 절벽 윤곽 꼭짓점 (완전 직선, 각진 형태) ──────────────────────
    const ptTop  = { x: 7300, y: 0    };  // 상단 왼쪽 끝
    const ptKink = { x: 7520, y: 380  };  // 중간 꺾임 (돌출 모서리)
    const ptBot  = { x: 7790, y: mapH };  // 하단

    ctx.save();

    // ① 빛 받는 면 (상단~꺾임 구간, 왼쪽 면) — 맵3 갈색 밝은 면
    ctx.beginPath();
    ctx.moveTo(ptTop.x,        ptTop.y);
    ctx.lineTo(ptKink.x,       ptKink.y);
    ctx.lineTo(ptKink.x + 160, ptKink.y);
    ctx.lineTo(ptTop.x + 160,  ptTop.y);
    ctx.closePath();
    const lightFace = ctx.createLinearGradient(ptTop.x, 0, ptTop.x + 160, 0);
    lightFace.addColorStop(0, '#c8a060');
    lightFace.addColorStop(1, '#a07840');
    ctx.fillStyle = lightFace;
    ctx.fill();

    // ② 그림자 면 (꺾임~하단 포함, 오른쪽 전체 채우기) — 맵3 갈색 어두운 면
    ctx.beginPath();
    ctx.moveTo(ptTop.x,  ptTop.y);
    ctx.lineTo(ptKink.x, ptKink.y);
    ctx.lineTo(ptBot.x,  ptBot.y);
    ctx.lineTo(mapW,     mapH);
    ctx.lineTo(mapW,     0);
    ctx.closePath();
    const shadowFace = ctx.createLinearGradient(ptTop.x, 0, mapW, 0);
    shadowFace.addColorStop(0,    '#8a6038');
    shadowFace.addColorStop(0.35, '#6a4828');
    shadowFace.addColorStop(1,    '#3e2810');
    ctx.fillStyle = shadowFace;
    ctx.fill();

    // ③ 꺾임 능선 — 빛/그림자 경계 밝은 선
    ctx.beginPath();
    ctx.moveTo(ptTop.x + 160, ptTop.y);
    ctx.lineTo(ptKink.x,      ptKink.y);
    ctx.strokeStyle = 'rgba(210,170,100,0.70)';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'miter';
    ctx.lineCap     = 'square';
    ctx.stroke();

    // ④ 왼쪽 윤곽 테두리 (완전 직선)
    ctx.beginPath();
    ctx.moveTo(ptTop.x,  ptTop.y);
    ctx.lineTo(ptKink.x, ptKink.y);
    ctx.lineTo(ptBot.x,  ptBot.y);
    ctx.strokeStyle = '#2e1a08';
    ctx.lineWidth   = 4;
    ctx.lineJoin    = 'miter';
    ctx.lineCap     = 'square';
    ctx.stroke();

    // ⑤ 윤곽 하이라이트 (테두리 오른쪽 얇은 밝은 선)
    ctx.beginPath();
    ctx.moveTo(ptTop.x + 3,  ptTop.y);
    ctx.lineTo(ptKink.x + 3, ptKink.y);
    ctx.lineTo(ptBot.x + 3,  ptBot.y);
    ctx.strokeStyle = 'rgba(200,155,80,0.40)';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'miter';
    ctx.lineCap     = 'square';
    ctx.stroke();

    ctx.restore();
}

// ── 맵3 절벽 벽면 바위 장식 ────────────────────────────────────────────
// 벽을 정면으로 보는 구도 — 벽에 박혀있는 납작한 바위 덩어리들 (순수 장식)
function drawMap3RockyBackground() {
    const W = world.width;   // 1280
    const H = world.height;  // 3200

    ctx.save();

    // 오른쪽 암벽 면 어두운 그라디언트 (깊이감)
    const rightGrad = ctx.createLinearGradient(W - 350, 0, W, 0);
    rightGrad.addColorStop(0,   'rgba(50,30,10,0)');
    rightGrad.addColorStop(0.5, 'rgba(50,30,10,0.15)');
    rightGrad.addColorStop(1,   'rgba(30,15,5,0.45)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(W - 350, 0, 350, H);

    // ── 벽에 박힌 바위 클러스터 (2~3개씩 뭉쳐서 산개) ─────────────────
    // 각 클러스터: 기준점 + 오프셋으로 2~3개 바위 배치
    // 바위 형태: 각진 다각형 (4~6각, 불규칙)
    const clusters = [
        { cx: 130, cy:  320, members: [{ ox:   0, oy:  0, r: 18 }, { ox:  22, oy: -8, r: 14 }, { ox: -16, oy: 12, r: 12 }] },
        { cx: 810, cy:  570, members: [{ ox:   0, oy:  0, r: 16 }, { ox:  20, oy:  6, r: 13 }] },
        { cx: 290, cy:  940, members: [{ ox:   0, oy:  0, r: 20 }, { ox:  24, oy: -5, r: 15 }, { ox: -18, oy:  8, r: 11 }] },
        { cx: 960, cy: 1240, members: [{ ox:   0, oy:  0, r: 15 }, { ox:  18, oy:  9, r: 12 }] },
        { cx:  80, cy: 1580, members: [{ ox:   0, oy:  0, r: 17 }, { ox:  21, oy: -6, r: 13 }, { ox: -14, oy: 10, r: 10 }] },
        { cx: 650, cy: 1870, members: [{ ox:   0, oy:  0, r: 19 }, { ox:  23, oy:  4, r: 14 }] },
        { cx: 200, cy: 2230, members: [{ ox:   0, oy:  0, r: 16 }, { ox:  20, oy: -7, r: 12 }, { ox: -15, oy:  9, r: 11 }] },
        { cx: 870, cy: 2510, members: [{ ox:   0, oy:  0, r: 18 }, { ox:  22, oy:  5, r: 13 }] },
        { cx: 420, cy: 2800, members: [{ ox:   0, oy:  0, r: 20 }, { ox:  25, oy: -4, r: 14 }, { ox: -17, oy: 11, r: 12 }] },
    ];

    // 각진-동그란 다각형 그리기 (꼭짓점 수 n, 반경 r, 중심 cx/cy, 시드로 불규칙화)
    function drawAngularRock(cx, cy, r, seed) {
        const n = 6;   // 꼭짓점 수
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            // 각 꼭짓점마다 반경을 seed 기반으로 약간씩 불규칙하게
            const jitter = 0.72 + ((seed * (i + 3) * 17) % 100) / 180;
            const angle  = (Math.PI * 2 / n) * i - Math.PI / 2;
            const px = cx + Math.cos(angle) * r * jitter;
            const py = cy + Math.sin(angle) * r * jitter * 0.78;  // 세로 약간 납작
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    clusters.forEach((cl, ci) => {
        cl.members.forEach((m, mi) => {
            const cx = cl.cx + m.ox;
            const cy = cl.cy + m.oy;
            const r  = m.r;
            const seed = ci * 31 + mi * 7;

            // 그림자
            ctx.save();
            ctx.translate(3, 5);
            drawAngularRock(cx, cy, r, seed);
            ctx.fillStyle = 'rgba(15,8,2,0.30)';
            ctx.fill();
            ctx.restore();

            // 본체
            drawAngularRock(cx, cy, r, seed);
            const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.05, cx, cy, r);
            g.addColorStop(0,   '#4a3822');
            g.addColorStop(0.7, '#2e2010');
            g.addColorStop(1,   '#150e05');
            ctx.fillStyle = g;
            ctx.fill();

            // 윤곽
            drawAngularRock(cx, cy, r, seed);
            ctx.strokeStyle = 'rgba(10,5,1,0.85)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            // 하이라이트 (왼쪽 위 작은 밝은 점)
            ctx.beginPath();
            ctx.ellipse(cx - r * 0.22, cy - r * 0.28, r * 0.28, r * 0.16, -0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(90,65,38,0.50)';
            ctx.fill();
        });
    });

    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(SCALE, SCALE);
    ctx.translate(-camera.x, -cameraY);

    // 7-1: 배경
    if (currentMapIndex === 2 && sprites['BG_FOREST'] && sprites['BG_FOREST'].naturalWidth > 0) {
        const bgImg  = sprites['BG_FOREST'];
        const bgImg2 = sprites['BG_FOREST2'] && sprites['BG_FOREST2'].naturalWidth > 0 ? sprites['BG_FOREST2'] : bgImg;
        const imgW  = bgImg.naturalWidth;
        const imgH  = bgImg.naturalHeight;
        // 맵 세로(world.height=800)에 딱 맞게 스케일, 가로는 비율 유지
        const scale = world.height / imgH;
        const tileW = imgW * scale;
        const tileH = world.height;
        const bgOffset = -tileW * 0.3;   // 전체 배경을 왼쪽으로 0.3장 이동
        const startX = Math.floor((camera.x - bgOffset) / tileW) * tileW + bgOffset;
        // 마지막 타일 X 계산 (world.width 이전 마지막 반복)
        const lastTileX = Math.floor((world.width - 1 - bgOffset) / tileW) * tileW + bgOffset;
        for (let tx = startX; tx < world.width; tx += tileW) {
            const useImg = (tx === lastTileX) ? bgImg2 : bgImg;
            ctx.drawImage(useImg, tx, 0, tileW, tileH);
        }
    } else {
        ctx.fillStyle = MAP_DATA[currentMapIndex].bgColor;
        ctx.fillRect(0, 0, world.width, world.height);
    }

    // 7-1b: 맵3 절벽 배경 이미지 (세로 루프)
    if (currentMapIndex === 3 && sprites['BG_CLIFF'] && sprites['BG_CLIFF'].naturalWidth > 0) {
        const bgImg = sprites['BG_CLIFF'];
        const imgW  = bgImg.naturalWidth;
        const imgH  = bgImg.naturalHeight;
        // 맵 가로(world.width=1280)에 딱 맞게 스케일, 세로는 비율 유지
        const scale = world.width / imgW;
        const tileW = world.width;
        const tileH = imgH * scale;
        const startY = Math.floor(cameraY / tileH) * tileH;
        for (let ty = startY; ty < world.height; ty += tileH) {
            ctx.drawImage(bgImg, 0, ty, tileW, tileH);
        }
    } else if (currentMapIndex === 3) {
        ctx.fillStyle = MAP_DATA[currentMapIndex].bgColor;
        ctx.fillRect(0, 0, world.width, world.height);
    }

// ── 잘린 나무 그루터기 렌더링 (barrier / log 공용) ──────────────────
function drawStump(ctx, x, y, w, h) {
    const cx  = x + w / 2;
    const base = y + h;   // 판정 하단 = 지면

    // 원기둥 치수 — rx 기준으로 모든 폭/위치 통일
    const rx  = w * 0.36;          // 가로 반경
    const ry  = Math.max(h * 0.09, 9); // 세로 반경 (상·하단 타원 공용)
    const topCY  = y + ry;         // 상단 타원 중심 y (타원이 판정 상단에 걸쳐 앉음)
    const botCY  = base;           // 하단 타원 중심 y (판정 하단)

    // ── ① 몸통: 좌우 직선 + 상·하단 타원 하반부·상반부로 닫히는 패스 ──
    // 좌우 벽은 타원 중심 y 기준으로 수직선
    ctx.save();
    ctx.beginPath();
    // 상단 타원 — 왼쪽 끝(π)에서 오른쪽 끝(0)으로 윗쪽 반호
    ctx.ellipse(cx, topCY, rx, ry, 0, Math.PI, 0, false); // 위 반호 (left→right)
    // 오른쪽 수직선: 상단 타원 오른쪽 끝 → 하단 타원 오른쪽 끝
    ctx.lineTo(cx + rx, botCY);
    // 하단 타원 아랫쪽 반호 (right→left)
    ctx.ellipse(cx, botCY, rx, ry, 0, 0, Math.PI, false);
    // 왼쪽 수직선: 하단 타원 왼쪽 끝 → 상단 타원 왼쪽 끝
    ctx.lineTo(cx - rx, topCY);
    ctx.closePath();

    const gradBody = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    gradBody.addColorStop(0,    '#2c1a0a');
    gradBody.addColorStop(0.10, '#5a3318');
    gradBody.addColorStop(0.32, '#8c5830');
    gradBody.addColorStop(0.50, '#a86838');
    gradBody.addColorStop(0.68, '#8c5830');
    gradBody.addColorStop(0.90, '#5a3318');
    gradBody.addColorStop(1,    '#2c1a0a');
    ctx.fillStyle = gradBody;
    ctx.fill();

    // 세로 껍질 결 (클립)
    ctx.clip();
    [0.12, 0.25, 0.40, 0.50, 0.60, 0.75, 0.88].forEach((r, i) => {
        const gx = (cx - rx) + rx * 2 * r;
        ctx.strokeStyle = `rgba(0,0,0,${0.09 + (i % 3) * 0.04})`;
        ctx.lineWidth   = 0.8 + (i % 3) * 0.7;
        ctx.beginPath();
        ctx.moveTo(gx + (r < 0.5 ? -2 : 2), topCY + ry * 0.3);
        ctx.lineTo(gx, botCY - ry * 0.3);
        ctx.stroke();
    });

    // 이끼 (왼쪽 측면 중간)
    ctx.globalAlpha = 0.40;
    [[0.10, 0.35, 6], [0.06, 0.52, 5], [0.14, 0.25, 4]].forEach(([rx2, ry2, rad]) => {
        ctx.beginPath();
        ctx.arc((cx - rx) + rx * 2 * rx2, topCY + (botCY - topCY) * ry2, rad, 0, Math.PI * 2);
        ctx.fillStyle = '#3d6e22';
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 측면 윤곽선
    ctx.strokeStyle = 'rgba(18, 8, 2, 0.55)';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    ctx.restore();

    // ── ② 하단 타원 — 위쪽 절반만 그려 바닥면 암시 ─────────────────
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, botCY, rx, ry, 0, Math.PI, 0, false); // 위 반호만
    ctx.closePath();
    ctx.fillStyle = '#4a2a10';
    ctx.fill();
    ctx.strokeStyle = 'rgba(18, 8, 2, 0.45)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── ③ 상단 단면 타원 (나이테 + 수심) ────────────────────────────
    // 껍질 외곽 (몸통 그라디언트와 동일 색으로 경계 없애기)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, topCY, rx, ry, 0, 0, Math.PI * 2);
    const gradBark = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    gradBark.addColorStop(0,    '#2c1a0a');
    gradBark.addColorStop(0.10, '#5a3318');
    gradBark.addColorStop(0.32, '#8c5830');
    gradBark.addColorStop(0.50, '#a86838');
    gradBark.addColorStop(0.68, '#8c5830');
    gradBark.addColorStop(0.90, '#5a3318');
    gradBark.addColorStop(1,    '#2c1a0a');
    ctx.fillStyle = gradBark;
    ctx.fill();
    ctx.restore();

    // 단면 내부 (나이테)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, topCY, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
    const gradFace = ctx.createRadialGradient(
        cx - rx * 0.18, topCY - ry * 0.25, 0,
        cx, topCY, rx
    );
    gradFace.addColorStop(0,    '#f8cc80');
    gradFace.addColorStop(0.35, '#d49858');
    gradFace.addColorStop(0.70, '#b07038');
    gradFace.addColorStop(1,    '#7a4820');
    ctx.fillStyle = gradFace;
    ctx.fill();

    ctx.clip();
    const ringCount = Math.max(2, Math.floor(rx / 6));
    for (let i = 1; i <= ringCount; i++) {
        const rt = i / (ringCount + 1);
        ctx.beginPath();
        ctx.ellipse(cx, topCY, rx * 0.86 * rt, ry * 0.86 * rt, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(85, 40, 12, ${0.13 + rt * 0.20})`;
        ctx.lineWidth   = 0.9;
        ctx.stroke();
    }
    // 수심
    ctx.beginPath();
    ctx.ellipse(cx, topCY, Math.max(2, rx * 0.07), Math.max(1, ry * 0.18), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60, 22, 5, 0.85)';
    ctx.fill();
    ctx.restore();

    // 단면 테두리
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, topCY, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(45, 18, 4, 0.50)';
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.restore();
}

    // 7-2: 플랫폼
    platforms.forEach(plat => {
        if (plat.type === 'barrier' || plat.type === 'log') {
            drawStump(ctx, plat.x, plat.y, plat.width, plat.height);
        } else if (plat.type === 'telewall') {
            // telewall: 투사체만 통과하는 에너지 장벽 — 보라/청보라 반투명
            const tw = plat.width;
            const th = plat.height;
            const tx = plat.x;
            const ty = plat.y;

            // 배경 채우기
            ctx.fillStyle = 'rgba(80, 40, 160, 0.55)';
            ctx.fillRect(tx, ty, tw, th);

            // 세로 줄무늬 에너지 라인
            const lineCount = Math.max(2, Math.floor(tw / 10));
            for (let li = 0; li < lineCount; li++) {
                const lx = tx + (tw / (lineCount + 1)) * (li + 1);
                const pulse = Math.sin(Date.now() / 300 + li * 1.5) * 0.25 + 0.75;
                ctx.strokeStyle = `rgba(180, 120, 255, ${pulse * 0.9})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(lx, ty);
                ctx.lineTo(lx, ty + th);
                ctx.stroke();
            }

            // 테두리 — 밝은 보라
            ctx.strokeStyle = 'rgba(200, 150, 255, 0.85)';
            ctx.lineWidth   = 2;
            ctx.strokeRect(tx, ty, tw, th);

            // 투사체 통과 아이콘 (중앙에 작은 원 힌트)
            const midY = ty + th / 2;
            ctx.beginPath();
            ctx.arc(tx + tw / 2, midY, 10, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(220, 180, 255, 0.4)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(220, 180, 255, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else {
            // 맵3: 절벽 바위 스타일
            if (currentMapIndex === 3) {
                if (plat.type === 'solid') {
                    // 바닥 — 두꺼운 암반 (격자 없음)
                    ctx.fillStyle = '#7a5030';
                    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
                    ctx.fillStyle = '#9a6840';
                    ctx.fillRect(plat.x, plat.y, plat.width, 10);
                    ctx.fillStyle = '#5a3820';
                    ctx.fillRect(plat.x, plat.y + 10, plat.width, 4);
                } else if (plat.type === 'wall') {
                    ctx.fillStyle = '#7a5030';
                    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
                } else {
                    // platform — 돌출된 바위 발판
                    ctx.fillStyle = '#8a6040';
                    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
                    // 상단 밝은 면 (빛 받는 표면)
                    ctx.fillStyle = '#b08058';
                    ctx.fillRect(plat.x, plat.y, plat.width, 6);
                    // 하단 그림자
                    ctx.fillStyle = '#5a3820';
                    ctx.fillRect(plat.x, plat.y + plat.height - 5, plat.width, 5);
                    // 왼쪽 측면 (돌출 느낌)
                    ctx.fillStyle = '#6a4828';
                    ctx.fillRect(plat.x, plat.y + 6, 6, plat.height - 11);
                    // 울퉁불퉁 돌 질감 (작은 돌기)
                    ctx.fillStyle = 'rgba(180,130,80,0.5)';
                    for (let bx2 = plat.x + 15; bx2 < plat.x + plat.width - 10; bx2 += 28) {
                        ctx.fillRect(bx2, plat.y + 2, 8, 3);
                    }
                }
            } else {
                ctx.fillStyle = (plat.type === 'solid' || plat.type === 'wall') ? '#654321' : '#4A4A4A';
                ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
            }
        }
    });

    // 7-3: 가시 / 가시덩굴
    spikes.forEach(spike => {
        if (spike.isThorns) {
            // 가시덩굴: 세로로 긴 덩굴 그래픽
            const sw = spike.width;
            const sx = spike.x;
            const sy = spike.y;
            const sh = spike.height;

            // 줄기 배경 (어두운 녹색)
            ctx.fillStyle = '#1a3a10';
            ctx.fillRect(sx, sy, sw, sh);

            // 줄기 중앙 라인들
            const stemCount = Math.max(2, Math.floor(sw / 18));
            for (let s = 0; s < stemCount; s++) {
                const stemX = sx + (sw / (stemCount + 1)) * (s + 1);
                ctx.strokeStyle = '#2d5a1a';
                ctx.lineWidth   = 3;
                ctx.beginPath();
                ctx.moveTo(stemX, sy + sh);
                ctx.bezierCurveTo(
                    stemX + 8,  sy + sh * 0.7,
                    stemX - 8,  sy + sh * 0.4,
                    stemX,      sy
                );
                ctx.stroke();
            }

            // 가시 삼각형 (좌우 교대로)
            const thornSpacing = 22;
            const thornH = 9;
            const thornW = 7;
            for (let ty2 = sy + 10; ty2 < sy + sh - 10; ty2 += thornSpacing) {
                const side = Math.floor((ty2 - sy) / thornSpacing) % 2 === 0 ? -1 : 1;
                const tx   = sx + sw / 2 + side * (sw * 0.15);
                ctx.fillStyle = '#c8c060';
                ctx.beginPath();
                ctx.moveTo(tx,               ty2);
                ctx.lineTo(tx + side * thornW, ty2 + thornH / 2);
                ctx.lineTo(tx,               ty2 + thornH);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#8a8030';
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }

            // 좌우 테두리 선
            ctx.strokeStyle = 'rgba(180,220,80,0.4)';
            ctx.lineWidth   = 1.5;
            ctx.strokeRect(sx, sy, sw, sh);

            // 대시 시 살짝 반짝임 (player.isDashing && 범위 근처)
            const nearX = Math.abs(player.x + player.width / 2 - (sx + sw / 2)) < 150;
            if (player.isDashing && nearX) {
                ctx.fillStyle = 'rgba(120,255,120,0.08)';
                ctx.fillRect(sx, sy, sw, sh);
            }
            return;
        }
        // 일반 가시
        const col  = 6;
        const tipW = spike.width / col;
        for (let i = 0; i < col; i++) {
            const sx2 = spike.x + i * tipW;
            ctx.fillStyle = '#888888';
            ctx.beginPath();
            ctx.moveTo(sx2,          spike.y + spike.height);
            ctx.lineTo(sx2 + tipW,   spike.y + spike.height);
            ctx.lineTo(sx2 + tipW/2, spike.y);
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

    // 7-5: 잔상 (필살기 연출 중엔 숨김)
    if (typeof afterimages !== 'undefined' && player.ultPhase === 'none') {
        const lW = canvas.width / SCALE;
        const lH = canvas.height / SCALE;
        afterimages.forEach(img => {
            const sx = img.x - camera.x;
            const sy = img.y - cameraY;
            if (sx + img.width < 0 || sx > lW) return;
            if (sy + img.height < 0 || sy > lH) return;
            drawSprite(img.imageKey, img.x, img.y, img.width, img.height, img.direction, img.opacity);
        });
    }

    // 7-6: 플레이어 스프라이트
    let currentKey = 'PLAYER_STAND';
    const introKey = getIntroPlayerKey();
    if (introKey) {
        // 인트로 연출 중: 스프라이트 고정, 방향은 왼쪽(쓰러진 방향)
        currentKey = introKey;
        if (introSeq.phase === 'fall' || introSeq.phase === 'hint') {
            player.direction = 'left';  // 쓰러진 채로 왼쪽 방향
        }
    } else if (player.isAttacking) {
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

    // vanish/hidden 페이즈면 JUMP1 고정, fire 페이즈면 STAND
    if (player.ultPhase === 'vanish' || player.ultPhase === 'hidden') {
        currentKey = 'PLAYER_JUMP1';
    } else if (player.ultPhase === 'fire') {
        currentKey = 'PLAYER_STAND';
    }
    player.currentDrawingKey = currentKey;

    let drawWidth  = player.width;
    let drawHeight = player.height * 1.3;
    if (player.isAttacking) {
        if (currentKey === 'ATTACK2') {
            drawWidth  *= 2.1;
            drawHeight *= 1.32;
        } else if (currentKey === 'JUMP_ATTACK2') {
            drawWidth  *= 1.75;
            drawHeight *= 1.32;
        } else {
            drawWidth  *= 1.3;
            drawHeight *= 1.1;
        }
    } else if (player.state === 'walk') {
        drawWidth *= 1.3;
    }

    // ── 인트로 전용 스프라이트 크기 오버라이드 ──────────────────────
    // fall_down: 1415×429 (비율 3.298)
    //   - 이미지 하단 여백이 있어 실제 칼/발 끝은 이미지 높이의 약 88% 지점
    //   - drawHeight를 hitbox 높이의 55%로 줄여서 자연스러운 크기로
    // wake_up:   398×329 (비율 1.21)
    if (currentKey === 'PLAYER_FALL_DOWN') {
        drawHeight = player.height * 0.55;
        drawWidth  = drawHeight * 3.298;
    } else if (currentKey === 'PLAYER_WAKE_UP') {
        drawHeight = player.height * 1.1;
        drawWidth  = drawHeight * 1.21;
    }

    // drawX/drawY: 기본은 hitbox 하단 기준 (발 맞춤)
    let drawX = player.x - (drawWidth  - player.width)  / 2;
    let drawY = (player.y + player.height) - drawHeight;

    if (currentKey === 'PLAYER_FALL_DOWN') {
        // imgBottomGap: 양수면 이미지가 위로 뜸 → 음수로 더 내림
        const imgBottomGap = drawHeight * 0.18;   // 0.03 → 0.18 (더 아래로)
        drawY = (player.y + player.height) - drawHeight + imgBottomGap;
        // drawWidth * X 를 키울수록 drawX가 왼쪽으로 이동 → 오른쪽 치우침 해소
        drawX = player.x + player.width / 2 - drawWidth * 0.35;
    }

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
    drawSlashEffects();

    // 출입구 잠금/해제 표시
    drawMapTransitionDoors();

    // 7-6: 적 렌더링
    drawEnemies();
    drawDummies();
    // 7-7: 투사체
    projectile.draw();

    ctx.restore();

    // 7-8: UI / 대화창 — DPR 배율 적용 (UI 좌표는 논리 픽셀 기준 그대로 유지)
    ctx.save();
    ctx.scale(DPR, DPR);
    if (typeof drawUI       === 'function') drawUI();
    if (typeof drawDialogue === 'function') drawDialogue();
    if (typeof drawTutorial === 'function') drawTutorial();
    drawIntroHint();
    drawMoveHint();
    drawTutHint();
    drawDashHint();
    drawTeleHint();
    drawCombatTutHint();
    drawUltimate();
    ctx.restore();

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
            // platform, telewall 타입은 투사체 통과
            if (type === 'platform' || type === 'telewall') continue;

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
    // 대화 중엔 투사체 발사 및 순간이동 차단
    if (dialogue.active || tutorial.active) return;
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

    // ══ 생각(thought) 전용 렌더링 ══════════════════════════════════════
    if (dialogue.speakerType === 'thought') {
        const boxH = 300;
        const boxY = LOGICAL_H - boxH;
        const boxW = LOGICAL_W;

        // 대화창 배경 (일반과 동일)
        ctx.fillStyle = 'rgba(8, 8, 18, 0.92)';
        ctx.fillRect(0, boxY, boxW, boxH);

        ctx.strokeStyle = 'rgba(160, 130, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, boxY);
        ctx.lineTo(boxW, boxY);
        ctx.stroke();

        // 텍스트 — 중앙 정렬
        const textY = boxY + 80;
        ctx.fillStyle = 'rgba(235, 230, 245, 1)';
        ctx.font = `42px ${DIALOGUE_FONT}`;
        ctx.textAlign = 'center';
        wrapTextCenter(ctx, dialogue.displayText, LOGICAL_W / 2, textY, LOGICAL_W - 400, 64);
        ctx.textAlign = 'left';

        // 진행 표시 ▼ (일반과 동일)
        if (dialogue.isFinished) {
            const blink = Math.floor(Date.now() / 500) % 2 === 0;
            if (blink) {
                ctx.fillStyle = 'rgba(200, 175, 255, 0.9)';
                ctx.font = '19px monospace';
                ctx.textAlign = 'right';
                ctx.fillText('▼', boxW - 45, LOGICAL_H - 30);
                ctx.textAlign = 'left';
            }
        }
        return;
    }

    // ══ 일반 대화 렌더링 ════════════════════════════════════════════════
    const boxH = 300;
    const boxY = LOGICAL_H - boxH;
    const boxW = LOGICAL_W;

    const illustH  = 1080;
    const illustW  = 585;
    const dimAlpha = 0.35;
    const isSolo   = dialogue.cast.length === 1;
    const isPlayer = dialogue.speakerType === 'player';

    // --- 왼쪽 스탠딩 ---
    const leftIllust = sprites['STORY1'];
    const leftAlpha  = isSolo ? 1 : (isPlayer ? 1 : dimAlpha);
    const leftX = 60;
    const leftY = LOGICAL_H - illustH;

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
        const rightX = LOGICAL_W - illustW - 60;
        const rightY = LOGICAL_H - illustH;

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
            : LOGICAL_W - 90 - nameW;

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
    const textMarginL = 300;
    const textMarginR = isSolo ? 200 : 680;
    const textX    = textMarginL;
    const textMaxW = LOGICAL_W - textMarginL - textMarginR;
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
            ctx.fillText('▼', boxW - 45, LOGICAL_H - 30);
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

// 중앙 정렬 wrapText (thought 타입용)
function wrapTextCenter(ctx, text, cx, y, maxWidth, lineHeight) {
    const chars = text.split('');
    let line = '';
    let currentY = y;
    for (const char of chars) {
        const test = line + char;
        if (ctx.measureText(test).width > maxWidth) {
            ctx.fillText(line, cx, currentY);
            line = char;
            currentY += lineHeight;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, cx, currentY);
}

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
            // requireClear가 있는 출입구: 맵 클리어 전엔 이동 불가
            if (tr.requireClear && !isMapCleared(currentMapIndex)) break;

            // requireTutorialKill: 튜토리얼 enemy1을 처치해야만 통과 가능
            if (tr.requireTutorialKill) {
                // 영구 클리어 플래그 우선 확인 (맵 재진입 후 enemy 없어도 안전)
                if (!map2Events.killMonologueDone) {
                    const tutEnemy = enemies.find(e => e.isTutorialEnemy);
                    if (tutEnemy) break;   // 아직 살아있으면 차단
                }
            }

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

function drawMapTransitionDoors() {
    const map = MAP_DATA[currentMapIndex];
    if (!map.transitions) return;

    map.transitions.forEach(tr => {
        const hasClearReq   = !!tr.requireClear;
        const hasTutKillReq = !!tr.requireTutorialKill;

        let cleared;
        if (hasTutKillReq) {
            // 영구 클리어 플래그 우선 (재진입 후에도 열림 유지)
            cleared = map2Events.killMonologueDone || !enemies.find(e => e.isTutorialEnemy);
        } else if (hasClearReq) {
            cleared = isMapCleared(currentMapIndex);
        } else {
            // 조건 없는 통로 — 항상 열림
            cleared = true;
        }

        const barW = tr.width;
        const barH = tr.height;

        ctx.save();

        if (!cleared) {
            // ── 잠김: 붉은 반투명 블로킹 ──
            ctx.fillStyle = 'rgba(200, 30, 30, 0.35)';
            ctx.fillRect(tr.x, tr.y, barW, barH);

            ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
            ctx.lineWidth   = 2.5;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(tr.x, tr.y, barW, barH);
            ctx.setLineDash([]);

        } else {
            // ── 열림: 초록 반짝이는 테두리 ──
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
            ctx.strokeStyle = `rgba(80, 255, 120, ${0.55 + 0.35 * pulse})`;
            ctx.lineWidth   = 3;
            ctx.strokeRect(tr.x, tr.y, barW, barH);

            ctx.fillStyle = `rgba(80, 255, 120, ${0.08 + 0.07 * pulse})`;
            ctx.fillRect(tr.x, tr.y, barW, barH);
        }

        ctx.restore();
    });
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

            const logicalW = canvas.width  / SCALE;
            const logicalH = canvas.height / SCALE;
            camera.x = player.x - logicalW / 2 + player.width  / 2;
            if (camera.x < 0) camera.x = 0;
            if (camera.x > world.width - logicalW) camera.x = world.width - logicalW;
            cameraY  = player.y - logicalH / 2 + player.height / 2;
            cameraY  = Math.max(0, Math.min(cameraY, world.height - logicalH));

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
    // 인트로 연출 중엔 HUD 숨김
    if (isIntroActive()) return;

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

// [SECTION 14] 순간이동 잔상 (Teleport Afterimages)
const teleportTrails = [];

function spawnTeleportAfterimages(fromX, fromY, toX, toY) {
    const dx    = toX - fromX;
    const dy    = toY - fromY;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(Math.floor(dist / 100), 2);

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

        // 화면 밖 컬링
        const screenX = t.x - camera.x;
        const screenY = t.y - cameraY;
        if (screenX + t.width  < 0 || screenX > logicalW) return;
        if (screenY + t.height < 0 || screenY > logicalH) return;

        const img       = sprites[t.imageKey];
        const fallback  = sprites['PLAYER_STAND'];
        const targetImg = (img && img.complete && img.naturalWidth !== 0) ? img : fallback;
        if (!targetImg) return;

        const drawWidth  = t.width;
        const drawHeight = t.height * 1.3;
        const drawX      = t.x - (drawWidth  - t.width)  / 2;
        const drawY      = (t.y + t.height) - drawHeight;

        ctx.save();
        ctx.globalAlpha = t.opacity;

        // 스프라이트 출력
        if (t.direction === 'right') {
            ctx.save();
            ctx.translate(drawX + drawWidth, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(targetImg, 0, 0, drawWidth, drawHeight);
            ctx.restore();
        } else {
            ctx.drawImage(targetImg, drawX, drawY, drawWidth, drawHeight);
        }

        // 파란 색조 오버레이 (ctx.filter 대체)
        ctx.globalAlpha = t.opacity * 0.55;
        ctx.fillStyle   = '#44aaff';
        ctx.fillRect(drawX, drawY, drawWidth, drawHeight);

        ctx.restore();
    });
}
// [SECTION 15] 허수아비 시스템 (Dummy System)
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
    },
    enemy3: {
        // ★ 이 두 값만 바꾸면 스프라이트·화살 스케일 전체 연동
        width:        90,
        height:       120,
        hp:           60,
        speed:        0,
        gravity:      0.8,
        detectRange:  700,   // 화면에 적이 보이기 시작하는 거리 (~화면 절반)
        loseRange:    900,   // 감지 해제
        attackRange:  650,
        arrowMaxDist: 800,   // 화살 최대 비행거리 (이 이상이면 소멸)
        attackDamage: 12,
        attackCooldown: 180,
        windupDuration: 30,
        imgStand:   'ENEMY3_STAND',
        imgAttack1: 'ENEMY3_ATTACK1',
        imgAttack2: 'ENEMY3_ATTACK2',
        imgAttack3: 'ENEMY3_ATTACK3',
        imgAttack4: 'ENEMY3_ATTACK4',
    }
};

function createEnemy(type, x, y, opts) {
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
        isTutorialEnemy:  !!(opts && opts.isTutorialEnemy),
        tutDialogueDone:  false,   // 대화 완료 전까지 행동 잠금

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

    if (type === 'enemy3') {
        return Object.assign(base, {
            imgStand:      def.imgStand,
            imgAttack1:    def.imgAttack1,
            imgAttack2:    def.imgAttack2,
            imgAttack3:    def.imgAttack3,
            imgAttack4:    def.imgAttack4,
            windupDuration: def.windupDuration,
            arrowMaxDist:  def.arrowMaxDist,
            windupStep:    0,
            windupTimer:   0,
            arrows:        [],
        });
    }

    return base;
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];

        if (e.isDead) {
            // 튜토리얼 enemy1은 깜빡임 없이 즉시 제거
            if (e.isTutorialEnemy) {
                enemies.splice(i, 1);
                continue;
            }
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

        if (!e.isAggro && dist < e.detectRange) { if (e.type !== 'enemy3') e.isAggro = true; }
        else if (e.isAggro && dist > e.loseRange) { if (e.type !== 'enemy3') e.isAggro = false; }

        // ── enemy1 ───────────────────────────────────────────────
        if (e.type === 'enemy1') {
            // ── 튜토리얼 전용 enemy1: 대화 전 완전 정지, 대화 후 영구 어그로 ──
            if (e.isTutorialEnemy) {
                if (!e.tutDialogueDone) {
                    // 대화 전: 제자리 대기 (배회·공격 없음)
                    e.dx    = 0;
                    e.state = 'idle';
                    e.direction = (player.x + player.width / 2 < e.x + e.width / 2) ? 'left' : 'right';

                    // 접근 감지 → 대화 발동 (컷신 완전 종료 후에만)
                    if (!combatTutorial.dialogueShown &&
                        combatTutorial.cutPhase === 'done' &&
                        Math.abs(distX) < combatTutorial.triggerDistX) {
                        combatTutorial.dialogueShown = true;
                        map2Events.dialogueShown     = true;
                        dialogue.active      = true;
                        dialogue.cast        = ['STORY1', 'ENEMY1_STORY'];
                        dialogue.lines       = [
                            { speaker: '???', text: '저기, 물어볼 것이 있습..',               speakerType: 'player', illustKey: 'STORY1' },
                            { speaker: '',     text: '말이 채 끝나기도 전에, 나를 발견한 그자가 소스라치며 놀란다.', speakerType: 'thought',  illustKey: '' },
                            { speaker: '???',    text: '사, 살아 있었다고?',              speakerType: 'npc',    illustKey: 'ENEMY1_STORY' },
                            { speaker: '???',    text: '하필 혼자 있을 때..! 도, 도망쳐야...', speakerType: 'npc',    illustKey: 'ENEMY1_STORY' },
                            { speaker: '',     text: '그렇게 말하며 뒤돌아섰던 그자가 잠시 멈칫하더니 이윽고 다시 나를 바라본다.', speakerType: 'thought',  illustKey: '' },
                            { speaker: '???',    text: '하, 하지만, 지금 상태라면.', speakerType: 'npc',    illustKey: 'ENEMY1_STORY' },
                            { speaker: '',     text: '알 수 없는 소리를 중얼거리던 그자는, 들고있던 무기를 떨리는 손으로 내게 겨눈다.', speakerType: 'thought',  illustKey: '' },
                            { speaker: '???', text: '무언가 오해가 있으신 거 같습니다. 저는..',               speakerType: 'player', illustKey: 'STORY1' },
                            { speaker: '',     text: '하지만 그는 더이상 말을 제대로 들을 상태가 아닌 것 같았다.', speakerType: 'thought',  illustKey: '' },
                            { speaker: '???', text: '허... 싸울 수 밖에 없나.',               speakerType: 'player', illustKey: 'STORY1' },
                        ];
                        dialogue.currentLine = 0;
                        dialogue.speakerName = dialogue.lines[0].speaker;
                        dialogue.speakerType = dialogue.lines[0].speakerType;
                        dialogue.illustKey   = dialogue.lines[0].illustKey;
                        dialogue.displayText = '';
                        dialogue.charIndex   = 0;
                        dialogue.typingTimer = 0;
                        dialogue.isFinished  = false;
                    }

                    // 대화가 끝났으면 잠금 해제 + 공격 힌트 표시
                    if (combatTutorial.dialogueShown && !dialogue.active) {
                        e.tutDialogueDone = true;
                        e.isAggro         = true;
                        if (!combatTutorial.hintShown) {
                            combatTutorial.hintActive = true;
                            combatTutorial.hintShown  = true;
                            combatTutorial.blinkTimer = 0;
                        }
                    }

                    // 대화 전이므로 물리만 처리하고 AI 스킵
                    e.dy += e.gravity;
                    if (e.dy > 20) e.dy = 20;
                    e.y += e.dy;
                    e.grounded = false;
                    platforms.forEach(plat => {
                        const type = plat.type || 'platform';
                        if (type === 'solid') {
                            if (e.x + e.width  > plat.x &&
                                e.x            < plat.x + plat.width &&
                                e.y + e.height >= plat.y &&
                                e.y + e.height <= plat.y + Math.max(20, e.dy + 1) &&
                                e.dy >= 0) {
                                e.y = plat.y - e.height; e.dy = 0; e.grounded = true;
                            }
                        }
                    });
                    continue;
                }
                // 대화 완료 후: 어그로 영구 유지, loseRange 무력화
                e.isAggro = true;
            }
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
                    playSoundImmediate('ENEMY2_ATTACK');
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

        // ── enemy3 (궁수) ─────────────────────────────────────────
        if (e.type === 'enemy3') {
            // 중력 적용 (지면에 서있도록)
            e.dy += e.gravity;
            if (e.dy > 20) e.dy = 20;
            e.y += e.dy;

            // 지면 충돌
            e.grounded = false;
            platforms.forEach(plat => {
                const type = plat.type || 'platform';
                if (type === 'solid') {
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

            // 항상 플레이어 방향 바라봄
            e.direction = distX > 0 ? 'right' : 'left';

            // 화살 업데이트 (어그로 여부와 무관하게 이미 발사된 화살은 계속 이동)
            for (let a = e.arrows.length - 1; a >= 0; a--) {
                const ar = e.arrows[a];
                ar.x += ar.dx;
                ar.y += ar.dy;
                // 중력 없음 — 직선 비행

                // 플레이어 피격 판정
                if (!player.isInvincible) {
                    if (ar.x + ar.w > player.x && ar.x < player.x + player.width &&
                        ar.y + ar.h > player.y && ar.y < player.y + player.height) {
                        player.hp              = Math.max(player.hp - e.attackDamage, 0);
                        player.isInvincible    = true;
                        player.invincibleTimer = 60;
                        player.dx = ar.dx * 0.5;
                        player.dy = -6;
                        e.arrows.splice(a, 1);
                        continue;
                    }
                }

                // 지형 충돌 또는 범위 이탈 시 제거
                let hitWall = false;
                for (const plat of platforms) {
                    const type = plat.type || 'platform';
                    if (type === 'platform') continue;
                    if (ar.x + ar.w > plat.x && ar.x < plat.x + plat.width &&
                        ar.y + ar.h > plat.y && ar.y < plat.y + plat.height) {
                        hitWall = true; break;
                    }
                }
                const travelDist = Math.sqrt(
                    (ar.x + ar.w / 2 - ar.originX) ** 2 +
                    (ar.y + ar.h / 2 - ar.originY) ** 2
                );
                if (hitWall || travelDist > e.arrowMaxDist ||
                    ar.x < -200 || ar.x > world.width + 200 ||
                    ar.y > world.height + 100) {
                    e.arrows.splice(a, 1);
                }
            }

            // 어그로 감지 — enemy3 전용 (수평·수직 별도 판정)
            // distX: 수평 거리, distY: 수직 거리 (위쪽 루프에서 이미 계산됨)
            const inHorzRange = Math.abs(distX) < e.detectRange;   // 수평 750px
            const inVertRange = Math.abs(distY) < 250;             // 수직 ±250px 제한
            if (inHorzRange && inVertRange) {
                e.isAggro = true;
            } else if (Math.abs(distX) > e.loseRange || Math.abs(distY) > 400) {
                // 수평 loseRange 초과 또는 수직으로 너무 멀어지면 해제
                if (e.windupStep === 0) {
                    e.isAggro = false;
                    e.state   = 'idle';
                }
            }

            if (e.isAggro) {
                // 준비 시퀀스: windupStep 0=대기, 1=atk1, 2=atk2, 3=atk3, 4=atk4→발사
                if (e.windupStep === 0 && e.cooldownTimer <= 0) {
                    e.windupStep  = 1;
                    e.windupTimer = e.windupDuration;
                    e.state       = 'attack';
                    e.attackFrame = 1;
                    playSound('ENEMY3_ATTACK1');
                }

                if (e.windupStep >= 1) {
                    e.windupTimer--;
                    if (e.windupTimer <= 0) {
                        e.windupStep++;
                        if (e.windupStep <= 3) {
                            e.windupTimer = e.windupDuration;
                            e.attackFrame = e.windupStep;
                        } else if (e.windupStep === 4) {
                            e.windupTimer = 20;
                            e.attackFrame = 4;
                            playSoundImmediate('ENEMY3_ATTACK2');
                        } else {
                            // 발사 완료 → 쿨타임 후 복귀
                            e.windupStep    = 0;
                            e.windupTimer   = 0;
                            e.cooldownTimer = e.attackCooldown;
                            e.state         = 'idle';
                            e.attackFrame   = 0;
                        }

                        // windupStep 4 진입 순간 화살 발사
                        if (e.windupStep === 4) {
                            const startX = e.x + e.width  / 2;
                            const startY = e.y + e.height / 2;
                            const tx     = player.x + player.width  / 2;
                            const ty     = player.y + player.height / 2;
                            const ddx    = tx - startX;
                            const ddy    = ty - startY;
                            const d2     = Math.sqrt(ddx * ddx + ddy * ddy);
                            const speed  = 17;
                            const arrowW = e.width * 1.0;
                            const arrowH = arrowW / 9.67;
                            const baseAngle = d2 > 0 ? Math.atan2(ddy, ddx) : 0;
                            e.arrows.push({
                                x:       startX - arrowW / 2,
                                y:       startY - arrowH / 2,
                                originX: startX,   // 발사 출발점 (비행거리 계산용)
                                originY: startY,
                                dx:    d2 > 0 ? (ddx / d2) * speed : (e.direction === 'right' ? speed : -speed),
                                dy:    d2 > 0 ? (ddy / d2) * speed : 0,
                                w:     arrowW,
                                h:     arrowH,
                                angle: baseAngle,
                            });
                        }
                    }
                }
            } else {
                e.state = 'idle';
            }
            // cooldownTimer 감소는 루프 상단 공통 처리에서 담당하므로 여기서는 생략
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

        // ── enemy3 (궁수) 전용 렌더링 ────────────────────────────
        if (e.type === 'enemy3') {
            // ★ 스케일 기준점: ENEMY_TYPES.enemy3 의 width/height (현재 120/150)
            // 아래 비율만 조정하면 전체 스프라이트 크기가 자동 변경됨
            // 비율 산출 근거: 스프라이트 픽셀 실측치를 stand(675×904) 기준으로 정규화
            const BW = e.width;    // hitbox width  (= 120)
            const BH = e.height;   // hitbox height (= 150)
            const SPRITE_RATIO = {
                //            wRatio  hRatio  (stand=1.0 기준)
                stand:   { w: 1.000, h: 1.000 },   // 675×904
                attack1: { w: 0.827, h: 1.657 },   // 558×1498  → 세로 길이 증가 (팔 위로)
                attack2: { w: 1.065, h: 1.618 },   // 719×1463  → 넓게 당김
                attack3: { w: 1.409, h: 1.382 },   // 951×1249  → 가로 최대
                attack4: { w: 1.167, h: 1.308 },   // 788×1182  → 발사 직전
            };

            let imgKey3, ratioKey;
            if (e.state === 'attack') {
                const f = e.attackFrame;
                if      (f === 1) { imgKey3 = e.imgAttack1; ratioKey = 'attack1'; }
                else if (f === 2) { imgKey3 = e.imgAttack2; ratioKey = 'attack2'; }
                else if (f === 3) { imgKey3 = e.imgAttack3; ratioKey = 'attack3'; }
                else              { imgKey3 = e.imgAttack4; ratioKey = 'attack4'; }
            } else {
                imgKey3  = e.imgStand;
                ratioKey = 'stand';
            }

            const r      = SPRITE_RATIO[ratioKey];
            const drawW3 = BW * r.w;
            const drawH3 = BH * r.h;
            // 발 위치 고정: 히트박스 하단(e.y+e.height)에 스프라이트 하단을 맞춤
            const drawX3 = e.x + BW / 2 - drawW3 / 2;
            const drawY3 = e.y + BH      - drawH3;
            const img3   = sprites[imgKey3];

            ctx.save();
            ctx.globalAlpha = deadAlpha;

            if (img3 && img3.complete && img3.naturalWidth !== 0) {
                if (e.direction === 'right') {
                    ctx.translate(drawX3 + drawW3, drawY3);
                    ctx.scale(-1, 1);
                    ctx.drawImage(img3, 0, 0, drawW3, drawH3);
                } else {
                    ctx.drawImage(img3, drawX3, drawY3, drawW3, drawH3);
                }
            } else {
                ctx.fillStyle = e.state === 'attack' ? '#8833aa' : '#553366';
                ctx.fillRect(e.x, e.y, BW, BH);
                ctx.fillStyle = 'white';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`e3_${ratioKey}`, e.x + BW / 2, e.y + BH / 2);
                ctx.textAlign = 'left';
            }
            ctx.restore();

            // HP바
            if (e.hpVisible && !e.isDead) {
                const ratio3 = e.hp / e.maxHp;
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(e.x - 1, e.y - 13, BW + 2, 7);
                ctx.fillStyle = ratio3 > 0.5 ? '#44cc44' : ratio3 > 0.25 ? '#ccaa00' : '#cc3333';
                ctx.fillRect(e.x, e.y - 12, BW * ratio3, 5);
            }

            // 화살 렌더링 (고정 각도 회전)
            const arrowImg = sprites['ENEMY3_ARROW'];
            e.arrows.forEach(ar => {
                ctx.save();
                ctx.translate(ar.x + ar.w / 2, ar.y + ar.h / 2);
                ctx.rotate(ar.angle);
                if (arrowImg && arrowImg.complete && arrowImg.naturalWidth !== 0) {
                    ctx.drawImage(arrowImg, -ar.w / 2, -ar.h / 2, ar.w, ar.h);
                } else {
                    ctx.fillStyle = '#cc2222';
                    ctx.fillRect(-ar.w / 2, -ar.h / 2, ar.w, ar.h);
                }
                ctx.restore();
            });

            return;  // enemy3 렌더링 종료
        }
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

const ultParticles = [];
const slashEffects = [];
let ULT_TIMELINE = [];
const ULT_FIRE_DURATION = 64;

function spawnUltParticles(count) {
    // 파티클 수 절반으로 제한 (최대 동시 파티클 수 상한도 설정)
    const spawnCount = Math.ceil(count * 0.55);
    if (ultParticles.length > 120) return;   // 상한 초과 시 추가 스폰 억제
    const backDir = player.direction === 'right' ? -1 : 1;
    const cx = player.x + player.width  / 2;
    const cy = player.y + player.height / 2;
    for (let i = 0; i < spawnCount; i++) {
        const spread = (Math.random() - 0.5) * 3.2;
        const speed  = 4 + Math.random() * 7;
        const angle  = Math.atan2(spread, backDir);
        ultParticles.push({
            x:     cx,
            y:     cy,
            dx:    Math.cos(angle) * speed,
            dy:    Math.sin(angle) * speed - Math.random() * 3,
            life:  1.0,
            decay: 0.045 + Math.random() * 0.03,   // 더 빨리 사라짐
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
    if (ultParticles.length === 0) return;
    ctx.save();
    ultParticles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
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
    const startX   = fullHalf;
    const endX     = fullHalf - fullHalf * 2 * s.drawProgress;

    ctx.save();
    ctx.rotate(s.angle || 0);

    const straightPath = (c, w) => {
        if (s.drawProgress < 0.01) return;
        const mx = startX - (startX - endX) * 0.5;
        c.beginPath();
        c.moveTo(startX, 0);
        c.quadraticCurveTo(mx, -w * 0.55, endX, 0);
        c.quadraticCurveTo(mx,  w * 0.55, startX, 0);
        c.closePath();
    };

    const sharpPath = (c, w) => {
        if (s.drawProgress < 0.01) return;
        const mid = (startX + endX) / 2;
        c.beginPath();
        c.moveTo(startX, 0);
        c.quadraticCurveTo(mid, -w * 0.5, endX, 0);
        c.quadraticCurveTo(mid,  w * 0.5, startX, 0);
        c.closePath();
    };

    if (isCross) {
        // cross: 글로우(넓게) + 본체 + 하이라이트 2레이어
        [ [1.5, s.glow, 0.30], [0.65, s.color, 1.0], [0.18, '#ffffff', 0.60] ]
            .forEach(([w, color, alpha]) => {
                ctx.save();
                ctx.globalAlpha *= alpha;
                ctx.fillStyle = color;
                straightPath(ctx, s.width * w);
                ctx.fill();
                ctx.restore();
            });
    } else {
        // slash: 주황 글로우(넓게) + 주황 중간 + 노란 본체 + 하이라이트
        [ [1.8, s.glow, 0.20], [0.75, '#ff8800', 0.50], [0.50, s.color, 1.0], [0.13, '#ffffff', 0.65] ]
            .forEach(([w, color, alpha]) => {
                ctx.save();
                ctx.globalAlpha *= alpha;
                ctx.fillStyle = color;
                sharpPath(ctx, s.width * w);
                ctx.fill();
                ctx.restore();
            });
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
            ctx.save(); ctx.rotate( 30 * Math.PI / 180); drawSingleSlash(s); ctx.restore();
            ctx.save(); ctx.rotate(-30 * Math.PI / 180); drawSingleSlash(s); ctx.restore();
        }

        ctx.restore();
    });
}

function doUltHit(isCross) {
    const atkRange = isCross ? 380 : 200;
    const damage   = isCross ? player.attackPower * 4 : player.attackPower * 1.5;
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

    // 시작 각도 랜덤, 이후 타격마다 70~110도 범위 내 랜덤 회전
    const startAngle = Math.random() * 360;
    const STEP_MIN = 70, STEP_MAX = 110;
    const randStep = () => STEP_MIN + Math.random() * (STEP_MAX - STEP_MIN);
    const slashAngles = [
        startAngle,
        startAngle + randStep(),
        startAngle + randStep() * 2,
        startAngle + randStep() * 3,
    ].map(a => a % 360);

    ULT_TIMELINE = [
        { frame: 5,  type: 'slash', angle: slashAngles[0], done: false },
        { frame: 12, type: 'slash', angle: slashAngles[1], done: false },
        { frame: 19, type: 'slash', angle: slashAngles[2], done: false },
        { frame: 26, type: 'slash', angle: slashAngles[3], done: false },
        { frame: 39, type: 'cross', done: false }
    ];

    player.ultCamStartX = camera.x;
    player.ultPhase     = 'vanish';
    player.ultTimer     = player.ultVanishDuration;
    player.dx           = 0;
    player.dy           = 0;
    player.isAttacking  = false;
}

function applyZoom(newScale) {
    SCALE = newScale;
    const logicalW = canvas.width  / SCALE;
    const logicalH = canvas.height / SCALE;
    camera.x = player.x + player.width  / 2 - logicalW / 2;
    camera.x = Math.max(0, Math.min(camera.x, world.width - logicalW));
    cameraY  = player.y + player.height / 2 - logicalH / 2;
    cameraY  = Math.max(0, Math.min(cameraY, world.height - logicalH));
}

function updateUltimatePhase() {
    player.ultTimer--;

    if (player.ultPhase === 'vanish') {
        const t    = 1 - player.ultTimer / player.ultVanishDuration;
        const ease = t * t * (3 - 2 * t);
        applyZoom(BASE_SCALE + (ULT_ZOOM_SCALE - BASE_SCALE) * ease);

        if (player.ultTimer <= 0) {
            applyZoom(ULT_ZOOM_SCALE);
            player.ultPhase = 'hidden';
            player.ultTimer = player.ultHiddenDuration;
            spawnUltParticles(40);
        }

    } else if (player.ultPhase === 'hidden') {
        applyZoom(ULT_ZOOM_SCALE);
        updateUltParticles();
        if (player.ultTimer <= 0) {
            player.ultCamStartX = camera.x;
            player.ultCamStartY = cameraY;
            const logicalW = canvas.width  / ULT_ZOOM_SCALE;
            const logicalH = canvas.height / ULT_ZOOM_SCALE;
            player.ultCamTargetX = Math.max(0,
                Math.min(player.ultTargetX + player.width  / 2 - logicalW / 2,
                         world.width - logicalW));
            player.ultCamTargetY = Math.max(0,
                Math.min(player.ultTargetY + player.height / 2 - logicalH / 2,
                         world.height - logicalH));
            player.ultPhase = 'camMove';
            player.ultTimer = player.ultCamDuration;
        }

    } else if (player.ultPhase === 'camMove') {
        updateUltParticles();
        const t    = 1 - player.ultTimer / player.ultCamDuration;
        const ease = t * t * (3 - 2 * t);

        SCALE    = ULT_ZOOM_SCALE;
        camera.x = player.ultCamStartX + (player.ultCamTargetX - player.ultCamStartX) * ease;
        cameraY  = player.ultCamStartY  + (player.ultCamTargetY - player.ultCamStartY) * ease;

        if (player.ultTimer <= 0) {
            // 줌아웃 없이 바로 fire 진입 — 클로즈업 유지
            player.x  = player.ultTargetX;
            player.y  = player.ultTargetY - 120;
            player.direction = player.direction === 'right' ? 'left' : 'right';
            player.dx = 0;
            player.dy = 0;

            player.ultPhase   = 'fire';
            player.ultTimer   = ULT_FIRE_DURATION;
            ultimate.active   = true;
            ultimate.timer    = ULT_FIRE_DURATION;
            ultimate.duration = ULT_FIRE_DURATION;
            ultimate.alpha    = 0;

            // 줌아웃용 카메라 시작점 기록
            player.ultZoomOutStartTimer = undefined;

            ULT_TIMELINE.forEach(e => e.done = false);
        }

    } else if (player.ultPhase === 'fire') {
        player.dx *= 0.85;
        player.x  += player.dx;
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
                    // cross 발동 시점에 튀어나오며 줌아웃 시작
                    player.dx = (player.direction === 'right' ? 1 : -1) * 7;
                    player.ultZoomOutStartTimer = player.ultTimer;
                    player.ultZoomStartX = camera.x;
                    player.ultZoomStartY = cameraY;
                }
            }
        });

        // cross 발동 후 줌아웃 진행
        if (player.ultZoomOutStartTimer !== undefined) {
            const zoomDuration = 25;
            const zoomElapsed  = player.ultZoomOutStartTimer - player.ultTimer;
            const t    = Math.min(zoomElapsed / zoomDuration, 1);
            const ease = t * t * (3 - 2 * t);

            SCALE = ULT_ZOOM_SCALE + (BASE_SCALE - ULT_ZOOM_SCALE) * ease;

            const logicalW  = canvas.width  / SCALE;
            const logicalH  = canvas.height / SCALE;
            const finalCamX = Math.max(0,
                Math.min(player.x + player.width  / 2 - logicalW / 2,
                         world.width  - logicalW));
            const finalCamY = Math.max(0,
                Math.min(player.y + player.height / 2 - logicalH / 2,
                         world.height - logicalH));

            camera.x = player.ultZoomStartX + (finalCamX - player.ultZoomStartX) * ease;
            cameraY  = player.ultZoomStartY  + (finalCamY  - player.ultZoomStartY)  * ease;
        }

        ultimate.timer--;
        const crossDone = ULT_TIMELINE[ULT_TIMELINE.length - 1].done;
        ultimate.alpha = crossDone
            ? Math.max(0, ultimate.timer / ULT_FIRE_DURATION)
            : 0;

        if (player.ultTimer <= 0) {
            SCALE = BASE_SCALE;
            player.ultZoomOutStartTimer = undefined;
            ultimate.active = false;
            player.ultPhase = 'appear';
            player.ultTimer = 10;
            // cameraY를 플레이어 현재 위치로 스냅 (0 하드코딩 제거)
            const _lW = canvas.width  / SCALE;
            const _lH = canvas.height / SCALE;
            camera.x = Math.max(0, Math.min(player.x + player.width  / 2 - _lW / 2, world.width  - _lW));
            cameraY  = Math.max(0, Math.min(player.y + player.height / 2 - _lH / 2, world.height - _lH));
        }

    } else if (player.ultPhase === 'appear') {
        updateUltParticles();
        updateSlashEffects();
        player.ultTimer--;
        if (player.ultTimer <= 0) {
            SCALE = BASE_SCALE;
            player.ultPhase     = 'none';
            slashEffects.length = 0;
            ultParticles.length = 0;
            // cameraY를 플레이어 현재 위치로 스냅
            const _lW = canvas.width  / SCALE;
            const _lH = canvas.height / SCALE;
            camera.x = Math.max(0, Math.min(player.x + player.width  / 2 - _lW / 2, world.width  - _lW));
            cameraY  = Math.max(0, Math.min(player.y + player.height / 2 - _lH / 2, world.height - _lH));
        }
    }
}

function drawUltimate() {
    if (!ultimate.active || ultimate.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = ultimate.alpha * 0.55;
    ctx.fillStyle   = '#ffdd88';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.restore();
}
// [SECTION 18] 튜토리얼 인트로 연출 (Tutorial Intro Sequence)
//
// 연출 흐름:
//   'idle'      → 아무것도 안 함 (튜토리얼 맵 아닐 때)
//   'fall'      → 플레이어가 쓰러진 상태(FALL_DOWN), 원거리 줌 + 서서히 클로즈업
//   'hint'      → 클로즈업 완료 후 "Space - 점프" 힌트 표시
//   'wakeup'    → Space 입력 시 WAKE_UP 스프라이트 잠시 표시
//   'stand'     → STAND 스프라이트로 전환, 줌 서서히 복귀
//   'monologue' → 줌 복귀 완료 후 독백 대화창 시작
//   'done'      → 연출 완전 종료, 일반 플레이
//
const introSeq = {
    phase: 'idle',

    // 클로즈업 SCALE 범위
    zoomFar:  BASE_SCALE * 1.3,   // 시작 줌 (살짝 먼 느낌)
    zoomClose: BASE_SCALE * 1.75, // 최대 클로즈업 (2.0→1.75, 맵 밖 노출 방지)
    zoomNormal: BASE_SCALE,       // 최종 일반 배율

    zoomTimer:    0,
    zoomDuration: 180,            // 원거리→클로즈업 프레임 수 (3초@60fps)

    wakeupTimer:   0,
    wakeupDuration: 40,           // WAKE_UP 유지 프레임
    standTimer:    0,
    standDuration: 30,            // STAND 고정 후 줌아웃 시작 딜레이

    zoomOutTimer:    0,
    zoomOutDuration: 90,          // 줌아웃 프레임 수

    hintBlink: 0,                 // 힌트 텍스트 깜빡임 카운터

    // 카메라 스냅 기준점 (wakeup→stand 전환 시 저장)
    zoomOutStartScale: BASE_SCALE,
    zoomOutCamStartX: 0,
    zoomOutCamStartY: 0,
};

function startTutorialIntro() {
    // 이미 인트로를 플레이한 적이 있으면 건너뜀
    if (map2Events.introPlayed) {
        introSeq.phase = 'done';
        moveHint.active = map2Events.moveHintActive;
        return;
    }
    map2Events.introPlayed = true;

    introSeq.phase      = 'fall';
    introSeq.zoomTimer  = 0;
    introSeq.hintBlink  = 0;
    SCALE = introSeq.zoomFar;

    // 카메라를 플레이어에 즉시 스냅
    _snapCameraToPlayer();
}

// 카메라를 현재 SCALE 기준으로 플레이어 중앙에 맞춤
function _snapCameraToPlayer() {
    const lW = canvas.width  / SCALE;
    const lH = canvas.height / SCALE;
    // 논리 뷰가 월드보다 넓어질 경우 중앙 고정 (맵 밖 노출 방지)
    if (lW >= world.width) {
        camera.x = (world.width - lW) / 2;
    } else {
        camera.x = Math.max(0, Math.min(player.x + player.width  / 2 - lW / 2, world.width  - lW));
    }
    if (lH >= world.height) {
        cameraY = (world.height - lH) / 2;
    } else {
        cameraY = Math.max(0, Math.min(player.y + player.height / 2 - lH / 2, world.height - lH));
    }
}

function updateTutorialIntro() {
    if (introSeq.phase === 'idle' || introSeq.phase === 'done') return;

    if (introSeq.phase === 'fall') {
        // 서서히 클로즈업
        introSeq.zoomTimer++;
        const t    = Math.min(introSeq.zoomTimer / introSeq.zoomDuration, 1);
        const ease = t * t * (3 - 2 * t);   // smoothstep
        SCALE = introSeq.zoomFar + (introSeq.zoomClose - introSeq.zoomFar) * ease;
        _snapCameraToPlayer();

        if (t >= 1) {
            introSeq.phase     = 'hint';
            introSeq.hintBlink = 0;
        }

    } else if (introSeq.phase === 'hint') {
        introSeq.hintBlink++;
        // Space 입력 감지
        if (keys.space) {
            keys.space        = false;
            keys.spacePressed = false;
            introSeq.phase        = 'wakeup';
            introSeq.wakeupTimer  = 0;
            // 바닥에 정확히 스냅 (쓰러진 상태에서 hitbox가 틀어졌을 수 있으므로)
            const floorY = MAP_DATA[2].platforms.find(p => p.type === 'solid').y;
            player.y       = floorY - player.height;
            player.dy      = 0;
            player.grounded = true;
            _snapCameraToPlayer();
        }

    } else if (introSeq.phase === 'wakeup') {
        introSeq.wakeupTimer++;
        if (introSeq.wakeupTimer >= introSeq.wakeupDuration) {
            introSeq.phase      = 'stand';
            introSeq.standTimer = 0;
        }

    } else if (introSeq.phase === 'stand') {
        introSeq.standTimer++;
        if (introSeq.standTimer >= introSeq.standDuration) {
            // 줌아웃 시작 - 현재 카메라 위치 기록
            introSeq.phase             = 'zoomout';
            introSeq.zoomOutTimer      = 0;
            introSeq.zoomOutStartScale = SCALE;
            introSeq.zoomOutCamStartX  = camera.x;
            introSeq.zoomOutCamStartY  = cameraY;
        }

    } else if (introSeq.phase === 'zoomout') {
        introSeq.zoomOutTimer++;
        const t    = Math.min(introSeq.zoomOutTimer / introSeq.zoomOutDuration, 1);
        const ease = t * t * (3 - 2 * t);
        SCALE = introSeq.zoomOutStartScale + (introSeq.zoomNormal - introSeq.zoomOutStartScale) * ease;

        // 카메라도 목표 위치로 보간
        const lW      = canvas.width  / SCALE;
        const lH      = canvas.height / SCALE;
        const targetX = Math.max(0, Math.min(player.x + player.width  / 2 - lW / 2, world.width  - lW));
        const targetY = Math.max(0, Math.min(player.y + player.height / 2 - lH / 2, world.height - lH));
        camera.x = introSeq.zoomOutCamStartX + (targetX - introSeq.zoomOutCamStartX) * ease;
        cameraY  = introSeq.zoomOutCamStartY  + (targetY  - introSeq.zoomOutCamStartY)  * ease;

        if (t >= 1) {
            SCALE = introSeq.zoomNormal;
            _snapCameraToPlayer();
            introSeq.phase = 'monologue';
            _startIntroMonologue();
        }

    } else if (introSeq.phase === 'monologue') {
        // 대화 시스템이 비활성화되면 인트로 완전 종료
        if (!dialogue.active) {
            introSeq.phase  = 'done';
            // 독백 종료 직후 이동 힌트 표시 시작
            if (currentMapIndex === 2) {
                moveHint.active    = true;
                moveHint.blinkTimer = 0;
                map2Events.moveHintActive = true;
            }
        }
    }
}

function _startIntroMonologue() {
    dialogue.active      = true;
    dialogue.cast        = ['STORY1'];
    dialogue.lines       = [
        // ── 여기에 실제 독백 대사를 채워 주세요 ──
        { speaker: '???', text: '윽...',        speakerType: 'player', illustKey: 'STORY1' },
        { speaker: '???', text: '여긴... 어디지?',   speakerType: 'player', illustKey: 'STORY1' },
        { speaker: '???', text: '아니, 그보다도',             speakerType: 'player', illustKey: 'STORY1' },
        { speaker: '???', text: '나는... 누구지?',             speakerType: 'player', illustKey: 'STORY1' },
        { speaker: '???', text: '아무것도 기억나지 않아. 나는 왜 이런 곳에 쓰러져 있던거지?',             speakerType: 'player', illustKey: 'STORY1' },
        { speaker: '???', text: '윽..떠올리려 하면 머리가 깨질듯이 아파.',             speakerType: 'player', illustKey: 'STORY1' },
        { speaker: '???', text: '어떻게 된 일인지는 모르겠지만..',             speakerType: 'player', illustKey: 'STORY1' },
        { speaker: '???', text: '일단, 주변을 살펴봐야겠어.',             speakerType: 'player', illustKey: 'STORY1' },
    ];
    dialogue.currentLine = 0;
    dialogue.speakerName = dialogue.lines[0].speaker;
    dialogue.speakerType = dialogue.lines[0].speakerType;
    dialogue.illustKey   = dialogue.lines[0].illustKey;
    dialogue.displayText = '';
    dialogue.charIndex   = 0;
    dialogue.typingTimer = 0;
    dialogue.isFinished  = false;
}

// 인트로 중 플레이어 스프라이트 키 반환 (draw()에서 호출)
function getIntroPlayerKey() {
    switch (introSeq.phase) {
        case 'fall':
        case 'hint':
            return 'PLAYER_FALL_DOWN';
        case 'wakeup':
            return 'PLAYER_WAKE_UP';
        case 'stand':
        case 'zoomout':
        case 'monologue':
            return 'PLAYER_STAND';
        default:
            return null;   // 'idle' or 'done' → 일반 로직에 맡김
    }
}

// 인트로 중 플레이어 입력/물리를 차단해야 하는지 여부
function isIntroActive() {
    return introSeq.phase !== 'idle' && introSeq.phase !== 'done';
}

// ── 전투 튜토리얼 컷신 업데이트 ────────────────────────────────────────
function updateCombatCutscene() {
    if (currentMapIndex !== 2) return;

    // ── 트리거 감지 ──────────────────────────────────────────────────
    if (!combatTutorial.cutTriggered &&
        combatTutorial.cutPhase === 'idle' &&
        player.x + player.width >= combatTutorial.cutTriggerX) {

        combatTutorial.cutTriggered = true;
        combatTutorial.cutPhase     = 'freeze';
        combatTutorial.cutTimer     = 0;
        map2Events.cutTriggered     = true;

        // 현재 상태 저장
        combatTutorial.savedScale = SCALE;
        combatTutorial.savedCamX  = camera.x;
        combatTutorial.savedCamY  = cameraY;
        combatTutorial.cutScale   = SCALE;
        combatTutorial.cutCamX    = camera.x;
        combatTutorial.cutCamY    = cameraY;

        // 적 위치 기준 목표 카메라 계산
        const tutEnemy = enemies.find(e => e.isTutorialEnemy);
        combatTutorial.zoomInScale = BASE_SCALE * 1.65;
        if (tutEnemy) {
            const lW = canvas.width  / combatTutorial.zoomInScale;
            const lH = canvas.height / combatTutorial.zoomInScale;
            combatTutorial.targetCamX = Math.max(0,
                Math.min(tutEnemy.x + tutEnemy.width  / 2 - lW / 2, world.width  - lW));
            combatTutorial.targetCamY = Math.max(0,
                Math.min(tutEnemy.y + tutEnemy.height / 2 - lH / 2, world.height - lH));
        }
        return;
    }

    if (combatTutorial.cutPhase === 'idle' ||
        combatTutorial.cutPhase === 'done') return;

    combatTutorial.cutTimer++;
    const t = combatTutorial.cutTimer;

    if (combatTutorial.cutPhase === 'freeze') {
        // 플레이어 이동 완전 잠금 (update()에서 처리)
        if (t >= combatTutorial.FREEZE_DUR) {
            combatTutorial.cutPhase = 'zoomToEnemy';
            combatTutorial.cutTimer = 0;
        }

    } else if (combatTutorial.cutPhase === 'zoomToEnemy') {
        const ratio = Math.min(t / combatTutorial.ZOOM_IN_DUR, 1);
        const ease  = ratio * ratio * (3 - 2 * ratio);

        SCALE    = combatTutorial.savedScale +
                   (combatTutorial.zoomInScale - combatTutorial.savedScale) * ease;
        camera.x = combatTutorial.savedCamX +
                   (combatTutorial.targetCamX - combatTutorial.savedCamX) * ease;
        cameraY  = combatTutorial.savedCamY +
                   (combatTutorial.targetCamY - combatTutorial.savedCamY) * ease;
        combatTutorial.cutScale = SCALE;
        combatTutorial.cutCamX  = camera.x;
        combatTutorial.cutCamY  = cameraY;

        if (ratio >= 1) {
            combatTutorial.cutPhase = 'hold';
            combatTutorial.cutTimer = 0;
        }

    } else if (combatTutorial.cutPhase === 'hold') {
        // 적 위치 고정 유지 (카메라 고정)
        SCALE    = combatTutorial.zoomInScale;
        camera.x = combatTutorial.targetCamX;
        cameraY  = combatTutorial.targetCamY;

        if (t >= combatTutorial.HOLD_DUR) {
            combatTutorial.cutPhase = 'zoomBack';
            combatTutorial.cutTimer = 0;
        }

    } else if (combatTutorial.cutPhase === 'zoomBack') {
        const ratio = Math.min(t / combatTutorial.ZOOM_OUT_DUR, 1);
        const ease  = ratio * ratio * (3 - 2 * ratio);

        SCALE    = combatTutorial.zoomInScale +
                   (combatTutorial.savedScale - combatTutorial.zoomInScale) * ease;
        camera.x = combatTutorial.targetCamX +
                   (combatTutorial.savedCamX - combatTutorial.targetCamX) * ease;
        cameraY  = combatTutorial.targetCamY +
                   (combatTutorial.savedCamY - combatTutorial.targetCamY) * ease;

        if (ratio >= 1) {
            SCALE    = combatTutorial.savedScale;
            camera.x = combatTutorial.savedCamX;
            cameraY  = combatTutorial.savedCamY;
            combatTutorial.cutPhase = 'monologue';
            combatTutorial.cutTimer = 0;

            // 주인공 독백(생각) 발동
            dialogue.active      = true;
            dialogue.cast        = [];
            dialogue.lines       = [
                { speaker: '', text: '누군가 있다.',         speakerType: 'thought', illustKey: '' },
                { speaker: '', text: '어쩌면 이 일에 대해 아는게 있지 않을까?', speakerType: 'thought', illustKey: '' },
            ];
            dialogue.currentLine = 0;
            dialogue.speakerName = dialogue.lines[0].speaker;
            dialogue.speakerType = dialogue.lines[0].speakerType;
            dialogue.illustKey   = dialogue.lines[0].illustKey;
            dialogue.displayText = '';
            dialogue.charIndex   = 0;
            dialogue.typingTimer = 0;
            dialogue.isFinished  = false;
        }

    } else if (combatTutorial.cutPhase === 'monologue') {
        // 독백이 끝나면 컷신 완전 종료 → 이후 접근 대화 트리거가 정상 작동
        if (!dialogue.active) {
            combatTutorial.cutPhase = 'done';
        }
    }
}

// ── 위치 트리거 힌트 업데이트 ────────────────────────────────────────
function updateTutHint() {
    if (currentMapIndex !== 2) return;
    if (isIntroActive()) return;

    // 이동 힌트: hideX 도달 시 숨김
    if (moveHint.active && player.x + player.width >= moveHint.hideX) {
        moveHint.active = false;
    }

    // ── 덩굴 직전 독백 트리거 (dashHint보다 먼저, x=3380 = 덩굴 250px 앞) ──
    if (!thornMonologue.shown && player.x + player.width >= thornMonologue.triggerX) {
        thornMonologue.shown = true;
        map2Events.thornMonologueShown = true;
        // 힌트들 일시 숨김
        dashHint.active = false;
        tutHint.active  = false;
        dialogue.active      = true;
        dialogue.cast        = ['STORY1'];
        dialogue.lines       = [
            { speaker: '???', text: '가시덩굴인가.',                              speakerType: 'player', illustKey: 'STORY1' },
            { speaker: '???', text: '음... 빠르게 지나간다면 다치지 않을 수 있겠지?', speakerType: 'player', illustKey: 'STORY1' },
        ];
        dialogue.currentLine = 0;
        dialogue.speakerName = dialogue.lines[0].speaker;
        dialogue.speakerType = dialogue.lines[0].speakerType;
        dialogue.illustKey   = dialogue.lines[0].illustKey;
        dialogue.displayText = '';
        dialogue.charIndex   = 0;
        dialogue.typingTimer = 0;
        dialogue.isFinished  = false;
        return;
    }

    if (dialogue.active) return;   // 독백 진행 중엔 이하 힌트 갱신 중단

    // 대시 힌트: 독백 끝난 후 트리거 도달 시 표시
    if (!dashHint.shown && player.x + player.width >= dashHint.triggerX) {
        dashHint.active = true;
        dashHint.shown  = true;
        map2Events.dashHintShown = true;
    }
    if (dashHint.active && player.x >= dashHint.hideX) {
        dashHint.active = false;
    }

    // 순간이동 힌트: telewall 직전 표시
    if (!teleHint.shown && player.x + player.width >= teleHint.triggerX) {
        teleHint.active = true;
        teleHint.shown  = true;
        map2Events.teleHintShown = true;
    }
    if (teleHint.active && player.x >= teleHint.hideX) {
        teleHint.active = false;
    }

    // ── telewall 직전 독백 (teleHint 트리거보다 먼저, x=5150) ──
    if (!teleMonologue.shown && player.x + player.width >= teleMonologue.triggerX) {
        teleMonologue.shown = true;
        map2Events.teleMonologueShown = true;
        teleHint.active = false;   // 힌트 일시 숨김
        dialogue.active      = true;
        dialogue.cast        = ['STORY1'];
        dialogue.lines       = [
            { speaker: '???', text: '주술로 만들어진 벽이 이런곳에..?', speakerType: 'player', illustKey: 'STORY1' },
            { speaker: '???', text: '일반적인 방법으로 통과하긴 힘들겠어.', speakerType: 'player', illustKey: 'STORY1' },
            { speaker: '???', text: '이럴땐.. 이걸쓰면 되겠지.',                                      speakerType: 'player', illustKey: 'STORY1' },
        ];
        dialogue.currentLine = 0;
        dialogue.speakerName = dialogue.lines[0].speaker;
        dialogue.speakerType = dialogue.lines[0].speakerType;
        dialogue.illustKey   = dialogue.lines[0].illustKey;
        dialogue.displayText = '';
        dialogue.charIndex   = 0;
        dialogue.typingTimer = 0;
        dialogue.isFinished  = false;
        return;
    }

    // ── telewall 통과 직후 독백 (x=5460) ──
    if (!teleAfterMonologue.shown && player.x >= teleAfterMonologue.triggerX) {
        teleAfterMonologue.shown = true;
        map2Events.teleAfterMonologueShown = true;
        teleHint.active = false;
        dialogue.active      = true;
        dialogue.cast        = ['STORY1'];
        dialogue.lines       = [
            { speaker: '???', text: '...잠깐, 나는 어떻게 이런걸 할 줄 아는거지?', speakerType: 'player', illustKey: 'STORY1' },
            { speaker: '???', text: '윽... 떠올리려 하니 다시 머리가 아파.',          speakerType: 'player', illustKey: 'STORY1' },
            { speaker: '???', text: '나는 대체..',                                 speakerType: 'player', illustKey: 'STORY1' },
        ];
        dialogue.currentLine = 0;
        dialogue.speakerName = dialogue.lines[0].speaker;
        dialogue.speakerType = dialogue.lines[0].speakerType;
        dialogue.illustKey   = dialogue.lines[0].illustKey;
        dialogue.displayText = '';
        dialogue.charIndex   = 0;
        dialogue.typingTimer = 0;
        dialogue.isFinished  = false;
        return;
    }

    // 2단점프 힌트: 덩굴 직전에 사라짐
    if (tutHint.active && player.x + player.width >= tutHint.hideX) {
        tutHint.active = false;
    }

    // 공격 튜토리얼 힌트: 적이 죽으면 숨기고 처치 후 독백 발동
    if (combatTutorial.hintActive || combatTutorial.hintShown) {
        const tutEnemy = enemies.find(e => e.isTutorialEnemy);
        if (!tutEnemy || tutEnemy.isDead) {
            combatTutorial.hintActive = false;
            // 처치 직후 독백 (한 번만)
            if (!combatTutorial.killMonologueDone) {
                combatTutorial.killMonologueDone = true;
                map2Events.killMonologueDone     = true;
                dialogue.active      = true;
                dialogue.cast        = [];
                dialogue.lines       = [
                    { speaker: '', text: '그자가 힘없이 쓰러진다.',                             speakerType: 'thought', illustKey: '' },
                    { speaker: '???', text: '잠깐, 당신..!',             speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: '???', text: '..다행이다. 그냥 기절한 것 뿐이야.',             speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: '???', text: '깨어나고 처음 보는 사람이 날 죽이려 들고, 나도 그자를 죽일 뻔 하다니...',             speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: '???', text: '대체 이게 어떻게 된 일이지?',             speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: '???', text: '...',             speakerType: 'player', illustKey: 'STORY1' },
                    { speaker: '', text: '곧 지금 그런 고민을 해봐야 의미 없다는 생각에, 다시 앞으로 나아가기로 했다.',                             speakerType: 'thought', illustKey: '' },
                ];
                dialogue.currentLine = 0;
                dialogue.speakerName = dialogue.lines[0].speaker;
                dialogue.speakerType = dialogue.lines[0].speakerType;
                dialogue.illustKey   = dialogue.lines[0].illustKey;
                dialogue.displayText = '';
                dialogue.charIndex   = 0;
                dialogue.typingTimer = 0;
                dialogue.isFinished  = false;
            }
        }
    }

    if (tutHint.shown) return;
    if (player.x + player.width >= tutHint.triggerX) {
        tutHint.active = true;
        tutHint.shown  = true;
        map2Events.tutHintShown = true;
    }
}

// ── 위치 트리거 힌트 렌더링 (drawIntroHint와 동일한 스타일) ──────────
function drawTutHint() {
    if (!tutHint.active || currentMapIndex !== 2) return;

    tutHint.blinkTimer++;
    const blink = Math.floor(tutHint.blinkTimer / 25) % 2 === 0;
    if (!blink) return;

    const text  = tutHint.text;
    const fontH = 38;
    ctx.font = `bold ${fontH}px ${DIALOGUE_FONT}`;

    const textW  = ctx.measureText(text).width;
    const boxPad = 32;
    const boxW   = textW + boxPad * 2;
    const boxH   = fontH + 24;
    const boxX   = (LOGICAL_W - boxW) / 2;
    const boxY   = LOGICAL_H - 160;

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = 'rgba(8, 8, 24, 0.9)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.55)';
    ctx.lineWidth   = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font         = `bold ${fontH}px ${DIALOGUE_FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
    ctx.lineWidth    = 5;
    ctx.lineJoin     = 'round';
    ctx.strokeText(text, LOGICAL_W / 2, boxY + boxH / 2);
    ctx.fillStyle    = 'rgba(210, 230, 255, 1)';
    ctx.fillText(text,   LOGICAL_W / 2, boxY + boxH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';
    ctx.restore();
}

// ── 독백 종료 후 이동 힌트 렌더링 ────────────────────────────────────
function drawMoveHint() {
    if (!moveHint.active || currentMapIndex !== 2) return;

    moveHint.blinkTimer++;
    const blink = Math.floor(moveHint.blinkTimer / 25) % 2 === 0;
    if (!blink) return;

    const lines   = ['A / D  —  이동', 'Space  —  점프'];
    const fontH   = 38;
    ctx.font      = `bold ${fontH}px ${DIALOGUE_FONT}`;

    const lineH   = fontH + 14;
    const boxPad  = 32;
    const maxW    = Math.max(...lines.map(t => ctx.measureText(t).width));
    const boxW    = maxW + boxPad * 2;
    const boxH    = lineH * lines.length + 16;
    const boxX    = (LOGICAL_W - boxW) / 2;
    const boxY    = LOGICAL_H - 200;

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = 'rgba(8, 8, 24, 0.9)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.55)';
    ctx.lineWidth   = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.stroke();
    ctx.restore();

    lines.forEach((text, i) => {
        const ty = boxY + 20 + fontH + i * lineH;
        ctx.save();
        ctx.font         = `bold ${fontH}px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 5;
        ctx.lineJoin     = 'round';
        ctx.strokeText(text, LOGICAL_W / 2, ty);
        ctx.fillStyle    = 'rgba(210, 230, 255, 1)';
        ctx.fillText(text,   LOGICAL_W / 2, ty);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign    = 'left';
        ctx.restore();
    });
}

// ── 대시 힌트 렌더링 ───────────────────────────────────────────────
function drawDashHint() {
    if (!dashHint.active || currentMapIndex !== 2) return;

    dashHint.blinkTimer++;
    const blink = Math.floor(dashHint.blinkTimer / 25) % 2 === 0;
    if (!blink) return;

    const lines  = ['우클릭 / I  —  대시'];
    const fontH  = 38;
    ctx.font     = `bold ${fontH}px ${DIALOGUE_FONT}`;

    const lineH  = fontH + 14;
    const boxPad = 32;
    const maxW   = Math.max(...lines.map(t => ctx.measureText(t).width));
    const boxW   = maxW + boxPad * 2;
    const boxH   = lineH * lines.length + 16;
    const boxX   = (LOGICAL_W - boxW) / 2;
    const boxY   = LOGICAL_H - 200;

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = 'rgba(8, 8, 24, 0.9)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.65)';  // 대시는 노란 테두리로 구분
    ctx.lineWidth   = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.stroke();
    ctx.restore();

    lines.forEach((text, i) => {
        const ty = boxY + 20 + fontH + i * lineH;
        ctx.save();
        ctx.font         = `bold ${fontH}px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 5;
        ctx.lineJoin     = 'round';
        ctx.strokeText(text, LOGICAL_W / 2, ty);
        ctx.fillStyle    = 'rgba(210, 230, 255, 1)';
        ctx.fillText(text,   LOGICAL_W / 2, ty);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign    = 'left';
        ctx.restore();
    });
}

// ── 순간이동 힌트 렌더링 ────────────────────────────────────────────
function drawTeleHint() {
    if (!teleHint.active || currentMapIndex !== 2) return;

    teleHint.blinkTimer++;
    const blink = Math.floor(teleHint.blinkTimer / 25) % 2 === 0;
    if (!blink) return;

    const lines  = ['E  —  투사체 발사', 'E(재사용)  —  투사체 위치로 순간이동'];
    const fontH  = 38;
    ctx.font     = `bold ${fontH}px ${DIALOGUE_FONT}`;

    const lineH  = fontH + 14;
    const boxPad = 32;
    const maxW   = Math.max(...lines.map(t => ctx.measureText(t).width));
    const boxW   = maxW + boxPad * 2;
    const boxH   = lineH * lines.length + 16;
    const boxX   = (LOGICAL_W - boxW) / 2;
    const boxY   = LOGICAL_H - 200;

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = 'rgba(8, 8, 24, 0.9)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 120, 255, 0.75)';   // 보라 테두리 (telewall 색과 통일)
    ctx.lineWidth   = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.stroke();
    ctx.restore();

    lines.forEach((text, i) => {
        const ty = boxY + 20 + fontH + i * lineH;
        ctx.save();
        ctx.font         = `bold ${fontH}px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 5;
        ctx.lineJoin     = 'round';
        ctx.strokeText(text, LOGICAL_W / 2, ty);
        ctx.fillStyle    = 'rgba(210, 190, 255, 1)';   // 연보라 텍스트
        ctx.fillText(text,   LOGICAL_W / 2, ty);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign    = 'left';
        ctx.restore();
    });
}


function drawIntroHint() {    if (introSeq.phase !== 'hint') return;

    const blink = Math.floor(introSeq.hintBlink / 25) % 2 === 0;
    if (!blink) return;

    const text  = 'Space  —  점프';
    const fontH = 38;
    ctx.font = `bold ${fontH}px ${DIALOGUE_FONT}`;

    const textW  = ctx.measureText(text).width;
    const boxPad = 32;
    const boxW   = textW + boxPad * 2;
    const boxH   = fontH + 24;
    const boxX   = (LOGICAL_W - boxW) / 2;
    const boxY   = LOGICAL_H - 160;

    // 배경 박스
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = 'rgba(8, 8, 24, 0.9)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.55)';
    ctx.lineWidth   = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.stroke();
    ctx.restore();

    // 텍스트
    ctx.save();
    ctx.font        = `bold ${fontH}px ${DIALOGUE_FONT}`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth   = 5;
    ctx.lineJoin    = 'round';
    ctx.strokeText(text, LOGICAL_W / 2, boxY + boxH / 2);
    ctx.fillStyle   = 'rgba(210, 230, 255, 1)';
    ctx.fillText(text,   LOGICAL_W / 2, boxY + boxH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';
    ctx.restore();
}
// ── 전투 튜토리얼 힌트 렌더링 (공격 키 안내) ──────────────────────────
function drawCombatTutHint() {
    if (!combatTutorial.hintActive || currentMapIndex !== 2) return;

    combatTutorial.blinkTimer++;
    const blink = Math.floor(combatTutorial.blinkTimer / 25) % 2 === 0;
    if (!blink) return;

    const lines  = ['좌클릭 / U  —  공격'];
    const fontH  = 38;
    ctx.font     = `bold ${fontH}px ${DIALOGUE_FONT}`;

    const lineH  = fontH + 14;
    const boxPad = 32;
    const maxW   = Math.max(...lines.map(t => ctx.measureText(t).width));
    const boxW   = maxW + boxPad * 2;
    const boxH   = lineH * lines.length + 16;
    const boxX   = (LOGICAL_W - boxW) / 2;
    const boxY   = LOGICAL_H - 200;

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = 'rgba(8, 8, 24, 0.9)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 120, 120, 0.75)';   // 붉은 테두리 (전투 강조)
    ctx.lineWidth   = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.stroke();
    ctx.restore();

    lines.forEach((text, i) => {
        const ty = boxY + 20 + fontH + i * lineH;
        ctx.save();
        ctx.font         = `bold ${fontH}px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 5;
        ctx.lineJoin     = 'round';
        ctx.strokeText(text, LOGICAL_W / 2, ty);
        ctx.fillStyle    = 'rgba(255, 210, 210, 1)';   // 연붉은 텍스트
        ctx.fillText(text,   LOGICAL_W / 2, ty);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign    = 'left';
        ctx.restore();
    });
}
// ── 맵 3 (세로로 길고 가로로 짧은 형태) ──────────────────────────────
// 튜토리얼 맵(맵2) 오른쪽 출구에서 진입
// ── 맵 3: 절벽 등반 (바닥 진입 → 꼭대기 출구) ───────────────────────
// 맵2 오른쪽 끝(x=7990)에서 오른쪽으로 진입 → 맵3 하단 바닥 스폰
// 위로 올라가며 꼭대기(y≈80)에 도달하면 맵2로 복귀 출구
MAP_DATA.push({
    id: 3,
    // 가로: 논리 화면 1개 너비(1280) — 카메라 x 고정, y축만 스크롤
    worldWidth:  1280,
    worldHeight: 3200,
    bgColor: '#c8a878',   // 맵2 오른쪽 절벽과 동일한 갈색

    // 진입 스폰: 바닥 왼쪽 끝 (바닥y=3150, 플레이어높이=80)
    spawnX: 20,
    spawnY: 3070,

    platforms: [
        // ── 바닥 ────────────────────────────────────────────────────
        { x: 0,    y: 3150, width: 1280, height: 50,  type: 'solid' },

        // ── 오른쪽 벽 (왼쪽 벽 없음 — 맵2와 오픈 연결) ─────────────
        { x: 1280, y: 0,    width: 60,   height: 3200, type: 'wall' },

        // ── 구간 1: 바닥 근처 (y 2800~3000) ─────────────────────────
        { x: 700,  y: 3000, width: 220,  height: 20,  type: 'platform' },
        { x: 180,  y: 2870, width: 180,  height: 20,  type: 'platform' },
        { x: 860,  y: 2760, width: 240,  height: 20,  type: 'platform' },
        { x: 350,  y: 2640, width: 200,  height: 20,  type: 'platform' },
        { x: 60,   y: 2520, width: 170,  height: 20,  type: 'platform' },

        { x: 900,  y: 2410, width: 190,  height: 20,  type: 'platform' },
        { x: 490,  y: 2300, width: 210,  height: 20,  type: 'platform' },
        { x: 80,   y: 2180, width: 230,  height: 20,  type: 'platform' },
        { x: 750,  y: 2070, width: 180,  height: 20,  type: 'platform' },
        { x: 280,  y: 1960, width: 200,  height: 20,  type: 'platform' },

        { x: 920,  y: 1840, width: 220,  height: 20,  type: 'platform' },
        { x: 550,  y: 1730, width: 190,  height: 20,  type: 'platform' },
        { x: 100,  y: 1620, width: 210,  height: 20,  type: 'platform' },
        { x: 800,  y: 1510, width: 180,  height: 20,  type: 'platform' },
        { x: 380,  y: 1390, width: 230,  height: 20,  type: 'platform' },
        { x: 50,   y: 1270, width: 200,  height: 20,  type: 'platform' },

        { x: 870,  y: 1160, width: 210,  height: 20,  type: 'platform' },
        { x: 460,  y: 1050, width: 180,  height: 20,  type: 'platform' },
        { x: 120,  y: 940,  width: 220,  height: 20,  type: 'platform' },
        { x: 760,  y: 830,  width: 200,  height: 20,  type: 'platform' },
        { x: 320,  y: 720,  width: 190,  height: 20,  type: 'platform' },
        { x: 950,  y: 610,  width: 210,  height: 20,  type: 'platform' },

        { x: 200,  y: 500,  width: 230,  height: 20,  type: 'platform' },
        { x: 700,  y: 390,  width: 200,  height: 20,  type: 'platform' },
        { x: 80,   y: 280,  width: 210,  height: 20,  type: 'platform' },
    ],

    signs: [],
    spikes: [],
    enemies: [],
    dummies: [],
    transitions: [
        // 바닥 왼쪽 출구: 왼쪽으로 나가면 맵2 복귀 (맵2 통로와 y/height 동일 비율)
        {
            x: -70, y: 2910,
            width: 80, height: 240,
            toMap: 2, spawnX: 7870, spawnY: 560,
            direction: 'left'
        }
    ],
    onEnter: () => {
        player.x        = MAP_DATA[3].spawnX;
        player.y        = MAP_DATA[3].spawnY;
        player.dx       = 0;
        player.dy       = 0;
        player.grounded = false;
    }
});

// [START] 게임 엔진 구동
document.fonts.ready.then(() => {
    loadAssets(() => {
        loadMap(0);

        // 카메라를 플레이어 초기 위치로 즉시 스냅 (보간 없이)
        const logicalW = canvas.width  / SCALE;
        const logicalH = canvas.height / SCALE;
        camera.x = player.x - logicalW / 2 + player.width  / 2;
        camera.x = Math.max(0, Math.min(camera.x, world.width  - logicalW));
        cameraY  = player.y - logicalH / 2 + player.height / 2;
        cameraY  = Math.max(0, Math.min(cameraY,  world.height - logicalH));

        update();
    });
});