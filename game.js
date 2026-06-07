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

// ══════════════════════════════════════════════════════════════════
// [PAUSE SYSTEM] 일시정지 메뉴
// ══════════════════════════════════════════════════════════════════
const pauseMenu = {
    active:   false,   // 일시정지 활성화 여부
    // 'main' | 'settings' | 'confirm_save'
    screen:   'main',

    // 선택된 버튼 인덱스 (마우스 hover)
    hoveredBtn: -1,

    // 세이브포인트 이동 암전 연출
    fadePhase:  'none',   // 'none' | 'fadeOut' | 'fadeIn'
    fadeAlpha:  0,
    fadeTimer:  0,
    FADE_DUR:   35,

    // 볼륨 설정
    masterVolume: 0.0,
    bgmVolume:    0.4,
    sfxVolume:    0.4,

    // 드래그 상태
    dragging: null,   // null | 'master' | 'bgm' | 'sfx'
    dragStartX: 0,
    dragStartVal: 0,

    open() {
        if (this.active) return;
        this.active  = true;
        this.screen  = 'main';
        this.hoveredBtn = -1;
        // BGM 일시 정지
        if (bgmPlayer.current) bgmPlayer.current.pause();
    },

    close() {
        this.active  = false;
        this.screen  = 'main';
        this.dragging = null;
        // BGM 재개
        if (bgmPlayer.current) bgmPlayer.current.play().catch(() => {});
    },

    // 볼륨 값 실제 적용
    applyVolumes() {
        const master = this.masterVolume;
        // BGM
        if (bgmPlayer.current) {
            bgmPlayer.current.volume = Math.min(1, this.bgmVolume * master);
        }
        // SFX
        Object.entries(SOUNDS).forEach(([key, def]) => {
            if (sounds[key]) {
                sounds[key].volume = Math.min(1, def.volume * this.sfxVolume * master);
            }
        });
    },
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
    BOSS_STAND:      './assets/images/boss_stand.png',
    BOSS_STAND2:     './assets/images/boss_stand2.png',
    BOSS_STAND2_1:   './assets/images/boss_stand2_1.png',
    BOSS_STAND2_2:   './assets/images/boss_stand2_2.png',
    BOSS_STAND2_3:   './assets/images/boss_stand2_3.png',
    BOSS_MOVE:       './assets/images/boss_move.png',
    BOSS_ATTACK:     './assets/images/boss_attack.png',
    BOSS_ATTACK1_1:  './assets/images/boss_attack1_1.png',
    BOSS_ATTACK1_2:  './assets/images/boss_attack1_2.png',
    BOSS_ATTACK1_3:  './assets/images/boss_attack1_3.png',
    BOSS_ATTACK2_1:  './assets/images/boss_attack2_1.png',   // 공격2 딜레이
    BOSS_ATTACK2_2:  './assets/images/boss_attack2_2.png',   // 공격2 돌진
    BOSS_ATTACK3_1:  './assets/images/boss_attack3_1.png',   // 공격3 windup(공중 정지)
    BOSS_ATTACK3_2:  './assets/images/boss_attack3_2.png',   // 공격3 strike(내려찍기)
    BOSS_ATTACK3_3:  './assets/images/boss_attack3_3.png',   // 공격3 post(후딜레이)
    BOSS_JUMP1:      './assets/images/boss_jump1.png',
    BOSS_JUMP2:      './assets/images/boss_jump2.png',
    BOSS_P2_ATTACK1: './assets/images/boss_p2_attack1.png',
    BOSS_P2_JUMP1:        './assets/images/boss_p2_jump1.png',
    BOSS_P2_JUMP2:        './assets/images/boss_p2_jump2.png',
    BOSS_P2_ATTACK1_1:    './assets/images/boss_p2_attack1_1.png',
    BOSS_P2_ATTACK1_2:    './assets/images/boss_p2_attack1_2.png',
    BOSS_P2_ATTACK3_1:    './assets/images/boss_p2_attack3_1.png',
    BOSS_P2_ATTACK3_2:    './assets/images/boss_p2_attack3_2.png',
    BOSS_P2_ATTACK4_1:    './assets/images/boss_p2_attack4_1.png',
    BOSS_P2_ATTACK4_1:    './assets/images/boss_p2_attack4_1.png',
    BOSS_P2_ATTACK4_1:    './assets/images/boss_p2_attack4_1.png',
    ENEMY1_ATTACK3: './assets/images/enemy1_attack3.png',
    ENEMY2_STAND:      './assets/images/enedmy2_stand.png',
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
    BG_PLAIN2:       './assets/images/background_plain2.png',
    BG_PLAIN:        './assets/images/background_plain.png',
    BG_CLIFF:        './assets/images/background_cliff.png',
    BG_SAVEPOINT:    './assets/images/background_savepoint.png',
    BG_BOSS:         './assets/images/background_boss.png'
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
    ENEMY3_ATTACK1:   { src: './assets/audio/enemy3_attack1.wav',   volume: 0.5 },
    ENEMY3_ATTACK2:   { src: './assets/audio/enemy3_attack2.wav',   volume: 0.5 },
    BOSS_ATTACK1_1:   { src: './assets/audio/boss_attack1_1.wav',   volume: 0.6 },
    BOSS_ATTACK1_3:   { src: './assets/audio/boss_attack1_3.wav',   volume: 0.6 },
    BOSS_ATTACK2_2:   { src: './assets/audio/boss_attack2_2.wav',   volume: 0.65 },
    BOSS_ATTACK3_3:   { src: './assets/audio/boss_attack3_3.wav',   volume: 0.7 },
    BOSS_JUMP:        { src: './assets/audio/boss_jump.wav',        volume: 0.5 }
};

const BGM = {
    BGM1:      './assets/audio/bgm1.mp3',
    BGM_BOSS1: './assets/audio/bgm_boss1.mp3',
    BGM_BOSS2: './assets/audio/bgm_boss2.mp3'
};

const sprites = {};
const sounds  = {};

// BGM 플레이어 - 나중에 맵/이벤트별 전환을 여기서 관리
const bgmPlayer = {
    current: null,       // 현재 재생 중인 Audio 객체
    currentKey: '',      // 현재 재생 중인 BGM 키
    _fadeInterval: null, // play/stop/restart/fadeOutFast 공용 페이드 인터벌
    _p2FadeInterval: null, // 페이즈2 전용 독립 페이드 인터벌 (다른 전환이 건드리지 않음)

    // 현재 재생 중인 오디오를 즉시 중단하고 상태 초기화 (내부용)
    _killCurrent() {
        if (this._fadeInterval) { clearInterval(this._fadeInterval); this._fadeInterval = null; }
        if (this.current) { this.current.pause(); this.current = null; }
        this.currentKey = '';
    },

    play(key, fadeIn = false) {
        if (this.currentKey === key) return;
        const src = BGM[key];
        if (!src) return;

        // 기존 BGM 즉시 중단 (겹침 방지)
        this._killCurrent();

        const targetVol = Math.min(1, pauseMenu.bgmVolume * pauseMenu.masterVolume);
        const audio = new Audio(src);
        audio.loop   = true;
        audio.volume = fadeIn ? 0 : targetVol;
        audio.play().catch(() => {});

        if (fadeIn && targetVol > 0) {
            let vol = 0;
            this._fadeInterval = setInterval(() => {
                // 매 틱마다 설정 반영 (페이즈2 전환 중 설정 바뀌어도 정상 동작)
                const tv = Math.min(1, pauseMenu.bgmVolume * pauseMenu.masterVolume);
                vol = Math.min(vol + 0.02, tv);
                audio.volume = vol;
                if (vol >= tv) { clearInterval(this._fadeInterval); this._fadeInterval = null; }
            }, 50);
        }

        this.current    = audio;
        this.currentKey = key;
    },

    stop(fadeOut = false) {
        if (this._fadeInterval) { clearInterval(this._fadeInterval); this._fadeInterval = null; }
        if (!this.current) return;
        if (fadeOut) {
            const target = this.current;
            this.current    = null;
            this.currentKey = '';
            this._fadeInterval = setInterval(() => {
                target.volume = Math.max(target.volume - 0.05, 0);
                if (target.volume <= 0) {
                    target.pause();
                    clearInterval(this._fadeInterval);
                    this._fadeInterval = null;
                }
            }, 50);
        } else {
            this.current.pause();
            this.current    = null;
            this.currentKey = '';
        }
    },

    // 빠른 페이드아웃 후 콜백 실행
    fadeOutFast(onDone, step = 0.08) {
        if (this._fadeInterval) { clearInterval(this._fadeInterval); this._fadeInterval = null; }
        if (!this.current) { onDone && onDone(); return; }
        const target = this.current;
        this.current    = null;
        this.currentKey = '';
        this._fadeInterval = setInterval(() => {
            target.volume = Math.max(target.volume - step, 0);
            if (target.volume <= 0) {
                target.pause();
                clearInterval(this._fadeInterval);
                this._fadeInterval = null;
                onDone && onDone();
            }
        }, 30);
    },

    // 같은 곡이어도 처음부터 재생 (사망 후 일반맵 복귀 등에 사용)
    restart(key, fadeIn = false) {
        this._killCurrent();
        this.play(key, fadeIn);
    },

    // 다른 곡으로 전환 (페이드 아웃 후 페이드 인)
    crossfade(key) {
        this.stop(true);
        setTimeout(() => this.play(key, true), 600);
    },

    // 페이즈2 비디오 전용: 독립 interval로 페이드아웃 후 새 BGM 페이드인
    // _p2FadeInterval을 사용하므로 다른 BGM 전환과 완전히 독립적으로 동작
    // 새 곡 재생은 설정 볼륨을 정상 참조함
    rawFadeOutThenPlay(nextKey, step = 0.07, interval = 25) {
        // 기존 p2 페이드가 있으면 먼저 정리
        if (this._p2FadeInterval) { clearInterval(this._p2FadeInterval); this._p2FadeInterval = null; }
        // 일반 BGM 전환 인터벌도 중단하고 현재 오디오 분리
        if (this._fadeInterval) { clearInterval(this._fadeInterval); this._fadeInterval = null; }
        const target = this.current;
        this.current    = null;
        this.currentKey = '';
        if (!target) {
            this.play(nextKey, true);
            return;
        }
        this._p2FadeInterval = setInterval(() => {
            target.volume = Math.max(target.volume - step, 0);
            if (target.volume <= 0) {
                target.pause();
                clearInterval(this._p2FadeInterval);
                this._p2FadeInterval = null;
                // 새 BGM: 설정 볼륨 정상 참조하여 페이드인
                this.play(nextKey, true);
            }
        }, interval);
    }
};

// ══════════════════════════════════════════════════════════════════
// [PAUSE SYSTEM] 렌더링 & 마우스 처리
// ══════════════════════════════════════════════════════════════════

// 캔버스 논리 좌표 변환 (DPR 보정)
function canvasLogicalPos(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = LOGICAL_W / rect.width;
    const scaleY = LOGICAL_H / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top)  * scaleY,
    };
}

// 일시정지 메뉴 그리기
function drawPauseMenu() {
    if (!pauseMenu.active) return;

    const W = LOGICAL_W, H = LOGICAL_H;

    // ── 반투명 암전 오버레이 (비네팅) ─────────────────────────────
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.75);
    grad.addColorStop(0,   'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(1,   'rgba(0, 0, 0, 0.82)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    if (pauseMenu.screen === 'main') {
        _drawPauseMain(W, H);
    } else if (pauseMenu.screen === 'confirm_save') {
        _drawPauseConfirmSave(W, H);
    } else {
        _drawPauseSettings(W, H);
    }
}

function _pauseRoundRect(x, y, w, h, r) {
    roundRect(ctx, x, y, w, h, r);
}

function _drawPauseMain(W, H) {
    const panelW = 520;
    const panelH = 420;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    // ── 패널 배경 ──
    ctx.save();
    ctx.shadowColor = 'rgba(140, 180, 255, 0.22)';
    ctx.shadowBlur  = 40 * DPR;
    ctx.fillStyle   = 'rgba(6, 8, 20, 0.97)';
    _pauseRoundRect(panelX, panelY, panelW, panelH, 18);
    ctx.fill();
    ctx.restore();

    // 테두리
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.45)';
    ctx.lineWidth   = 1.5;
    _pauseRoundRect(panelX, panelY, panelW, panelH, 18);
    ctx.stroke();
    ctx.restore();

    // 타이틀
    ctx.save();
    ctx.font         = `bold 52px ${DIALOGUE_FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = 'rgba(0,0,0,0.95)';
    ctx.lineWidth    = 6;
    ctx.lineJoin     = 'round';
    ctx.strokeText('일시정지', W / 2, panelY + 70);
    ctx.fillStyle = 'rgba(210, 230, 255, 1)';
    ctx.fillText('일시정지',   W / 2, panelY + 70);
    ctx.restore();

    // 구분선
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.2)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 40, panelY + 110);
    ctx.lineTo(panelX + panelW - 40, panelY + 110);
    ctx.stroke();
    ctx.restore();

    // 버튼 정의
    const buttons = [
        { label: '재개',                     id: 'resume'    },
        { label: '설정',                     id: 'settings'  },
        { label: '마지막 세이브 포인트로 이동', id: 'goto_save' },
    ];

    const btnW   = panelW - 80;
    const btnH   = 64;
    const btnX   = panelX + 40;
    const btnGap = 18;
    const startY = panelY + 138;

    buttons.forEach((btn, i) => {
        const btnY    = startY + i * (btnH + btnGap);
        const hovered = pauseMenu.hoveredBtn === i;

        // 버튼 배경
        ctx.save();
        if (hovered) {
            ctx.fillStyle = 'rgba(80, 120, 210, 0.35)';
            ctx.shadowColor = 'rgba(120, 170, 255, 0.5)';
            ctx.shadowBlur  = 18 * DPR;
        } else {
            ctx.fillStyle = 'rgba(20, 26, 50, 0.75)';
        }
        _pauseRoundRect(btnX, btnY, btnW, btnH, 10);
        ctx.fill();
        ctx.restore();

        // 버튼 테두리
        ctx.save();
        ctx.strokeStyle = hovered ? 'rgba(160, 200, 255, 0.75)' : 'rgba(160, 200, 255, 0.3)';
        ctx.lineWidth = 1.5;
        _pauseRoundRect(btnX, btnY, btnW, btnH, 10);
        ctx.stroke();
        ctx.restore();

        // 버튼 텍스트
        ctx.save();
        ctx.font         = `bold 34px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 5;
        ctx.lineJoin     = 'round';
        ctx.strokeText(btn.label, btnX + btnW / 2, btnY + btnH / 2);
        ctx.fillStyle = hovered ? 'rgba(220, 240, 255, 1)' : 'rgba(190, 215, 255, 0.95)';
        ctx.fillText(btn.label, btnX + btnW / 2, btnY + btnH / 2);
        ctx.restore();

        // 저장
        btn._x = btnX; btn._y = btnY; btn._w = btnW; btn._h = btnH;
    });

    // 버튼 배열을 메뉴에 저장 (클릭 판정용)
    pauseMenu._mainBtns = buttons;

    // 하단 안내
    ctx.save();
    ctx.font         = `20px ${DIALOGUE_FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(140, 160, 200, 0.55)';
    ctx.fillText('ESC — 재개', W / 2, panelY + panelH - 26);
    ctx.restore();
}

function _drawPauseConfirmSave(W, H) {
    const panelW = 560;
    const panelH = 340;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    // 패널 배경
    ctx.save();
    ctx.shadowColor = 'rgba(255, 180, 80, 0.18)';
    ctx.shadowBlur  = 40 * DPR;
    ctx.fillStyle   = 'rgba(6, 8, 20, 0.97)';
    _pauseRoundRect(panelX, panelY, panelW, panelH, 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.5)';
    ctx.lineWidth   = 1.5;
    _pauseRoundRect(panelX, panelY, panelW, panelH, 18);
    ctx.stroke();
    ctx.restore();

    // 경고 아이콘 (느낌표)
    ctx.save();
    ctx.font         = `bold 40px ${DIALOGUE_FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(255, 210, 80, 0.9)';
    ctx.fillText('⚠', W / 2, panelY + 52);
    ctx.restore();

    // 질문 텍스트 (2줄)
    const lines = ['정말 이동하시겠습니까?', '현재 위치가 저장되지 않습니다.'];
    lines.forEach((line, i) => {
        ctx.save();
        ctx.font         = `bold ${i === 0 ? 36 : 28}px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 5;
        ctx.lineJoin     = 'round';
        ctx.strokeText(line, W / 2, panelY + 108 + i * 46);
        ctx.fillStyle    = i === 0 ? 'rgba(220, 235, 255, 1)' : 'rgba(180, 195, 230, 0.85)';
        ctx.fillText(line,   W / 2, panelY + 108 + i * 46);
        ctx.restore();
    });

    // 버튼 2개: 이동 / 취소
    const confirmBtns = [
        { label: '이동',  id: 'confirm_yes' },
        { label: '취소',  id: 'confirm_no'  },
    ];
    const btnW   = 200;
    const btnH   = 58;
    const btnGap = 28;
    const totalBtnsW = btnW * 2 + btnGap;
    const startBtnX  = (W - totalBtnsW) / 2;
    const btnY       = panelY + panelH - 90;

    confirmBtns.forEach((btn, i) => {
        const bx      = startBtnX + i * (btnW + btnGap);
        const hovered = pauseMenu.hoveredBtn === 20 + i;
        const isYes   = btn.id === 'confirm_yes';

        ctx.save();
        if (hovered) {
            ctx.fillStyle   = isYes ? 'rgba(200, 120, 40, 0.45)' : 'rgba(50, 70, 130, 0.45)';
            ctx.shadowColor = isYes ? 'rgba(255, 180, 80, 0.5)' : 'rgba(120, 160, 255, 0.5)';
            ctx.shadowBlur  = 18 * DPR;
        } else {
            ctx.fillStyle = 'rgba(20, 26, 50, 0.75)';
        }
        _pauseRoundRect(bx, btnY, btnW, btnH, 10);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = hovered
            ? (isYes ? 'rgba(255, 200, 100, 0.8)' : 'rgba(160, 200, 255, 0.8)')
            : 'rgba(160, 200, 255, 0.3)';
        ctx.lineWidth = 1.5;
        _pauseRoundRect(bx, btnY, btnW, btnH, 10);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font         = `bold 32px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 4;
        ctx.lineJoin     = 'round';
        ctx.strokeText(btn.label, bx + btnW / 2, btnY + btnH / 2);
        ctx.fillStyle = hovered
            ? (isYes ? 'rgba(255, 225, 140, 1)' : 'rgba(220, 240, 255, 1)')
            : 'rgba(190, 215, 255, 0.95)';
        ctx.fillText(btn.label, bx + btnW / 2, btnY + btnH / 2);
        ctx.restore();

        btn._x = bx; btn._y = btnY; btn._w = btnW; btn._h = btnH;
    });

    pauseMenu._confirmBtns = confirmBtns;
}

function _drawPauseSettings(W, H) {
    const panelW = 580;
    const panelH = 480;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    // 패널 배경
    ctx.save();
    ctx.shadowColor = 'rgba(140, 180, 255, 0.22)';
    ctx.shadowBlur  = 40 * DPR;
    ctx.fillStyle   = 'rgba(6, 8, 20, 0.97)';
    _pauseRoundRect(panelX, panelY, panelW, panelH, 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.45)';
    ctx.lineWidth   = 1.5;
    _pauseRoundRect(panelX, panelY, panelW, panelH, 18);
    ctx.stroke();
    ctx.restore();

    // 타이틀
    ctx.save();
    ctx.font         = `bold 48px ${DIALOGUE_FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = 'rgba(0,0,0,0.95)';
    ctx.lineWidth    = 6;
    ctx.lineJoin     = 'round';
    ctx.strokeText('설정', W / 2, panelY + 64);
    ctx.fillStyle = 'rgba(210, 230, 255, 1)';
    ctx.fillText('설정',   W / 2, panelY + 64);
    ctx.restore();

    // 구분선
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.2)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 40, panelY + 100);
    ctx.lineTo(panelX + panelW - 40, panelY + 100);
    ctx.stroke();
    ctx.restore();

    // 슬라이더 정의
    const sliders = [
        { label: '마스터',   key: 'masterVolume', val: pauseMenu.masterVolume },
        { label: '배경음악', key: 'bgmVolume',    val: pauseMenu.bgmVolume    },
        { label: '효과음',   key: 'sfxVolume',    val: pauseMenu.sfxVolume    },
    ];

    const labelW       = 130;   // 레이블 영역
    const pctW         = 72;    // 퍼센트 텍스트 영역
    const padL         = 40;    // 패널 좌측 여백
    const padR         = 40;    // 패널 우측 여백
    const sliderX      = panelX + padL + labelW;
    const sliderTrackW = panelW - padL - labelW - pctW - padR;
    const sliderTrackH = 10;
    const knobR        = 14;
    const startY       = panelY + 148;
    const rowGap       = 100;

    sliders.forEach((sl, i) => {
        const rowY      = startY + i * rowGap;
        const trackY    = rowY + 20;
        const fillW     = sl.val * sliderTrackW;
        const knobX     = sliderX + fillW;
        const knobY     = trackY + sliderTrackH / 2;
        const isDragging = pauseMenu.dragging === sl.key;

        // 레이블
        ctx.save();
        ctx.font         = `bold 32px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.8)';
        ctx.lineWidth    = 4;
        ctx.lineJoin     = 'round';
        ctx.strokeText(sl.label, panelX + padL, trackY + sliderTrackH / 2);
        ctx.fillStyle    = 'rgba(200, 220, 255, 0.95)';
        ctx.fillText(sl.label, panelX + padL, trackY + sliderTrackH / 2);
        ctx.restore();

        // 트랙 배경
        ctx.save();
        ctx.fillStyle = 'rgba(30, 40, 70, 0.9)';
        roundRect(ctx, sliderX, trackY, sliderTrackW, sliderTrackH, 5);
        ctx.fill();
        ctx.restore();

        // 채워진 부분
        ctx.save();
        ctx.fillStyle = isDragging
            ? 'rgba(160, 210, 255, 0.95)'
            : 'rgba(120, 170, 240, 0.85)';
        if (fillW > 0) {
            roundRect(ctx, sliderX, trackY, fillW, sliderTrackH, 5);
            ctx.fill();
        }
        ctx.restore();

        // 노브
        ctx.save();
        if (isDragging) {
            ctx.shadowColor = 'rgba(160, 210, 255, 0.7)';
            ctx.shadowBlur  = 14 * DPR;
        }
        ctx.fillStyle = isDragging ? 'rgba(220, 240, 255, 1)' : 'rgba(180, 215, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 150, 230, 0.6)';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();

        // 퍼센트 표시
        ctx.save();
        ctx.font         = `bold 26px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(170, 200, 255, 0.8)';
        ctx.fillText(`${Math.round(sl.val * 100)}%`, sliderX + sliderTrackW + 18, knobY);
        ctx.restore();

        // 히트 영역 저장 (클릭/드래그 판정)
        sl._trackX = sliderX;
        sl._trackY = trackY;
        sl._trackW = sliderTrackW;
        sl._trackH = sliderTrackH;
        sl._knobX  = knobX;
        sl._knobY  = knobY;
        sl._knobR  = knobR;
    });

    pauseMenu._sliders = sliders;

    // 뒤로 가기 버튼
    const backW = 200, backH = 54;
    const backX = (W - backW) / 2;
    const backY = panelY + panelH - 82;
    const backHovered = pauseMenu.hoveredBtn === 10;

    ctx.save();
    ctx.fillStyle = backHovered ? 'rgba(80, 120, 210, 0.35)' : 'rgba(20, 26, 50, 0.75)';
    if (backHovered) { ctx.shadowColor = 'rgba(120,170,255,0.5)'; ctx.shadowBlur = 18 * DPR; }
    _pauseRoundRect(backX, backY, backW, backH, 10);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = backHovered ? 'rgba(160,200,255,0.75)' : 'rgba(160,200,255,0.3)';
    ctx.lineWidth   = 1.5;
    _pauseRoundRect(backX, backY, backW, backH, 10);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font         = `bold 30px ${DIALOGUE_FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
    ctx.lineWidth    = 4;
    ctx.lineJoin     = 'round';
    ctx.strokeText('← 뒤로', backX + backW / 2, backY + backH / 2);
    ctx.fillStyle = backHovered ? 'rgba(220,240,255,1)' : 'rgba(190,215,255,0.95)';
    ctx.fillText('← 뒤로',   backX + backW / 2, backY + backH / 2);
    ctx.restore();

    pauseMenu._backBtn = { x: backX, y: backY, w: backW, h: backH };
}

// ── 마우스 이벤트 ─────────────────────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
    if (!pauseMenu.active) return;
    const pos = canvasLogicalPos(e);

    // 드래그 중이면 슬라이더 값 갱신
    if (pauseMenu.dragging && pauseMenu._sliders) {
        const sl = pauseMenu._sliders.find(s => s.key === pauseMenu.dragging);
        if (sl) {
            const raw = (pos.x - sl._trackX) / sl._trackW;
            pauseMenu[sl.key] = Math.max(0, Math.min(1, raw));
            pauseMenu.applyVolumes();
        }
        return;
    }

    pauseMenu.hoveredBtn = -1;

    if (pauseMenu.screen === 'main' && pauseMenu._mainBtns) {
        pauseMenu._mainBtns.forEach((btn, i) => {
            if (pos.x >= btn._x && pos.x <= btn._x + btn._w &&
                pos.y >= btn._y && pos.y <= btn._y + btn._h) {
                pauseMenu.hoveredBtn = i;
            }
        });
    } else if (pauseMenu.screen === 'confirm_save' && pauseMenu._confirmBtns) {
        pauseMenu._confirmBtns.forEach((btn, i) => {
            if (pos.x >= btn._x && pos.x <= btn._x + btn._w &&
                pos.y >= btn._y && pos.y <= btn._y + btn._h) {
                pauseMenu.hoveredBtn = 20 + i;
            }
        });
    } else if (pauseMenu.screen === 'settings') {
        if (pauseMenu._backBtn) {
            const b = pauseMenu._backBtn;
            if (pos.x >= b.x && pos.x <= b.x + b.w &&
                pos.y >= b.y && pos.y <= b.y + b.h) {
                pauseMenu.hoveredBtn = 10;
            }
        }
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (!pauseMenu.active) return;
    if (e.button !== 0) return;
    const pos = canvasLogicalPos(e);

    if (pauseMenu.screen === 'settings' && pauseMenu._sliders) {
        for (const sl of pauseMenu._sliders) {
            // 노브 또는 트랙 클릭
            const onKnob  = Math.hypot(pos.x - sl._knobX, pos.y - sl._knobY) <= sl._knobR + 8;
            const onTrack = pos.x >= sl._trackX && pos.x <= sl._trackX + sl._trackW &&
                            pos.y >= sl._trackY - 12 && pos.y <= sl._trackY + sl._trackH + 12;
            if (onKnob || onTrack) {
                pauseMenu.dragging = sl.key;
                const raw = (pos.x - sl._trackX) / sl._trackW;
                pauseMenu[sl.key] = Math.max(0, Math.min(1, raw));
                pauseMenu.applyVolumes();
                return;
            }
        }
    }
});

window.addEventListener('mouseup', (e) => {
    if (pauseMenu.dragging) {
        pauseMenu.dragging = null;
    }
});

canvas.addEventListener('click', (e) => {
    if (!pauseMenu.active) return;
    if (pauseMenu.dragging) return;   // 드래그 종료 후 클릭 오발 방지
    const pos = canvasLogicalPos(e);

    if (pauseMenu.screen === 'main' && pauseMenu._mainBtns) {
        pauseMenu._mainBtns.forEach((btn, i) => {
            if (pos.x >= btn._x && pos.x <= btn._x + btn._w &&
                pos.y >= btn._y && pos.y <= btn._y + btn._h) {
                _handlePauseMainClick(btn.id);
            }
        });
    } else if (pauseMenu.screen === 'confirm_save' && pauseMenu._confirmBtns) {
        pauseMenu._confirmBtns.forEach((btn) => {
            if (pos.x >= btn._x && pos.x <= btn._x + btn._w &&
                pos.y >= btn._y && pos.y <= btn._y + btn._h) {
                if (btn.id === 'confirm_yes') {
                    pauseMenu.close();
                    bgmPlayer.stop(false);
                    pauseMenu.fadePhase = 'fadeOut';
                    pauseMenu.fadeTimer = 0;
                    pauseMenu.fadeAlpha = 0;
                } else {
                    pauseMenu.screen = 'main';
                    pauseMenu.hoveredBtn = -1;
                }
            }
        });
    } else if (pauseMenu.screen === 'settings') {
        if (pauseMenu._backBtn) {
            const b = pauseMenu._backBtn;
            if (pos.x >= b.x && pos.x <= b.x + b.w &&
                pos.y >= b.y && pos.y <= b.y + b.h) {
                pauseMenu.screen = 'main';
                pauseMenu.hoveredBtn = -1;
            }
        }
    }
});

function _handlePauseMainClick(id) {
    if (id === 'resume') {
        pauseMenu.close();
    } else if (id === 'settings') {
        pauseMenu.screen = 'settings';
        pauseMenu.hoveredBtn = -1;
    } else if (id === 'goto_save') {
        // 확인 화면으로 전환 (이동은 confirm_yes에서 처리)
        pauseMenu.screen = 'confirm_save';
        pauseMenu.hoveredBtn = -1;
    }
}

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
        audio.volume  = Math.min(1, volume * pauseMenu.sfxVolume * pauseMenu.masterVolume);
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
const keys = { a: false, d: false, s: false, w: false, space: false, spacePressed: false, mouseLeft: false, mouseLeftPressed: false, q: false, qPressed: false, u: false, uPressed: false, i: false, iPressed: false, f: false, fPressed: false };

