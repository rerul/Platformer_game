/**
 * [플랫포머 게임 통합 엔진 - 전투 및 유틸리티 강화 버전]
 */

// [SECTION 1] 설정 및 전역 변수 (Settings & Globals)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1280;
canvas.height = 720;
const world = { width: 3000, height: 720 };

// [SECTION 2] 자산 관리 (Asset Management)
const ASSETS = {
    PLAYER_STAND: './assets/images/player_stand.png',
    PLAYER_MOVE1: './assets/images/player_move1.png',
    PLAYER_MOVE2: './assets/images/player_move2.png',
    PLAYER_JUMP1: './assets/images/player_jump1.png',
    PLAYER_JUMP2: './assets/images/player_jump2.png',
    ATTACK1: './assets/images/player_attack1.png',
    ATTACK2: './assets/images/player_attack2.png',
    JUMP_ATTACK1: './assets/images/player_jump_attack1.png',
    JUMP_ATTACK2: './assets/images/player_jump_attack2.png'
};

const sprites = {};
let imagesLoaded = 0;

function loadAssets(callback) {
    const keys = Object.keys(ASSETS);
    if (keys.length === 0) return callback();

    keys.forEach(key => {
        const img = new Image();
        img.src = ASSETS[key];
        
        // 브라우저에게 이 이미지를 미리 메모리에 풀어놓으라고 명령 (비동기 디코딩)
        img.decode().then(() => {
            sprites[key] = img;
            imagesLoaded++;
            if (imagesLoaded === keys.length) {
                callback();
            }
        }).catch(() => {
            // 디코딩 실패 시(파일 없음 등)에도 일단 카운트는 올려서 게임 실행 보장
            sprites[key] = img; 
            imagesLoaded++;
            if (imagesLoaded === keys.length) callback();
        });
    });
}
// [SECTION 3] 입력 감지 (Input Control)
const keys = { a: false, d: false, s: false, w: false, space: false, spacePressed: false, mouseLeft: false, mouseLeftPressed: false };

window.addEventListener('mousedown', (e) => { 
    if (e.button === 0) {
        keys.mouseLeft = true; 
        keys.mouseLeftPressed = true; // 새로 눌림 감지
    }
});
window.addEventListener('mouseup', (e) => { 
    if (e.button === 0) {
        keys.mouseLeft = false; 
        keys.mouseLeftPressed = false; // 떼면 초기화
    }
});

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'a') keys.a = true;
    if (key === 'd') keys.d = true;
    if (key === 's') keys.s = true;
    if (key === 'w') keys.w = true;
    if (key === ' ' && !keys.spacePressed) { keys.space = true; keys.spacePressed = true; }
    if (key === 'e') handleEKey();
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'a') keys.a = false;
    if (key === 'd') keys.d = false;
    if (key === 's') keys.s = false;
    if (key === 'w') keys.w = false;
    if (key === ' ') { keys.space = false; keys.spacePressed = false; }
});
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (!player.isDashing && now - player.lastDashTime > player.dashCooldown) {
        player.isAttacking = false; 
        player.attackTimer = 0;     
        startDash();
    }
});
// [SECTION 4] 플레이어 객체 정의 (Player Object)
const player = {
    x: 100, y: 500, width: 60, height: 60,
    dx: 0, dy: 0,
    speed: 7, jumpForce: 16, gravity: 0.8, friction: 0.8,
    grounded: false, jumpCount: 0, maxJumps: 2,
    isDescending: false, isDashing: false, isInvincible: false,
    state: 'idle', direction: 'right',
    
    // 공격 데이터
    isAttacking: false, attackFrame: 1, attackTimer: 0, hasAirAttacked: false,
    
    // 추가된 타이머: 점프 직후 가속 중첩 방지용
    jumpTimer: 0, 

    // 스킬 쿨타임 및 데이터
    dashSpeed: 18, dashDuration: 120, dashCooldown: 600, lastDashTime: 0,
    teleportCooldown: 3000, lastTeleportTime: 0
};

const camera = { x: 0, y: 0 };

// [SECTION 5] 지형 데이터 (Map / Platforms)
const platforms = [
    { x: 0, y: 670, width: 3000, height: 50, isGround: true }, // 메인 바닥
    { x: 300, y: 520, width: 200, height: 20 },
    { x: 600, y: 400, width: 250, height: 20 },
    { x: 1000, y: 300, width: 200, height: 20 },
    { x: 1400, y: 450, width: 300, height: 20 },
    { x: 1800, y: 350, width: 200, height: 20 }
];

