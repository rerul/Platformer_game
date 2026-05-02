/**
 * [플랫포머 게임 통합 엔진]
 * 섹션 [1] ~ [10] 전체 코드
 */

// [1] 설정 및 전역 변수 (Settings & Globals)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1280;
canvas.height = 720;
const world = { width: 3000, height: 720 };

// [2] 자산 관리 (Asset Management)
const ASSETS = {
    PLAYER_STAND: './assets/images/player_stand.png',
    PLAYER_MOVE: './assets/images/player_move.png',
    PLAYER_JUMP1: './assets/images/player_jump1.png',
    PLAYER_JUMP2: './assets/images/player_jump2.png'
};
const sprites = {};
let imagesLoaded = 0;

function loadAssets(callback) {
    const keys = Object.keys(ASSETS);
    keys.forEach(key => {
        sprites[key] = new Image();
        sprites[key].src = ASSETS[key];
        sprites[key].onload = () => { if (++imagesLoaded === keys.length) callback(); };
        sprites[key].onerror = () => { if (++imagesLoaded === keys.length) callback(); };
    });
}

// [3] 입력 감지 (Input Control)
const keys = { a: false, d: false, s: false, w: false, space: false, spacePressed: false, e: false };

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'a') keys.a = true;
    if (key === 'd') keys.d = true;
    if (key === 's') keys.s = true;
    if (key === 'w') keys.w = true;
    if (key === ' ' && !keys.spacePressed) { keys.space = true; keys.spacePressed = true; }
    if (key === 'e') handleEKey(); // 투사체/순간이동 함수 분리 호출
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'a') keys.a = false;
    if (key === 'd') keys.d = false;
    if (key === 's') keys.s = false;
    if (key === 'w') keys.w = false;
    if (key === ' ') { keys.space = false; keys.spacePressed = false; }
});

// 대시 발동: 마우스 우클릭
window.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // 메뉴 뜨는 것 방지
    const now = Date.now();
    // 대시 중이 아니고 쿨타임이 지났을 때만 실행
    if (!player.isDashing && now - player.lastDashTime > player.dashCooldown) {
        startDash();
    }
});

function handleEKey() {
    const now = Date.now();
    if (projectile.active) {
        player.x = projectile.x - player.width / 2 + projectile.width / 2;
        player.y = projectile.y - player.height / 2 + projectile.height / 2;
        player.dy = 0;
        player.isDescending = false;
        projectile.reset();
    } else if (now - player.lastTeleportTime > player.teleportCooldown) {
        projectile.launch(player.x, player.y, player.direction, keys);
    }
}

function startDash() {
    player.isDashing = true;
    player.isInvincible = true;
    player.lastDashTime = Date.now();
    
    // 현재 바라보는 방향으로 속도 고정
    const dashDir = player.direction === 'right' ? 1 : -1;
    player.dx = dashDir * player.dashSpeed;
    player.dy = 0; // 대시 중 수직 이동 방지

    // 지속 시간(dashDuration) 후에 상태 해제
    setTimeout(() => {
        player.isDashing = false;
        player.isInvincible = false;
    }, player.dashDuration);
}
// [4] 게임 객체 정의 (Player & Camera)
const player = {
    x: 100, y: 500, width: 60, height: 60,
    dx: 0, dy: 0,
    speed: 7, jumpForce: 16, gravity: 0.8, friction: 0.8,
    grounded: false, jumpCount: 0, maxJumps: 2,
    isDescending: false, isDashing: false, isInvincible: false,
    
    // 애니메이션 및 상태 제어
    state: 'idle', direction: 'right', jumpTimer: 0,
    
    // 스킬 데이터
    dashSpeed: 18, dashDuration: 120, dashCooldown: 600, lastDashTime: 0,
    teleportCooldown: 3000, lastTeleportTime: 0
};

const camera = { x: 0, y: 0, width: canvas.width, height: canvas.height };