let audioUnlocked = false;
let audioMuted    = false;
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
    if (pauseMenu.active) return;   // 일시정지 중 게임 입력 차단
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
    // ── ESC 먼저 처리 ──
    if (e.key === 'Escape') {
        if (pauseMenu.active && pauseMenu.screen === 'settings') {
            pauseMenu.screen = 'main';
        } else if (pauseMenu.active && pauseMenu.screen === 'confirm_save') {
            pauseMenu.screen = 'main';
            pauseMenu.hoveredBtn = -1;
        } else if (pauseMenu.active) {
            pauseMenu.close();
        } else if (!isDeathActive() && pauseMenu.fadePhase === 'none') {
            pauseMenu.open();
        }
        return;
    }
    // ── 일시정지 중 나머지 키 차단 ──
    if (pauseMenu.active || pauseMenu.fadePhase !== 'none') return;

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
    if (key === 'f') {
        if (dialogue.active) {
            // 대화 중: 꾹 눌러도 빠르게 넘기기 허용 (fPressed 가드 없음)
            handleFKey();
        } else if (!keys.fPressed) {
            // 대화 밖: 최초 1회만 실행 (sign/NPC 무한 트리거 방지)
            keys.fPressed = true;
            handleFKey();
        }
    }
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
    // 테스트용 단축키: 3 = 맵4로 즉시 이동
    if (key === '3') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(4);
        player.x = 400; player.y = 570; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: 4 = 맵5로 즉시 이동
    if (key === '4') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(5);
        player.x = 80; player.y = 580; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: 5 = 맵6으로 즉시 이동
    if (key === '5') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(6);
        player.x = 80; player.y = 580; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: 6 = 맵7로 즉시 이동
    if (key === '6') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(7);
        player.x = 80; player.y = 580; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: 7 = 맵8(세이브포인트)으로 즉시 이동
    if (key === '7') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(8);
        player.x = 80; player.y = 580; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: 8 = 맵9(세이브 이후 구간1)로 즉시 이동
    if (key === '8') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(9);
        player.x = 80; player.y = 580; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: 9 = 맵10으로 즉시 이동
    if (key === '9') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(10);
        player.x = 80; player.y = 580; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: 0 = 맵11로 즉시 이동
    if (key === '0') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(11);
        player.x = 80; player.y = 580; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: - = 맵12로 즉시 이동
    if (key === '-') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(12);
        player.x = 80; player.y = 580; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    // 테스트용 단축키: = = 맵13(보스방)으로 즉시 이동
    if (key === '=') {
        projectile.reset();
        introSeq.phase = 'idle';
        SCALE = BASE_SCALE;
        loadMap(13);
        player.x = 120; player.y = 940; player.dx = 0; player.dy = 0;
        player.grounded = false;
        _snapCameraToPlayer();
    }
    if (key === 'q' && !keys.qPressed) { keys.q = true; keys.qPressed = true; handleQKey(); }
    // C = 보스 체력 절반 연출 테스트 (맵13 한정)
    if (key === 'c' && currentMapIndex === 13) {
        const boss = enemies.find(e => e.type === 'boss' && !e.isDead);
        if (boss) { boss._phase2Triggered = true; bossHalfSeq.trigger(); }
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
    // 테스트용 단축키: X = 보스 체력 30%로 설정
    if (key === 'x') {
        const boss = enemies.find(e => e.type === 'boss' && !e.isDead);
        if (boss) boss.hp = Math.ceil(boss.maxHp * 0.30);
    }
    // 테스트용 단축키: Z = 보스 마지막 패턴(체력 10% 미만) 강제 발동
    if (key === 'z') {
        const boss = enemies.find(e => e.type === 'boss' && e._phase2Active && !e.isDead);
        if (boss) _triggerBossFinalPattern(boss);
    }
    // 테스트용 단축키: V = 마지막 패턴 화면 중앙 연속 할퀴기 강제 발동
    if (key === 'v') {
        const boss = enemies.find(e => e.type === 'boss' && e._phase2Active && !e.isDead);
        if (boss) {
            if (!boss._finalPatternActive) _triggerBossFinalPattern(boss);
            // 이미 active 단계면 즉시 슬래시 버스트 트리거
            boss._fpSlashBurstQueued = true;
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
    if (key === 'f') { keys.f = false; keys.fPressed = false; }
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
    pitLaunchTimer: 0,    // 구덩이에서 솟구친 직후 오른쪽 dx 강제 유지 타이머

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
            { x: 3000, y: 0,   width: 60,   height: 600, type: 'wall'  },
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
    bgColor: '#654321',
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
let bossMapReached = false;  // 보스맵(맵13) 최초 도달 여부
let savepointReached = false;  // 세이브포인트(맵8) 도달 여부

// ── 보스 2페이즈 전환 연출 ────────────────────────────────────────────
const bossPhase2 = {
    active:      false,
    playing:     false,
    blackScreen: false,  // 영상 로딩 중 검정화면 강제
    fadeIn:      false,
    fadeAlpha:   0.65,
    FADE_STEP:   0.04,

    _video: null,

    get video() {
        if (!this._video) {
            const v = document.createElement('video');
            v.src     = './assets/images/background_change.mp4';
            v.preload = 'auto';
            v.muted   = false;
            v.style.display = 'none';
            document.body.appendChild(v);
            v.addEventListener('ended', () => {
                this.playing     = false;
                this.blackScreen = false;
                this.fadeIn      = true;
                this.fadeAlpha   = 0.65;
            });
            this._video = v;
        }
        return this._video;
    },

    trigger() {
        // 중복 방지 제거: 페이즈 전환 시마다 재트리거 허용
        // 진행 중이면 일단 리셋 후 재시작
        if (this._video) {
            this._video.pause();
            this._video.currentTime = 0;
        }
        this.active      = false;
        // 즉시 검정화면으로 전환 (로딩 중 깜빡임 방지)
        this.blackScreen = true;
        this.playing     = false;
        this.fadeIn      = false;
        this.fadeAlpha   = 0.65;

        const v = this.video;   // _video 미리 생성
        v.currentTime = 0;

        const doPlay = () => {
            this.playing     = true;
            this.blackScreen = false;
            // 비디오 재생 시작과 동시에 BGM을 설정과 무관하게 빠르게 페이드아웃 후 BGM_BOSS2로 전환
            bgmPlayer.rawFadeOutThenPlay('BGM_BOSS2');
            v.play().catch(() => {
                this.playing     = false;
                this.blackScreen = false;
                this.fadeIn      = true;
                this.fadeAlpha   = 0.65;
            });
        };

        if (v.readyState >= 4) {
            doPlay();
        } else {
            v.addEventListener('canplaythrough', doPlay, { once: true });
            v.load();
        }
    },

    // update()는 draw 루프에서 매 프레임 호출
    updateFade() {
        if (!this.fadeIn) return;
        this.fadeAlpha = Math.max(this.fadeAlpha - this.FADE_STEP, 0);
        if (this.fadeAlpha <= 0) {
            this.fadeIn  = false;
            this.active  = true;   // 페이드 완료 → BG_BOSS 확정
        }
    },

    reset() {
        this.active      = false;
        this.playing     = false;
        this.blackScreen = false;
        this.fadeIn      = false;
        this.fadeAlpha   = 0.65;
        if (this._video) {
            this._video.pause();
            this._video.currentTime = 0;
        }
    },
};

// phase: 'idle' → 'jump' → 'zoomin' → 'dialogue' → 'stand2' → 'bgchange' → 'dialogue2' → 'zoomout' → 'done'
const bossHalfSeq = {
    phase:      'idle',
    timer:      0,
    // stand2 순차 스프라이트 전환용
    stand2TransTimer: 0,   // stand2 진입 후 경과 프레임
    STAND2_FRAME_DUR: 54,  // 각 스프라이트 표시 프레임 수 (54프레임 × 3 = 162프레임)

    // 클로즈업 파라미터
    ZOOM_SCALE:     BASE_SCALE * 2.2,
    ZOOM_DUR:       30,     // 줌인 프레임
    ZOOMOUT_DUR:    30,     // 줌아웃 프레임
    savedScale:     1,
    savedCamX:      0,
    savedCamY:      0,
    targetCamX:     0,      // 보스 클로즈업 카메라 X
    targetCamY:     0,

    // 줌인/아웃 중 카메라 보간용 시작값
    _startCamX:  0,
    _startCamY:  0,
    _startScale: 1,

    // 대화 라인
    LINES1: [
        { text: '...!?' },
        { text: '...하.' },
        { text: '그래, 이 정도는 되어야 하지.' },
    ],
    LINES2: [
        { text: '이제부터가 진짜다.' },
    ],
    _dialogueIdx:  0,
    _dialogueLines: null,
    _displayText:  '',
    _charIdx:      0,
    _typingTimer:  0,
    _finished:     false,

    trigger() {
        // 중복 방지 제거: 이미 진행 중이어도 재트리거 허용
        const boss = enemies.find(e => e.type === 'boss' && !e.isDead);
        if (!boss) return;

        // 현재 공격 중단, 무적 설정
        boss.attackTimer      = 0;
        boss._atk2Active      = false;
        boss._atk2Windup      = false;
        boss._atk2Dashing     = false;
        boss._atk3Phase       = 'none';
        boss.isLeapWindup     = false;
        boss.isLeaping        = false;
        boss.dx               = 0;
        boss._halfInvincible  = true;   // 절반 연출 중 무적
        // 2페이즈 공격 상태 초기화
        boss._p2a1Phase       = 'idle';
        boss._p2a1Timer       = 0;
        boss._p2a1Cooldown    = 90;    // 2페이즈 진입 직후 약간의 유예 쿨타임
        boss._p2a1Alpha       = 1;
        boss._p2a1Visible     = true;

        // 맵 중앙으로 점프
        const centerX = world.width / 2;
        const bexNow  = boss.x + boss.width / 2;
        boss.dx = (centerX - bexNow) > 0 ? 8 : -8;
        boss.dy = -20;
        boss._leapIgnorePlatforms = true;
        boss.state = 'jump1';

        this.phase = 'jump';
        this.timer = 0;
        // 궁극기 줌 진행 중이면 BASE_SCALE / 정상 카메라로 저장 (충돌 방지)
        if (player.ultPhase !== 'none') {
            this.savedScale = BASE_SCALE;
            const _lW = canvas.width  / BASE_SCALE;
            const _lH = canvas.height / BASE_SCALE;
            this.savedCamX = Math.max(0, Math.min(player.x + player.width  / 2 - _lW / 2, world.width  - _lW));
            this.savedCamY = Math.max(0, Math.min(player.y + player.height / 2 - _lH / 2, world.height - _lH));
            // 궁극기 즉시 종료
            player.ultPhase = 'none';
            player.ultTimer = 0;
            SCALE = BASE_SCALE;
            camera.x = this.savedCamX;
            cameraY  = this.savedCamY;
            ultimate.active = false;
            slashEffects.length = 0;
            ultParticles.length = 0;
        } else {
            this.savedScale = SCALE;
            this.savedCamX  = camera.x;
            this.savedCamY  = cameraY;
        }
    },

    update() {
        if (this.phase === 'idle' || this.phase === 'done') return;
        this.timer++;

        const boss = enemies.find(e => e.type === 'boss' && !e.isDead);

        if (this.phase === 'jump') {
            // 보스가 착지하면 다음 단계
            if (boss && boss.grounded && this.timer > 10) {
                boss.dx    = 0;
                boss.dy    = 0;
                boss.state = 'idle';
                boss._leapIgnorePlatforms = false;
                // 클로즈업 카메라 목표: 보스 얼굴 중심
                const bCX = boss.x + boss.width  / 2;
                const bCY = boss.y + boss.height / 2;
                const lW  = canvas.width  / this.ZOOM_SCALE;
                const lH  = canvas.height / this.ZOOM_SCALE;
                this.targetCamX  = Math.max(0, Math.min(bCX - lW / 2, world.width  - lW));
                this.targetCamY  = Math.max(0, Math.min(bCY - lH / 2, world.height - lH));
                this._startScale = SCALE;
                this._startCamX  = camera.x;
                this._startCamY  = cameraY;
                this.phase = 'zoomin';
                this.timer = 0;
            }
        } else if (this.phase === 'zoomin') {
            const t = Math.min(this.timer / this.ZOOM_DUR, 1);
            const e2 = t * t * (3 - 2 * t);
            SCALE    = this._startScale + (this.ZOOM_SCALE - this._startScale) * e2;
            camera.x = this._startCamX  + (this.targetCamX  - this._startCamX)  * e2;
            cameraY  = this._startCamY  + (this.targetCamY  - this._startCamY)   * e2;
            if (t >= 1) {
                this.phase = 'dialogue';
                this.timer = 0;
                this._startDialogue(this.LINES1);
            }
        } else if (this.phase === 'dialogue') {
            this._updateTyping();
        } else if (this.phase === 'stand2') {
            // stand2 첫 진입 시 초기화 + 배경 전환 영상 동시 시작
            if (this.stand2TransTimer === 0) {
                // 클로즈업 즉시 해제 — savedScale/savedCam으로 복귀
                SCALE    = this.savedScale;
                camera.x = this.savedCamX;
                cameraY  = this.savedCamY;
                if (boss) {
                    boss._halfInvincible = true;
                    boss.isInvincible    = false;
                    boss.invincibleTimer = 0;
                    boss.imgStand = 'BOSS_STAND2_1';
                }
                // 배경 전환 영상 즉시 시작 (스프라이트 전환과 동시)
                bossPhase2.trigger();
            }
            this.stand2TransTimer++;

            // 스프라이트 단계별 전환: _1 → _2 → _3
            if (boss) {
                const fd = this.STAND2_FRAME_DUR;
                if      (this.stand2TransTimer < fd)     boss.imgStand = 'BOSS_STAND2_1';
                else if (this.stand2TransTimer < fd * 2) boss.imgStand = 'BOSS_STAND2_2';
                else                                     boss.imgStand = 'BOSS_STAND2_3';
            }

            // 스프라이트 전환 완료 후 bgchange 대기로 전환
            if (this.stand2TransTimer >= this.STAND2_FRAME_DUR * 3) {
                if (boss) boss.imgStand = 'BOSS_STAND2_3';
                this.phase = 'bgchange';
                this.timer = 0;
                this.stand2TransTimer = 0;
            }
        } else if (this.phase === 'bgchange') {
            // 배경 연출(영상+페이드) 완료 대기
            if (!bossPhase2.playing && !bossPhase2.blackScreen && !bossPhase2.fadeIn) {
                this.phase = 'dialogue2';
                this.timer = 0;
                this._startDialogue(this.LINES2);
            }
        } else if (this.phase === 'dialogue2') {
            this._updateTyping();
        } else if (this.phase === 'zoomout') {
            const t = Math.min(this.timer / this.ZOOMOUT_DUR, 1);
            const e2 = t * t * (3 - 2 * t);
            SCALE    = this.ZOOM_SCALE + (this.savedScale  - this.ZOOM_SCALE) * e2;
            camera.x = this.targetCamX + (this.savedCamX  - this.targetCamX) * e2;
            cameraY  = this.targetCamY + (this.savedCamY  - this.targetCamY) * e2;
            if (t >= 1) {
                SCALE    = this.savedScale;
                camera.x = this.savedCamX;
                cameraY  = this.savedCamY;
                this.phase = 'done';
                this.timer = 0;
                if (boss) {
                    boss._halfInvincible  = false;   // 무적 해제
                    boss.isInvincible     = false;   // 피격 깜빡임 초기화
                    boss.invincibleTimer  = 0;
                    boss._phase2Active    = true;    // 2페이즈 효과 활성화
                    boss._dotTimer        = 0;
                }
                // 플레이어 무적 상태 즉시 해제 (전환 중 invincibleTimer=999 잔류 방지)
                player.isInvincible    = false;
                player.invincibleTimer = 0;
            }
        }
    },

    _startDialogue(lines) {
        this._dialogueLines = lines;
        this._dialogueIdx   = 0;
        this._displayText   = '';
        this._charIdx       = 0;
        this._typingTimer   = 0;
        this._finished      = false;
    },

    _updateTyping() {
        if (!this._finished) {
            this._typingTimer++;
            if (this._typingTimer % 2 === 0 && this._charIdx < this._dialogueLines[this._dialogueIdx].text.length) {
                this._displayText += this._dialogueLines[this._dialogueIdx].text[this._charIdx++];
            }
            if (this._charIdx >= this._dialogueLines[this._dialogueIdx].text.length) {
                this._finished = true;
            }
        }
    },

    // F키 또는 클릭 → 대화 진행
    advance() {
        if (this.phase !== 'dialogue' && this.phase !== 'dialogue2') return false;
        if (!this._finished) {
            // 즉시 완성
            this._displayText = this._dialogueLines[this._dialogueIdx].text;
            this._charIdx     = this._dialogueLines[this._dialogueIdx].text.length;
            this._finished    = true;
            return true;
        }
        // 다음 줄
        this._dialogueIdx++;
        if (this._dialogueIdx >= this._dialogueLines.length) {
            // 이 대화 블록 종료
            if (this.phase === 'dialogue') {
                this.phase = 'stand2';
                this.timer = 0;
            } else {
                // dialogue2 종료 → 즉시 done (stand2에서 이미 줌아웃 완료)
                this.phase = 'done';
                this.timer = 0;
                const boss2 = enemies.find(e => e.type === 'boss' && !e.isDead);
                if (boss2) {
                    boss2._halfInvincible = false;
                    boss2.isInvincible    = false;
                    boss2.invincibleTimer = 0;
                    boss2._phase2Active   = true;    // 2페이즈 효과 활성화
                    boss2._dotTimer       = 0;
                }
                // 플레이어 무적 상태 즉시 해제 (전환 중 invincibleTimer=999 잔류 방지)
                player.isInvincible    = false;
                player.invincibleTimer = 0;
            }
        } else {
            this._displayText = '';
            this._charIdx     = 0;
            this._typingTimer = 0;
            this._finished    = false;
        }
        return true;
    },

    draw() {
        if (this.phase !== 'dialogue' && this.phase !== 'dialogue2') return;
        // thought 스타일 대화창
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);   // 스크린 좌표로 전환

        const W    = canvas.width  / DPR;
        const H    = canvas.height / DPR;
        const boxH = H * 0.28;
        const boxY = H - boxH;

        ctx.fillStyle = 'rgba(8, 8, 18, 0.92)';
        ctx.fillRect(0, boxY * DPR, W * DPR, boxH * DPR);

        ctx.strokeStyle = 'rgba(160, 130, 255, 0.6)';
        ctx.lineWidth   = 2 * DPR;
        ctx.beginPath();
        ctx.moveTo(0, boxY * DPR);
        ctx.lineTo(W * DPR, boxY * DPR);
        ctx.stroke();

        // 텍스트
        const fontSize = Math.round(28 * DPR);
        ctx.font      = `${fontSize}px ${DIALOGUE_FONT}`;
        ctx.fillStyle = 'rgba(235, 220, 200, 1)';
        ctx.textAlign = 'center';
        const textY   = (boxY + boxH * 0.45) * DPR;
        ctx.fillText(this._displayText, (W / 2) * DPR, textY);

        // ▼ 진행 표시
        if (this._finished) {
            const blink = Math.floor(Date.now() / 500) % 2 === 0;
            if (blink) {
                ctx.fillStyle = 'rgba(200, 175, 255, 0.9)';
                ctx.font      = `${Math.round(14 * DPR)}px monospace`;
                ctx.textAlign = 'right';
                ctx.fillText('▼', (W - 30) * DPR, (H - 20) * DPR);
            }
        }
        ctx.restore();
    },

    reset() {
        this.phase = 'idle';
        this.timer = 0;
        const boss = enemies.find(e => e.type === 'boss' && !e.isDead);
        if (boss) boss._halfInvincible = false;
    },
};
const savepointHint = {
    active:        false,   // 현재 표시 중
    shown:         false,   // 최초 1회 힌트를 표시했는지 (게임 전체에서)
    dialogueDone:  false,   // 최초 NPC 대화가 끝났는지
    blinkTimer:    0,
};

// 세이브포인트 회복 이펙트 (초록 파티클)
const savepointEffect = {
    active:    false,
    particles: [],
    timer:     0,
    duration:  80,   // 이펙트 총 지속 프레임
    pending:   false, // 맵 전환 완료 후 발동 대기

    trigger() {
        this.active    = true;
        this.timer     = 0;
        this.particles = [];
        // 플레이어 주위에 초록 파티클 생성
        for (let i = 0; i < 8; i++) {
            const angle  = (Math.PI * 2 / 8) * i + (Math.random() - 0.5) * 0.4;
            const speed  = 1.8 + Math.random() * 2.5;
            this.particles.push({
                x:     player.x + player.width  / 2,
                y:     player.y + player.height / 2,
                dx:    Math.cos(angle) * speed,
                dy:    Math.sin(angle) * speed - 1.5,
                life:  1.0,
                decay: 0.018 + Math.random() * 0.012,
                size:  4 + Math.random() * 5,
            });
        }
        // HP 즉시 최대 회복
        player.hp = player.maxHp;
    },

    update() {
        if (!this.active) return;
        this.timer++;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x   += p.dx;
            p.y   += p.dy;
            p.dy  += 0.08;   // 살짝 중력
            p.life -= p.decay;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        if (this.timer >= this.duration && this.particles.length === 0) {
            this.active = false;
        }
    },

    draw() {
        if (!this.active) return;
        this.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(p.life, 0);
            // 초록 계열 글로우
            ctx.shadowColor = 'rgba(80, 255, 120, 0.9)';
            ctx.shadowBlur  = 8 * DPR;
            ctx.fillStyle   = `rgba(${Math.floor(60 + (1 - p.life) * 80)}, 255, ${Math.floor(100 + p.life * 80)}, 1)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
};

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
    // 보스맵 벗어날 때 체력바 숨김 + 보스BGM 정지 후 일반BGM 복구
    if (mapIndex !== 13 && typeof bossHpBar !== 'undefined') {
        bossHpBar.visible    = false;
        bossHpBar.introPhase = 'idle';
        if (typeof bossPhase2 !== 'undefined') bossPhase2.reset();
        if (bgmPlayer.currentKey === 'BGM_BOSS1' || bgmPlayer.currentKey === '') {
            bgmPlayer.stop(false);
            bgmPlayer.restart('BGM1', true);
        }
    }
    // 맵13 진입 시에도 페이즈2 상태 초기화 (죽고 돌아올 때 배경 리셋)
    if (mapIndex === 13 && typeof bossPhase2 !== 'undefined') {
        bossPhase2.reset();
        if (typeof bossHalfSeq !== 'undefined') {
            bossHalfSeq.phase = 'idle';
            bossHalfSeq.timer = 0;
            bossHalfSeq.stand2TransTimer = 0;
        }
    }
    platforms       = map.platforms;
    signs           = map.signs;
    spikes          = map.spikes || [];

    // 맵2는 한 번 클리어하면 적 리스폰 없음
    if ((map.keepClearedEnemiesDead && clearedMaps.has(mapIndex)) ||
        (mapIndex === 2 && map2Events.killMonologueDone)) {
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

    // 세이브포인트(맵8) 방문 시 플래그 활성화
    if (mapIndex === 8) {
        savepointReached = true;
    } else {
        // 다른 맵으로 이동하면 힌트 숨김
        savepointHint.active = false;
    }

    // 맵 진입 이벤트 실행
    if (map.onEnter) map.onEnter();
}
// [SECTION 6] 물리 연산 및 업데이트 (Update Logic)
// ══════════════════════════════════════════════════════════════════
// [DEATH SYSTEM] 사망 연출 시퀀스
// phase: 'idle' → 'closeup' → 'fall_down' → 'wake_up' → 'fadeOut' → 'done'
// ══════════════════════════════════════════════════════════════════
const deathSeq = {
    phase:       'idle',
    timer:       0,

    CLOSEUP_SCALE:    BASE_SCALE * 2.2,
    CLOSEUP_DURATION: 20,   // 줌인
    WAKEUP_DURATION:  35,   // wake_up 먼저
    FALL_DURATION:    45,   // 이후 fall_down
    FADEOUT_DURATION: 45,   // 암전

    fadeAlpha:   0,
    savedScale:  1,
};

function triggerDeath() {
    if (deathSeq.phase !== 'idle') return;

    bgmPlayer.stop(true);   // BGM 페이드아웃 (보스전 포함 모든 BGM)
    Object.values(sounds).forEach(s => { s.pause(); s.currentTime = 0; });

    deathSeq.savedScale = SCALE;
    deathSeq.phase      = 'closeup';
    deathSeq.timer      = 0;
    deathSeq.fadeAlpha  = 0;

    player.dx           = 0;
    player.dy           = 0;
    player.isAttacking  = false;
    player.attackTimer  = 0;
    player.isDashing    = false;
    player.isInvincible = false;
}

function updateDeathSeq() {
    if (deathSeq.phase === 'idle') return;
    deathSeq.timer++;

    if (deathSeq.phase === 'closeup') {
        const t    = Math.min(deathSeq.timer / deathSeq.CLOSEUP_DURATION, 1);
        const ease = t * t * (3 - 2 * t);
        SCALE = deathSeq.savedScale + (deathSeq.CLOSEUP_SCALE - deathSeq.savedScale) * ease;
        _snapCameraToPlayer();
        if (t >= 1) {
            deathSeq.phase = 'wake_up';   // ① wake_up 먼저
            deathSeq.timer = 0;
        }

    } else if (deathSeq.phase === 'wake_up') {
        _snapCameraToPlayer();
        if (deathSeq.timer >= deathSeq.WAKEUP_DURATION) {
            deathSeq.phase = 'fall_down'; // ② 이후 fall_down
            deathSeq.timer = 0;
        }

    } else if (deathSeq.phase === 'fall_down') {
        _snapCameraToPlayer();
        if (deathSeq.timer >= deathSeq.FALL_DURATION) {
            deathSeq.phase = 'fadeOut';
            deathSeq.timer = 0;
        }

    } else if (deathSeq.phase === 'fadeOut') {
        deathSeq.fadeAlpha = Math.min(deathSeq.timer / deathSeq.FADEOUT_DURATION, 1);
        if (deathSeq.timer >= deathSeq.FADEOUT_DURATION) {
            _applyDeath();
            deathSeq.phase     = 'fadeIn';
            deathSeq.timer     = 0;
            deathSeq.fadeAlpha = 1;
        }

    } else if (deathSeq.phase === 'fadeIn') {
        deathSeq.fadeAlpha = Math.max(1 - deathSeq.timer / deathSeq.FADEOUT_DURATION, 0);
        if (deathSeq.timer >= deathSeq.FADEOUT_DURATION) {
            deathSeq.fadeAlpha = 0;
            deathSeq.phase     = 'idle';
            SCALE = BASE_SCALE;
            _snapCameraToPlayer();
            // 보스맵 리스폰이면 BGM은 맵13 onEnter에서 처리, 일반맵이면 처음부터
            if (!bossMapReached) {
                bgmPlayer.restart('BGM1', true);
            }
        }
    }
}

function _applyDeath() {
    // ── 맵 클리어 상태만 보존, 나머지 리셋 ──────────────────────
    const savedCleared = new Set(clearedMaps);

    // map2Events 이벤트 플래그 리셋 (인트로는 이미 봤으므로 introPlayed 유지)
    const savedIntroPlayed = map2Events.introPlayed;
    Object.keys(map2Events).forEach(k => { map2Events[k] = false; });
    map2Events.introPlayed = savedIntroPlayed;

    // combatTutorial 리셋
    combatTutorial.dialogueShown     = false;
    combatTutorial.hintActive        = false;
    combatTutorial.hintShown         = false;
    combatTutorial.blinkTimer        = 0;
    combatTutorial.cutPhase          = 'idle';
    combatTutorial.cutTimer          = 0;
    combatTutorial.cutTriggered      = false;
    combatTutorial.killMonologueDone = false;

    // 투사체 리셋
    projectile.reset();
    player.lastTeleportTime = 0;

    // 부활 위치: 보스맵 도달 → 맵12 오른쪽 포탈 근처, 세이브포인트 → 맵8, 기본 → 맵2
    const respawnMapIndex = bossMapReached ? 12 : (savepointReached ? 8 : 2);
    const respawnMap      = MAP_DATA[respawnMapIndex];
    loadMap(respawnMapIndex);

    // 클리어 상태 복원
    clearedMaps.clear();
    savedCleared.forEach(id => clearedMaps.add(id));

    // 플레이어 상태 리셋
    // 보스맵 도달 시 맵12 오른쪽 포탈(x=2840) 앞에 스폰
    player.x            = bossMapReached ? 2600 : respawnMap.spawnX;
    player.y            = respawnMap.spawnY;
    player.dx           = 0;
    player.dy           = 0;
    player.hp           = player.maxHp;
    player.gauge        = 0;
    player.isInvincible = false;
    player.invincibleTimer = 0;
    player.isDashing    = false;
    player.isAttacking  = false;
    player.attackTimer  = 0;
    player.jumpCount    = 0;
    player.grounded     = true;
    player.ultPhase     = 'none';
    player.direction    = 'right';
    SCALE = BASE_SCALE;
    _snapCameraToPlayer();
}

function drawDeathOverlay() {
    if (deathSeq.phase === 'idle') return;
    if (deathSeq.fadeAlpha <= 0) return;
    // 캔버스 전체에 암전 오버레이 (SCALE 변환 밖에서 그림)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(0,0,0,${deathSeq.fadeAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

// 사망 연출 중 플레이어 스프라이트 키 반환
function getDeathPlayerKey() {
    if (deathSeq.phase === 'closeup' || deathSeq.phase === 'wake_up') return 'PLAYER_WAKE_UP';
    if (deathSeq.phase === 'fall_down' || deathSeq.phase === 'fadeOut' || deathSeq.phase === 'fadeIn') return 'PLAYER_FALL_DOWN';
    return null;
}

function isDeathActive() {
    return deathSeq.phase !== 'idle';
}

function update() {
    // ── 세이브포인트 이동 암전 연출 (일시정지 해제 후) ────────────────
    if (pauseMenu.fadePhase !== 'none') {
        pauseMenu.fadeTimer++;
        if (pauseMenu.fadePhase === 'fadeOut') {
            pauseMenu.fadeAlpha = Math.min(pauseMenu.fadeTimer / pauseMenu.FADE_DUR, 1);
            if (pauseMenu.fadeTimer >= pauseMenu.FADE_DUR) {
                // 완전 암전 → 실제 이동 수행
                const destMapIndex = bossMapReached ? 12 : (savepointReached ? 8 : 2);
                const destMap = MAP_DATA[destMapIndex];
                loadMap(destMapIndex);
                player.x = bossMapReached ? 2600 : destMap.spawnX;
                player.y = destMap.spawnY;
                player.dx = 0; player.dy = 0;
                player.grounded = true;
                SCALE = BASE_SCALE;
                _snapCameraToPlayer();
                pauseMenu.fadePhase = 'fadeIn';
                pauseMenu.fadeTimer = 0;
            }
        } else if (pauseMenu.fadePhase === 'fadeIn') {
            pauseMenu.fadeAlpha = Math.max(1 - pauseMenu.fadeTimer / pauseMenu.FADE_DUR, 0);
            if (pauseMenu.fadeTimer >= pauseMenu.FADE_DUR) {
                pauseMenu.fadeAlpha = 0;
                pauseMenu.fadePhase = 'none';
                // BGM 재개
                bgmPlayer.play('BGM1', true);
            }
        }
        draw();
        requestAnimationFrame(update);
        return;
    }

    // ── 일시정지 중 ────────────────────────────────────────────────
    if (pauseMenu.active) {
        draw();
        requestAnimationFrame(update);
        return;
    }

    // ── 사망 연출 중 ─────────────────────────────────────────────
    if (isDeathActive()) {
        updateDeathSeq();
        draw();
        requestAnimationFrame(update);
        return;
    }

    // ── 보스 체력 절반 연출 업데이트 (_bossHalfActive true면 위 블록에서 return 후 미도달) ──
    bossHalfSeq.update();

    // ── HP 0 감지 → 사망 연출 시작 ────────────────────────────────
    if (player.hp <= 0) {
        triggerDeath();
        draw();
        requestAnimationFrame(update);
        return;
    }

    updateDialogue();
    updateAfterimages();
    if (player.isDashing) createAfterimage();
    updateSavepointMap();

    // 튜토리얼 인트로 연출 업데이트 (항상 실행)
    updateTutorialIntro();
    // 전투 컷신 업데이트 (항상 실행 — SCALE·카메라 제어)
    updateCombatCutscene();

    // 천장 전환 업데이트 (맵3→4) 및 맵4 구멍 낙하 체크
    updateCeilingTransition();

    // 천장 전환 암전 중 — 물리/입력 차단 (점프 모션 유지)
    if (ceilingTransition.active && ceilingTransition.phase === 'fadeOut') {
        player.dx = 0;
        player.dy = ceilingTransition.savedDy || player.dy;  // 상승 속도 유지
        // y를 천장 위로 고정해서 맵 밖으로 사라지는 느낌
        player.y = Math.min(player.y, -10);
        draw();
        requestAnimationFrame(update);
        return;
    }

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

    // 보스 페이즈2 전환 연출 중 — 플레이어 완전 동결
    const _bossHalfActive = bossHalfSeq.phase !== 'idle' && bossHalfSeq.phase !== 'done';
    if (_bossHalfActive) {
        bossHalfSeq.update();

        // 플레이어 모든 동작 차단 + 외형 고정
        player.dx             = 0;
        player.isAttacking    = false;
        player.attackTimer    = 0;
        player.isDashing      = false;
        player.dashTimer      = 0;
        player.jumpCount      = Math.max(player.jumpCount, 1); // 추가 점프 봉쇄
        player.isInvincible   = true;   // 피격 차단 (깜빡임은 아래서 처리)
        player.invincibleTimer = 999;
        // 스프라이트 고정: 착지면 idle, 공중이면 jump2 (fall)
        player.state = player.grounded ? 'idle' : 'jump2';

        // 중력 + 착지만 처리
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
                        player.y         = plat.y - player.height;
                        player.dy        = 0;
                        player.grounded  = true;
                        player.jumpCount = 0;
                        player.jumpTimer = 0;
                    }
                }
            }
        });
        player.state = player.grounded ? 'idle' : 'jump2';

        // 적 물리/AI 처리 (보스 점프 착지 등)
        updateEnemies();
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
    if (player.pitLaunchTimer  > 0) {
        player.pitLaunchTimer--;
        player.dx = 6;   // 오른쪽 속도 강제 유지
        player.direction = 'right';
    } else if (player.isDashing) {
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
                // 최대 점프 높이로 도달 가능한 플랫폼이 있을 때만 효과음 재생
                // 최대 높이 = jumpForce² / (2 * gravity)
                const maxJumpHeight = (player.jumpForce * player.jumpForce) / (2 * player.gravity);
                const playerFeetY   = player.y + player.height;
                const canReachPlat  = platforms.some(plat => {
                    if ((plat.type || 'platform') !== 'platform') return false;
                    const platTopY = plat.y;
                    return platTopY < playerFeetY && (playerFeetY - platTopY) <= maxJumpHeight;
                });
                if (canReachPlat) playSound('JUMP');
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
            // ② 좌우 막힘 (발판 위에 서있는 경우 제외)
            const solidOverlapY = player.y + player.height > plat.y + 20 &&
                                  player.y                 < plat.y + plat.height;
            if (solidOverlapY) {
                const solidOverlapX = player.x + player.width > plat.x &&
                                      player.x                < plat.x + plat.width;
                if (solidOverlapX) {
                    const fromLeft  = (player.x + player.width) - plat.x;
                    const fromRight = (plat.x + plat.width) - player.x;
                    if (fromLeft < fromRight) {
                        player.x = plat.x - player.width;
                    } else {
                        player.x = plat.x + plat.width;
                    }
                    player.dx = 0;
                }
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
    updateBossStoneParticles();
    updateSlashEffects();
    updateScreenShards();
    updateP2A3Shockwaves();

    // 6-9: 맵 전환 트리거 체크
    checkMapTransitions();
    checkMap3CeilingTransition();   // 맵3 천장 → 맵4
    checkMap4PitFall();             // 맵4 구멍 → 맵3

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
        if (camera.x > Math.max(0, world.width - logicalW)) camera.x = Math.max(0, world.width - logicalW);
    }

    // 수직 카메라 — 보스맵은 Y 고정 (바닥 기준), 나머지는 플레이어 추적
    if (currentMapIndex === 13) {
        cameraY = Math.max(0, world.height - logicalH);
    } else {
        const targetCamY = player.y - logicalH / 2 + player.height / 2;
        cameraY += (targetCamY - cameraY) * 0.12;
        if (cameraY < 0) cameraY = 0;
        if (cameraY > Math.max(0, world.height - logicalH)) cameraY = Math.max(0, world.height - logicalH);
    }

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
    if (isDeathActive()) return;   // 사망 연출 중 피격 차단
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
        // 맵 밖(위아래)이 보여도 자연스럽도록 먼저 bgColor로 전체 채움
        ctx.fillStyle = MAP_DATA[currentMapIndex].bgColor;
        ctx.fillRect(0, 0, world.width, world.height);
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

    // 7-1c: 맵4~7, 맵9~12 배경 — BG_PLAIN 타일링 (world.height 기준 스케일)
    if ([4, 5, 6, 7, 9, 10, 11, 12].includes(currentMapIndex)) {
        const bgImg = sprites['BG_PLAIN'];
        const viewWidth  = canvas.width / SCALE;
        const viewHeight = canvas.height / SCALE;
        const viewLeft   = camera.x;
        const viewTop    = cameraY;
        const viewRight  = viewLeft + viewWidth;

        ctx.fillStyle = MAP_DATA[currentMapIndex].bgColor;
        ctx.fillRect(viewLeft, viewTop, viewWidth, viewHeight);

        if (bgImg && bgImg.naturalWidth > 0) {
            const imgW = bgImg.naturalWidth;
            const imgH = bgImg.naturalHeight;
            const scale = Math.max(viewWidth / imgW, world.height / imgH);
            const tileW = imgW * scale;
            const tileH = imgH * scale;
            const drawY = viewTop + viewHeight - tileH;
            const bgOffset = -tileW * 0.3;
            const startX = Math.floor((viewLeft - bgOffset) / tileW) * tileW + bgOffset;

            for (let tx = startX; tx < viewRight; tx += tileW) {
                ctx.drawImage(bgImg, tx, drawY, tileW, tileH);
            }
        }
    }

    // 7-1c-boss: 맵13 보스방 배경
    if (currentMapIndex === 13) {
        const worldBottom = world.height;

        // 줌인 중인 페이즈(jump/zoomin/dialogue)에서만 pre-zoom 카메라로 배경 고정
        // stand2 이후(bgchange/dialogue2)는 이미 줌아웃 완료 → 현재 카메라 사용
        const _zoomPhase = bossHalfSeq.phase === 'jump'    ||
                           bossHalfSeq.phase === 'zoomin'  ||
                           bossHalfSeq.phase === 'dialogue';
        const _bgScale   = _zoomPhase ? bossHalfSeq.savedScale : SCALE;
        const _bgCamX    = _zoomPhase ? bossHalfSeq.savedCamX  : camera.x;
        const _bgCamY    = _zoomPhase ? bossHalfSeq.savedCamY  : cameraY;

        // 배경을 순수 스크린 픽셀로 고정해서 그리는 헬퍼
        // _bgScale/_bgCamX/_bgCamY 기준 월드뷰를 캔버스 전체(0,0,W,H)에 매핑
        const _drawScreenBg = (imgKey, fillColor, alpha) => {
            const bgImg = sprites[imgKey];
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
            ctx.fillStyle = fillColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (bgImg && bgImg.naturalWidth > 0) {
                const sw = canvas.width  / _bgScale;
                const sh = canvas.height / _bgScale;
                const imgW  = bgImg.naturalWidth;
                const imgH  = bgImg.naturalHeight;
                const scale = Math.max(sw / imgW, sh / imgH);
                const tileW = imgW * scale;
                const tileH = imgH * scale;
                // 월드 Y → 스크린 픽셀 Y
                const worldDrawY  = worldBottom - tileH;
                const screenDrawY = (worldDrawY - _bgCamY) * _bgScale;
                const screenTileW = tileW * _bgScale;
                const screenTileH = tileH * _bgScale;
                const bgOffset    = -tileW * 0.3;
                const firstWorldX = Math.floor((_bgCamX - bgOffset) / tileW) * tileW + bgOffset;
                let screenX = (firstWorldX - _bgCamX) * _bgScale;
                while (screenX < canvas.width) {
                    ctx.drawImage(bgImg, screenX, screenDrawY, screenTileW, screenTileH);
                    screenX += screenTileW;
                }
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        };

        if (bossPhase2.blackScreen) {
            // 로딩 중: 1페이즈 BG_PLAIN 고정
            _drawScreenBg('BG_PLAIN', MAP_DATA[13].bgColor);
        } else if (bossPhase2.playing && bossPhase2._video) {
            // 영상 재생 중: 스크린 전체 고정
            const v = bossPhase2._video;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (v.readyState >= 3) {
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            }
            ctx.restore();
        } else if (bossPhase2.fadeIn) {
            // 영상 종료 후 페이드인
            bossPhase2.updateFade();
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
            _drawScreenBg('BG_BOSS', '#0d1e35', 1 - bossPhase2.fadeAlpha);
        } else if (bossPhase2.active) {
            // 2페이즈 배경 확정 (현재 카메라 기준 — 이미 zoomout 완료)
            _drawScreenBg('BG_BOSS', '#0d1e35');
            // 마지막 패턴 비디오가 재생 중이면 배경 위에 덮어씌움
        } else {
            // 1페이즈: BG_PLAIN (현재 카메라 기준)
            _drawScreenBg('BG_PLAIN', MAP_DATA[13].bgColor);
        }
    }

    // 7-1d: 맵8 배경 — 세이브포인트 (뷰포트 1280×720 꽉 채움, 카메라 고정)
    if (currentMapIndex === 8) {
        const bgImg = sprites['BG_SAVEPOINT'];
        const viewWidth  = canvas.width / SCALE;
        const viewHeight = canvas.height / SCALE;
        ctx.fillStyle = MAP_DATA[currentMapIndex].bgColor;
        ctx.fillRect(camera.x, cameraY, viewWidth, viewHeight);
        if (bgImg && bgImg.naturalWidth > 0) {
            ctx.drawImage(bgImg, camera.x, cameraY, viewWidth, viewHeight);
        }
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
            } else if (currentMapIndex === 4 || currentMapIndex === 5 || currentMapIndex === 6 || currentMapIndex === 7 || currentMapIndex === 8 || currentMapIndex === 9 || currentMapIndex === 10 || currentMapIndex === 11 || currentMapIndex === 12) {
                ctx.fillStyle = (plat.type === 'solid' || plat.type === 'wall') ? '#654321' : '#4A4A4A';
                ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
            } else if (currentMapIndex === 13) {
                // 보스방: 플랫폼도 바닥/벽과 동일한 색
                ctx.fillStyle = '#654321';
                ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
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
        const playerCX = player.x + player.width / 2;
        const signCX   = sign.x + sign.width / 2;
        const inRange  = Math.abs(playerCX - signCX) < sign.interactRange;

        if (sign.isNpc) {
            // ── NPC 렌더링 ──────────────────────────────────────────
            const npcImg = sign.imgKey ? sprites[sign.imgKey] : null;
            const npcDir = sign.direction || 'left';

            if (npcImg && npcImg.complete && npcImg.naturalWidth !== 0) {
                ctx.save();
                if (npcDir === 'right') {
                    ctx.translate(sign.x + sign.width, sign.y);
                    ctx.scale(-1, 1);
                    ctx.drawImage(npcImg, 0, 0, sign.width, sign.height);
                } else {
                    ctx.drawImage(npcImg, sign.x, sign.y, sign.width, sign.height);
                }
                ctx.restore();
            } else {
                // 이미지 없으면 직사각형 폴백
                ctx.fillStyle   = '#7a6a9a';
                ctx.fillRect(sign.x, sign.y, sign.width, sign.height);
                ctx.strokeStyle = '#4a3a6a';
                ctx.lineWidth   = 2;
                ctx.strokeRect(sign.x, sign.y, sign.width, sign.height);
            }

            // [F] 상호작용 표시
            if (inRange) {
                ctx.fillStyle    = 'white';
                ctx.font         = `bold 13px monospace`;
                ctx.textAlign    = 'center';
                ctx.fillText('[F]', signCX, sign.y - 10);
                ctx.textAlign    = 'left';
            }
        } else {
            // ── 기존 표지판 렌더링 ─────────────────────────────────
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

            if (inRange) {
                ctx.fillStyle = 'white';
                ctx.font      = 'bold 13px monospace';
                ctx.fillText('[F]', signCX, sign.y - 10);
            }
            ctx.textAlign = 'left';
        }
    });

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
    const deathKey = getDeathPlayerKey();
    const introKey = getIntroPlayerKey();
    // 보스 페이즈2 전환 중 — 스프라이트 완전 고정 (idle/jump2만 허용)
    const _bossHalfFrozen = bossHalfSeq.phase !== 'idle' && bossHalfSeq.phase !== 'done';
    if (_bossHalfFrozen) {
        currentKey = player.grounded ? 'PLAYER_STAND' : 'PLAYER_JUMP2';
    } else if (deathKey) {
        // 사망 연출 중: 스프라이트 고정
        currentKey = deathKey;
        if (deathKey === 'PLAYER_FALL_DOWN') player.direction = 'left';
    } else if (introKey) {
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
    if (_bossHalfFrozen) {
        // 페이즈 전환 중 — 플레이어 항상 표시 (깜빡임 없음)
        blinkVisible = true;
    } else if (player.ultPhase === 'vanish') {
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
        // PLAYER_WAKE_UP은 사망 연출 전용 — 항상 좌우반전(right) 방향으로 그림
        const drawDir = (currentKey === 'PLAYER_WAKE_UP') ? 'right' : player.direction;
        drawSprite(currentKey, drawX, drawY, drawWidth, drawHeight, drawDir, alpha);
    }

    // 7-5-1: 순간이동 잔상
    updateTeleportTrails();
    drawTeleportTrails();
    drawUltParticles();
    drawSlashEffects();
    drawBossStoneParticles();
    drawBossRoarRings();
    drawP2A3Shockwaves();
    // p2 공격4 이펙트 (gather, flash, spike)
    {
        const _b4 = enemies.find(e => e.type === 'boss' && e._p2Attack === 'atk4');
        if (_b4) drawP2A4Effects(_b4);
    }
    // p2 공격3 강화 기모으기 파티클 (별도 배열, 고정 타겟)
    drawP2A3GatherParticles();
    // 세이브포인트 회복 이펙트 (월드 좌표계)
    savepointEffect.draw();

    // 출입구 잠금/해제 표시
    drawMapTransitionDoors();

    // 7-6: 적 렌더링
    drawEnemies();
    drawDummies();
    // 7-7: 투사체
    projectile.draw();

    // 7-7b: 구덩이 오버레이 — 플레이어/적을 덮어야 하므로 마지막에 렌더
    if (currentMapIndex === 4) {
        const pitX1 = 0, pitX2 = 400, pitY = 660;
        // 그라데이션 (바닥 상단부)
        const pitGrad = ctx.createLinearGradient(pitX1, pitY, pitX1, pitY + 60);
        pitGrad.addColorStop(0,   'rgba(0, 0, 0, 0.92)');
        pitGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.6)');
        pitGrad.addColorStop(1,   'rgba(0, 0, 0, 0.0)');
        ctx.fillStyle = pitGrad;
        ctx.fillRect(pitX1, pitY, pitX2 - pitX1, 60);
        // 구덩이 아래 완전 검정
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fillRect(pitX1, pitY + 60, pitX2 - pitX1, world.height - pitY - 60);
        // 오른쪽 가장자리
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(pitX2, pitY, 4, 20);
    }

    ctx.restore();

    // 7-8: UI / 대화창 — DPR 배율 적용 (UI 좌표는 논리 픽셀 기준 그대로 유지)
    ctx.save();
    ctx.scale(DPR, DPR);
    if (!isDeathActive()) {
        if (typeof drawUI       === 'function') drawUI();
        if (typeof drawBossHpBar === 'function') drawBossHpBar();
        bossHalfSeq.draw();
        if (typeof drawDialogue === 'function') drawDialogue();
        if (typeof drawTutorial === 'function') drawTutorial();
        drawIntroHint();
        drawMoveHint();
        drawTutHint();
        drawDashHint();
        drawTeleHint();
        drawCombatTutHint();
        drawSavepointHint();
        drawUltimate();
        // 일시정지 메뉴 (최상단 UI)
        drawPauseMenu();
    }
    ctx.restore();

    // 7-9: 페이드 오버레이
    if (mapTransition.alpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${mapTransition.alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // 천장 전환 페이드 오버레이 (점프 모션 위에 덮어씌움)
    if (ceilingTransition.alpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${ceilingTransition.alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // 사망 연출 암전 오버레이 (최상단)
    drawDeathOverlay();
    // 균열 연출 (crack 단계: 스냅샷 위에 금 선 표시)
    {
        const _crackBoss = enemies.find(e => e.type === 'boss' && e._fpCrackPhase === 'crack');
        if (_crackBoss) drawScreenCracks(_crackBoss);
    }
    // 화면 조각 이펙트 (사망·페이드 아래, 슬래시 위에 겹쳐 렌더)
    drawScreenShards();

    // 세이브포인트 이동 암전 오버레이
    if (pauseMenu.fadeAlpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${pauseMenu.fadeAlpha})`;
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
    // 보스 절반 연출 대화 진행 우선
    if (bossHalfSeq.phase === 'dialogue' || bossHalfSeq.phase === 'dialogue2') {
        bossHalfSeq.advance();
        return;
    }
    if (dialogue.active) {
        if (!dialogue.isFinished) {
            // 꾹 눌러도 OK: 현재 줄 텍스트 즉시 완성
            dialogue.displayText = dialogue.lines[dialogue.currentLine].text;
            dialogue.charIndex   = dialogue.displayText.length;
            dialogue.isFinished  = true;
        } else {
            // 다음 줄 진행은 이번 keydown이 "새로 눌린 것"일 때만 (fPressed 가드로 보장됨)
            dialogue.currentLine++;
            if (dialogue.currentLine >= dialogue.lines.length) {
                dialogue.active = false;
                // 보스맵(맵13) 대화 종료 시 체력바 등장 + 보스BGM 재생 + 보스 스폰
                if (currentMapIndex === 13 && !bossHpBar.visible) {
                    bossHpBar.startIntro();
                    bgmPlayer.play('BGM_BOSS1', true);
                // 보스 스폰 (맵 중앙)
                    enemies.push(createEnemy('boss', 960, 1020));
                }
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

    // 대화 중이 아닐 때만 sign/NPC 상호작용 트리거
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
    spawnY: 500,
    spawnDirection: '',
    groundSpawn: false
};

// ── 천장 점프 전환 시스템 (맵3 → 맵4) ──────────────────────────────────
// 점프 모션을 끊지 않고 암전 → 맵4 스폰 후 낙하 착지
const ceilingTransition = {
    active:   false,
    alpha:    0,
    phase:    'none',   // 'fadeOut' | 'switch' | 'fadeIn'
    speed:    0.07,
    savedDy:  0,        // 전환 시점의 dy 보존 (맵4에서 튀어오르는 느낌용)
    toMap:    4,
    spawnX:   640,
    spawnY:   60,       // 맵4 바닥 구멍 위에서 아래로 떨어지는 위치
};

// 맵3에서 플레이어가 천장(y=0)에 닿았을 때 전환 시작
function checkMap3CeilingTransition() {
    if (currentMapIndex !== 3) return;
    if (ceilingTransition.active || mapTransition.active) return;
    // 플레이어 머리가 y=0 이상으로 올라가면 트리거
    if (player.y <= 0 && player.dy < 0) {
        ceilingTransition.active  = true;
        ceilingTransition.phase   = 'fadeOut';
        ceilingTransition.alpha   = 0;
        ceilingTransition.savedDy = player.dy;   // 상승 속도 보존 (음수)
        // 스폰 x는 구멍 오른쪽에 치우친 위치(x=0~400 중 x=320)
        const pitCenterX = 320;  // 구덩이 오른쪽 치우침 (바닥 끝 x=400에 가깝게)
        ceilingTransition.spawnX = pitCenterX;
        ceilingTransition.spawnY = 100;  // 구멍 위에서 살짝 솟구쳤다 착지
    }
}

function updateCeilingTransition() {
    if (!ceilingTransition.active) return;

    if (ceilingTransition.phase === 'fadeOut') {
        ceilingTransition.alpha = Math.min(ceilingTransition.alpha + ceilingTransition.speed, 1);
        if (ceilingTransition.alpha >= 1) {
            ceilingTransition.phase = 'switch';
        }
    } else if (ceilingTransition.phase === 'switch') {
        // 맵 전환 실행
        projectile.reset();
        player.lastTeleportTime = 0;
        loadMap(ceilingTransition.toMap);
        // 구멍(x=0~400) 오른쪽 치우친 위치에서 — 바닥(y=540) 바로 아래에 스폰하고 오른쪽으로 솟구치는 연출
        player.x        = ceilingTransition.spawnX - player.width / 2;
        player.y        = 680;    // 바닥(660) 아래에서 시작
        player.dx       = 6;     // 오른쪽 수평 속도 (적당히) → 바닥에 착지
        player.dy       = -18;   // 강한 상향 속도 → 구덩이에서 솟구침
        player.pitLaunchTimer = 35; // 35프레임 동안 오른쪽 dx 강제 유지
        player.grounded = false;
        player.jumpCount = 2;    // 공중이므로 추가 점프 불가
        _snapCameraToPlayer();
        ceilingTransition.phase = 'fadeIn';
    } else if (ceilingTransition.phase === 'fadeIn') {
        ceilingTransition.alpha = Math.max(ceilingTransition.alpha - ceilingTransition.speed, 0);
        if (ceilingTransition.alpha <= 0) {
            ceilingTransition.alpha  = 0;
            ceilingTransition.phase  = 'none';
            ceilingTransition.active = false;
        }
    }
}

// 맵4 구멍에서 떨어질 때 맵3 최상단으로 복귀
function checkMap4PitFall() {
    if (currentMapIndex !== 4) return;
    if (ceilingTransition.active || mapTransition.active) return;
    // 맵4 바닥 구멍 영역(x=0~400)을 통해 바닥(y=540) 아래로 떨어지면
    const pitX1 = 0, pitX2 = 400;
    const pitY  = 665;   // 바닥 y=660보다 살짝 아래
    const inPitX = player.x + player.width > pitX1 && player.x < pitX2;
    if (inPitX && player.y > pitY && player.dy > 0) {
        // 암전 후 맵3 최상단으로 전환
        mapTransition.active = true;
        mapTransition.phase  = 'fadeOut';
        mapTransition.alpha  = 0;
        mapTransition.toMap  = 3;
        // 맵3 최상단 근처 (y=280 플랫폼 위) — x는 구멍 X 기준으로 맵3 폭에 클램프
        mapTransition.spawnX = Math.max(50, Math.min(player.x, 1200));
        mapTransition.spawnY = 160;   // 맵3 최상단 y=280 플랫폼 위 공중에서 낙하
    }
}

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

            // requireBossDefeated: 보스가 살아있는 동안 통과 불가
            if (tr.requireBossDefeated && enemies.some(e => e.type === 'boss' && !e.isDead)) break;

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
            mapTransition.spawnDirection = tr.direction;
            mapTransition.groundSpawn = !!tr.groundSpawn;
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
        } else if (tr.requireBossDefeated) {
            // 보스 생존 중엔 잠금
            cleared = !enemies.some(e => e.type === 'boss' && !e.isDead);
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
            if (mapTransition.spawnDirection) player.direction = mapTransition.spawnDirection;
            if (mapTransition.groundSpawn) {
                player.grounded = true;
                player.jumpCount = 0;
                player.jumpTimer = 0;
                player.hasAirAttacked = false;
                player.isDescending = false;
            }

            const logicalW = canvas.width  / SCALE;
            const logicalH = canvas.height / SCALE;
            camera.x = player.x - logicalW / 2 + player.width  / 2;
            camera.x = Math.max(0, Math.min(camera.x, Math.max(0, world.width - logicalW)));
            cameraY  = currentMapIndex === 13
                ? Math.max(0, world.height - logicalH)
                : player.y - logicalH / 2 + player.height / 2;
            cameraY  = Math.max(0, Math.min(cameraY, Math.max(0, world.height - logicalH)));

            mapTransition.phase = 'fadeIn';
        }
    } else if (mapTransition.phase === 'fadeIn') {
        // fadeIn 중에도 카메라를 플레이어에 즉시 스냅 (보간 튀는 현상 방지)
        const logicalW2 = canvas.width  / SCALE;
        const logicalH2 = canvas.height / SCALE;
        camera.x = player.x - logicalW2 / 2 + player.width  / 2;
        camera.x = Math.max(0, Math.min(camera.x, Math.max(0, world.width  - logicalW2)));
        cameraY  = currentMapIndex === 13
            ? Math.max(0, world.height - logicalH2)
            : player.y - logicalH2 / 2 + player.height / 2;
        cameraY  = Math.max(0, Math.min(cameraY,  Math.max(0, world.height - logicalH2)));

        mapTransition.alpha -= mapTransition.speed;
        if (mapTransition.alpha <= 0) {
            mapTransition.alpha  = 0;
            mapTransition.phase  = 'none';
            mapTransition.active = false;
            // 세이브포인트 이펙트 대기 중이면 전환 완료 후 발동
            if (savepointEffect.pending) {
                savepointEffect.pending = false;
                savepointEffect.trigger();
            }
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

// ══════════════════════════════════════════════════════════════════
// [BOSS HP BAR] 보스 체력바 시스템
// ══════════════════════════════════════════════════════════════════
const bossHpBar = {
    active:      false,
    visible:     false,
    hp:          1000,
    maxHp:       1000,

    // 등장 연출 상태
    introPhase:  'idle',
    bgAlpha:     0,
    fillRatio:   0,
    SLIDE_DUR:   18,
    FILL_DUR:    28,
    timer:       0,

    // 실제 HP: 맵13의 boss enemy와 동기화
    get ratio() {
        const boss = enemies.find(e => e.type === 'boss' && !e.isDead);
        if (boss) {
            this.hp    = boss.hp;
            this.maxHp = boss.maxHp;
        }
        return Math.max(this.hp, 0) / this.maxHp;
    },

    startIntro() {
        this.active     = true;
        this.visible    = true;
        this.introPhase = 'slideIn';
        this.bgAlpha    = 0;
        this.fillRatio  = 0;
        this.timer      = 0;
    },

    update() {
        if (!this.visible) return;
        if (this.introPhase === 'slideIn') {
            this.timer++;
            this.bgAlpha = Math.min(this.timer / this.SLIDE_DUR, 1);
            if (this.timer >= this.SLIDE_DUR) {
                this.introPhase = 'fillHp';
                this.timer = 0;
            }
        } else if (this.introPhase === 'fillHp') {
            this.timer++;
            this.fillRatio = Math.min(this.timer / this.FILL_DUR, 1);
            if (this.timer >= this.FILL_DUR) {
                this.introPhase = 'done';
                this.fillRatio  = 1;
            }
        }
    },

    draw(W, H) {
        if (!this.visible || this.bgAlpha <= 0) return;

        const barW   = W * 0.55;
        const barH   = 36;
        const barX   = (W - barW) / 2;
        const barY   = H - 80;
        const radius = 6;

        ctx.save();
        ctx.globalAlpha = this.bgAlpha;

        // 보스 이름
        ctx.font         = `bold 26px ${DIALOGUE_FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.strokeStyle  = 'rgba(0,0,0,1)';
        ctx.lineWidth    = 6;
        ctx.lineJoin     = 'round';
        ctx.strokeText('???', W / 2, barY - 14);
        ctx.fillStyle = 'rgba(255, 200, 200, 1)';
        ctx.fillText('???',   W / 2, barY - 14);

        // 바 바깥 테두리 (검은 테두리)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
        roundRect(ctx, barX - 4, barY - 4, barW + 8, barH + 8, radius + 2);
        ctx.fill();

        // 바 배경
        ctx.fillStyle = 'rgba(40, 8, 8, 0.95)';
        roundRect(ctx, barX, barY, barW, barH, radius);
        ctx.fill();

        // 빨간 체력 (등장 연출 시 fillRatio, 이후 ratio 사용)
        const displayRatio = this.introPhase !== 'done'
            ? this.fillRatio * this.ratio
            : this.ratio;

        if (displayRatio > 0) {
            const fillW = (barW - 6) * displayRatio;
            const grad  = ctx.createLinearGradient(barX, barY, barX, barY + barH);
            grad.addColorStop(0,   'rgba(240, 60,  40, 1)');
            grad.addColorStop(0.5, 'rgba(200, 30,  20, 1)');
            grad.addColorStop(1,   'rgba(150, 15,  15, 1)');
            ctx.fillStyle = grad;
            roundRect(ctx, barX + 3, barY + 3, fillW, barH - 6, radius - 1);
            ctx.fill();

            // 광택
            ctx.fillStyle = 'rgba(255, 140, 120, 0.22)';
            roundRect(ctx, barX + 3, barY + 3, fillW, (barH - 6) * 0.38, radius - 1);
            ctx.fill();
        }

        // 바 안쪽 테두리
        ctx.strokeStyle = 'rgba(180, 40, 40, 0.85)';
        ctx.lineWidth   = 2;
        roundRect(ctx, barX, barY, barW, barH, radius);
        ctx.stroke();

        ctx.restore();
    },
};

function drawBossHpBar() {
    if (currentMapIndex !== 13) return;
    if (!bossHpBar.visible) return;

    const W = LOGICAL_W;
    const H = LOGICAL_H;
    bossHpBar.update();
    bossHpBar.draw(W, H);
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
        detectRange:  500,
        loseRange:    900,
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
    boss: {
        width:          100,
        height:         130,
        hp:             2400,
        speed:          4.2,          // 플레이어(7)의 0.6배
        gravity:        0.9,
        detectRange:    1400,
        loseRange:      2000,
        attackRange:    168,  // 공격1 인식사거리
        attackDamage:   18,
        attackCooldown: 128,  // 공격1 쿨타임 (150 × 0.85)
        // 공격2 돌진 파라미터
        atk2Damage:     14,
        atk2Windup:     40,       // 공격2 딜레이 프레임
        atk2DashSpeed:  38,       // 돌진 초기 dx
        atk2DashDecay:  0.88,     // 매 프레임 dx에 곱하는 감쇄율
        atk2DashFrames: 35,       // 돌진 지속 프레임
        atk2PostDelay:  20,       // 돌진 후 후딜레이 프레임
        atk2Cooldown:   170,      // 공격2 전용 쿨타임 (200 × 0.85)
        // 도약
        leapCooldownMin: 126,
        leapCooldownMax: 294,
        leapWindup:      35,
        leapSpeed:       13,
        leapJumpPower:   14,
        // 공격3 파라미터
        atk3Damage:      22,
        atk3Cooldown:    450,    // 공격3 전용 쿨타임 (7.5초)
        atk3IdleNeeded:  120,    // 공격1/2 미발동 필요 프레임 (2초)
        atk3FarDist:     500,    // 발동 최소 거리
        atk3WindupDur:   40,     // 공중 정지(예고) 프레임
        atk3StrikeDur:   18,     // 내려찍기 프레임
        atk3PostDur:     30,     // 후딜레이 프레임
        atk3RangeX:      160,    // 착지 지점 기준 좌우 판정 반경
        atk3RangeY:      180,    // 착지 지점 기준 상하 판정 범위
        imgStand:    'BOSS_STAND',
        imgStand2:   'BOSS_STAND2',
        imgMove:     'BOSS_MOVE',
        imgAttack:   'BOSS_ATTACK',
        imgAtk1_1:   'BOSS_ATTACK1_1',
        imgAtk1_2:   'BOSS_ATTACK1_2',
        imgAtk1_3:   'BOSS_ATTACK1_3',
        imgAtk2_1:   'BOSS_ATTACK2_1',
        imgAtk2_2:   'BOSS_ATTACK2_2',
        imgAtk3_1:   'BOSS_ATTACK3_1',
        imgAtk3_2:   'BOSS_ATTACK3_2',
        imgAtk3_3:   'BOSS_ATTACK3_3',
        imgJump1:    'BOSS_JUMP1',
        imgJump2:    'BOSS_JUMP2',
        imgP2Jump1:  'BOSS_P2_JUMP1',
        imgP2Jump2:  'BOSS_P2_JUMP2',
        imgP2Atk1_1: 'BOSS_P2_ATTACK1_1',
        imgP2Atk1_2: 'BOSS_P2_ATTACK1_2',
        imgP2Atk3_1: 'BOSS_P2_ATTACK3_1',
        imgP2Atk3_2: 'BOSS_P2_ATTACK3_2',
        imgP2Atk4_1: 'BOSS_P2_ATTACK4_1',
        imgP2Atk4_1: 'BOSS_P2_ATTACK4_1',
        imgP2Atk4_1: 'BOSS_P2_ATTACK4_1',
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
            // 2페이즈 피해 감소 40%
            const actualDmg = (this.type === 'boss' && this._phase2Active)
                ? dmg * 0.6
                : dmg;
            // 보스 페이즈2 전환: 절반 이하로 깎일 때 절반까지만 깎고 트리거
            if (this.type === 'boss' && !this._phase2Triggered) {
                const halfHp = this.maxHp / 2;
                if (this.hp > halfHp) {
                    this.hp = Math.max(this.hp - actualDmg, halfHp);
                    if (this.hp <= halfHp) {
                        this._phase2Triggered = true;
                        bossHalfSeq.trigger();
                    }
                } else {
                    this.hp = Math.max(this.hp - actualDmg, 0);
                }
            } else {
                this.hp = Math.max(this.hp - actualDmg, 0);
            }
            this.hpVisible       = true;
            this.isInvincible    = true;
            this.invincibleTimer = 20;
            this.isAggro         = true;
            if (this.hp <= 0) this.isDead = true;
        }
    };

    // ── 타입별 추가 속성 합성 ─────────────────────────────────────────
    let result;
    if (type === 'enemy1') {
        result = Object.assign(base, {
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
    } else if (type === 'enemy2') {
        result = Object.assign(base, {
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
    } else if (type === 'boss') {
        result = Object.assign(base, {
            imgStand:      def.imgStand,
            imgStand2:     def.imgStand2,
            imgMove:       def.imgMove,
            imgAttack:     def.imgAttack,
            imgAtk1_1:     def.imgAtk1_1,
            imgAtk1_2:     def.imgAtk1_2,
            imgAtk1_3:     def.imgAtk1_3,
            imgAtk2_1:     def.imgAtk2_1,
            imgAtk2_2:     def.imgAtk2_2,
            imgAtk3_1:     def.imgAtk3_1,
            imgAtk3_2:     def.imgAtk3_2,
            imgAtk3_3:     def.imgAtk3_3,
            imgJump1:      def.imgJump1,
            imgJump2:      def.imgJump2,
            imgP2Jump1:    def.imgP2Jump1,
            imgP2Jump2:    def.imgP2Jump2,
            imgP2Atk1_1:   def.imgP2Atk1_1,
            imgP2Atk1_2:   def.imgP2Atk1_2,
            imgP2Atk3_1:   def.imgP2Atk3_1,
            imgP2Atk3_2:   def.imgP2Atk3_2,
            imgP2Atk4_1:   def.imgP2Atk4_1,
            imgP2Atk4_1:   def.imgP2Atk4_1,
            imgP2Atk4_1:   def.imgP2Atk4_1,
            // 공격2 파라미터
            atk2Damage:     def.atk2Damage,
            atk2Windup:     def.atk2Windup,
            atk2DashSpeed:  def.atk2DashSpeed,
            atk2DashDecay:  def.atk2DashDecay,
            atk2DashFrames: def.atk2DashFrames,
            atk2PostDelay:  def.atk2PostDelay,
            atk2Cooldown:   def.atk2Cooldown,
            // 공격2 런타임 상태
            _atk2Active:      false,
            _atk2Windup:      false,
            _atk2WindupTimer: 0,
            _atk2Dashing:     false,
            _atk2DashTimer:   0,
            _atk2DashDir:     1,
            _atk2PostTimer:   0,
            _atk2CooldownTimer: 0,
            // 공격3 파라미터
            atk3Damage:     def.atk3Damage,
            atk3Cooldown:   def.atk3Cooldown,
            atk3IdleNeeded: def.atk3IdleNeeded,
            atk3FarDist:    def.atk3FarDist,
            atk3WindupDur:  def.atk3WindupDur,
            atk3StrikeDur:  def.atk3StrikeDur,
            atk3PostDur:    def.atk3PostDur,
            atk3RangeX:     def.atk3RangeX,
            atk3RangeY:     def.atk3RangeY,
            // 공격3 런타임 상태
            _atk3Phase:         'none',  // 'none'|'jump'|'windup'|'strike'|'post'
            _atk3CooldownTimer: 360,    // 전투 시작 후 6초간 공격3 비활성화
            _atk3IdleTimer:     0,       // 공격1/2 미발동 누적 프레임
            _atk3TargetX:       0,       // 발동 당시 플레이어 X
            _atk3WindupTimer:   0,
            _atk3StrikeTimer:   0,
            _atk3PostTimer:     0,
            _atk3HitDone:       false,
            // 도약
            leapCooldownMin:  def.leapCooldownMin,
            leapCooldownMax:  def.leapCooldownMax,
            leapWindup:       def.leapWindup,
            leapSpeed:        def.leapSpeed,
            leapJumpPower:    def.leapJumpPower,
            leapTimer:        0,
            leapWindupTimer:  0,
            isLeapWindup:     false,
            isLeaping:        false,
            // 체력 절반 페이즈 전환
            _phase2Triggered: false,
            // 2페이즈 전투 효과
            _phase2Active:    false,   // 피해 감소 + 도트 데미지 활성화
            _dotTimer:        0,       // 도트 데미지 프레임 카운터
        });
    } else if (type === 'enemy3') {
        result = Object.assign(base, {
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
    } else {
        result = base;
    }

    // ── 스폰 즉시 플랫폼 위로 snap (gravity=0인 enemy2는 제외) ──────
    if (def.gravity > 0) {
        let bestPlat = null;
        let bestDist = Infinity;
        const foot = result.y + result.height;
        for (const plat of platforms) {
            const pt = plat.type || 'platform';
            if (pt === 'wall') continue;
            if (result.x + result.width > plat.x && result.x < plat.x + plat.width) {
                // 발 위치가 플랫폼 상단 위쪽에 있고 가장 가까운 플랫폼으로 snap
                if (foot <= plat.y + 4 && plat.y - foot < bestDist) {
                    bestDist = plat.y - foot;
                    bestPlat = plat;
                }
            }
        }
        if (bestPlat) {
            result.y        = bestPlat.y - result.height;
            result.dy       = 0;
            result.grounded = true;
        }
    }

    return result;
}

function updateEnemies() {
    if (isDeathActive()) return;   // 사망 연출 중 적 AI 정지
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
        if (e.type === 'boss' && e._atk2CooldownTimer > 0) e._atk2CooldownTimer--;

        // 2페이즈 도트 데미지: 매초(60프레임) 최대체력의 0.5%
        if (e.type === 'boss' && e._phase2Active && !e.isDead) {
            e._dotTimer = (e._dotTimer || 0) + 1;
            if (e._dotTimer >= 60) {
                e._dotTimer = 0;
                const dot = e.maxHp * 0.005;
                e.hp = Math.max(e.hp - dot, 0);
                if (e.hp <= 0) {
                    e.isDead = true;
                    bgmPlayer.stop(true);
                }
            }
        }

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
                        if (type === 'solid' || type === 'platform') {
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
                        player.hp              = Math.max(player.hp - Math.round(e.attackDamage * (bossPhase2.active ? 0.6 : 1)), 0);
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
                        // ── 배회 중 발판 끝 감지: 앞쪽 아래에 발판이 없으면 방향 반전 ──
                        if (e.grounded) {
                            const stepX  = e.patrolDir > 0 ? e.x + e.width + 4 : e.x - 4;
                            const footY  = e.y + e.height;
                            let floorAhead = false;
                            for (const plat of platforms) {
                                const pt = plat.type || 'platform';
                                if (pt === 'wall') continue;
                                if (stepX >= plat.x && stepX <= plat.x + plat.width &&
                                    footY >= plat.y - 4 && footY <= plat.y + plat.height + 2) {
                                    floorAhead = true;
                                    break;
                                }
                            }
                            if (!floorAhead) {
                                e.patrolDir   = -e.patrolDir;
                                e.patrolTimer = 0;
                            }
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
                } else if (type === 'solid' || type === 'platform') {
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
                        player.hp              = Math.max(player.hp - Math.round(e.attackDamage * (bossPhase2.active ? 0.6 : 1)), 0);
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

                // ── enemy2 플랫폼/바닥 충돌: 너무 아래로 내려가지 않도록 ──
                platforms.forEach(plat => {
                    const pt = plat.type || 'platform';
                    if (pt === 'wall') return;
                    if (e.x + e.width > plat.x && e.x < plat.x + plat.width &&
                        e.y + e.height >= plat.y && e.y + e.height <= plat.y + 30) {
                        e.y = plat.y - e.height;
                    }
                });
            }
        }

        // ── boss ─────────────────────────────────────────────────
        if (e.type === 'boss') {
            // 중력 (공격3 windup 중, drop/done 페이즈 중에는 자체 처리)
            const _skipGravity = e._finalPatternActive &&
                (e._finalPatternPhase === 'drop' || e._finalPatternPhase === 'done');
            if (e._atk3Phase !== 'windup' && !_skipGravity) {
                e.dy += e.gravity;
                if (e.dy > 22) e.dy = 22;
            }

            // 절반 연출 중: AI 정지 (물리만 처리)
            if (e._halfInvincible || (bossHalfSeq.phase !== 'idle' && bossHalfSeq.phase !== 'done')) {
                e.isInvincible    = true;
                e.invincibleTimer = 999;
                // jump 단계는 보스 스스로 이동 중이므로 물리 허용
                // 나머지 단계는 멈춤
                if (bossHalfSeq.phase !== 'jump') {
                    e.dx = 0;
                    e.state = 'idle';
                }
                // 물리/충돌만 처리하고 AI 스킵
                e.x += e.dx;
                e.y += e.dy;
                e.grounded = false;
                platforms.forEach(plat => {
                    const pt = plat.type || 'platform';
                    if (pt === 'wall') {
                        if (e.x + e.width > plat.x && e.x < plat.x + plat.width &&
                            e.y + e.height > plat.y && e.y < plat.y + plat.height) {
                            if (e.dx > 0) e.x = plat.x - e.width; else e.x = plat.x + plat.width;
                            e.dx = 0;
                        }
                    } else if (pt === 'solid' || pt === 'platform') {
                        if (pt === 'platform' && e._leapIgnorePlatforms) return;
                        if (e.x + e.width > plat.x && e.x < plat.x + plat.width &&
                            e.y + e.height >= plat.y && e.y + e.height <= plat.y + Math.max(20, e.dy + 1) && e.dy >= 0) {
                            e.y = plat.y - e.height; e.dy = 0; e.grounded = true;
                            e._leapIgnorePlatforms = false;
                        }
                    }
                });
                continue;
            }

            // 보스는 항상 어그로
            e.isAggro = true;

            // 플레이어 중심 기준 거리 (1·2페이즈 공통으로 미리 계산)
            const bpx = player.x + player.width  / 2;
            const bpy = player.y + player.height / 2;
            const bex = e.x + e.width  / 2;
            const bey = e.y + e.height / 2;
            const bdx = bpx - bex;   // 양수=플레이어가 오른쪽
            const bdy = bpy - bey;   // 양수=플레이어가 아래
            const absDX = Math.abs(bdx);
            const absDY = Math.abs(bdy);

            // ══════════════════════════════════════════════════════
            // ── 2페이즈 AI (1페이즈 패턴·점프 완전 우회) ────────────
            // ══════════════════════════════════════════════════════
            if (e._phase2Active) {
                // ── 체력 10% 미만: 마지막 패턴 강제 발동 ──
                if (!e._finalPatternActive && (e.hp / e.maxHp) < 0.10) {
                    _triggerBossFinalPattern(e);
                }
                // 마지막 패턴 진행 중이면 다른 패턴 모두 건너뜀
                if (e._finalPatternActive) {
                    _updateBossFinalPattern(e);
                    continue;   // 1페이즈 AI로 절대 넘어가지 않음
                } else {
                // 런타임 상태 초기화 (첫 프레임)
                if (e._p2a1Phase === undefined) {
                    e._p2a1Phase      = 'idle';
                    e._p2a1Timer      = 0;
                    e._p2a1DashDir    = 1;
                    e._p2a1HitDone    = false;
                    e._p2a1Visible    = true;
                    e._p2a1Cooldown   = 0;
                    e._p2a1SpawnY     = world.height - 60 - e.height;
                    e._p2Attack       = 'atk1';   // 현재 선택된 공격
                    e._p2AtkPool      = [];   // 랜덤 사이클 풀
                    e._p2CycleLastAtk = null; // 이전 사이클 마지막 기술 (경계 중복 방지)
                }
                if (e._p2a1Cooldown > 0) e._p2a1Cooldown--;

                // ══════════════════════════════════════════════════
                // ── p2_attack2: 투명 상태로 플레이어 위치 할퀴기 2회
                // ══════════════════════════════════════════════════
                if (e._p2Attack === 'atk2') {
                    // 초기화
                    if (e._p2a2Phase === undefined) {
                        e._p2a2Phase    = 'hidden1';
                        e._p2a2Timer    = 0;
                        e._p2a2Alpha    = 0;
                        // 1번·2번·3번 타겟/각도 독립 저장
                        e._p2a2Target1X = 0; e._p2a2Target1Y = 0; e._p2a2Angle1 = 0;
                        e._p2a2Target2X = 0; e._p2a2Target2Y = 0; e._p2a2Angle2 = 0;
                        e._p2a2Target3X = 0; e._p2a2Target3Y = 0; e._p2a2Angle3 = 0;
                        // 체력 30% 미만이면 3연속 공격 발동
                        e._p2a2TripleCombo = (e.hp / e.maxHp) < 0.30;
                    }

                    e.dx = 0;
                    e.dy = 0;
                    e.state = 'idle';
                    e._p2a1Alpha = e._p2a2Alpha;

                    if (e._p2a2Phase === 'hidden1') {
                        // 1번 타겟·각도 결정
                        e._p2a2Target1X = player.x + player.width  / 2;
                        e._p2a2Target1Y = player.y + player.height / 2;
                        e._p2a2Angle1   = ((Math.random() - 0.5) * 160) * Math.PI / 180;
                        e._p2a2Phase    = 'range1';
                        e._p2a2Timer    = 32;

                    } else if (e._p2a2Phase === 'range1') {
                        e._p2a2Alpha = 0;
                        e._p2a2Timer--;
                        if (e._p2a2Timer <= 0) {
                            spawnP2ClawAtTarget(e, e._p2a2Target1X, e._p2a2Target1Y, e._p2a2Angle1);
                            e._p2a2Phase = 'strike1';
                            e._p2a2Timer = 20;
                        }

                    } else if (e._p2a2Phase === 'strike1') {
                        e._p2a2Alpha = 0;
                        e._p2a2Timer--;
                        if (e._p2a2Timer <= 0) {
                            // 2번 타겟·각도 결정 (이전 각도와 최소 60도 차이 보장)
                            e._p2a2Target2X = player.x + player.width  / 2;
                            e._p2a2Target2Y = player.y + player.height / 2;
                            e._p2a2Angle2   = _p2a2NextAngle(e._p2a2Angle1);
                            e._p2a2Phase    = 'range2';
                            e._p2a2Timer    = 22;
                        }

                    } else if (e._p2a2Phase === 'range2') {
                        e._p2a2Alpha = 0;
                        e._p2a2Timer--;
                        if (e._p2a2Timer <= 0) {
                            spawnP2ClawAtTarget(e, e._p2a2Target2X, e._p2a2Target2Y, e._p2a2Angle2);
                            e._p2a2Phase = 'strike2';
                            e._p2a2Timer = 20;
                        }

                    } else if (e._p2a2Phase === 'strike2') {
                        e._p2a2Alpha = 0;
                        e._p2a2Timer--;
                        if (e._p2a2Timer <= 0) {
                            if (e._p2a2TripleCombo) {
                                // 체력 30% 미만: 3번째 공격으로 진행 (이전 각도와 최소 60도 차이 보장)
                                e._p2a2Target3X = player.x + player.width  / 2;
                                e._p2a2Target3Y = player.y + player.height / 2;
                                e._p2a2Angle3   = _p2a2NextAngle(e._p2a2Angle2);
                                e._p2a2Phase    = 'range3';
                                e._p2a2Timer    = 27;   // 3번째: 27f 표시
                            } else {
                                e._p2a2Phase    = undefined;
                                e._p2Attack     = 'atk1';
                                e._p2a1Phase    = 'idle';
                                e._p2a1Cooldown = 0;
                                e._p2a1Alpha    = 1;
                                e.x = world.width / 2 - e.width / 2;
                                e.y = world.height - 60 - e.height;
                            }
                        }
                    } else if (e._p2a2Phase === 'range3') {
                        e._p2a2Alpha = 0;
                        e._p2a2Timer--;
                        if (e._p2a2Timer <= 0) {
                            spawnP2ClawAtTarget(e, e._p2a2Target3X, e._p2a2Target3Y, e._p2a2Angle3, 1.3);
                            e._p2a2Phase = 'strike3';
                            e._p2a2Timer = 20;
                        }
                    } else if (e._p2a2Phase === 'strike3') {
                        e._p2a2Alpha = 0;
                        e._p2a2Timer--;
                        if (e._p2a2Timer <= 0) {
                            e._p2a2Phase    = undefined;
                            e._p2Attack     = 'atk1';
                            e._p2a1Phase    = 'idle';
                            e._p2a1Cooldown = 0;
                            e._p2a1Alpha    = 1;
                            e.x = world.width / 2 - e.width / 2;
                            e.y = world.height - 60 - e.height;
                        }
                    }

                    e.x += e.dx;
                    e.grounded = true;
                    continue;
                }

                // ══════════════════════════════════════════════════
                // ── p2_attack3: 순간이동 내려찍기 × 3회 + 충격파
                // ══════════════════════════════════════════════════
                if (e._p2Attack === 'atk3' && e._p2a3Phase !== undefined) {
                    e.dx = 0;

                    if (e._p2a3Phase === 'appear') {
                        // 플레이어 위 고정 높이에 순간이동 (투명→등장)
                        e._p2a3Timer--;
                        if (e._p2a3Enraged) updateP2A3GatherParticles();  // 기모으는 이펙트 유지
                        if (e._p2a3Timer === (e._p2a3Enraged ? 17 : 14)) {
                            // 위치 결정: 플레이어 X, 화면 상단 근처 고정 Y
                            const appearY = world.height - 60 - e.height - 320;
                            e.x = Math.max(10, Math.min(world.width - e.width - 10,
                                player.x + player.width / 2 - e.width / 2));
                            e.y = appearY;
                            e.dy = 0;
                            e.direction = bdx >= 0 ? 'right' : 'left';
                            e._p2a1Visible = true;
                            e._p2a1Alpha   = 1;
                            // 강화 3번째: 보스 위치 확정 직후 스폰 (타겟 = 현재 보스 위치)
                            if (e._p2a3Enraged) spawnP2A3GatherParticles(e);
                        }
                        e.state = 'idle';
                        if (e._p2a3Timer <= 0) {
                            e._p2a3Phase       = 'windup';
                            e._p2a3WindupTimer = 17;
                            e._p2a3HitDone     = false;
                            // windup 진입 시 파티클 강제 소거
                            p2a3GatherParticles.length = 0;
                        }

                    } else if (e._p2a3Phase === 'windup') {
                        // 공중 정지 예고
                        e.state = 'attack';
                        e.dy = 0;
                        e._p2a3WindupTimer--;
                        if (e._p2a3WindupTimer <= 0) {
                            e._p2a3Phase = 'strike';
                        }

                    } else if (e._p2a3Phase === 'strike') {
                        // 빠른 낙하
                        e.state = 'attack';
                        e.dy = 30;
                        e.y += e.dy;

                        // 하강 중 히트
                        if (!e._p2a3HitDone) {
                            const px3 = player.x + player.width  / 2;
                            const py3 = player.y + player.height / 2;
                            if (Math.abs(px3 - (e.x + e.width / 2)) < e.atk3RangeX &&
                                py3 > e.y + e.height - e.atk3RangeY && !player.isInvincible) {
                                player.hp = Math.max(0, player.hp - Math.round(e.atk3Damage));
                                player.isInvincible = true; player.invincibleTimer = 60;
                                player.dx = (px3 - (e.x + e.width/2) > 0 ? 1 : -1) * 9;
                                player.dy = -8;
                                e._p2a3HitDone = true;
                            }
                        }

                        // 바닥에만 착지 (플랫폼 무시)
                        let p2a3Landed = false;
                        const groundY3 = world.height - 60 - e.height;
                        if (e.y >= groundY3) { e.y = groundY3; p2a3Landed = true; }

                        if (p2a3Landed) {
                            e.dy = 0;
                            playSoundImmediate('BOSS_ATTACK3_3');
                            // 착지 히트 (미명중 시)
                            if (!e._p2a3HitDone) {
                                e._p2a3HitDone = true;
                                const px3 = player.x + player.width / 2;
                                const py3 = player.y + player.height / 2;
                                if (Math.abs(px3 - (e.x + e.width / 2)) < e.atk3RangeX &&
                                    py3 > e.y + e.height - e.atk3RangeY && !player.isInvincible) {
                                    player.hp = Math.max(0, player.hp - Math.round(e.atk3Damage));
                                    player.isInvincible = true; player.invincibleTimer = 60;
                                    player.dx = (px3 - (e.x + e.width/2) > 0 ? 1 : -1) * 9;
                                    player.dy = -8;
                                }
                            }
                            // 돌 파티클
                            spawnBossStoneParticles(
                                e.x + e.width / 2 - e.atk3RangeX, e.atk3RangeX * 2,
                                e.y + e.height - 60, e.y + e.height,
                                e._p2a3Enraged ? 16 : 5);  // 강화: 3배 이상
                            // 충격파 스폰
                            _spawnP2A3Shockwave(e, e._p2a3Enraged);
                            e._p2a3Phase      = 'shockwave';
                            e._p2a3PostTimer  = 8;   // 매우 짧은 후딜 후 사라짐
                        }

                    } else if (e._p2a3Phase === 'shockwave') {
                        e.state = 'attack';
                        e._p2a3PostTimer--;
                        if (e._p2a3PostTimer <= 0) {
                            e._p2a3RepCount++;
                            const isEnraged3rd = e._p2a3RepCount === 2 && e.hp / e.maxHp < 0.30;
                            if (e._p2a3RepCount < 3) {
                                // 다음 회차
                                e._p2a3Phase  = 'appear';
                                e._p2a3Timer  = isEnraged3rd ? 32 : 15;  // 3번째 30%미만: 준비 2배
                                e._p2a3Enraged = isEnraged3rd;            // 강화 플래그
                                e._p2a1Visible = false;
                                e._p2a1Alpha   = 0;
                                // 강화 3번째: 기모으는 이펙트 시작
                                // 강화 3번째: 기모으는 이펙트는 appear 위치 확정 시 스폰
                                if (isEnraged3rd) p2a3GatherParticles.length = 0;
                            } else {
                                // 3회 완료 → idle
                                e._p2a3Phase   = undefined;
                                e._p2a3Enraged = false;
                                e._p2Attack    = 'atk1';
                                e._p2LastAttack = 'atk3';
                                e._p2a1Phase   = 'idle';
                                e._p2a1Cooldown = 0;
                                e._p2a1Visible  = true;
                                e._p2a1Alpha    = 1;
                                e.x = world.width / 2 - e.width / 2;
                                e.y = world.height - 60 - e.height;
                            }
                        }
                    }

                    e.grounded = true;
                    continue;
                }

                // ══════════════════════════════════════════════════
                // ── p2_attack4: 맵중앙 등장 → 모으기 → 십자반짝 → 바닥가시
                // ══════════════════════════════════════════════════
                if (e._p2Attack === 'atk4' && e._p2a4Phase !== undefined) {
                    e.dx = 0; e.dy = 0;

                    if (e._p2a4Phase === 'appear') {
                        // 모으기: 보스 고정, 원형 파티클이 중앙으로 모여듦 (이펙트만)
                        e.state = 'attack';
                        if (e._p2a4Timer === 49) spawnP2A4GatherParticles(e);  // 첫 프레임
                        updateP2A4GatherParticles(e);
                        e._p2a4Timer--;
                        if (e._p2a4Timer <= 0) {
                            e._p2a4Phase     = 'flash';
                            e._p2a4FlashTimer = 42;
                            // 가시 위치 미리 결정 (일정 간격)
                            const spikeGap  = 151;
                            const spikeCount = Math.floor(world.width / spikeGap) + 1;
                            e._p2a4Spikes = [];
                            for (let si = 0; si < spikeCount; si++) {
                                e._p2a4Spikes.push({ x: si * spikeGap + spikeGap / 2 });
                            }
                        }

                    } else if (e._p2a4Phase === 'flash') {
                        // 십자 반짝 + 범위 표시
                        e.state = 'attack';
                        e._p2a4FlashTimer--;
                        if (e._p2a4FlashTimer <= 0) {
                            e._p2a4Phase      = 'spike';
                            e._p2a4SpikeTimer = 55;   // 가시 유지 시간
                            e._p2a4SpikeUp    = true;
                            // 가시 피해 판정
                            e._p2a4Spikes.forEach(sp => {
                                const sw = 13;
                                if (player.x + player.width > sp.x - sw &&
                                    player.x < sp.x + sw && !player.isInvincible) {
                                    player.hp = Math.max(0, player.hp - (e.atk3Damage || 25));
                                    player.isInvincible = true;
                                    player.invincibleTimer = 60;
                                    player.dy = -10;
                                }
                            });
                        }

                    } else if (e._p2a4Phase === 'spike') {
                        e.state = 'attack';
                        e._p2a4SpikeTimer--;
                        if (e._p2a4SpikeTimer <= 0) {
                            // 종료 → idle
                            e._p2a4Phase    = undefined;
                            e._p2a4Spikes   = null;
                            e._p2a4SpikeUp  = false;
                            e._p2Attack     = 'atk1';
                            e._p2LastAttack = 'atk4';
                            e._p2a1Phase    = 'idle';
                            e._p2a1Cooldown = 0;
                        }
                    }

                    e.grounded = true;
                    continue;
                }

                // ── 각 단계 처리 ──────────────────────────────────
                if (e._p2a1Phase === 'idle') {
                    e._p2a1Visible = true;
                    e.dx = 0;
                    e.state = 'idle';
                    e.direction = bdx >= 0 ? 'right' : 'left';
                    if (e._p2a1Cooldown <= 0) {
                        // ── 랜덤 중복없는 사이클 풀 (사이클 경계 중복 방지 포함) ──
                        if (!e._p2AtkPool || e._p2AtkPool.length === 0) {
                            // 풀이 비면 셔플. 단, 새 사이클 첫 번째가 이전 사이클 마지막과 같으면 재셔플
                            const all = ['atk1', 'atk2', 'atk3', 'atk4'];
                            let shuffled;
                            do {
                                shuffled = [...all];
                                for (let i = shuffled.length - 1; i > 0; i--) {
                                    const j = Math.floor(Math.random() * (i + 1));
                                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                                }
                            } while (shuffled[0] === e._p2CycleLastAtk);
                            e._p2AtkPool = shuffled;
                        }
                        const nextAtk = e._p2AtkPool.shift();
                        // 풀이 소진되면 이번 사이클 마지막 기술 기록
                        if (e._p2AtkPool.length === 0) e._p2CycleLastAtk = nextAtk;
                        e._p2LastAttack = nextAtk;
                        e._p2Attack = nextAtk;
                        if (nextAtk === 'atk1') {
                            e._p2a1Phase = 'vanish';
                            e._p2a1Timer = 23;
                        } else if (nextAtk === 'atk2') {
                            e._p2a2Phase = undefined;
                            e._p2a2Round = 0;
                            e._p2a1Alpha = 0;
                        } else if (nextAtk === 'atk3') {
                            e._p2a3Phase    = 'appear';
                            e._p2a3RepCount = 0;
                            e._p2a3Timer    = 18;
                            e._p2a1Visible  = false;
                        } else {
                            // atk4 시작
                            e._p2a4Phase  = 'appear';
                            e._p2a4Timer  = 50;   // 모으기 시간
                            e.x = world.width / 2 - e.width / 2;
                            e.y = world.height - 60 - e.height;
                            e._p2a1Visible = true;
                            e._p2a1Alpha   = 1;
                        }
                    }

                } else if (e._p2a1Phase === 'vanish') {
                    e.dx = 0;
                    e.state = 'idle';
                    e._p2a1Timer--;
                    if (e._p2a1Timer <= 0) {
                        // ── 플레이어 위치 감지 ──────────────────────────
                        const floorY     = world.height - 60;           // 1020 (바닥 상단)
                        const platY      = 820;                         // 보스맵 플랫폼 상단
                        const playerFoot = player.y + player.height;
                        const onPlatform = player.grounded && playerFoot < floorY - 10;
                        // 플레이어 중심이 플랫폼 상단보다 위쪽일 때만 플랫폼 레인 조준
                        // (점프 중이라도 플랫폼 y보다 낮으면 바닥 레인)
                        const abovePlat  = player.y + player.height / 2 < platY;

                        e._p2a1SpawnY = (onPlatform || abovePlat)
                            ? platY - e.height       // 플랫폼 위 스윕 (y≈690)
                            : floorY - e.height;     // 바닥 스윕 (y≈890)

                        // 맵 양끝 중 무작위 선택
                        const spawnLeft = Math.random() < 0.5;
                        if (spawnLeft) {
                            e.x            = 30;
                            e._p2a1DashDir = 1;
                            e.direction    = 'right';
                        } else {
                            e.x            = world.width - e.width - 30;
                            e._p2a1DashDir = -1;
                            e.direction    = 'left';
                        }
                        // 대각선 위 시작: 돌진 반대 방향으로 살짝 + 스윕 높이보다 위쪽에서 등장
                        const dropHeight = 80;   // 스윕Y보다 위쪽 시작 거리
                        e.y  = e._p2a1SpawnY - dropHeight;
                        e.dy = 0;
                        e.dx = 0;
                        // 등장 하강 속도 계산: dropHeight를 appearTimer 프레임 안에 도달
                        e._p2a1AppearDy  =  dropHeight / 16;   // 매 프레임 하강량
                        e._p2a1AppearDx  =  e._p2a1DashDir * 3; // 돌진 방향으로 살짝
                        e._p2a1Phase = 'appear';
                        e._p2a1Timer = 16;
                    }

                } else if (e._p2a1Phase === 'appear') {
                    // 대각선 위에서 빠르게 스윕 높이로 내려오며 등장
                    e.dx    = e._p2a1AppearDx;
                    e.dy    = e._p2a1AppearDy;
                    e.state = 'jump2';   // 하강 자세
                    e._p2a1Timer--;
                    // y가 스윕 높이에 도달하거나 타이머 종료 시 windup
                    if (e.y + e.dy >= e._p2a1SpawnY || e._p2a1Timer <= 0) {
                        e.y            = e._p2a1SpawnY;   // 정확히 스윕 높이에 snap
                        e.dx           = 0;
                        e.dy           = 0;
                        e._p2a1Phase    = 'windup';
                        e._p2a1Timer    = e._p2a1IsEnrage ? 19 : 38;   // 격노 연속공격은 절반
                        e._p2a1IsEnrage = false;   // 소모 후 리셋
                        e._p2a1HitDone  = false;
                        playSound('BOSS_ATTACK1_1');
                    }

                } else if (e._p2a1Phase === 'windup') {
                    e.dx = 0;
                    e.state = 'attack';   // atk2_1 모션
                    e._p2a1Timer--;
                    if (e._p2a1Timer <= 0) {
                        e._p2a1Phase     = 'dash';
                        e._p2a1Timer     = 120;   // 최대 프레임 (벽 도달이 우선)
                        e._p2a1DashSpeed = 110;
                        e.dx = e._p2a1DashDir * e._p2a1DashSpeed;
                        playSoundImmediate('BOSS_ATTACK2_2');
                    }

                } else if (e._p2a1Phase === 'dash') {
                    e.state = 'attack';
                    e.dx = e._p2a1DashDir * e._p2a1DashSpeed;
                    e.y  = e._p2a1SpawnY;
                    e.dy = 0;
                    e._p2a1Timer--;

                    // 잔상 이펙트
                    if (e._p2a1Timer % 2 === 0) {
                        const _savedDir = e._atk2DashDir;
                        e._atk2DashDir = e._p2a1DashDir;
                        spawnBossDashSlash(e, true);
                        e._atk2DashDir = _savedDir;
                    }

                    // 돌진 종료 0.3초(18f) 전부터 범위 표시 시작
                    const reachedWall = e._p2a1DashDir > 0
                        ? e.x + e.width >= world.width - 30
                        : e.x <= 30;
                    if (!e._p2a1PreChaseActive && (reachedWall || e._p2a1Timer <= 18)) {
                        e._p2a1PreChaseActive = true;
                        e._p2a1PreChaseTimer  = 18;   // 범위 표시 남은 시간
                    }
                    if (e._p2a1PreChaseActive && e._p2a1PreChaseTimer > 0) {
                        e._p2a1PreChaseTimer--;
                    }

                    // 피해 판정
                    if (!player.isInvincible) {
                        const pOvX = player.x + player.width  > e.x && player.x < e.x + e.width;
                        const pOvY = player.y + player.height > e.y && player.y < e.y + e.height;
                        if (pOvX && pOvY) {
                            player.hp              = Math.max(player.hp - Math.round(e.atk2Damage * 0.6), 0);
                            player.isInvincible    = true;
                            player.invincibleTimer = 60;
                            player.dx = e._p2a1DashDir * 12;
                            player.dy = -7;
                            e._p2a1HitDone = true;
                        }
                    }

                    // 벽 도달 또는 타이머 종료 → post
                    if (reachedWall || e._p2a1Timer <= 0) {
                        e.dx = 0;
                        e._p2a1Phase         = 'post';
                        e._p2a1Timer         = 52;
                        e._p2a1PreChaseActive = false;
                        e.state = 'attack';
                    }

                } else if (e._p2a1Phase === 'post') {
                    // ── post: chase(후속타 즉시 시작) → wait ──
                    if (e._p2a1PostSub === undefined) {
                        e._p2a1PostSub      = 'chase';
                        e._p2a1PostSubTimer = 0;   // 즉시 첫 slash
                        e._p2a1ChaseCount   = 0;
                        e._p2a1PostFlash    = false;
                    }
                    e.dx    = 0;
                    e.dy    = 0;
                    e.state = 'jump1';

                    if (e._p2a1PostSub === 'preshow') {
                        // 범위만 표시, 후속타 아직 없음
                        e._p2a1PostSubTimer--;
                        if (e._p2a1PostSubTimer <= 0) {
                            e._p2a1PostSub      = 'chase';
                            e._p2a1PostSubTimer = 0;   // 즉시 첫 번째 slash
                        }
                    } else if (e._p2a1PostSub === 'chase') {
                        e._p2a1PostSubTimer--;
                        // 5프레임 간격으로 slash 7개 순차 발사
                        if (e._p2a1PostSubTimer <= 0 && e._p2a1ChaseCount < 7) {
                            spawnP2ChaseSlash(e, e._p2a1ChaseCount);
                            e._p2a1ChaseCount++;
                            e._p2a1PostSubTimer = 5;
                        }
                        // 7개 모두 발사 후 대기
                        if (e._p2a1ChaseCount >= 7 && e._p2a1PostSubTimer <= 0) {
                            e._p2a1PostSub      = 'wait';
                            e._p2a1PostSubTimer = 28;
                        }
                    } else if (e._p2a1PostSub === 'wait') {
                        e._p2a1PostSubTimer--;

                        // 체력 30% 미만: wait 종료 0.3초(18f) 전에 재공격 시작
                        const hpRatio = e.hp / e.maxHp;
                        if (hpRatio < 0.30 && !e._p2a1EnrageUsed && e._p2a1PostSubTimer === 10) {
                            e._p2a1EnrageUsed = true;

                            e._p2a1DashDir = -e._p2a1DashDir;
                            e.direction = e._p2a1DashDir > 0 ? 'right' : 'left';

                            const floorY    = world.height - 60;
                            const platY     = 820;
                            const floorSpawnY = floorY - e.height;   // ≈ 890
                            const platSpawnY  = platY  - e.height;   // ≈ 690
                            const midSpawnY   = (floorSpawnY + platSpawnY) / 2;  // ≈ 790

                            // 현재 spawnY가 중간값보다 위면 플랫폼, 아래면 바닥
                            const wasOnPlat = e._p2a1SpawnY < midSpawnY;
                            e._p2a1SpawnY = wasOnPlat ? floorSpawnY : platSpawnY;

                            const dropHeight = 80;
                            e.x = e._p2a1DashDir > 0 ? 30 : world.width - e.width - 30;
                            e.y  = e._p2a1SpawnY - dropHeight;
                            e.dy = 0;
                            e.dx = 0;
                            e._p2a1AppearDy  = dropHeight / 16;
                            e._p2a1AppearDx  = e._p2a1DashDir * 3;
                            e._p2a1Alpha     = 0;
                            e._p2a1Phase     = 'appear';
                            e._p2a1Timer     = 16;
                            e._p2a1HitDone   = false;
                            e._p2a1PostSub   = undefined;
                            e._p2a1IsEnrage  = true;   // windup 절반 적용 플래그
                        } else if (e._p2a1PostSubTimer <= 0) {
                            e._p2a1PostSub    = undefined;
                            e._p2a1EnrageUsed = false;
                            e._p2a1Phase      = 'endvanish';
                            e._p2a1Timer      = 10;
                            e._p2a1EvDx       = e._p2a1DashDir * 6;
                            e._p2a1EvDy       = -9;
                        }
                    }

                } else if (e._p2a1Phase === 'endvanish') {
                    // 대각선 위로 이동하며 빠르게 투명해짐
                    e.dx    = e._p2a1EvDx;
                    e.dy    = e._p2a1EvDy;
                    e.state = 'jump1';
                    e._p2a1Timer--;
                    if (e._p2a1Timer <= 0) {
                        const groundY = world.height - 60 - e.height;
                        e.x  = world.width / 2 - e.width / 2;
                        e.y  = groundY;
                        e.dy = 0;
                        e.dx = 0;
                        e.direction     = bdx >= 0 ? 'right' : 'left';
                        e._p2a1Phase    = 'idle';
                        e._p2a1Cooldown = 0;
                        e._p2a1Visible  = true;
                    }
                }

                // 투명도 계산
                if (e._p2a1Phase === 'vanish') {
                    e._p2a1Alpha = e._p2a1Timer / 23;
                } else if (e._p2a1Phase === 'appear') {
                    // 타이머 기반 단순 페이드인 (0→1)
                    e._p2a1Alpha = Math.min(1, 1 - (e._p2a1Timer / 16));
                } else if (e._p2a1Phase === 'endvanish') {
                    e._p2a1Alpha = e._p2a1Timer / 10;   // 10f 만에 0으로
                } else {
                    e._p2a1Alpha = 1;
                }

                // 위치 업데이트 (endvanish·appear는 y도 이동, 나머지는 y 고정)
                e.x += e.dx;
                if (e._p2a1Phase === 'endvanish' || e._p2a1Phase === 'appear') {
                    e.y += e.dy;
                } else {
                    e.dy = 0;
                }
                e.grounded = (e._p2a1Phase !== 'endvanish' && e._p2a1Phase !== 'appear');

                continue;   // 1페이즈 AI 전체 건너뜀
                } // end else (finalPattern 아닐 때)
            }
            // ══════════════════════════════════════════════════════
            // ── 1페이즈 AI (이하 기존 코드 유지) ─────────────────────
            // ══════════════════════════════════════════════════════

            if (e.leapTimer > 0) e.leapTimer--;
            if (e._atk3CooldownTimer > 0) e._atk3CooldownTimer--;

            // 공격3 아이들 타이머: 공격1/2가 활성화되지 않은 프레임 누적
            const atk12Active = e.attackTimer > 0 || e._atk2Active || e._atk3Phase !== 'none';
            if (atk12Active) {
                e._atk3IdleTimer = 0;
            } else {
                e._atk3IdleTimer++;
            }

            // 플레이어가 플랫폼(공중) 위에 있는지 판정
            const playerOnPlatform = player.grounded &&
                                     (player.y + player.height) < (world.height - 65);

            // ── 상태 머신 ────────────────────────────────────────

            // ── 공격3 상태머신 ─────────────────────────────────────
            if (e._atk3Phase === 'jump') {
                // ── 공격3 전용 점프 비행 (일반 도약과 완전 분리) ──────
                e.state = e.dy < 0 ? 'jump1' : 'jump2';
                const bexNow = e.x + e.width / 2;
                const distToTarget = e._atk3TargetX - bexNow;
                const overshot = e._atk3DashDir > 0
                    ? bexNow >= e._atk3TargetX
                    : bexNow <= e._atk3TargetX;
                // 상승 중(dy < 0)에는 windup 전환 금지 — 최소 포물선 보장
                if ((overshot || Math.abs(distToTarget) < 10) && e.dy >= 0) {
                    e.dx = 0;
                    e.dy = 0;
                    e._atk3Phase       = 'windup';
                    e._atk3WindupTimer = e.atk3WindupDur;
                    e._atk3HitDone     = false;
                }

            } else if (e._atk3Phase === 'windup') {
                // 공중 정지 + 공격 예고
                e.state = 'attack';   // atk1_1 스프라이트 재활용
                e.dx    = 0;
                e.dy    = 0;          // 중력 무효
                e._atk3WindupTimer--;
                if (e._atk3WindupTimer <= 0) {
                    e._atk3Phase       = 'strike';
                    e._atk3StrikeTimer = e.atk3StrikeDur;
                }

            } else if (e._atk3Phase === 'strike') {
                // 내려찍기: 빠르게 하강
                e.state = 'attack';
                e.dx    = 0;
                e.dy    = 28;         // 강제 낙하 속도
                e._atk3StrikeTimer--;

                // ── 하강 중 매 프레임 공격 판정 ────────────────────
                {
                    const strikeX  = e.x + e.width  / 2;
                    const strikeY  = e.y + e.height;
                    const px3      = player.x + player.width  / 2;
                    const py3      = player.y + player.height / 2;
                    const inX3     = Math.abs(px3 - strikeX) < e.atk3RangeX;
                    const inY3     = py3 > strikeY - e.atk3RangeY && py3 < strikeY + 40;
                    if (inX3 && inY3 && !player.isInvincible) {
                        player.hp              = Math.max(player.hp - Math.round(e.atk3Damage * (bossPhase2.active ? 0.6 : 1)), 0);
                        player.isInvincible    = true;
                        player.invincibleTimer = 60;
                        player.dx = (px3 - strikeX > 0 ? 1 : -1) * 9;
                        player.dy = -8;
                        e._atk3HitDone = true;   // 하강 중 명중 시 착지 판정 생략
                    }
                }

                // 착지 or 타이머 종료 시 후딜로 전환
                if (e.grounded || e._atk3StrikeTimer <= 0) {
                    e.dy = 0;
                    e._atk3Phase     = 'post';
                    e._atk3PostTimer = e.atk3PostDur;
                    playSoundImmediate('BOSS_ATTACK3_3');

                    // 착지 순간 판정 (하강 중 미명중 시 1회)
                    if (!e._atk3HitDone) {
                        e._atk3HitDone = true;
                        const landX  = e.x + e.width  / 2;
                        const landY  = e.y + e.height;
                        const px3    = player.x + player.width  / 2;
                        const py3    = player.y + player.height / 2;
                        const inX3   = Math.abs(px3 - landX) < e.atk3RangeX;
                        const inY3   = py3 > landY - e.atk3RangeY && py3 < landY + 20;
                        if (inX3 && inY3 && !player.isInvincible) {
                            player.hp              = Math.max(player.hp - Math.round(e.atk3Damage * (bossPhase2.active ? 0.6 : 1)), 0);
                            player.isInvincible    = true;
                            player.invincibleTimer = 60;
                            player.dx = (px3 - landX > 0 ? 1 : -1) * 9;
                            player.dy = -8;
                        }
                        // 착지 돌 파티클
                        spawnBossStoneParticles(
                            landX - e.atk3RangeX,
                            e.atk3RangeX * 2,
                            landY - 60,
                            landY
                        );
                    }
                }

            } else if (e._atk3Phase === 'post') {
                // 후딜레이
                e.state = 'attack';   // atk1_3 스프라이트
                e.dx    = 0;
                e._atk3PostTimer--;
                if (e._atk3PostTimer <= 0) {
                    e._atk3Phase            = 'none';
                    e._atk3CooldownTimer    = e.atk3Cooldown;
                    e._leapIgnorePlatforms  = false;
                }

            // ── 공격2 후딜레이 ─────────────────────────────────────
            } else if (e._atk2PostTimer > 0) {
                e.state = 'attack';
                e.dx    = 0;
                e._atk2PostTimer--;
                if (e._atk2PostTimer <= 0) {
                    e._atk2Active = false;
                    e.state       = 'idle';
                }

            // ── 공격2 돌진 진행 ────────────────────────────────────
            } else if (e._atk2Dashing) {
                e.state = 'attack';
                e.dx   *= e.atk2DashDecay;
                e._atk2DashTimer--;

                // 돌진 슬래시 이펙트: 3프레임마다 스폰 (빠른 잔상 느낌)
                if (e._atk2DashTimer % 3 === 0) {
                    spawnBossDashSlash(e);
                }

                // 돌진 중 보스 본체 히트박스로 피해 판정
                const dashHitX = e.x;
                const dashHitY = e.y;
                const dashHitW = e.width;
                const dashHitH = e.height;
                const pOvX = player.x + player.width  > dashHitX && player.x < dashHitX + dashHitW;
                const pOvY = player.y + player.height > dashHitY && player.y < dashHitY + dashHitH;
                if (pOvX && pOvY && !player.isInvincible) {
                    player.hp              = Math.max(player.hp - Math.round(e.atk2Damage * (bossPhase2.active ? 0.6 : 1)), 0);
                    player.isInvincible    = true;
                    player.invincibleTimer = 60;
                    player.dx = e._atk2DashDir * 10;
                    player.dy = -7;
                }

                if (e._atk2DashTimer <= 0 || Math.abs(e.dx) < 1.5) {
                    e._atk2Dashing      = false;
                    e.dx                = 0;
                    e._atk2PostTimer    = e.atk2PostDelay;
                    e._atk2CooldownTimer = e.atk2Cooldown;
                    e.state             = 'attack';
                }

            // ── 공격2 딜레이 ───────────────────────────────────────
            } else if (e._atk2Windup) {
                e.state = 'attack';
                e.dx    = 0;
                // 딜레이 중 방향 전환 허용 (15프레임)
                if (e._atk2WindupTimer > e.atk2Windup - 15) {
                    e.direction    = bdx >= 0 ? 'right' : 'left';
                    e._atk2DashDir = e.direction === 'right' ? 1 : -1;
                }
                e._atk2WindupTimer--;
                if (e._atk2WindupTimer <= 0) {
                    e._atk2Windup    = false;
                    e._atk2Dashing   = true;
                    e._atk2DashTimer = e.atk2DashFrames;
                    e.dx = e._atk2DashDir * e.atk2DashSpeed;
                    playSoundImmediate('BOSS_ATTACK2_2');
                }

            // ── 공격1 타이머 ───────────────────────────────────────
            } else if (e.attackTimer > 0) {
                e.attackTimer--;
                e.dx    = 0;
                e.state = 'attack';

                // 공격1 진행 중 방향 전환 불가
                const hitFrame = 60 - e._atk1DelayTotal;   // = 15

                // 공격1 판정: 딜레이 끝 순간 1회
                if (e._atk1DelayTotal !== undefined && !e._atk1HitDone) {
                    if (e.attackTimer === hitFrame) {
                        e._atk1HitDone = true;
                        playSound('BOSS_ATTACK1_3');
                        const atk1RangeX = 280;
                        const atk1RangeY = e.height * 0.45;
                        // 보스 본체 포함: 보스 뒤쪽 끝부터 앞쪽 280px까지
                        const bossFrontX = e.direction === 'right'
                            ? e.x                        // 보스 왼쪽 끝부터
                            : e.x + e.width - atk1RangeX; // 보스 오른쪽 끝에서 280px 앞까지
                        const hitTop    = e.y + e.height / 2 - atk1RangeY;
                        const hitBottom = e.y + e.height / 2 + atk1RangeY;
                        const pCenterX  = player.x + player.width  / 2;
                        const pCenterY  = player.y + player.height / 2;
                        const inX = pCenterX >= bossFrontX && pCenterX <= bossFrontX + atk1RangeX;
                        const inY = pCenterY >= hitTop     && pCenterY <= hitBottom;
                        if (inX && inY && !player.isInvincible) {
                            player.hp              = Math.max(player.hp - Math.round(e.attackDamage * (bossPhase2.active ? 0.6 : 1)), 0);
                            player.isInvincible    = true;
                            player.invincibleTimer = 60;
                            const bdxHit           = pCenterX - (e.x + e.width / 2);
                            player.dx = (bdxHit > 0 ? 1 : -1) * 8;
                            player.dy = -6;
                        }
                        // 돌 파티클: 공격 범위 전체에서 스폰 (판정 성공 여부와 무관)
                        spawnBossStoneParticles(bossFrontX, atk1RangeX, hitTop, hitBottom);
                    }
                }
            } else if (e.isLeapWindup) {
                // 도약 준비자세: 제자리 정지
                e.dx = 0;
                e.state = 'jump1';
                e.leapWindupTimer--;
                if (e.leapWindupTimer <= 0) {
                    e.isLeapWindup = false;
                    e.isLeaping    = true;

                    // ── 도약 발사: X/Y 독립 계산 ──────────────────
                    const basePower = e._dynLeapJumpPower || e.leapJumpPower;
                    if (e._dynLeapSpeed === 0) {
                        e.dy = -basePower;
                    } else {
                        const launchDist = Math.sqrt(bdx * bdx + bdy * bdy);
                        const closeRatio = Math.min(1, launchDist / 600);
                        const minPower   = e.leapJumpPower * 0.45;
                        e.dy = -(minPower + (basePower - minPower) * closeRatio);
                    }

                    if (e._dynLeapSpeed === 0) {
                        e.dx = 0;
                    } else {
                        const airTime  = Math.max(1, (2 * Math.abs(e.dy)) / e.gravity);
                        const baseSpeed = e._dynLeapSpeed || e.leapSpeed;
                        const wantedDX  = bdx / airTime;
                        const maxDX     = Math.min(baseSpeed, Math.abs(wantedDX) + 2);
                        e.dx = Math.sign(bdx) * Math.min(Math.abs(wantedDX), maxDX);
                        if (absDX < 60) e.dx = 0;
                    }

                    e._dynLeapJumpPower = 0;
                    e._dynLeapSpeed     = 0;
                    e.direction = bdx > 0 ? 'right' : 'left';
                    playSound('BOSS_JUMP');

                    if (!e._leapIgnorePlatforms) {
                        const bossLeft  = Math.min(e.x, e.x + bdx);
                        const bossRight = Math.max(e.x, e.x + bdx) + e.width;
                        e._leapIgnorePlatforms = platforms.some(plat => {
                            if ((plat.type || 'platform') !== 'platform') return false;
                            const overlapX = plat.x < bossRight && plat.x + plat.width > bossLeft;
                            const playerBelowPlat = (player.y + player.height) > plat.y;
                            return overlapX && playerBelowPlat;
                        });
                    }
                }

            } else if (e.isLeaping) {
                e.state = e.dy < 0 ? 'jump1' : 'jump2';
                if (e.grounded) {
                    e.isLeaping = false;
                    e.state     = 'idle';
                    e.dx        = 0;
                    e._forceLeapChecked    = false;
                    e._leapIgnorePlatforms = false;
                    e.leapTimer = e.leapCooldownMin +
                        Math.floor(Math.random() * (e.leapCooldownMax - e.leapCooldownMin));
                }

            } else {
                // ── 일반 상태: 공격 / 이동 / 도약 판정 ──────────────
                // 공격1 인식범위
                const inAtk1Range = absDX < e.attackRange && absDY < e.height;

                if (e._forceLeapCooldown === undefined) e._forceLeapCooldown = 0;
                if (e._forceLeapCooldown > 0) e._forceLeapCooldown--;

                if (e.grounded && e._forceLeapCooldown <= 0) {
                    const closeX     = absDX < e.attackRange;
                    const highAbove  = bdy < -150;
                    const onPlatform = player.grounded && playerOnPlatform;

                    if (closeX && highAbove && onPlatform) {
                        const heightRatio   = Math.min(1, absDY / 300);
                        e._dynLeapJumpPower = Math.min(e.leapJumpPower + heightRatio * 18, 32);
                        e._dynLeapSpeed     = 0;
                        e.isLeapWindup      = true;
                        e.leapWindupTimer   = e.leapWindup;
                        e.direction         = bdx >= 0 ? 'right' : 'left';
                        e.dx                = 0;
                        e._forceLeapCooldown = 90;
                    } else {
                        const bossOnAirPlatform = e.grounded &&
                                                  (e.y + e.height) < (world.height - 65);
                        const playerBelow    = bdy > 80;
                        const playerOnGround = player.grounded && !playerOnPlatform;
                        if (closeX && bossOnAirPlatform && playerBelow && playerOnGround) {
                            e._dynLeapJumpPower = e.leapJumpPower * 0.35;
                            e._dynLeapSpeed     = 0;
                            e.isLeapWindup      = true;
                            e.leapWindupTimer   = e.leapWindup;
                            e.direction         = bdx >= 0 ? 'right' : 'left';
                            e.dx                = 0;
                            e._forceLeapCooldown = 90;
                            e._leapIgnorePlatforms = true;
                        }
                    }
                }

                if (!e.isLeapWindup) {
                    const atk1Ready = e.cooldownTimer    <= 0 && inAtk1Range;
                    const atk2Ready = e._atk2CooldownTimer <= 0 && inAtk1Range && !e._atk2Active;

                    if ((atk1Ready || atk2Ready) && e.attackTimer <= 0 && !e._atk2Active) {
                        e.direction = bdx >= 0 ? 'right' : 'left';

                        // 둘 다 준비됐으면 쿨타임이 더 낮은(먼저 만료된) 쪽 우선
                        // cooldownTimer와 _atk2CooldownTimer 중 더 작은 쪽 발동
                        // 같으면 랜덤
                        let fireAtk1;
                        if (atk1Ready && !atk2Ready)       fireAtk1 = true;
                        else if (!atk1Ready && atk2Ready)  fireAtk1 = false;
                        else /* 둘 다 준비 */
                            fireAtk1 = e.cooldownTimer <= e._atk2CooldownTimer
                                ? Math.random() < 0.5   // 동시 만료: 랜덤
                                : e.cooldownTimer < e._atk2CooldownTimer;

                        if (fireAtk1) {
                            e.cooldownTimer   = e.attackCooldown;
                            e.state           = 'attack';
                            e.attackTimer     = 60;
                            e._atk1DelayTotal = 45;
                            e._atk1HitDone    = false;
                            e.dx              = 0;
                            e._atk3IdleTimer  = 0;
                            playSound('BOSS_ATTACK1_1');
                        } else {
                            e._atk2CooldownTimer = e.atk2Cooldown;
                            e._atk2Active      = true;
                            e._atk2Windup      = true;
                            e._atk2WindupTimer = e.atk2Windup;
                            e._atk2DashDir     = e.direction === 'right' ? 1 : -1;
                            e.state            = 'attack';
                            e.dx               = 0;
                            e._atk3IdleTimer   = 0;
                        }

                    } else if (
                        // ── 공격3 발동 조건 (쿨타임 + 착지 중 — 사거리 무관)
                        e._atk3Phase === 'none' &&
                        e._atk3CooldownTimer <= 0 &&
                        e.grounded
                    ) {
                        // 가까울수록 dx 감소: 200px 이내면 최소 4, 멀수록 최대 16
                        const atk3DxRaw = Math.min(16, Math.max(4, absDX / 20));
                        e._atk3Phase           = 'jump';
                        e._atk3TargetX         = player.x + player.width / 2;
                        e._atk3DashDir         = bdx >= 0 ? 1 : -1;
                        e.direction            = bdx >= 0 ? 'right' : 'left';
                        e.dx                   = e._atk3DashDir * atk3DxRaw;
                        // X거리가 짧을 때(attackRange 이하)만 최소 높이 보장, 그 외엔 고정 -26
                        e.dy                   = (absDX <= e.attackRange) ? -22 : -26;
                        e._leapIgnorePlatforms = true;
                        e._atk3IdleTimer       = 0;
                        e.state                = 'jump1';
                        playSound('BOSS_JUMP');

                    } else if (e.grounded && e.leapTimer <= 0 &&
                               absDX >= e.attackRange && absDX < 1000) {
                        // 일반 도약 (공격2 범위 바깥)
                        const leapRatio     = Math.min(1, absDX / 900);
                        const hBonus        = bdy < -60 ? Math.min(6, absDY / 50) : 0;
                        e._dynLeapJumpPower = Math.min(e.leapJumpPower + leapRatio * 10 + hBonus, 26);
                        e._dynLeapSpeed     = Math.min(e.leapSpeed     + leapRatio * 8,  21);
                        e.isLeapWindup    = true;
                        e.leapWindupTimer = e.leapWindup;
                        e.direction       = bdx >= 0 ? 'right' : 'left';
                        e.dx = 0;

                    } else {
                        // 일반 이동
                        const nearX = absDX < e.attackRange;
                        if (nearX) {
                            e.state = 'idle';
                            e.dx    = 0;
                        } else {
                            e.state = 'walk';
                            e.dx    = (bdx >= 0 ? 1 : -1) * e.speed;
                        }
                        e.direction = bdx >= 0 ? 'right' : 'left';
                    }
                }
            }

            e.x += e.dx;
            e.y += e.dy;

            e.grounded = false;
            platforms.forEach(plat => {
                const pt = plat.type || 'platform';
                if (pt === 'wall') {
                    if (e.x + e.width  > plat.x && e.x < plat.x + plat.width &&
                        e.y + e.height > plat.y && e.y < plat.y + plat.height) {
                        if (e.dx > 0) e.x = plat.x - e.width;
                        else          e.x = plat.x + plat.width;
                        e.dx = 0;
                    }
                } else if (pt === 'solid' || pt === 'platform') {
                    if (pt === 'platform' && e._leapIgnorePlatforms) return;
                    if (e.x + e.width  > plat.x &&
                        e.x            < plat.x + plat.width &&
                        e.y + e.height >= plat.y &&
                        e.y + e.height <= plat.y + Math.max(20, e.dy + 1) &&
                        e.dy >= 0) {
                        e.y        = plat.y - e.height;
                        e.dy       = 0;
                        e.grounded = true;
                        e._leapIgnorePlatforms = false;
                    }
                }
            });
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
                if (type === 'solid' || type === 'platform') {
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
                        player.hp              = Math.max(player.hp - Math.round(e.attackDamage * (bossPhase2.active ? 0.6 : 1)), 0);
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
        // 페이즈 전환 연출 중에는 보스 깜빡임 없이 항상 표시
        const isPhaseTransition = e.type === 'boss' &&
            (bossHalfSeq.phase !== 'idle' && bossHalfSeq.phase !== 'done');
        if (!blinkVisible && !isPhaseTransition) return;

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

        // ── boss 전용 렌더링 ──────────────────────────────────────
        if (e.type === 'boss') {
            // 마지막 패턴 공격 중(roar/active/wait1/crack)에는 보스 숨김
            // drop/done 페이즈부터 다시 표시
            if (e._finalPatternActive) {
                const ph = e._finalPatternPhase;
                // 숨겨야 할 페이즈
                const hidden = ph === 'roar' || ph === 'active' || ph === 'intro'
                    || e._fpCrackPhase === 'wait1' || e._fpCrackPhase === 'crack';
                if (hidden) return;

                if (ph === 'drop' || ph === 'done') {
                    const BH2 = e.height;
                    const useStand = (ph === 'done');
                    const imgKey2  = useStand ? e.imgStand : e.imgP2Jump1;
                    const dH = useStand ? BH2 * 1.3 : BH2 / 0.88;
                    const dW = useStand ? dH : dH * (457 / 451);
                    const img = sprites[imgKey2];
                    const dx = e.x - (dW - e.width) / 2;
                    const dy = (e.y + e.height) - dH;
                    ctx.save();
                    ctx.globalAlpha = 1;   // 무적 깜빡임 무시하고 항상 표시
                    if (img && img.complete && img.naturalWidth !== 0) {
                        ctx.drawImage(img, dx, dy, dW, dH);
                    } else {
                        ctx.fillStyle = '#8844ff';
                        ctx.fillRect(e.x, e.y, e.width, e.height);
                    }
                    ctx.restore();
                    return;
                }
            }
            // ── 이미지 키 + 스케일 선택 ──────────────────────────
            // 기준: 히트박스 높이(e.height=130)가 캐릭터 본체 높이와 일치하도록
            // 각 스프라이트별 (imgW/imgH) × (hb / charRatio) 로 drawW/drawH 산출
            // charRatio = 이미지 높이 대비 캐릭터 본체 높이 비율
            // ─────────────────────────────────────────────────────
            // sprite       imgW  imgH  charRatio → drawH  drawW
            // atk1_1        578   409    0.90     → 144    204
            // atk1_2       1770  1219    0.65     → 200    290
            // atk1_3        517   294    0.80     → 163    286   ← 후딜
            // atk2_1        584   341    0.88     → 148    253   ← 공격2 딜레이
            // atk2_2        674   305    0.75     → 173    383   ← 공격2 돌진
            // jump1         457   451    0.88     → 148    150
            // jump2         500   500    0.82     → 159    159
            // stand/move: 기본 1.3× 스케일 유지
            // ─────────────────────────────────────────────────────

            let bossImgKey;
            let drawW, drawH;
            const BH = e.height;   // 히트박스 높이 = 130

            // ── 2페이즈 p2_attack4 전용 스프라이트 ─────────────────
            if (e._phase2Active && e._p2Attack === 'atk4' && e._p2a4Phase !== undefined) {
                bossImgKey = e.imgP2Atk4_1;
                drawH = BH * 1.3; drawW = drawH;
            } else
            // ── 2페이즈 p2_attack3 전용 스프라이트 ─────────────────
            if (e._phase2Active && e._p2Attack === 'atk3' && e._p2a3Phase !== undefined) {
                const ph3 = e._p2a3Phase;
                if (ph3 === 'appear' || ph3 === 'windup' || ph3 === 'strike') {
                    bossImgKey = e.imgP2Atk3_1;
                } else {
                    bossImgKey = e.imgP2Atk3_2;
                }
                drawH = BH * 1.3;
                drawW = drawH;
            } else
            // ── 2페이즈 p2_attack1 전용 스프라이트 ─────────────────
            if (e._phase2Active && e._p2a1Phase !== undefined) {
                if (e._p2a1Phase === 'appear') {
                    // 대각선 하강: p2 전용 jump2
                    bossImgKey = e.imgP2Jump2;
                    drawH = BH / 0.82;
                    drawW = drawH * (500 / 500);
                } else if (e._p2a1Phase === 'windup') {
                    // 윈드업: p2 전용 attack1_1
                    bossImgKey = e.imgP2Atk1_1;
                    drawH = BH * (9 / 8) * 0.85;
                    drawW = drawH * (584 / 341);
                } else if (e._p2a1Phase === 'dash') {
                    // 돌진 중: p2 전용 attack1_2
                    bossImgKey = e.imgP2Atk1_2;
                    drawH = (BH / 0.9375) * 0.85;
                    drawW = drawH * (674 / 305);
                } else if (e._p2a1Phase === 'post' || e._p2a1Phase === 'endvanish') {
                    // 후딜 / 소멸: p2 전용 jump1
                    bossImgKey = e.imgP2Jump1;
                    drawH = BH / 0.88;
                    drawW = drawH * (457 / 451);
                } else {
                    // idle / vanish: 기본 stand
                    bossImgKey = e.imgStand;
                    drawH = BH * 1.3;
                    drawW = drawH;
                }
            } else if (e._atk3Phase === 'windup') {
                // 공중 정지 예고: boss_attack3_1 (1.2× 스케일)
                bossImgKey = e.imgAtk3_1;
                drawH = (BH / 0.80) * 1.44;           // 기존 × 1.2 = 1.2배 확대
                drawW = drawH * (239 / 518);          // 종횡비 유지

            } else if (e._atk3Phase === 'strike') {
                // 내려찍기: boss_attack3_2
                bossImgKey = e.imgAtk3_2;
                drawH = (BH / 0.75) * 1.3 * 0.85;       // ≈191
                drawW = (BH * 0.80 * 1.3) * 1.3 * 0.85; // ≈150

            } else if (e._atk3Phase === 'post') {
                // 후딜: atk1_3 재활용
                bossImgKey = e.imgAtk1_3;
                drawH = BH / 1.00;
                drawW = drawH * (517 / 294);

            } else if (e._atk3Phase === 'jump') {
                // 점프 비행: 기존 jump1/jump2
                bossImgKey = e.dy < 0 ? e.imgJump1 : e.imgJump2;
                drawH = BH / 0.88;
                drawW = drawH * (457 / 451);

            } else if (e._atk2Dashing) {
                // 공격2 돌진: atk2_2 (기존×0.85)
                bossImgKey = e.imgAtk2_2;
                drawH = (BH / 0.9375) * 0.85;   // ≈118
                drawW = drawH * (674 / 305);

            } else if (e._atk2PostTimer > 0) {
                // 공격2 후딜레이: atk2_2 유지 (기존×0.85)
                bossImgKey = e.imgAtk2_2;
                drawH = (BH / 0.9375) * 0.85;
                drawW = drawH * (674 / 305);

            } else if (e._atk2Windup) {
                // 공격2 선딜: atk2_1 (기존×0.85)
                bossImgKey = e.imgAtk2_1;
                drawH = BH * (9 / 8) * 0.85;   // ≈124
                drawW = drawH * (584 / 341);

            } else if (e.state === 'attack' && e._atk1DelayTotal !== undefined) {
                // 공격1 3단계
                const hitFrame = 60 - e._atk1DelayTotal;   // = 15
                if (e.attackTimer > hitFrame) {
                    // 선딜: atk1_1 (크기 유지)
                    bossImgKey = e.imgAtk1_1;
                    drawH = BH / 0.90;   // ≈144
                    drawW = drawH * (578 / 409);  // ≈204
                } else if (e.attackTimer > 8) {
                    // 타격: atk1_2 (×0.80)
                    bossImgKey = e.imgAtk1_2;
                    drawH = BH / 0.8125;   // ≈160
                    drawW = drawH * (1770 / 1219);  // ≈232
                } else {
                    // 후딜: atk1_3 (×0.80)
                    bossImgKey = e.imgAtk1_3;
                    drawH = BH / 1.00;   // =130
                    drawW = drawH * (517 / 294);  // ≈229
                }

            } else if (e.isLeapWindup || (e.isLeaping && e.dy < 0) || (!e.grounded && e.dy < 0)) {
                // 점프 상승: jump1
                bossImgKey = e.imgJump1;
                drawH = BH / 0.88;   // ≈148
                drawW = drawH * (457 / 451);  // ≈150

            } else if (e.isLeaping || !e.grounded) {
                // 점프 하강: jump2
                bossImgKey = e.imgJump2;
                drawH = BH / 0.82;   // ≈159
                drawW = drawH * (500 / 500);  // ≈159

            } else {
                // 이동/대기 (절반 연출 중엔 stand 고정)
                if (e._halfInvincible || (bossHalfSeq.phase !== 'idle' && bossHalfSeq.phase !== 'done')) {
                    bossImgKey = e.imgStand;
                } else {
                    bossImgKey = e.state === 'walk' ? e.imgMove : e.imgStand;
                }
                drawH = e.state === 'walk' ? BH * 1.105 : BH * 1.3;
                // stand2 전환 스프라이트는 원본 비율대로 drawW 산출 (height 고정)
                const _stand2Ratios = {
                    'BOSS_STAND2_1': 307 / 462,
                    'BOSS_STAND2_2': 292 / 449,
                    'BOSS_STAND2_3': 253 / 477,
                };
                if (_stand2Ratios[bossImgKey] !== undefined) {
                    drawW = drawH * _stand2Ratios[bossImgKey];
                } else {
                    drawW = drawH;
                }
            }

            // 발 위치 고정 기준으로 drawX, drawY 결정
            // X: 히트박스 중심과 스프라이트 중심을 맞춤
            const drawX = e.x + e.width / 2 - drawW / 2;
            const drawY = (e.y + e.height) - drawH;   // 발 위치 고정

            const bImg   = sprites[bossImgKey];
            const hasImg = bImg && bImg.complete && bImg.naturalWidth !== 0;

            ctx.save();
            // 2페이즈 소멸/등장 투명도 반영
            const _p2Alpha = (e._phase2Active && e._p2a1Alpha !== undefined) ? e._p2a1Alpha : 1;
            ctx.globalAlpha = deadAlpha * _p2Alpha;

            if (hasImg) {
                if (e.direction === 'right') {
                    ctx.translate(drawX + drawW, drawY);
                    ctx.scale(-1, 1);
                    ctx.drawImage(bImg, 0, 0, drawW, drawH);
                } else {
                    ctx.drawImage(bImg, drawX, drawY, drawW, drawH);
                }
            } else {
                // fallback: 단색 직사각형
                const bossColor = e.state === 'attack' ? '#ff2222'
                                : e.state === 'jump1'  ? '#ff8800'
                                : e.state === 'jump2'  ? '#ffaa00'
                                : e.state === 'walk'   ? '#cc2244'
                                :                        '#881122';
                ctx.fillStyle = bossColor;
                ctx.fillRect(drawX, drawY, drawW, drawH);
                ctx.fillStyle = 'white';
                ctx.font = 'bold 11px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`BOSS [${e.state}]`, drawX + drawW / 2, drawY + drawH / 2 + 4);
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.font = '14px monospace';
                ctx.fillText(e.direction === 'right' ? '▶' : '◀', drawX + drawW / 2, drawY + 16);
                ctx.textAlign = 'left';
            }

            ctx.restore();

            // ── p2_attack2 범위 표시기 (각도 기반 회전 사각형) ──────
            if (e._phase2Active && e._p2Attack === 'atk2' &&
                (e._p2a2Phase === 'range1' || e._p2a2Phase === 'range2' || e._p2a2Phase === 'range3')) {
                const isR3     = e._p2a2Phase === 'range3';
                const isR2     = e._p2a2Phase === 'range2';
                const tX       = isR3 ? e._p2a2Target3X : (isR2 ? e._p2a2Target2X : e._p2a2Target1X);
                const tY       = isR3 ? e._p2a2Target3Y : (isR2 ? e._p2a2Target2Y : e._p2a2Target1Y);
                const aRad     = isR3 ? e._p2a2Angle3   : (isR2 ? e._p2a2Angle2   : e._p2a2Angle1);
                // range1: 32f, range2: 22f, range3: 27f 기준
                const totalT   = isR3 ? 27 : (isR2 ? 22 : 32);
                const ratio    = e._p2a2Timer / totalT;
                const pulse    = 0.5 + 0.5 * Math.sin(Date.now() / 70);
                const alpha    = (1 - ratio * 0.5) * (0.30 + 0.20 * pulse);
                // 3번째 타격: 범위 1.3배
                const scale    = isR3 ? 1.3 : 1.0;
                const maxLen   = 500 * scale;
                const halfLen  = maxLen / 2;
                const thick    = e.height * 0.65 * scale;

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(tX, tY);
                ctx.rotate(aRad);
                ctx.fillStyle   = isR3 ? '#ff6600' : '#ff2020';
                ctx.fillRect(-halfLen, -thick / 2, halfLen * 2, thick);
                ctx.globalAlpha = Math.min(1, alpha * 2.5);
                ctx.strokeStyle = isR3 ? '#ffaa44' : '#ff6060';
                ctx.lineWidth   = isR3 ? 3.5 : 2.5;
                ctx.strokeRect(-halfLen, -thick / 2, halfLen * 2, thick);
                ctx.restore();
            }

            // ── p2_attack1 윈드업 예고 표시기 (맵 전체 돌진 범위) ────
            if (e._phase2Active && e._p2a1Phase === 'windup') {
                const windupTotal = 38;
                const isFlash = false;
                const ratio   = e._p2a1Timer / windupTotal;
                const pulse   = 0.5 + 0.5 * Math.sin(Date.now() / 80);
                const alpha   = (1 - ratio) * (0.35 + 0.2 * pulse);

                // 돌진 방향으로 보스 끝부터 맵 반대편 벽까지
                const dashFrom = e._p2a1DashDir > 0 ? e.x + e.width : 0;
                const dashTo   = e._p2a1DashDir > 0 ? world.width   : e.x;
                const laneW    = Math.abs(dashTo - dashFrom);
                const laneX    = Math.min(dashFrom, dashTo);
                const laneY    = e.y;
                const laneH    = e.height;

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle   = '#ff2020';
                ctx.fillRect(laneX, laneY, laneW, laneH);
                ctx.globalAlpha = Math.min(1, alpha * 2.2);
                ctx.strokeStyle = '#ff6060';
                ctx.lineWidth   = 2.5;
                ctx.strokeRect(laneX, laneY, laneW, laneH);
                ctx.restore();
            }

            // ── 마지막 패턴 테스트 표시기 ──────────────────────────────
            if (e._phase2Active && e._finalPatternActive) {
                _drawBossFinalPatternTest(ctx, e);
            }

            // ── p2_attack1 chase 단계: 맵 전체 레인 한 번에 표시 (preshow 동안만) ──
            if (e._phase2Active && e._p2a1Phase === 'post' && e._p2a1PostSub === 'preshow') {
                const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 60);
                const ratio = e._p2a1PostSubTimer / 20;   // 1→0
                const alpha = (0.28 + 0.15 * pulse) * (0.4 + 0.6 * (1 - ratio));  // 점점 밝아짐
                const lx    = 0;
                const ly    = e._p2a1SpawnY - e.height * 0.1;
                const lw    = world.width;
                const lh    = e.height * 1.2;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle   = '#ff2020';
                ctx.fillRect(lx, ly, lw, lh);
                ctx.globalAlpha = Math.min(1, alpha * 2.5);
                ctx.strokeStyle = '#ff6060';
                ctx.lineWidth   = 2.5;
                ctx.strokeRect(lx, ly, lw, lh);
                ctx.restore();
            }

            // ── 공격1 예고 표시기 ──────────────────────────────────
            if (e.state === 'attack' && e._atk1DelayTotal !== undefined && !e._atk1HitDone) {
                const hitFrame   = 60 - e._atk1DelayTotal;   // = 15
                const delayLeft  = e.attackTimer - hitFrame;
                if (delayLeft > 0) {
                    const alpha      = (delayLeft / e._atk1DelayTotal) * 0.55;
                    const atk1RangeX = 280;
                    const atk1RangeY = e.height * 0.45;
                    // 판정: pCenterX 기준 → 표시는 플레이어 중심이 박스 안에 들어오는 범위
                    // 보스 본체(e.x) 기준, 방향에 따라 280px
                    const indX = e.direction === 'right'
                        ? e.x
                        : e.x + e.width - atk1RangeX;
                    // Y: 보스 중심 ± atk1RangeY (pCenterY 기준 판정과 동일)
                    const indY = e.y + e.height / 2 - atk1RangeY;
                    const indH = atk1RangeY * 2;

                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle   = '#ff2020';
                    ctx.fillRect(indX, indY, atk1RangeX, indH);
                    ctx.globalAlpha = Math.min(1, alpha * 2);
                    ctx.strokeStyle = '#ff6060';
                    ctx.lineWidth   = 2;
                    ctx.strokeRect(indX, indY, atk1RangeX, indH);
                    ctx.restore();
                }
            }

            // ── 공격3 예고 표시기 (windup 중 — 凸 모양, 주황색) ──────
            if (e._atk3Phase === 'windup') {
                const ratio   = e._atk3WindupTimer / e.atk3WindupDur;
                const alpha   = (1 - ratio) * 0.85;

                const centerX  = e.x + e.width / 2;
                const groundY  = world.height - 60;   // 바닥 Y (착지 예정)

                // ── 실제 판정 기준 ─────────────────────────────────
                // 하강 판정: 보스 발(bossBottom) ~ groundY+40, X ± atk3RangeX
                // 착지 판정: groundY - atk3RangeY ~ groundY+20,  X ± atk3RangeX
                // → 기둥: 보스 발 ~ (groundY - atk3RangeY) 구간  [하강만 판정]
                // → 받침: groundY - atk3RangeY ~ groundY+20      [하강+착지 겹침 구간]

                const bossBottomY = e.y + e.height;          // 보스 발 (windup 고정)
                const baseTopY    = groundY - e.atk3RangeY;  // 받침 상단 = 착지 판정 상단
                const baseBottomY = groundY + 20;            // 착지 판정 하단

                const rangeHW  = e.atk3RangeX;               // 160 — 양쪽 동일
                const pillarHW = e.width / 2 + 16;           // 기둥은 보스 폭 기준으로 더 좁게

                // 기둥 (보스 발 ~ 받침 상단)
                const pillarX = centerX - pillarHW;
                const pillarW = pillarHW * 2;
                const pillarY = bossBottomY;
                const pillarH = Math.max(0, baseTopY - bossBottomY);

                // 받침 (착지 판정 전체 구간)
                const baseX = centerX - rangeHW;
                const baseW = rangeHW * 2;
                const baseY = baseTopY;
                const baseH = baseBottomY - baseTopY;

                ctx.save();

                // 채우기
                ctx.globalAlpha = alpha * 0.28;
                ctx.fillStyle   = '#ff88ff';
                if (pillarH > 0) ctx.fillRect(pillarX, pillarY, pillarW, pillarH);
                ctx.fillRect(baseX, baseY, baseW, baseH);

                // 凸 테두리
                ctx.globalAlpha = alpha * 0.95;
                ctx.strokeStyle = '#cc44ff';
                ctx.lineWidth   = 4;
                ctx.beginPath();
                if (pillarH > 0) {
                    // 기둥 있을 때: 완전한 凸
                    ctx.moveTo(pillarX,           pillarY);
                    ctx.lineTo(pillarX + pillarW, pillarY);
                    ctx.lineTo(pillarX + pillarW, baseY);
                    ctx.lineTo(baseX   + baseW,   baseY);
                    ctx.lineTo(baseX   + baseW,   baseY + baseH);
                    ctx.lineTo(baseX,             baseY + baseH);
                    ctx.lineTo(baseX,             baseY);
                    ctx.lineTo(pillarX,           baseY);
                    ctx.closePath();
                } else {
                    // 보스가 이미 낮을 때: 받침만 (□)
                    ctx.rect(baseX, baseY, baseW, baseH);
                }
                ctx.stroke();

                ctx.restore();
            }

            // ── p2 공격3 예고 표시기 (appear / windup 단계) ──────────
            if (e._phase2Active && e._p2Attack === 'atk3' &&
                (e._p2a3Phase === 'appear' || e._p2a3Phase === 'windup')) {

                // appear: 0→1, windup: 항상 최대
                const maxAlpha  = 0.85;
                const appearTotal = (e._p2a3RepCount === 0) ? 18 : (e._p2a3Enraged ? 32 : 15);
                const alpha = e._p2a3Phase === 'windup'
                    ? maxAlpha
                    : maxAlpha * (1 - e._p2a3Timer / appearTotal);

                const centerX   = e.x + e.width / 2;
                const groundY   = world.height - 60;
                const bossBottomY = e.y + e.height;
                const baseTopY    = groundY - e.atk3RangeY;
                const baseBottomY = groundY + 20;
                const rangeHW     = e.atk3RangeX / 2;   // 받침 크기 1/2
                const pillarHW    = e.width / 2 + 16;

                const pillarX = centerX - pillarHW;
                const pillarW = pillarHW * 2;
                const pillarY = bossBottomY;
                const pillarH = Math.max(0, baseTopY - bossBottomY);
                const baseX   = centerX - rangeHW;
                const baseW   = rangeHW * 2;
                const baseY   = baseTopY;
                const baseH   = baseBottomY - baseTopY;

                ctx.save();

                // 채우기 (청보라)
                ctx.globalAlpha = alpha * 0.25;
                ctx.fillStyle   = '#8844ff';
                if (pillarH > 0) ctx.fillRect(pillarX, pillarY, pillarW, pillarH);
                ctx.fillRect(baseX, baseY, baseW, baseH);

                // 凸 테두리
                ctx.globalAlpha = alpha * 0.95;
                ctx.strokeStyle = '#aa66ff';
                ctx.lineWidth   = 4;
                ctx.beginPath();
                if (pillarH > 0) {
                    ctx.moveTo(pillarX,           pillarY);
                    ctx.lineTo(pillarX + pillarW, pillarY);
                    ctx.lineTo(pillarX + pillarW, baseY);
                    ctx.lineTo(baseX   + baseW,   baseY);
                    ctx.lineTo(baseX   + baseW,   baseY + baseH);
                    ctx.lineTo(baseX,             baseY + baseH);
                    ctx.lineTo(baseX,             baseY);
                    ctx.lineTo(pillarX,           baseY);
                    ctx.closePath();
                } else {
                    ctx.rect(baseX, baseY, baseW, baseH);
                }
                ctx.stroke();

                ctx.restore();
            }

            // ── 공격2 예고 표시기 (딜레이 중) ─────────────────────
            // 실제 돌진 거리: v0*(1-r^n)/(1-r) ≈ 305px (감쇄 기반 계산)
            if (e._atk2Windup) {
                const ratio  = e._atk2WindupTimer / e.atk2Windup;
                const alpha  = ratio * 0.5;
                // 실제 도달 거리 (등비수열 합)
                const dashDist = Math.round(
                    e.atk2DashSpeed * (1 - Math.pow(e.atk2DashDecay, e.atk2DashFrames))
                    / (1 - e.atk2DashDecay)
                );
                // 판정은 보스 본체 AABB 기준이므로 표시도 보스 폭 포함
                const dashW  = dashDist + e.width;
                const dashH  = e.height;   // 보스 본체 전체 높이
                const dashX  = e._atk2DashDir > 0
                    ? e.x                        // 오른쪽: 현재 위치부터
                    : e.x - (dashDist);          // 왼쪽: 이동 후 끝점부터
                const dashY  = e.y;              // 보스 발 위치 기준

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle   = '#ff8800';
                ctx.fillRect(dashX, dashY, dashW, dashH);
                ctx.globalAlpha = Math.min(1, alpha * 2.5);
                ctx.strokeStyle = '#ffcc44';
                ctx.lineWidth   = 2;
                ctx.strokeRect(dashX, dashY, dashW, dashH);
                ctx.restore();
            }

            return;  // boss 렌더링 종료
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

// ── 보스 공격1 돌 파티클 ─────────────────────────────────────────
const bossStoneParticles = [];

function spawnBossStoneParticles(bossFrontX, atk1RangeX, hitTop, hitBottom, count = 5) {
    // 공격 범위 내 균등 간격 + 랜덤 오프셋
    const segW    = atk1RangeX / count;
    const groundY = hitBottom;
    for (let i = 0; i < count; i++) {
        const baseX  = bossFrontX + segW * i + segW * 0.5;
        const rx     = (Math.random() - 0.5) * segW * 0.6;
        const spawnX = baseX + rx;
        const spawnY = groundY;

        // 2~3개 파편 (기존 3~5의 70%)
        const fragCount = 2 + Math.floor(Math.random() * 2);
        for (let f = 0; f < fragCount; f++) {
            const speedX  = (Math.random() - 0.5) * 14;
            const speedY  = -(8 + Math.random() * 9);   // 높이 복원
            const gray    = 110 + Math.floor(Math.random() * 90);
            const color   = `rgb(${gray},${gray - 15},${gray - 25})`;
            const maxLife = 0.85 + Math.random() * 0.3;
            bossStoneParticles.push({
                x:        spawnX,
                y:        spawnY,
                dx:       speedX,
                dy:       speedY,
                life:     maxLife,
                maxLife,
                decay:    0.018 + Math.random() * 0.012,
                size:     5 + Math.random() * 9,
                color,
                rot:      Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.45,
            });
        }
    }
}

function updateBossStoneParticles() {
    for (let i = bossStoneParticles.length - 1; i >= 0; i--) {
        const p  = bossStoneParticles[i];
        p.x     += p.dx;
        p.y     += p.dy;
        p.dy    += 0.55;   // 중력 (강하게)
        p.dx    *= 0.97;   // 공기 저항 (적게 — 멀리 날아감)
        p.rot   += p.rotSpeed;
        p.life  -= p.decay;
        if (p.life <= 0) bossStoneParticles.splice(i, 1);
    }
}

function drawBossStoneParticles() {
    if (bossStoneParticles.length === 0) return;
    ctx.save();
    bossStoneParticles.forEach(p => {
        // 하강 후반부(life 하위 35%)에서만 빠르게 페이드아웃
        const fadeThreshold = p.maxLife * 0.35;
        const alpha = p.life > fadeThreshold
            ? 1.0
            : Math.max(0, p.life / fadeThreshold);
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(-s,       -s * 0.4);
        ctx.lineTo( s * 0.6, -s);
        ctx.lineTo( s,        s * 0.5);
        ctx.lineTo(-s * 0.4,  s);
        ctx.closePath();
        ctx.fill();
        // 밝은 하이라이트 엣지
        ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.4})`;
        ctx.lineWidth   = 1.2;
        ctx.stroke();
        ctx.restore();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

// ── p2 공격4 이펙트 시스템 ────────────────────────────────────────────────
const p2a4GatherParticles = [];

function spawnP2A4GatherParticles(boss) {
    p2a4GatherParticles.length = 0;
    const cx = boss.x + boss.width  / 2;
    const cy = boss.y + boss.height / 2;
    const count = 48;
    for (let i = 0; i < count; i++) {
        const angle  = Math.random() * Math.PI * 2;
        const radius = 200 + Math.random() * 350;
        p2a4GatherParticles.push({
            x:     cx + Math.cos(angle) * radius,
            y:     cy + Math.sin(angle) * radius,
            tx:    cx,
            ty:    cy,
            life:  1.0,
            size:  4 + Math.random() * 6,
            color: `hsl(${200 + Math.random() * 40},80%,${55 + Math.random() * 20}%)`,
        });
    }
}

function updateP2A4GatherParticles(boss) {
    const cx = boss.x + boss.width  / 2;
    const cy = boss.y + boss.height / 2;
    for (let i = p2a4GatherParticles.length - 1; i >= 0; i--) {
        const p = p2a4GatherParticles[i];
        p.x    += (cx - p.x) * 0.07;
        p.y    += (cy - p.y) * 0.07;
        p.life -= 0.012;
        if (p.life <= 0) p2a4GatherParticles.splice(i, 1);
    }
}

// ── 공격3 강화 전용 기모으기 파티클 (타겟 좌표 고정, 보스 이동 무관) ──────
const p2a3GatherParticles = [];

function spawnP2A3GatherParticles(boss) {
    p2a3GatherParticles.length = 0;
    // 스폰 시점의 보스 위치를 타겟으로 고정
    const tx = boss.x + boss.width  / 2;
    const ty = boss.y + boss.height / 2;
    const count = 48;
    for (let i = 0; i < count; i++) {
        const angle  = Math.random() * Math.PI * 2;
        const radius = 200 + Math.random() * 350;
        p2a3GatherParticles.push({
            x:     tx + Math.cos(angle) * radius,
            y:     ty + Math.sin(angle) * radius,
            tx,   // 고정 타겟 X
            ty,   // 고정 타겟 Y
            life:  1.0,
            size:  4 + Math.random() * 6,
            color: `hsl(${200 + Math.random() * 40},80%,${55 + Math.random() * 20}%)`,
            decay: 0.062 + Math.random() * 0.02,  // 약 15~20프레임 안에 소진
        });
    }
}

function updateP2A3GatherParticles() {
    for (let i = p2a3GatherParticles.length - 1; i >= 0; i--) {
        const p = p2a3GatherParticles[i];
        // 고정 타겟으로 수렴 (보스 위치와 무관)
        p.x    += (p.tx - p.x) * 0.07;
        p.y    += (p.ty - p.y) * 0.07;
        p.life -= p.decay;
        if (p.life <= 0) p2a3GatherParticles.splice(i, 1);
    }
}

function drawP2A3GatherParticles() {
    if (p2a3GatherParticles.length === 0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    p2a3GatherParticles.forEach(p => {
        const px = (p.x - camera.x) * SCALE;
        const py = (p.y - cameraY)  * SCALE;
        ctx.globalAlpha = p.life * 0.9;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawP2A4Effects(boss) {
    if (!boss || boss._p2Attack !== 'atk4' || !boss._p2a4Phase) return;
    const phase = boss._p2a4Phase;
    const cx = (boss.x + boss.width  / 2 - camera.x) * SCALE;
    const cy = (boss.y + boss.height / 2 - cameraY)  * SCALE;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 수집 파티클 (appear 단계)
    if (phase === 'appear' && p2a4GatherParticles.length > 0) {
        p2a4GatherParticles.forEach(p => {
            const px = (p.x - camera.x) * SCALE;
            const py = (p.y - cameraY)  * SCALE;
            ctx.globalAlpha = p.life * 0.9;
            ctx.fillStyle   = p.color;
            ctx.beginPath();
            ctx.arc(px, py, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // 범위 표시 (flash 단계) — 십자 반짝임 제거
    if (phase === 'flash') {
        const prog = 1 - (boss._p2a4FlashTimer || 0) / 42;

        if (boss._p2a4Spikes) {
            const spikeH = canvas.height;
            ctx.globalAlpha = 0.55 + prog * 0.30;
            boss._p2a4Spikes.forEach(sp => {
                const sx = (sp.x - camera.x) * SCALE;
                const rectW = 36;
                ctx.fillStyle = 'rgba(255,60,60,0.55)';
                ctx.fillRect(sx - rectW / 2, 0, rectW, spikeH);
                ctx.strokeStyle = 'rgba(255,100,100,0.95)';
                ctx.lineWidth   = 2;
                ctx.strokeRect(sx - rectW / 2, 0, rectW, spikeH);
            });
        }
    }


    // 가시 렌더 (spike 단계)
    if (phase === 'spike' && boss._p2a4Spikes && boss._p2a4SpikeUp) {
        const SPIKE_TOTAL = 55;
        const st     = boss._p2a4SpikeTimer || 0;
        // 올라오는 비율: 0→1 (처음 8프레임에 걸쳐 빠르게 상승)
        const riseT  = SPIKE_TOTAL - st;   // 0부터 증가
        const rise   = Math.min(1, riseT / 8);
        // 사라지는 비율: 마지막 10프레임에 걸쳐 fade
        const vanish = st < 10 ? st / 10 : 1;
        const alpha  = vanish;

        const groundY = canvas.height;
        const fullH   = groundY;
        const spikeH  = fullH * rise;   // 바닥에서 위쪽으로 채워짐
        const spikeW  = 18;

        boss._p2a4Spikes.forEach(sp => {
            const sx = (sp.x - camera.x) * SCALE;
            const sy = groundY;

            ctx.globalAlpha = alpha * 0.28;
            ctx.fillStyle   = '#ff2200';
            ctx.fillRect(sx - spikeW * 1.8, sy - spikeH * 1.05, spikeW * 3.6, spikeH * 1.05);

            ctx.globalAlpha = alpha * 0.92;
            ctx.fillStyle   = '#cc1100';
            ctx.beginPath();
            ctx.moveTo(sx - spikeW, sy);
            ctx.lineTo(sx + spikeW, sy);
            ctx.lineTo(sx,          sy - spikeH);
            ctx.closePath();
            ctx.fill();

            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ff4422';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.moveTo(sx - spikeW, sy);
            ctx.lineTo(sx,          sy - spikeH);
            ctx.lineTo(sx + spikeW, sy);
            ctx.stroke();
        });
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}


// ── p2 공격3 충격파 시스템 ────────────────────────────────────────────────
const p2a3Shockwaves = [];

function _spawnP2A3Shockwave(e, enraged = false) {
    const originX = e.x + e.width / 2;
    const groundY = e.y + e.height;
    // 강화: 플랫폼 높이(820) 기준으로 충격파 높이 계산
    const shockH  = enraged
        ? Math.max(60, groundY - 820)   // 바닥~플랫폼 높이
        : 22;
    const shockSpd = 14;
    const shockW   = 8;
    [-1, 1].forEach(dir => {
        p2a3Shockwaves.push({
            x:       originX,
            y:       groundY,
            dir,
            speed:   shockSpd,
            width:   shockW,
            height:  shockH,
            life:    1.0,
            decay:   0,
            hitDone: false,
        });
    });
}

function updateP2A3Shockwaves() {
    for (let i = p2a3Shockwaves.length - 1; i >= 0; i--) {
        const s = p2a3Shockwaves[i];
        s.x += s.dir * s.speed;
        if (s.x < -50 || s.x > world.width + 50) {
            p2a3Shockwaves.splice(i, 1); continue;
        }
        if (!s.hitDone) {
            const px = player.x + player.width  / 2;
            const py = player.y + player.height / 2;
            if (Math.abs(px - s.x) < s.width + player.width / 2 &&
                py + player.height / 2 > s.y - s.height && !player.isInvincible) {
                player.hp = Math.max(0, player.hp - 12);
                player.isInvincible = true; player.invincibleTimer = 45;
                player.dx = s.dir * 8; player.dy = -5;
                s.hitDone = true;
            }
        }
    }
}

function drawP2A3Shockwaves() {
    if (p2a3Shockwaves.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';

    p2a3Shockwaves.forEach(s => {
        const by = s.y;
        const h  = s.height;
        const w  = s.width;
        const bx = s.x;

        const spikes = [
            { bl: bx - w,                    br: bx + w,                    ty: by - h,      a: 1.0  },
            { bl: bx - w*0.55 + s.dir*w*1.4, br: bx + w*0.55 + s.dir*w*1.4, ty: by - h*0.62, a: 0.75 },
            { bl: bx - w*0.4  - s.dir*w*1.2, br: bx + w*0.4  - s.dir*w*1.2, ty: by - h*0.45, a: 0.55 },
        ];

        spikes.forEach(sp => {
            ctx.globalAlpha = sp.a * 0.35;
            ctx.fillStyle   = '#1a4a7a';
            ctx.beginPath();
            ctx.moveTo(sp.bl - w*0.6, by); ctx.lineTo(sp.br + w*0.6, by);
            ctx.lineTo((sp.bl + sp.br) / 2, sp.ty - h*0.12); ctx.closePath(); ctx.fill();

            ctx.globalAlpha = sp.a * 0.92;
            ctx.fillStyle   = '#2255aa';
            ctx.beginPath();
            ctx.moveTo(sp.bl, by); ctx.lineTo(sp.br, by);
            ctx.lineTo((sp.bl + sp.br) / 2, sp.ty); ctx.closePath(); ctx.fill();

            ctx.globalAlpha = sp.a;
            ctx.strokeStyle = '#4488dd'; ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(sp.bl, by); ctx.lineTo((sp.bl + sp.br) / 2, sp.ty); ctx.lineTo(sp.br, by);
            ctx.stroke();
        });
    });

    ctx.globalAlpha = 1;
    ctx.restore();
}
function drawBossRoarRings() {
    const boss = enemies.find(e => e.type === 'boss' && e._finalPatternPhase === 'roar' && e._roarRings);
    if (!boss || boss._roarRings.length === 0) return;

    ctx.save();
    // drawSlashEffects와 동일한 좌표계 (scale+translate 적용된 상태)
    boss._roarRings.forEach(ring => {
        // 링 업데이트 (draw 안에서 처리해 update 분리 불필요)
        ring.r    += (ring.maxR - ring.r) * 0.07 + 4;
        ring.life -= 0.022;
        if (ring.life < 0) ring.life = 0;

        const alpha = ring.life * ring.life;
        if (alpha <= 0) return;

        // 월드 좌표로 역변환 (이미 scale+translate 적용된 컨텍스트)
        const wx = ring.x / SCALE + camera.x;
        const wy = ring.y / SCALE + cameraY;
        const wr = ring.r / SCALE;

        // 외곽 글로우
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180,100,255,${0.25 * alpha})`;
        ctx.lineWidth   = 28 / SCALE;
        ctx.stroke();

        // 중간 링
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(220,160,255,${0.55 * alpha})`;
        ctx.lineWidth   = 10 / SCALE;
        ctx.stroke();

        // 내곽 흰 선
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,240,255,${0.85 * alpha})`;
        ctx.lineWidth   = 3 / SCALE;
        ctx.stroke();
    });

    // 죽은 링 제거
    boss._roarRings = boss._roarRings.filter(r => r.life > 0);
    ctx.restore();
}

const ultParticles = [];
const slashEffects = [];

// ── 화면 조각 이펙트 (마지막 패턴 슬래시 후 화면이 조각남) ──────────────
const screenShards = [];

// ── 균열 스냅샷: crack 단계 진입 시 현재 화면을 찍어둠 ──────────────────
function _takeCrackSnapshot(lines) {
    const snap = document.createElement('canvas');
    snap.width  = canvas.width;
    snap.height = canvas.height;
    snap.getContext('2d').drawImage(canvas, 0, 0);
    return snap;
}

// ── 균열 단계 렌더: 스냅샷 위에 금 선을 그어 유리 균열처럼 표시 ─────────
function drawScreenCracks(boss) {
    if (!boss || boss._fpCrackPhase !== 'crack' || !boss._fpCrackSegs) return;

    ctx.save();
    ctx.lineCap = 'round';

    const originLine = boss._fpCrackLines[0];
    const ocx = (originLine.cx - camera.x) * SCALE;
    const ocy = (originLine.cy - cameraY)  * SCALE;

    boss._fpCrackSegs.forEach(seg => {
        const line = boss._fpCrackLines[seg.li];
        const cos  = Math.cos(line.angle);
        const sin  = Math.sin(line.angle);
        const fullReach = line.length * SCALE * 0.85;

        const ex = ocx + cos * seg.dir * fullReach;
        const ey = ocy + sin * seg.dir * fullReach;

        // 외곽 글로우 (넓게)
        ctx.beginPath();
        ctx.moveTo(ocx, ocy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(150,200,255,0.25)';
        ctx.lineWidth   = 18;
        ctx.stroke();

        // 내곽 글로우
        ctx.beginPath();
        ctx.moveTo(ocx, ocy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(200,230,255,0.45)';
        ctx.lineWidth   = 8;
        ctx.stroke();

        // 흰 균열선
        ctx.beginPath();
        ctx.moveTo(ocx, ocy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth   = 2;
        ctx.stroke();

        // 가지 (양방향)
        const branchCount = 6 + (seg.li % 3);
        for (let b = 1; b <= branchCount; b++) {
            const t  = b / (branchCount + 1);
            const bx = ocx + cos * seg.dir * fullReach * t;
            const by = ocy + sin * seg.dir * fullReach * t;
            const jitter = ((seg.li * 5 + b * 7 + (seg.dir > 0 ? 2 : 0)) % 9 - 4) / 4 * 0.6;
            // b 홀수→왼쪽, 짝수→오른쪽으로 교대로 갈라짐
            const side   = b % 2 === 0 ? 1 : -1;
            const bAngle = line.angle + side * (0.45 + jitter);
            const bLen   = (canvas.width * 0.05 + (seg.li * 11 + b * 17) % (canvas.width * 0.07));
            const bex = bx + Math.cos(bAngle) * bLen;
            const bey = by + Math.sin(bAngle) * bLen;

            // 가지 글로우
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bex, bey);
            ctx.strokeStyle = 'rgba(180,220,255,0.35)';
            ctx.lineWidth   = 5;
            ctx.stroke();

            // 가지 본선
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bex, bey);
            ctx.strokeStyle = 'rgba(220,240,255,0.75)';
            ctx.lineWidth   = 1.2;
            ctx.stroke();

            // 2차 가지
            if (b % 2 === 0) {
                const jitter2 = ((seg.li * 3 + b * 11) % 7 - 3) / 3 * 0.4;
                const bAngle2 = bAngle + jitter2 + (b % 3 === 0 ? 0.3 : -0.3);
                const bLen2   = bLen * 0.5;
                const mx = bx + Math.cos(bAngle) * bLen * 0.5;
                const my = by + Math.sin(bAngle) * bLen * 0.5;
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.lineTo(mx + Math.cos(bAngle2) * bLen2, my + Math.sin(bAngle2) * bLen2);
                ctx.strokeStyle = 'rgba(200,230,255,0.45)';
                ctx.lineWidth   = 3;
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.lineTo(mx + Math.cos(bAngle2) * bLen2, my + Math.sin(bAngle2) * bLen2);
                ctx.strokeStyle = 'rgba(230,245,255,0.6)';
                ctx.lineWidth   = 0.8;
                ctx.stroke();
            }
        }
    });

    ctx.restore();
}

function triggerScreenShatter(lines, snap) {
    // snap이 없으면 현재 화면을 찍음 (fallback)
    if (!snap) {
        snap = document.createElement('canvas');
        snap.width  = canvas.width;
        snap.height = canvas.height;
        snap.getContext('2d').drawImage(canvas, 0, 0);
    }

    // 절단선들로 화면을 다각형 조각으로 분리
    const W = canvas.width;
    const H = canvas.height;

    let polys = [[ [0,0],[W,0],[W,H],[0,H] ]];

    lines.forEach(line => {
        const scx = (line.cx - camera.x) * SCALE;
        const scy = (line.cy - cameraY)  * SCALE;
        const halfLen = line.length * SCALE;
        const cos = Math.cos(line.angle);
        const sin = Math.sin(line.angle);

        const ax = scx - cos * halfLen * 1.5;
        const ay = scy - sin * halfLen * 1.5;
        const bx = scx + cos * halfLen * 1.5;
        const by = scy + sin * halfLen * 1.5;

        const nx = -(by - ay);
        const ny =  (bx - ax);

        const nextPolys = [];
        polys.forEach(poly => {
            const front = [], back = [];
            const n = poly.length;
            for (let i = 0; i < n; i++) {
                const [px, py] = poly[i];
                const [qx, qy] = poly[(i + 1) % n];
                const dp = (px - ax) * nx + (py - ay) * ny;
                const dq = (qx - ax) * nx + (qy - ay) * ny;
                if (dp >= 0) front.push([px, py]);
                else          back.push([px, py]);
                if ((dp >= 0) !== (dq >= 0)) {
                    const t = dp / (dp - dq);
                    const ix = px + t * (qx - px);
                    const iy = py + t * (qy - py);
                    front.push([ix, iy]);
                    back.push([ix, iy]);
                }
            }
            if (front.length >= 3) nextPolys.push(front);
            if (back.length  >= 3) nextPolys.push(back);
        });
        polys = nextPolys;
    });

    polys.forEach(poly => {
        let cx = 0, cy = 0;
        poly.forEach(([x, y]) => { cx += x; cy += y; });
        cx /= poly.length; cy /= poly.length;

        const dx = cx - W / 2;
        const dy = cy - H / 2;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = 0.8 + Math.random() * 1.2;   // 초기 속도 낮게

        // 조각 대각선 반지름 계산 (화면 밖 판정용)
        let maxR = 0;
        poly.forEach(([x, y]) => {
            const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (r > maxR) maxR = r;
        });

        screenShards.push({
            snap,
            poly,
            cx, cy,
            _origCy: cy,
            dy:      0,    // 원래 위치에서 내려온 누적 거리
            vy:      0,    // 수직 속도
            rot:     0,
            rotV:    (Math.random() - 0.5) * 0.06,
            age:     0,
            _radius: maxR,
        });
    });

    // 화면이 깨지는 순간 30 피해 (무적 무시, 체력 1 미만으로는 안 내려감)
    player.hp = Math.max(1, player.hp - 30);
}

function updateScreenShards() {
    for (let i = screenShards.length - 1; i >= 0; i--) {
        const s = screenShards[i];
        s.vy   += 0.55;
        s.dy   += s.vy;    // 원래 poly 위치에서 얼마나 내려왔는지 누적
        s.rot  += s.rotV;
        s.age  = (s.age || 0) + 1;
        if (s.age > 600) screenShards.splice(i, 1);   // 10초(60fps) 후 삭제
    }
}

function drawScreenShards() {
    if (screenShards.length === 0) return;
    screenShards.forEach(s => {
        ctx.save();
        ctx.globalAlpha = 1;

        // 조각 무게중심을 기준으로: 아래로 dy만큼 이동 + 제자리 회전
        ctx.translate(s.cx, s._origCy + s.dy);  // 수직 이동
        ctx.rotate(s.rot);                        // 제자리 회전
        ctx.translate(-s.cx, -s._origCy);         // 원점 복원 (스냅샷 좌표계)

        ctx.beginPath();
        s.poly.forEach(([x, y], idx) => {
            if (idx === 0) ctx.moveTo(x, y);
            else           ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(s.snap, 0, 0);

        // 조각 테두리
        ctx.beginPath();
        s.poly.forEach(([x, y], idx) => {
            if (idx === 0) ctx.moveTo(x, y);
            else           ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = 'rgba(100,180,255,0.6)';
        ctx.lineWidth   = 2;
        ctx.stroke();

        ctx.restore();
    });
}

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

// ── 보스 attack2 돌진 속도선 이펙트 ──────────────────────────────
function spawnBossDashSlash(e, isP2 = false) {
    const dir = e._atk2DashDir;
    const bossL = e.x;
    const bossR = e.x + e.width;
    const bossT = e.y;
    const bossB = e.y + e.height;

    const lineCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < lineCount; i++) {
        const cy = bossT + (bossB - bossT) * (0.15 + Math.random() * 0.70);
        const cx = dir > 0 ? bossL + Math.random() * e.width * 0.5
                           : bossR - Math.random() * e.width * 0.5;
        const len   = 60 + Math.random() * 90;
        const speed = Math.abs(e.dx);

        slashEffects.push({
            type:  'bossDash',
            cx, cy, dir, len, speed,
            life:  1.0,
            decay: 0.16 + Math.random() * 0.08,
            thick: 1.5  + Math.random() * 2.5,
            isP2,   // p2 돌진이면 슬래시와 동일 색상
        });
    }
}

// ── 보스 2페이즈 p2_attack1 추격 slash (맵 전체 이동) ────────────────
// index: 0=중앙, 1=위, 2=아래 (세로 오프셋으로 이미지의 3줄 일렬 표현)
// ── p2_attack2: 특정 위치를 중심으로 할퀴기 이펙트 + 히트 판정 ──────
// 이전 각도로부터 최소 60도 차이를 보장하는 다음 공격 각도 생성
// 전체 범위는 기존과 동일한 ±80도(160도 폭) 유지
// ══════════════════════════════════════════════════════════════
// ── 보스 마지막 패턴 (체력 10% 미만 전용) ───────────────────────
// ══════════════════════════════════════════════════════════════

// 현재 진행 중인 모든 페이즈2 공격 상태를 즉시 초기화 (패턴 취소)
function _cancelAllP2Attacks(e) {
    // atk1 (대시 패턴) 초기화
    e._p2a1Phase      = 'idle';
    e._p2a1Timer      = 0;
    e._p2a1Cooldown   = 0;
    e._p2a1Alpha      = 1;
    e._p2a1Visible    = true;
    e.dx = 0; e.dy = 0;
    // atk2 (발톱 패턴) 초기화
    e._p2Attack   = 'atk1';
    e._p2a2Phase  = undefined;
    e._p2a2Alpha  = 0;
    e._p2a2Timer  = 0;
    // 보스 위치를 바닥 중앙으로 복귀
    e.x = world.width / 2 - e.width / 2;
    e.y = world.height - 60 - e.height;
    e.state = 'idle';
}

// 마지막 패턴 발동 (외부/단축키에서 호출)
function _triggerBossFinalPattern(e) {
    _cancelAllP2Attacks(e);
    // 보스를 맵 중앙 바닥으로 순간이동
    e.x = world.width / 2 - e.width / 2;
    e.y = world.height - 60 - e.height;
    e.dx = 0; e.dy = 0;
    e._finalPatternActive = true;
    e._finalPatternPhase  = 'roar';
    e._finalPatternTimer  = 110;
    e._finalPatternTick   = 0;
    e._roarRingTimer      = 0;
    e._roarRings          = [];
    // 버스트 상태 초기화 (재사용 대비)
    e._fpFirstBurst       = undefined;
    e._fpSlashBurstQueued = false;
    e._fpBurstActive      = false;
    e._fpBurstCount       = 0;
    e._fpCrackPhase       = null;
    e._fpCrackLines       = null;
    e._fpCrackSegs        = null;
}

// 마지막 패턴 프레임별 업데이트 (매 프레임 호출)
function _updateBossFinalPattern(e) {
    e._finalPatternTick = (e._finalPatternTick || 0) + 1;

    if (e._finalPatternPhase === 'roar') {
        e.dx = 0; e.dy = 0;
        e._finalPatternTimer--;
        if (e._finalPatternTimer <= 0) {
            e._finalPatternPhase = 'active';
            e._finalPatternTimer = 0;
        }

    } else if (e._finalPatternPhase === 'intro') {
        // ── 인트로: 보스 정지 ──
        e.dx = 0; e.dy = 0;
        e._finalPatternTimer--;
        if (e._finalPatternTimer <= 0) {
            e._finalPatternPhase = 'active';
            e._finalPatternTimer = 0;
        }

    } else if (e._finalPatternPhase === 'active') {
        e.dx = 0; e.dy = 0;

        // ── 슬래시 버스트 초기화 (active 첫 진입 시 자동 1회) ──
        if (e._fpFirstBurst === undefined) {
            e._fpFirstBurst       = true;
            e._fpSlashBurstQueued = true;
        }

        // V키(또는 첫 진입)로 큐에 올라온 버스트 시작
        if (e._fpSlashBurstQueued) {
            e._fpSlashBurstQueued   = false;
            e._fpBurstActive        = true;
            e._fpBurstCount         = 0;
            e._fpBurstTotal         = 7;
            e._fpBurstInterval      = 3;
            e._fpBurstIntervalTimer = 0;

            // ── 각도 사전 결정 + Fisher-Yates 셔플 ──
            const total = 7;
            const angles = [];
            for (let i = 0; i < total; i++) {
                const baseDeg  = (i / total) * 180;
                const jitter   = (Math.random() - 0.5) * 28;
                angles.push((baseDeg + jitter) * Math.PI / 180);
            }
            for (let i = angles.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [angles[i], angles[j]] = [angles[j], angles[i]];
            }
            e._fpBurstAngles = angles;   // 셔플된 스폰 순서
        }

        // 버스트 진행: 매 N프레임마다 화면 중앙에 단일 선 하나씩 스폰
        if (e._fpBurstActive) {
            e._fpBurstIntervalTimer--;
            if (e._fpBurstIntervalTimer <= 0 && e._fpBurstCount < e._fpBurstTotal) {
                e._fpBurstIntervalTimer = e._fpBurstInterval;

                const cx = world.width  / 2;
                const cy = world.height * 0.75;

                // 사전에 정해진 셔플 순서로 각도 사용
                const angleRad = e._fpBurstAngles[e._fpBurstCount];
                const SHARED_DECAY = 0.014;

                slashEffects.push({
                    type:         'p2chase',
                    cx,
                    cy,
                    angle:        angleRad,
                    length:       1800,
                    life:         1.0,
                    decay:        SHARED_DECAY,
                    width:        28,
                    drawProgress: 0,
                    drawSpeed:    1.0,
                    dir:          Math.cos(angleRad) >= 0 ? 1 : -1,
                    hitChecked:   true,
                    hitLaneX:     cx - 900,
                    hitLaneY:     cy - e.height * 0.6,
                    hitLaneW:     1800,
                    hitLaneH:     e.height * 1.2,
                    isFirstRow:   true,
                    isFinalBurst: true,   // 조각 연출용 태그
                });

                e._fpBurstCount++;

                // 마지막 슬래시 스폰 직후 → crack 대기 시작
                if (e._fpBurstCount >= e._fpBurstTotal) {
                    e._fpCrackPhase = 'wait1';   // wait1(25f) → crack(35f) → shatter
                    e._fpCrackTimer = 25;
                    // 슬래시 선 정보 저장 (균열·파편에 재사용)
                    e._fpCrackLines = slashEffects
                        .filter(s => s.isFinalBurst)
                        .map(s => ({ cx: s.cx, cy: s.cy, angle: s.angle, length: s.length }));
                }
            }

            if (e._fpBurstCount >= e._fpBurstTotal) {
                e._fpBurstActive = false;
            }
        }

        // 균열 → 파편 타이밍 관리
        if (e._fpCrackPhase) {
            e._fpCrackTimer--;

            // crack 단계: 세그먼트를 순서대로 빠르게 그리기
            if (e._fpCrackPhase === 'crack' && e._fpCrackSegs) {
                const DRAW_SPEED   = 0.18;   // 한 세그먼트가 ~6f 만에 완성
                const START_OFFSET = 0.35;   // 앞 세그먼트가 35% 그려지면 다음 시작
                const segs = e._fpCrackSegs;
                for (let i = 0; i < segs.length; i++) {
                    const prev = segs[i - 1];
                    // 첫 번째거나 앞 것이 START_OFFSET 이상 그려졌으면 진행
                    if (i === 0 || prev.t >= START_OFFSET) {
                        segs[i].t = Math.min(1, segs[i].t + DRAW_SPEED);
                    }
                }
            }
            if (e._fpCrackPhase === 'wait1' && e._fpCrackTimer <= 0) {
                e._fpCrackPhase = 'crack';
                e._fpCrackTimer = 35;

                // 각 선(5개) × 양방향(2) = 10개 세그먼트를 랜덤 순서로 섞기
                const segs = [];
                e._fpCrackLines.forEach((line, li) => {
                    [-1, 1].forEach(dir => segs.push({ li, dir, t: 0 }));
                });
                // Fisher-Yates 셔플
                for (let i = segs.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [segs[i], segs[j]] = [segs[j], segs[i]];
                }
                e._fpCrackSegs = segs;   // t: 0→1 그리기 진행도
            } else if (e._fpCrackPhase === 'crack' && e._fpCrackTimer <= 0) {
                e._fpCrackPhase = null;
                triggerScreenShatter(e._fpCrackLines, null);
                e._fpCrackLines = null;
                e._fpCrackSnap  = null;
                e._fpCrackSegs  = null;
                // 파편 날린 직후 → 보스 낙하 시퀀스 시작
                e._finalPatternPhase = 'drop';
                e.x  = world.width / 2 - e.width / 2;
                e.y  = cameraY - e.height - 5;   // 화면 상단 바로 위
                e.dx = 0;
                e.dy = 0;
                e.isInvincible    = false;
                e.invincibleTimer = 0;
            }
        }

    }

    // ── drop 페이즈: 중력으로 낙하, 바닥 도달 시 done ──
    if (e._finalPatternActive && e._finalPatternPhase === 'drop') {
        e.dy += 1.2;
        if (e.dy > 40) e.dy = 40;
        e.y += e.dy;

        let landed = false;
        platforms.forEach(plat => {
            const pt = plat.type || 'platform';
            if (pt === 'wall') return;
            if (e.x + e.width > plat.x && e.x < plat.x + plat.width &&
                e.y + e.height >= plat.y && e.y + e.height <= plat.y + Math.max(20, e.dy + 1) && e.dy >= 0) {
                e.y = plat.y - e.height;
                landed = true;
            }
        });
        const groundY = world.height - 60 - e.height;
        if (e.y >= groundY) { e.y = groundY; landed = true; }

        if (landed) {
            e.dy = 0; e.dx = 0;
            e._finalPatternPhase = 'done';
            e.state = 'idle';
        }
    }

    // ── done 페이즈: 완전 정지 ──
    if (e._finalPatternActive && e._finalPatternPhase === 'done') {
        e.dx = 0; e.dy = 0;
    }
}

// ── 마지막 패턴 렌더러 (표시 없음 — 슬래시 이펙트만으로 연출) ──
function _drawBossFinalPatternTest(ctx, e) {
    // 의도적으로 비워둠: 경고 플래시·텍스트·황금 원 등 모두 제거
}

function _p2a2NextAngle(prevRad) {
    const MIN_DIFF = 60 * Math.PI / 180;
    const RANGE    = 80 * Math.PI / 180;   // ±80도
    let next;
    let tries = 0;
    do {
        next = (Math.random() - 0.5) * 2 * RANGE;
        tries++;
    } while (Math.abs(next - prevRad) < MIN_DIFF && tries < 20);
    // 20회 시도 후에도 조건 불만족이면 반대 방향으로 강제 설정
    if (Math.abs(next - prevRad) < MIN_DIFF) {
        next = prevRad + (prevRad >= 0 ? -MIN_DIFF : MIN_DIFF);
        next = Math.max(-RANGE, Math.min(RANGE, next));
    }
    return next;
}

function spawnP2ClawAtTarget(e, targetX, targetY, angleRad, sizeScale = 1.0) {
    const bossH = e.height;

    // 전달받은 각도 사용 (없으면 랜덤)
    if (angleRad === undefined) angleRad = ((Math.random() - 0.5) * 160) * Math.PI / 180;

    // 시각적 범위 크기 (범위 표시와 동일한 기준)
    const maxLen  = 500 * sizeScale;
    const halfLen = maxLen / 2;
    const thick   = bossH * 0.65 * sizeScale;

    // 히트박스: 시각 범위보다 살짝 좁게 (길이 85%, 두께 75%)
    const hitHalfLen = halfLen * 0.85;
    const hitHalfThick = (thick / 2) * 0.75;

    // OBB 판정: 플레이어 중심을 타격 중심 기준 로컬 좌표로 변환 후 AABB 체크
    if (!player.isInvincible) {
        const pcx = player.x + player.width  * 0.5;
        const pcy = player.y + player.height * 0.5;
        const dx  = pcx - targetX;
        const dy  = pcy - targetY;
        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);
        // 로컬 좌표 (각도만큼 역회전)
        const localX = Math.abs( dx * cosA + dy * sinA);
        const localY = Math.abs(-dx * sinA + dy * cosA);
        if (localX < hitHalfLen && localY < hitHalfThick) {
            const dmg = Math.round((e.atk2Damage || 20) * 0.55);
            player.hp              = Math.max(player.hp - dmg, 0);
            player.isInvincible    = true;
            player.invincibleTimer = 50;
            player.dx = (pcx < targetX ? -1 : 1) * 9;
            player.dy = -6;
        }
    }

    // AABB 근사 (이펙트 저장용 - hitLane은 디버그/참조용으로만 유지)
    const cosA2 = Math.abs(Math.cos(angleRad));
    const sinA2 = Math.abs(Math.sin(angleRad));
    const hitW  = hitHalfLen * 2 * cosA2 + hitHalfThick * 2 * sinA2;
    const hitH  = hitHalfLen * 2 * sinA2 + hitHalfThick * 2 * cosA2;

    // 이펙트: 3줄 모두 동일 각도 (yOff로만 구분), sizeScale 적용
    const rows = [
        { yOff: -bossH * 0.30, len: 500 * sizeScale, width: 10 * sizeScale, speed: 0.55 },
        { yOff:  0,            len: 420 * sizeScale, width: 18 * sizeScale, speed: 0.50 },
        { yOff:  bossH * 0.30, len: 320 * sizeScale, width: 12 * sizeScale, speed: 0.58 },
    ];
    rows.forEach((row, i) => {
        slashEffects.push({
            type:         'p2chase',
            cx:           targetX,
            cy:           targetY + row.yOff,
            angle:        angleRad,
            length:       row.len,
            life:         1.0,
            decay:        0.026,
            width:        row.width,
            drawProgress: 0,
            drawSpeed:    row.speed,
            dir:          Math.cos(angleRad) >= 0 ? 1 : -1,
            hitChecked:   true,
            hitLaneX:     targetX - hitW / 2,
            hitLaneY:     targetY - hitH / 2,
            hitLaneW:     hitW,
            hitLaneH:     hitH,
            // 범위표시용 각도·크기 저장
            clawAngle:    angleRad,
            clawHalfLen:  halfLen,
            clawThick:    thick,
            isFirstRow:   i === 0,
        });
    });
}


function spawnP2ChaseSlash(e, groupIndex) {
    const dir    = e._p2a1DashDir;
    const spawnY = e._p2a1SpawnY;
    const bossH  = e.height;
    const bossW  = e.width;    // 히트박스 폭 기준
    const mapW   = world.width;

    // 그룹 X 위치: 7회로 맵 전체 균등 배치 (맵을 8등분해 1~7 지점)
    const step   = mapW / 8;
    const secIdx = dir > 0 ? groupIndex : (6 - groupIndex);
    const cx     = step * (secIdx + 1);

    // 각도: 기본값에 랜덤 변동 (±12°)
    const baseDeg = dir > 0 ? -10 : 190;
    const randDeg = (Math.random() - 0.5) * 24;

    // 세로 3줄: 위/중/아래
    const yOffsets = [bossH * 0.15, bossH * 0.50, bossH * 0.85];
    const configs  = [
        { len: 520, width: 10, speed: 0.55 },
        { len: 420, width: 18, speed: 0.50 },
        { len: 320, width: 12, speed: 0.58 },
    ];

    yOffsets.forEach((yOff, row) => {
        const cfg     = configs[row];
        const xOff    = dir * 20 * (row - 1);
        const rowRand = (Math.random() - 0.5) * 14;
        const slashCx = cx + xOff;

        // 히트박스: 각도 무관, slash 길이 폭 × bossH*1.2 높이 고정 직사각형
        slashEffects.push({
            type:         'p2chase',
            cx:           slashCx,
            cy:           spawnY + yOff,
            angle:        (baseDeg + randDeg + row * 4 + rowRand) * Math.PI / 180,
            length:       cfg.len,
            life:         1.0,
            decay:        0.028,
            width:        cfg.width,
            drawProgress: 0,
            drawSpeed:    cfg.speed,
            dir,
            hitChecked:   false,
            hitLaneX:     slashCx - cfg.len / 2,   // slash 길이 기준 폭
            hitLaneY:     spawnY - bossH * 0.1,    // 1.2배 높이를 위아래로 확장
            hitLaneW:     cfg.len,
            hitLaneH:     bossH * 1.2,
            isFirstRow:   row === 0,
        });
    });
}


function updateSlashEffects() {
    for (let i = slashEffects.length - 1; i >= 0; i--) {
        const s = slashEffects[i];
        if (s.type === 'bossDash') {
            // 속도선은 drawProgress 없이 바로 페이드
            s.life -= s.decay;
        } else if (s.type === 'p2chase') {
            // 고정 위치에 drawProgress로 그려지듯 등장 후 페이드아웃
            if (s.drawProgress < 1) {
                s.drawProgress = Math.min(s.drawProgress + s.drawSpeed, 1);
                // 히트 판정: 돌진 레인과 동일한 직사각형 범위
                if (!s.hitChecked && s.drawProgress > 0.3 && typeof player !== 'undefined' && !player.isInvincible) {
                    const lx = s.hitLaneX, ly = s.hitLaneY;
                    const lw = s.hitLaneW, lh = s.hitLaneH;
                    const pOvX = player.x + player.width  > lx && player.x < lx + lw;
                    const pOvY = player.y + player.height > ly && player.y < ly + lh;
                    if (pOvX && pOvY) {
                        const boss = enemies.find(e => e.type === 'boss' && !e.isDead);
                        const dmg  = boss ? Math.round((boss.atk2Damage || 20) * 0.40) : 10;
                        player.hp              = Math.max(player.hp - dmg, 0);
                        player.isInvincible    = true;
                        player.invincibleTimer = 45;
                        player.dx = s.dir * 7;
                        player.dy = -5;
                        s.hitChecked = true;
                    }
                }
            } else {
                s.life -= s.decay;
            }
        } else if (s.drawProgress < 1) {
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
        ctx.globalAlpha = s.type === 'bossDash' ? 1 : (s.drawProgress < 1 ? 1 : s.life * s.life);
        ctx.translate(s.cx, s.cy);

        if (s.type === 'slash') {
            drawSingleSlash(s);
        } else if (s.type === 'cross') {
            ctx.save(); ctx.rotate( 30 * Math.PI / 180); drawSingleSlash(s); ctx.restore();
            ctx.save(); ctx.rotate(-30 * Math.PI / 180); drawSingleSlash(s); ctx.restore();
        } else if (s.type === 'p2chase') {
            // 고정 위치에서 drawProgress로 긁히듯 나타나는 slash
            // translate(s.cx, s.cy) 이미 적용됨
            ctx.save();
            ctx.rotate(s.angle);
            const alpha = s.drawProgress < 1 ? 1.0 : s.life * s.life;
            // 글로우 + 밝은 청백 본체 + 하이라이트
            // 그려지는 방향: dir>0이면 왼쪽→오른쪽, dir<0이면 오른쪽→왼쪽
            [
                [2.5, 'rgba(100,180,255,0.20)', 1.0],
                [1.0, '#1a4aaa',                0.80],
                [0.6, '#4a9aee',                1.0],
                [0.15, '#ccecff',               0.70],
            ].forEach(([w, color, a]) => {
                if (s.drawProgress < 0.01) return;
                const fullHalf = s.length / 2;
                // dir에 맞춰 그려지는 방향 결정
                const fixedEnd = s.dir > 0 ? -fullHalf : fullHalf;   // 고정 끝
                const progEnd  = s.dir > 0
                    ? -fullHalf + s.length * s.drawProgress           // 왼→오
                    :  fullHalf - s.length * s.drawProgress;          // 오→왼
                const mid = (fixedEnd + progEnd) / 2;
                ctx.save();
                ctx.globalAlpha = alpha * a;
                ctx.fillStyle   = color;
                ctx.beginPath();
                ctx.moveTo(fixedEnd, 0);
                ctx.quadraticCurveTo(mid, -s.width * w * 0.5, progEnd, 0);
                ctx.quadraticCurveTo(mid,  s.width * w * 0.5, fixedEnd, 0);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            });
            ctx.restore();
        } else if (s.type === 'p2claw') {
            // 3-way 할퀴기: 끝에서 시작으로 긁히는 방향 (drawSingleSlash 재활용)
            ctx.save();
            ctx.rotate(s.angle);
            // 글로우(넓게) + 붉은 본체 + 하이라이트
            [ [2.0, s.glow, 0.18], [0.85, '#cc2222', 0.55], [0.45, s.color, 1.0], [0.12, '#ffaaaa', 0.60] ]
                .forEach(([w, color, alpha]) => {
                    if (s.drawProgress < 0.01) return;
                    const fullHalf = s.length / 2;
                    const startX   = fullHalf;
                    const endX     = fullHalf - fullHalf * 2 * s.drawProgress;
                    const mid      = (startX + endX) / 2;
                    ctx.save();
                    ctx.globalAlpha *= alpha;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.moveTo(startX, 0);
                    ctx.quadraticCurveTo(mid, -s.width * w * 0.5, endX, 0);
                    ctx.quadraticCurveTo(mid,  s.width * w * 0.5, startX, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                });
            ctx.restore();
        } else if (s.type === 'bossDash') {
            // 일자 속도선 (이미 ctx.translate(s.cx, s.cy) 적용된 상태)
            const alpha = s.life * s.life;
            const dir   = s.dir;
            const len   = s.len;
            const thick = s.thick;

            ctx.globalAlpha = alpha;

            // 글로우 외곽선
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-dir * len, 0);
            ctx.strokeStyle = s.isP2 ? 'rgba(100,180,255,0.35)' : 'rgba(200,225,255,0.4)';
            ctx.lineWidth   = thick * 4;
            ctx.lineCap     = 'round';
            ctx.stroke();

            // 핵심 선
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-dir * len, 0);
            ctx.strokeStyle = s.isP2 ? 'rgba(120,200,255,0.95)' : 'rgba(255,255,255,0.95)';
            ctx.lineWidth   = thick;
            ctx.lineCap     = 'round';
            ctx.stroke();
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
        // 절반 연출 진행 중 보스 무적
        if (e.type === 'boss' && (e._halfInvincible || bossHalfSeq.phase !== 'idle' && bossHalfSeq.phase !== 'done')) return;
        const ex = e.x + e.width  / 2;
        const ey = e.y + e.height / 2;
        if (Math.abs(px - ex) < atkRange && Math.abs(py - ey) < atkRange) {
            const halfHp = e.maxHp / 2;
            // 보스 체력이 아직 절반 이상이고, 이번 피해로 절반 이하가 되면 절반까지만 깎임
            if (e.type === 'boss' && !e._phase2Triggered && e.hp > halfHp) {
                e.hp = Math.max(e.hp - damage, halfHp);
                if (e.hp <= halfHp) {
                    e._phase2Triggered = true;
                    bossHalfSeq.trigger();
                }
            } else {
                // 2페이즈 피해 감소 40%
                const ultDmg = (e.type === 'boss' && e._phase2Active) ? damage * 0.6 : damage;
                e.hp = Math.max(e.hp - ultDmg, 0);
            }
            e.hpVisible       = true;
            e.isAggro         = true;
            e.isInvincible    = true;
            e.invincibleTimer = 20;
            if (e.hp <= 0) {
                e.isDead = true;
                if (e.type === 'boss') bgmPlayer.stop(true);
            }
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
    if (lW >= world.width) {
        camera.x = (world.width - lW) / 2;
    } else {
        camera.x = Math.max(0, Math.min(player.x + player.width  / 2 - lW / 2, world.width  - lW));
    }
    // 보스맵: 카메라 Y를 바닥 기준으로 고정
    if (currentMapIndex === 13) {
        cameraY = Math.max(0, world.height - lH);
    } else if (lH >= world.height) {
        cameraY = 0;
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


// ── 세이브포인트 도달 힌트 렌더링 ────────────────────────────────────
function drawSavepointHint() {
    if (!savepointHint.active || currentMapIndex !== 8) return;

    savepointHint.blinkTimer++;
    const blink = Math.floor(savepointHint.blinkTimer / 25) % 2 === 0;
    if (!blink) return;

    const lines  = ['세이브 포인트에 도달했습니다.', '사망시 이곳에서 부활하게 됩니다.'];
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

// ── 세이브포인트 맵 업데이트 (대화 종료 감지 → 이펙트+힌트) ─────────────
function updateSavepointMap() {
    savepointEffect.update();
    if (currentMapIndex !== 8) return;
    // 최초 방문: NPC 대화가 끝난 순간에 이펙트 + 힌트 발동
    if (savepointHint.shown && !savepointHint.dialogueDone && !dialogue.active) {
        savepointHint.dialogueDone = true;
        savepointHint.active       = true;
        savepointHint.blinkTimer   = 0;
        savepointEffect.trigger();
    }
}

function drawIntroHint() {
    if (introSeq.phase !== 'hint') return;

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

// ── 맵 4: 절벽 위 (맵3 천장 점프로 진입 / 구멍으로 낙하하면 맵3 복귀) ──────
// 가로 1280, 세로 600. 바닥 중앙(x=400~880)에 구멍 — 맵3 천장과 연결
// 구멍을 제외한 바닥(양쪽), 상단 발판군, 왼쪽/오른쪽 벽으로 구성
MAP_DATA.push({
    id: 4,
    worldWidth:  2880,
    worldHeight: 720,
    bgColor: '#7ab8e8',   // 맑은 하늘빛 (절벽 꼭대기 느낌)
    keepClearedEnemiesDead: true,

    spawnX: 600,
    spawnY: 60,   // ceilingTransition에서 덮어쓰므로 기본값만

    platforms: [
        // ── 왼쪽/오른쪽 벽 ──────────────────────────────────────────
        { x: -60,  y: 0, width: 60,  height: 720, type: 'wall' },
        { x: 2880, y: 0, width: 60,  height: 720, type: 'wall' },

        // ── 바닥: 구멍(x=0~400)은 맨 왼쪽 — 오른쪽 바닥만 존재 ────────
        { x: 400, y: 660, width: 2480, height: 60, type: 'solid' },

        // ── 중층 발판 (간격 넓게 복구) ───────────────────────────────
        { x: 700,  y: 500, width: 200, height: 18, type: 'platform' },
        { x: 1300, y: 430, width: 200, height: 18, type: 'platform' },
        { x: 1950, y: 500, width: 200, height: 18, type: 'platform' },

        // ── 오른쪽 끝 높은 플랫폼 (시야에 보이지만 플레이어 도달 불가) ──
        { x: 2560, y: 160, width: 260, height: 18, type: 'platform' },
    ],

    signs:   [],
    spikes:  [],
    enemies: [
        // 지상 몹1 — 구멍(x=0~400)에서 충분히 멀리 배치 (배회범위 ±180 고려)
        { type: 'enemy1', x: 1000, y: 660 },
        { type: 'enemy1', x: 1700, y: 660 },
        // 중층 플랫폼 위 몹1
        { type: 'enemy1', x: 1350, y: 430 },
        { type: 'enemy1', x: 2000, y: 500 },
        // 높은 플랫폼 위 몹1
        { type: 'enemy1', x: 2620, y: 160 },
    ],
    dummies: [],

    // 맵4는 일반 transition 없음 — 구멍 낙하는 checkMap4PitFall() 에서 처리
    transitions: [
        {
            x: 2840, y: 540,
            width: 40, height: 120,
            toMap: 5, spawnX: 80, spawnY: 580,
            direction: 'right',
            requireClear: true,
            groundSpawn: true
        }
    ],

    onEnter: () => {
        // ceilingTransition.switch 단계에서 직접 좌표 설정하므로 여기선 리셋만
        player.dx      = 0;
        player.grounded = false;
    }
});

MAP_DATA.push({
    id: 5,
    worldWidth:  2880,
    worldHeight: 720,
    bgColor: '#7ab8e8',
    keepClearedEnemiesDead: true,

    spawnX: 80,
    spawnY: 580,

    platforms: [
        { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 2880, y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 0,    y: 660, width: 2880, height: 60,  type: 'solid' },

        // ── 중층 발판 (간격 넓게) ─────────────────────────────────────
        { x: 450,  y: 500, width: 200, height: 18, type: 'platform' },
        { x: 1100, y: 430, width: 200, height: 18, type: 'platform' },
        { x: 1700, y: 490, width: 200, height: 18, type: 'platform' },

        // ── enemy3 2마리가 올라서는 오른쪽 끝 플랫폼 ──────────────────
        { x: 2260, y: 380, width: 380, height: 18, type: 'platform' },
    ],

    signs:   [],
    spikes:  [],
    enemies: [
        // enemy3: 오른쪽 끝 플랫폼 위 2마리 (플랫폼 y=380)
        { type: 'enemy3', x: 2310, y: 380 },
        { type: 'enemy3', x: 2510, y: 380 },

        // enemy1: 지상
        { type: 'enemy1', x:  600, y: 660 },
        { type: 'enemy1', x:  900, y: 660 },
        { type: 'enemy1', x: 1200, y: 660 },
        // 중층 플랫폼 위 enemy1 (플랫폼 y=430)
        { type: 'enemy1', x: 1150, y: 430 },
    ],
    dummies: [],
    transitions: [
        {
            x: -20, y: 540,
            width: 40, height: 120,
            toMap: 4, spawnX: 2760, spawnY: 580,
            direction: 'left',
            groundSpawn: true
        },
        {
            x: 2840, y: 540,
            width: 40, height: 120,
            toMap: 6, spawnX: 80, spawnY: 580,
            direction: 'right',
            requireClear: true,
            groundSpawn: true
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;
    }
});

MAP_DATA.push({
    id: 6,
    worldWidth:  2880,
    worldHeight: 720,
    bgColor: '#7ab8e8',
    keepClearedEnemiesDead: true,

    spawnX: 80,
    spawnY: 580,

    platforms: [
        { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 2880, y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 0,    y: 660, width: 2880, height: 60,  type: 'solid' },

        // ── 왼쪽 구간 발판 ────────────────────────────────────────────
        { x: 300,  y: 510, width: 200, height: 18, type: 'platform' },
        { x: 750,  y: 440, width: 180, height: 18, type: 'platform' },

        // ── 계단식 플랫폼 4단 (오른쪽으로 갈수록 높아짐) ──────────────
        { x: 1200, y: 560, width: 200, height: 18, type: 'platform' },  // 1단
        { x: 1560, y: 460, width: 200, height: 18, type: 'platform' },  // 2단
        { x: 1920, y: 360, width: 200, height: 18, type: 'platform' },  // 3단
        { x: 2280, y: 260, width: 200, height: 18, type: 'platform' },  // 4단 (최상단)
    ],

    signs:   [],
    spikes:  [],
    enemies: [
        // enemy3: 계단 최상단(4단 y=260) 위 1마리
        { type: 'enemy3', x: 2340, y: 260 },

        // enemy2: 계단 1~3단 위 (gravity=0, y=플랫폼y로 자연스럽게 뜸)
        { type: 'enemy2', x: 1260, y: 560 },
        { type: 'enemy2', x: 1620, y: 460 },
        { type: 'enemy2', x: 1980, y: 360 },

        // enemy1: 지상 + 왼쪽 발판 위
        { type: 'enemy1', x:  400, y: 660 },
        { type: 'enemy1', x:  350, y: 510 },
        { type: 'enemy1', x:  800, y: 440 },
    ],
    dummies: [],
    transitions: [
        {
            x: -20, y: 540,
            width: 40, height: 120,
            toMap: 5, spawnX: 2760, spawnY: 580,
            direction: 'left',
            groundSpawn: true
        },
        {
            x: 2840, y: 540,
            width: 40, height: 120,
            toMap: 7, spawnX: 80, spawnY: 580,
            direction: 'right',
            requireClear: true,
            groundSpawn: true
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;
    }
});

MAP_DATA.push({
    id: 7,
    worldWidth:  2880,
    worldHeight: 720,
    bgColor: '#7ab8e8',
    keepClearedEnemiesDead: true,

    spawnX: 80,
    spawnY: 580,

    platforms: [
        { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 2880, y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 0,    y: 660, width: 2880, height: 60,  type: 'solid' },

        { x: 420,  y: 530, width: 220, height: 18, type: 'platform' },
        { x: 820,  y: 440, width: 180, height: 18, type: 'platform' },
        { x: 1280, y: 510, width: 220, height: 18, type: 'platform' },
        { x: 1760, y: 420, width: 200, height: 18, type: 'platform' },
        { x: 2260, y: 520, width: 240, height: 18, type: 'platform' }
    ],

    signs:   [],
    spikes:  [],
    enemies: [
        { type: 'enemy1', x: 1450, y: 660 }
    ],
    dummies: [],
    transitions: [
        {
            x: -20, y: 540,
            width: 40, height: 120,
            toMap: 6, spawnX: 2760, spawnY: 580,
            direction: 'left',
            groundSpawn: true
        },
        {
            x: 2840, y: 540,
            width: 40, height: 120,
            toMap: 8, spawnX: 80, spawnY: 580,
            direction: 'right',
            requireClear: true,
            groundSpawn: true
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;
    }
});

// ── 맵 8: 세이브포인트 (뷰포트 1280×720에 맞춰 배경 꽉 채움, 카메라 고정) ──
MAP_DATA.push({
    id: 8,
    worldWidth:  1280,
    worldHeight: 720,
    bgColor: '#87CEEB',
    keepClearedEnemiesDead: true,

    spawnX: 80,
    spawnY: 580,

    platforms: [
        { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 1280, y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 0,    y: 660, width: 1280, height: 60,  type: 'solid' },
    ],

    signs: [
        {
            // 세이브포인트 NPC — 맵 오른쪽 40% 지점 (x≈768), 바닥(y=660)에 발 맞춤
            x: 730, y: 536,
            width: 78, height: 124,
            interactRange: 130,
            isNpc: true,          // sign과 구분하는 플래그
            imgKey: 'NPC1_STORY', // 이미지가 없으면 직사각형 폴백
            direction: 'left',    // 플레이어 쪽(왼쪽)을 바라봄
            cast: ['STORY1', 'NPC1_STORY'],
            dialogue: [
                { speaker: 'NPC',  text: '이곳에 오시다니 고생이 많으셨겠군요.',         speakerType: 'npc',    illustKey: 'NPC1_STORY' },
                { speaker: '???',  text: '당신은 누구입니까?',                            speakerType: 'player', illustKey: 'STORY1' },
                { speaker: 'NPC',  text: '저는 이 세이브 포인트를 지키는 자입니다.',       speakerType: 'npc',    illustKey: 'NPC1_STORY' },
                { speaker: 'NPC',  text: '이곳에서 쉬다 가세요. 당신의 여정을 응원합니다.', speakerType: 'npc',   illustKey: 'NPC1_STORY' },
                { speaker: '???',  text: '...감사합니다.',                                 speakerType: 'player', illustKey: 'STORY1' },
            ]
        }
    ],
    spikes:  [],
    enemies: [],
    dummies: [],
    transitions: [
        {
            x: -20, y: 540,
            width: 40, height: 120,
            toMap: 7, spawnX: 2760, spawnY: 580,
            direction: 'left',
            groundSpawn: true
        },
        {
            x: 1260, y: 540,
            width: 40, height: 120,
            toMap: 9, spawnX: 80, spawnY: 580,
            direction: 'right',
            groundSpawn: true
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;

        if (!savepointHint.shown) {
            // ── 최초 방문: NPC 대화 먼저, 대화 종료 후 이펙트+힌트는 updateSavepointMap()에서 처리 ──
            savepointHint.shown       = true;
            savepointHint.dialogueDone = false;
            savepointHint.active      = false;
            dialogue.active      = true;
            dialogue.cast        = ['STORY1', 'NPC1_STORY'];
            dialogue.lines       = [
                { speaker: 'NPC',      text: '어서오세요. 이곳은 세이브 포인트입니다.',          speakerType: 'npc',    illustKey: 'NPC1_STORY' },
                { speaker: 'NPC',      text: '이 자리에서 힘을 회복하고 떠나세요.',               speakerType: 'npc',    illustKey: 'NPC1_STORY' },
                { speaker: 'NPC',      text: '만약 쓰러지더라도, 이곳에서 다시 깨어날 수 있을 겁니다.', speakerType: 'npc', illustKey: 'NPC1_STORY' },
                { speaker: '???',      text: '...감사합니다.',                                    speakerType: 'player', illustKey: 'STORY1' },
            ];
            dialogue.currentLine = 0;
            dialogue.speakerName = dialogue.lines[0].speaker;
            dialogue.speakerType = dialogue.lines[0].speakerType;
            dialogue.illustKey   = dialogue.lines[0].illustKey;
            dialogue.displayText = '';
            dialogue.charIndex   = 0;
            dialogue.typingTimer = 0;
            dialogue.isFinished  = false;
        } else {
            // ── 재방문: 맵 전환 완료 후 이펙트 + HP 회복 (pending으로 지연 발동) ──
            savepointEffect.pending = true;
        }
    }
});

// ── 맵 9: 세이브 이후 구간 1 ────────────────────────────────────────────
MAP_DATA.push({
    id: 9,
    worldWidth:  2880,
    worldHeight: 720,
    bgColor: '#7ab8e8',
    keepClearedEnemiesDead: true,

    spawnX: 80,
    spawnY: 580,

    platforms: [
        { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 2880, y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 0,    y: 660, width: 2880, height: 60,  type: 'solid' },

        { x: 420,  y: 530, width: 220, height: 18, type: 'platform' },
        { x: 820,  y: 440, width: 180, height: 18, type: 'platform' },
        { x: 1280, y: 510, width: 220, height: 18, type: 'platform' },
        { x: 1760, y: 420, width: 200, height: 18, type: 'platform' },
        { x: 2260, y: 520, width: 240, height: 18, type: 'platform' }
    ],

    signs:   [],
    spikes:  [],
    enemies: [
        { type: 'enemy1', x: 1440, y: 660 }
    ],
    dummies: [],
    transitions: [
        {
            x: -20, y: 540,
            width: 40, height: 120,
            toMap: 8, spawnX: 1000, spawnY: 580,
            direction: 'left',
            groundSpawn: true
        },
        {
            x: 2840, y: 540,
            width: 40, height: 120,
            toMap: 10, spawnX: 80, spawnY: 580,
            direction: 'right',
            requireClear: true,
            groundSpawn: true
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;
    }
});

// ── 맵 10: 세이브 이후 구간 2 ───────────────────────────────────────────
MAP_DATA.push({
    id: 10,
    worldWidth:  2880,
    worldHeight: 720,
    bgColor: '#7ab8e8',
    keepClearedEnemiesDead: true,

    spawnX: 80,
    spawnY: 580,

    platforms: [
        { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 2880, y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 0,    y: 660, width: 2880, height: 60,  type: 'solid' },

        { x: 420,  y: 530, width: 220, height: 18, type: 'platform' },
        { x: 820,  y: 440, width: 180, height: 18, type: 'platform' },
        { x: 1280, y: 510, width: 220, height: 18, type: 'platform' },
        { x: 1760, y: 420, width: 200, height: 18, type: 'platform' },
        { x: 2260, y: 520, width: 240, height: 18, type: 'platform' }
    ],

    signs:   [],
    spikes:  [],
    enemies: [
        { type: 'enemy2', x: 1440, y: 660 }
    ],
    dummies: [],
    transitions: [
        {
            x: -20, y: 540,
            width: 40, height: 120,
            toMap: 9, spawnX: 2760, spawnY: 580,
            direction: 'left',
            groundSpawn: true
        },
        {
            x: 2840, y: 540,
            width: 40, height: 120,
            toMap: 11, spawnX: 80, spawnY: 580,
            direction: 'right',
            requireClear: true,
            groundSpawn: true
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;
    }
});

// ── 맵 11: 세이브 이후 구간 3 ───────────────────────────────────────────
MAP_DATA.push({
    id: 11,
    worldWidth:  2880,
    worldHeight: 720,
    bgColor: '#7ab8e8',
    keepClearedEnemiesDead: true,

    spawnX: 80,
    spawnY: 580,

    platforms: [
        { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 2880, y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 0,    y: 660, width: 2880, height: 60,  type: 'solid' },

        { x: 420,  y: 530, width: 220, height: 18, type: 'platform' },
        { x: 820,  y: 440, width: 180, height: 18, type: 'platform' },
        { x: 1280, y: 510, width: 220, height: 18, type: 'platform' },
        { x: 1760, y: 420, width: 200, height: 18, type: 'platform' },
        { x: 2260, y: 520, width: 240, height: 18, type: 'platform' }
    ],

    signs:   [],
    spikes:  [],
    enemies: [
        { type: 'enemy3', x: 1440, y: 660 }
    ],
    dummies: [],
    transitions: [
        {
            x: -20, y: 540,
            width: 40, height: 120,
            toMap: 10, spawnX: 2760, spawnY: 580,
            direction: 'left',
            groundSpawn: true
        },
        {
            x: 2840, y: 540,
            width: 40, height: 120,
            toMap: 12, spawnX: 80, spawnY: 580,
            direction: 'right',
            requireClear: true,
            groundSpawn: true
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;
    }
});

// ── 맵 12: 세이브 이후 구간 4 ───────────────────────────────────────────
MAP_DATA.push({
    id: 12,
    worldWidth:  2880,
    worldHeight: 720,
    bgColor: '#7ab8e8',
    keepClearedEnemiesDead: true,

    spawnX: 80,
    spawnY: 580,

    platforms: [
        { x: -60,  y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 2880, y: 0,   width: 60,   height: 720, type: 'wall' },
        { x: 0,    y: 660, width: 2880, height: 60,  type: 'solid' },

        { x: 420,  y: 530, width: 220, height: 18, type: 'platform' },
        { x: 820,  y: 440, width: 180, height: 18, type: 'platform' },
        { x: 1280, y: 510, width: 220, height: 18, type: 'platform' },
        { x: 1760, y: 420, width: 200, height: 18, type: 'platform' },
        { x: 2260, y: 520, width: 240, height: 18, type: 'platform' }
    ],

    signs:   [],
    spikes:  [],
    enemies: [
        { type: 'enemy2', x: 1440, y: 660 }
    ],
    dummies: [],
    transitions: [
        {
            x: -20, y: 540,
            width: 40, height: 120,
            toMap: 11, spawnX: 2760, spawnY: 580,
            direction: 'left',
            groundSpawn: true
        },
        {
            x: 2840, y: 540,
            width: 40, height: 120,
            toMap: 13, spawnX: 80, spawnY: 580,
            direction: 'right',
            requireClear: true,
            groundSpawn: true
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;
    }
});

// ── 맵 13: 보스전 장소 ──────────────────────────────────────────────────
// 화면 1.5배 너비(1920), 세로도 1.5배(1080) — 천장 없이 카메라 자유 추적
// 양옆에 위아래 2개씩 플랫폼 배치
MAP_DATA.push({
    id: 13,
    worldWidth:  1920,
    worldHeight: 1080,
    bgColor: '#55c0e0',   // BG_PLAIN 이미지 상단 색과 자연스럽게 이어지는 하늘색
    keepClearedEnemiesDead: true,

    spawnX: 120,
    spawnY: 940,

    platforms: [
        // ── 좌우 벽 ────────────────────────────────────────────────────
        { x: -60,  y: 0, width: 60,   height: 1080, type: 'wall' },
        { x: 1920, y: 0, width: 60,   height: 1080, type: 'wall' },

        // ── 바닥 (전체) ─────────────────────────────────────────────────
        { x: 0,    y: 1020, width: 1920, height: 60, type: 'solid' },

        // ── 플랫폼: 중앙에 가까운 좌우 대칭 한 쌍 ──────────────────────
        { x: 80,   y: 820, width: 560, height: 18, type: 'platform' },   // 왼쪽
        { x: 1280, y: 820, width: 560, height: 18, type: 'platform' },   // 오른쪽
    ],

    signs:   [],
    spikes:  [],
    enemies: [],   // 보스는 onEnter 대화 종료 후 스폰
    dummies: [],
    transitions: [
        {
            x: -20, y: 860,
            width: 40, height: 160,
            toMap: 12, spawnX: 2760, spawnY: 580,
            direction: 'left',
            groundSpawn: true,
            requireBossDefeated: true   // 보스 생존 중 이전 맵으로 돌아가기 불가
        }
    ],

    onEnter: () => {
        player.dx       = 0;
        player.grounded = false;
        bossMapReached  = true;

        // 기존 BGM 빠르게 페이드아웃
        bgmPlayer.fadeOutFast(() => { /* 대화 종료 후 보스BGM은 dialogue 끝에서 재생 */ });

        if (!MAP_DATA[13]._introDone) {
            MAP_DATA[13]._introDone = true;
            bossHpBar.visible    = false;   // 대화 후 등장
            dialogue.active      = true;
            dialogue.cast        = ['STORY1', 'BOSS_STORY1'];
            dialogue.lines       = [
                { speaker: '???',      text: '너탁경구.',                speakerType: 'npc',    illustKey: 'BOSS_STORY1' },
                { speaker: '플레이어', text: '너도탁경구.',              speakerType: 'player', illustKey: 'STORY1'      },
                { speaker: '???',      text: '탁',                   speakerType: 'npc',    illustKey: 'BOSS_STORY1' },
                { speaker: '???',      text: '그 말은 내가 해야 할 것 같은데.', speakerType: 'npc',    illustKey: 'BOSS_STORY1' },
                { speaker: '플레이어', text: '...',                             speakerType: 'player', illustKey: 'STORY1'      },
                { speaker: '???',      text: '오냐덤벼라.',                         speakerType: 'npc',    illustKey: 'BOSS_STORY1' },
            ];
            dialogue.currentLine = 0;
            dialogue.speakerName = dialogue.lines[0].speaker;
            dialogue.speakerType = dialogue.lines[0].speakerType;
            dialogue.illustKey   = dialogue.lines[0].illustKey;
            dialogue.displayText = '';
            dialogue.charIndex   = 0;
            dialogue.typingTimer = 0;
            dialogue.isFinished  = false;
        } else {
            // 재진입: 배경·페이즈2 상태 완전 리셋 (항상 기본 배경으로 시작)
            bossPhase2.reset();
            bossHalfSeq.phase = 'idle';
            bossHalfSeq.timer = 0;
            bossHalfSeq.stand2TransTimer = 0;
            // 보스 imgStand도 1페이즈 스프라이트로 복원
            const bossToReset = enemies.find(e => e.type === 'boss');
            if (bossToReset) bossToReset.imgStand = 'BOSS_STAND';

            bgmPlayer.fadeOutFast(() => {});
            if (!bossHpBar.visible) bossHpBar.startIntro();
            bgmPlayer.play('BGM_BOSS1', true);
            // 살아있는 보스가 없으면 재스폰
            const bossAlive = enemies.some(e => e.type === 'boss' && !e.isDead);
            if (!bossAlive) enemies.push(createEnemy('boss', 960, 1020));
        }
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