// [SECTION 6] 물리 연산 및 업데이트 (Update Logic)
// [SECTION 6] 물리 연산 및 업데이트 (Update Logic)
function update() {
    updateAfterimages();
    if (player.isDashing) createAfterimage();

    // 6-1: 공격 처리
    if (keys.mouseLeft && !player.isDashing) {
        if (player.grounded) {
            player.isAttacking = true;
            player.dx *= 0.3; 
            if (player.attackTimer <= 0) {
                player.attackFrame = (player.attackFrame === 1) ? 2 : 1;
                player.attackTimer = 10;
            }
        } else if (!player.hasAirAttacked && keys.mouseLeftPressed) {
            player.isAttacking = true;
            player.hasAirAttacked = true;
            
            // 점프 후 어느 정도 시간이 지났을 때만 반동 적용 (이전 중첩 방지 유지)
            if (player.jumpTimer > 6) {
                player.dy = -9; 
            }
            
            player.dx *= 0.2;
            player.attackFrame = 1;
            player.attackTimer = 15;
            keys.mouseLeftPressed = false; 
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
            let moveSpeed = player.isAttacking ? player.speed * 0.2 : player.speed;
            player.dx = -moveSpeed;
            player.direction = 'left';
        } else if (keys.d) {
            let moveSpeed = player.isAttacking ? player.speed * 0.2 : player.speed;
            player.dx = moveSpeed;
            player.direction = 'right';
        } else {
            player.dx *= player.friction;
            if (Math.abs(player.dx) < 0.5) player.dx = 0;
        }
    }

    // 6-3: 애니메이션 상태 결정
    if (player.isAttacking) {
        if (player.grounded) {
            player.state = `attack${player.attackFrame}`;
        } else {
            let airFrame = (player.attackTimer > 7) ? 1 : 2;
            player.state = `jump_attack${airFrame}`;
        }
    } else if (player.isDashing) {
        player.state = 'walk';
    } else if (!player.grounded) {
        player.state = (player.dy < 0) ? 'jump1' : 'jump2';
    } else {
        player.state = (keys.a || keys.d) ? 'walk' : 'idle';
    }

    // 6-4: 수직 이동 및 중력 (중요 수정 포인트!)
    if (!player.isDashing) {
        if (keys.space && player.jumpCount < player.maxJumps) {
            if (keys.s && player.grounded) {
                player.isDescending = true;
                player.grounded = false;
                player.y += 10;
            } else {
                player.dy = -player.jumpForce;
                player.jumpCount++;
                player.grounded = false;
                player.jumpTimer = 0;
                keys.mouseLeftPressed = false; 
            }
            keys.space = false;
        }
        
        if (!player.grounded) player.jumpTimer++;

        // --- 수정된 중력 로직 ---
        // 하강 중(dy >= 0)이면서 공격 중일 때만 중력을 줄여 체공 효과를 줍니다.
        // 상승 중(dy < 0)일 때는 공격 여부와 상관없이 100% 중력을 적용해 높이 튀는 것을 막습니다.
        let gravityForce = (player.isAttacking && player.dy >= 0) ? player.gravity * 0.4 : player.gravity;
        player.dy += gravityForce;
    } else {
        player.dy = 0;
    }

    player.x += player.dx;
    player.y += player.dy;

    // 6-5: 지형 충돌 처리
    player.grounded = false;
    platforms.forEach(plat => {
        if (player.x + player.width > plat.x && player.x < plat.x + plat.width &&
            player.y + player.height <= plat.y + 10 && player.y + player.height + player.dy >= plat.y) {
            if (!player.isDescending) {
                player.y = plat.y - player.height;
                player.dy = 0;
                player.grounded = true;
                player.jumpCount = 0;
                player.jumpTimer = 0;
                player.hasAirAttacked = false; 
            }
        }
    });
    if (player.dy > 5) player.isDescending = false;

    // 6-6: 카메라 및 경계 설정
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > world.width) player.x = world.width - player.width;
    camera.x = player.x - canvas.width / 2 + player.width / 2;
    if (camera.x < 0) camera.x = 0;
    if (camera.x > world.width - canvas.width) camera.x = world.width - canvas.width;

    projectile.update();
    draw();
    requestAnimationFrame(update);
}
// [SECTION 7] 렌더링 (Rendering)
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, 0);

    // 7-1: 배경 및 플랫폼
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, world.width, world.height);
    platforms.forEach(plat => {
        ctx.fillStyle = plat.isGround ? '#654321' : '#4A4A4A';
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
    });

    // 7-2: 잔상
    if (typeof afterimages !== 'undefined') {
        afterimages.forEach(img => {
            drawSprite(img.imageKey, img.x, img.y, img.width, img.height, img.direction, img.opacity);
        });
    }

    // 7-3: 플레이어 현재 이미지 키 결정
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
        currentKey = `PLAYER_MOVE${player.moveFrame}`;
        player.state = 'walk';
    } else {
        currentKey = 'PLAYER_STAND';
        player.moveTimer = 0;
        player.state = 'idle';
    }

    player.currentDrawingKey = currentKey;

    // --- 수치 계산 (중첩 수치 정확히 유지) ---
    let drawWidth = player.width;
    let drawHeight = player.height * 1.3; // 기본 1.3배

    if (player.isAttacking) {
        if (currentKey === 'ATTACK2' || currentKey === 'JUMP_ATTACK2') {
            drawWidth *= 1.69;  // 1.3 * 1.3
            drawHeight *= 1.32; // 1.1 * 1.2
        } else {
            drawWidth *= 1.3;
            drawHeight *= 1.1;
        }
    } else if (player.state === 'walk') {
        drawWidth *= 1.3; // 이동 중 가로 1.2배
    }

    let drawX = player.x - (drawWidth - player.width) / 2;
    let drawY = (player.y + player.height) - drawHeight;

    drawSprite(currentKey, drawX, drawY, drawWidth, drawHeight, player.direction, player.isInvincible ? 0.6 : 1);

    // 7-4: 투사체
    if (typeof projectile !== 'undefined' && projectile.active) {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(projectile.x + 10, projectile.y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    if (typeof drawUI === 'function') drawUI();
}

/** 렌더링 도우미 */
function drawSprite(key, x, y, w, h, dir, alpha) {
    const img = sprites[key];
    
    // 핵심 변경: 이미지가 완벽히 준비되지 않았다면 'STAND' 이미지를 대신 그려서 붉은색 방지
    const fallbackImg = sprites['PLAYER_STAND'];
    const targetImg = (img && img.complete && img.naturalWidth !== 0) ? img : fallbackImg;

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
        // 모든 수단이 실패했을 때만 붉은색 (보통 발생 안 함)
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
        ctx.fillRect(x, y, w, h);
    }
}
// [SECTION 8] 투사체 시스템 (Projectile)
const projectile = {
    active: false,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    dx: 0,
    dy: 0,
    speed: 15,       // 초기 발사 속도 (기존 25에서 15로 하향 조절)
    friction: 0.96,  // 마찰력 (1에 가까울수록 천천히 느려짐, 0.9가량이면 금방 멈춤)
    timer: 0,
    maxLife: 200,    // 투사체 유지 시간

    launch: function(pX, pY, pDir) {
        this.active = true;
        this.x = pX + 20;
        this.y = pY + 20;
        this.timer = 0;
        
        // 바라보는 방향으로 초기 속도 부여
        this.dx = (pDir === 'right' ? 1 : -1) * this.speed;
        this.dy = 0;
    },

    update: function() {
        if (!this.active) return;

        // 마찰력 적용: 매 프레임마다 속도를 줄임
        this.dx *= this.friction;
        this.dy *= this.friction;

        // 위치 업데이트
        this.x += this.dx;
        this.y += this.dy;

        // 속도가 거의 0에 가까워지거나 시간이 다 되면 소멸 (원할 경우)
        if (++this.timer > this.maxLife || Math.abs(this.dx) < 0.1) {
            // this.active = false; // 멈췄을 때 바로 없애고 싶으면 주석 해제
        }
    }
};
// [SECTION 9] 대시 및 순간이동 (Skills)
function startDash() {
    player.isDashing = true;
    player.isInvincible = true;
    player.lastDashTime = Date.now();
    
    // 공격 캔슬 확인 사살 및 대시 속도 부여
    const dashDir = (player.direction === 'right' ? 1 : -1);
    player.dx = dashDir * player.dashSpeed;
    
    setTimeout(() => {
        player.isDashing = false;
        player.isInvincible = false;
    }, player.dashDuration);
}

function handleEKey() {
    const now = Date.now();
    if (projectile.active) {
        player.x = projectile.x;
        player.y = projectile.y;
        player.dy = 0;
        projectile.active = false;
    } else if (now - player.lastTeleportTime > player.teleportCooldown) {
        projectile.launch(player.x, player.y, player.direction);
        player.lastTeleportTime = now;
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

// [START] 게임 엔진 구동
loadAssets(() => { update(); });