// [5] 지형 데이터 (Map Data)
const platforms = [
    { x: 300, y: 550, width: 200, height: 20 },
    { x: 600, y: 450, width: 200, height: 20 },
    { x: 900, y: 350, width: 200, height: 20 },
    { x: 1200, y: 450, width: 200, height: 20 },
    { x: 500, y: 250, width: 400, height: 20 }
];

// [6] 물리 연산 및 업데이트 (Physics & Update)
function update() {
    updateAfterimages();
    if (player.isDashing) createAfterimage();

    // 6-1: 수평 이동 및 마찰력
    if (!player.isDashing) {
        if (keys.a) {
            player.dx = -player.speed;
            player.direction = 'left';
        } else if (keys.d) {
            player.dx = player.speed;
            player.direction = 'right';
        } else {
            player.dx *= player.friction;
            if (Math.abs(player.dx) < 0.5) player.dx = 0;
        }
    }

    // --- 애니메이션 상태 결정 로직 (수직 속도 dy 기준) ---
    if (player.isDashing) {
        // 대시 중에는 무조건 이동 모션
        player.state = 'walk'; 
    } else if (!player.grounded) {
        // 공중 상태일 때
        if (player.dy < 0) {
            // 위로 상승 중이면 JUMP1 (이단 점프 포함)
            player.state = 'jump1';
        } else {
            // 아래로 낙하 중이면 JUMP2
            player.state = 'jump2';
        }
    } else {
        // 지면 상태: 키 입력 여부에 따라 walk 또는 idle
        if (keys.a || keys.d) {
            player.state = 'walk';
        } else {
            player.state = 'idle';
        }
    }

    // 6-2: 점프 및 중력
    if (!player.isDashing) {
        if (keys.space && player.jumpCount < player.maxJumps) {
            if (keys.s && player.grounded) {
                player.isDescending = true;
                player.grounded = false;
                player.y += 15;
            } else {
                // 점프 발동 (dy가 음수가 되어 jump1 상태가 됨)
                player.dy = -player.jumpForce;
                player.jumpCount++;
                player.grounded = false;
            }
            keys.space = false; 
        }
        player.dy += player.gravity;
    } else {
        // 대시 물리: 중력 무시 및 속도 강제 유지
        const dashDir = player.direction === 'right' ? 1 : -1;
        player.dx = dashDir * player.dashSpeed;
        player.dy = 0;
    }
    
    player.x += player.dx;
    player.y += player.dy;

    // 6-3: 충돌 체크
    player.grounded = false;
    if (player.y + player.height > world.height - 50) {
        player.y = world.height - 50 - player.height;
        player.dy = 0;
        player.grounded = true;
        player.jumpCount = 0;
        player.isDescending = false;
    }
    if (player.dy >= 0) {
        platforms.forEach(plat => {
            if (player.x + player.width > plat.x && player.x < plat.x + plat.width &&
                player.y + player.height <= plat.y + 15 && player.y + player.height + player.dy >= plat.y) {
                if (!player.isDescending) {
                    player.y = plat.y - player.height;
                    player.dy = 0;
                    player.grounded = true;
                    player.jumpCount = 0;
                }
            }
        });
    }
    if (player.dy > 10) player.isDescending = false;

    // 6-4: 시스템 업데이트 및 카메라
    projectile.update();
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > world.width) player.x = world.width - player.width;
    camera.x = player.x - canvas.width / 2 + player.width / 2;
    if (camera.x < 0) camera.x = 0;
    if (camera.x > world.width - canvas.width) camera.x = world.width - canvas.width;

    draw();
    requestAnimationFrame(update);
}
// [7] 렌더링 (Rendering)
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // 7-1: 월드 배경
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.fillStyle = '#654321';
    ctx.fillRect(0, world.height - 50, world.width, 50);

    // 7-2: 플랫폼
    platforms.forEach(plat => {
        ctx.fillStyle = '#4A4A4A';
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        ctx.fillStyle = '#8BC34A'; 
        ctx.fillRect(plat.x, plat.y, plat.width, 5);
    });

    // 7-6: 잔상 그리기 (기본 비율)
    afterimages.forEach(img => {
        drawSprite(img.imageKey, img.x, img.y, img.width, img.height, img.direction, img.opacity);
    });

    // 7-3: 투사체
    if (projectile.active) {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(projectile.x + 10, projectile.y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    // 7-4: 플레이어 본체
    let currentKey = 'PLAYER_STAND';
    if (player.state === 'jump1') currentKey = 'PLAYER_JUMP1';
    else if (player.state === 'jump2') currentKey = 'PLAYER_JUMP2';
    else if (player.state === 'walk') currentKey = 'PLAYER_MOVE';

    // 무적 상태 시 투명도 0.6 적용
    drawSprite(currentKey, player.x, player.y, player.width, player.height, player.direction, player.isInvincible ? 0.6 : 1);

    ctx.restore();
    drawUI();
}

/** 
 * 렌더링 도우미: 이미지 좌우반전만 포함 (기본 비율)
 */
function drawSprite(key, x, y, w, h, dir, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    
    const img = sprites[key];
    if (img && img.complete) {
        if (dir === 'right') { // 원본이 왼쪽이므로 오른쪽일 때 반전
            ctx.translate(x + w, y);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, w, h);
        } else {
            ctx.drawImage(img, x, y, w, h);
        }
    } else {
        // 이미지 로드 전 대체 사각형
        ctx.fillStyle = key.includes('JUMP') ? 'orange' : (key === 'PLAYER_MOVE' ? 'blue' : 'red');
        ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
}

function drawUI() {
    const now = Date.now();
    const dashCD = Math.max(0, (player.dashCooldown - (now - player.lastDashTime)) / 1000);
    ctx.fillStyle = 'black';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`DASH READY: ${dashCD === 0 ? "YES" : dashCD.toFixed(1) + "s"}`, 20, 40);
    ctx.fillText(`TP READY: ${projectile.active ? "GO!" : "YES"}`, 20, 70);
}
// [8] 투사체 시스템 (Projectile System)
const projectile = {
    active: false, x: 0, y: 0, width: 20, height: 20, dx: 0, dy: 0, speed: 25, friction: 0.92, timer: 0, maxLife: 300,
    launch: function(pX, pY, pDir, keys) {
        this.active = true;
        this.x = pX + 20; this.y = pY + 20;
        this.timer = 0;
        let vx = 0, vy = 0;
        if (keys.w) vy = -1; else if (keys.s) vy = 1;
        if (keys.a) vx = -1; else if (keys.d) vx = 1;
        if (vx === 0 && vy === 0) vx = (pDir === 'right' ? 1 : -1);
        const mag = Math.sqrt(vx * vx + vy * vy) || 1;
        this.dx = (vx / mag) * this.speed;
        this.dy = (vy / mag) * this.speed;
    },
    update: function() {
        if (!this.active) return;
        this.x += this.dx; this.y += this.dy;
        this.dx *= this.friction; this.dy *= this.friction;
        // 지형 충돌 시 정지
        if (this.y + this.height > world.height - 50 || this.x < 0 || this.x + this.width > world.width || this.y < 0) {
            this.dx = 0; this.dy = 0;
        }
        if (++this.timer > this.maxLife) this.reset();
    },
    reset: function() { this.active = false; player.lastTeleportTime = Date.now(); }
};

// [10] 잔상 시스템 (Afterimage System)
const afterimages = [];

function createAfterimage() {
    let key = 'PLAYER_STAND';
    if (player.state === 'jump1') key = 'PLAYER_JUMP1';
    else if (player.state === 'jump2') key = 'PLAYER_JUMP2';
    else if (player.state === 'walk') key = 'PLAYER_MOVE';

    afterimages.push({
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height,
        opacity: 0.6,
        direction: player.direction,
        imageKey: key
    });
}

function updateAfterimages() {
    for (let i = afterimages.length - 1; i >= 0; i--) {
        afterimages[i].opacity -= 0.08; // 소멸 속도
        if (afterimages[i].opacity <= 0) {
            afterimages.splice(i, 1);
        }
    }
}
// [9] 게임 시작 (Game Start)
loadAssets(() => { update(); });