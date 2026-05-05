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
    JUMP_ATTACK2: './assets/images/player_jump_attack2.png',
    STORY1: './assets/images/player_story1.png'  // 스탠딩 일러스트
};

const sprites = {};
let imagesLoaded = 0;

function loadAssets(callback) {
    const keys = Object.keys(ASSETS);
    if (keys.length === 0) return callback();

    keys.forEach(key => {
        const img = new Image();
        img.src = ASSETS[key];
        img.decode().then(() => {
            sprites[key] = img;
            imagesLoaded++;
            if (imagesLoaded === keys.length) callback();
        }).catch(() => {
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
        keys.mouseLeftPressed = true;
    }
});
window.addEventListener('mouseup', (e) => { 
    if (e.button === 0) {
        keys.mouseLeft = false; 
        keys.mouseLeftPressed = false;
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
    if (key === 'f') handleFKey();  // 대화 상호작용
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
    { x: 0, y: 670, width: 3000, height: 50, isGround: true },
    { x: 300, y: 520, width: 200, height: 20 },
    { x: 600, y: 400, width: 250, height: 20 },
    { x: 1000, y: 300, width: 200, height: 20 },
    { x: 1400, y: 450, width: 300, height: 20 },
    { x: 1800, y: 350, width: 200, height: 20 }
];

// 표지판 데이터
const signs = [
    {
        x: 350, y: 630,
        width: 30, height: 40,
        interactRange: 80,
        dialogue: [
            { speaker: '???', text: '너탁경구.' },
            { speaker: '???', text: 'F키를 눌러서 대화를 진행할 수 있어.' },
            { speaker: '???', text: '오른쪽으로 나아가봐.' }
        ]
    }
];
// [SECTION 6] 물리 연산 및 업데이트 (Update Logic)
// [SECTION 6] 물리 연산 및 업데이트
function update() {
    updateDialogue();
    updateAfterimages();
    if (player.isDashing) createAfterimage();

    // 대화 중 이동 잠금
    if (dialogue.active) {
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
            }
        } else if (!player.hasAirAttacked && keys.mouseLeftPressed) {
            player.isAttacking = true;
            player.hasAirAttacked = true;
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

    // 6-4: 수직 이동 및 중력
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

    // 7-2: 표지판 렌더링
    signs.forEach(sign => {
        // 기둥
        ctx.fillStyle = '#8B5E3C';
        ctx.fillRect(sign.x + sign.width / 2 - 4, sign.y + sign.height * 0.5, 8, sign.height * 0.5);
        // 판
        ctx.fillStyle = '#C8A96E';
        ctx.strokeStyle = '#5C3A1E';
        ctx.lineWidth = 2;
        ctx.fillRect(sign.x, sign.y, sign.width, sign.height * 0.6);
        ctx.strokeRect(sign.x, sign.y, sign.width, sign.height * 0.6);
        // 판 위 텍스트
        ctx.fillStyle = '#3B1F0A';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', sign.x + sign.width / 2, sign.y + sign.height * 0.38);

        // 범위 내 있으면 F 안내 표시
        const playerCX = player.x + player.width / 2;
        const signCX = sign.x + sign.width / 2;
        if (Math.abs(playerCX - signCX) < sign.interactRange) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 13px monospace';
            ctx.fillText('[F]', signCX, sign.y - 10);
        }
    });
    ctx.textAlign = 'left';

    // 7-3: 잔상
    if (typeof afterimages !== 'undefined') {
        afterimages.forEach(img => {
            drawSprite(img.imageKey, img.x, img.y, img.width, img.height, img.direction, img.opacity);
        });
    }

    // 7-4: 플레이어 현재 이미지 키 결정
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

    let drawWidth = player.width;
    let drawHeight = player.height * 1.3;

    if (player.isAttacking) {
        if (currentKey === 'ATTACK2' || currentKey === 'JUMP_ATTACK2') {
            drawWidth *= 1.69;
            drawHeight *= 1.32;
        } else {
            drawWidth *= 1.3;
            drawHeight *= 1.1;
        }
    } else if (player.state === 'walk') {
        drawWidth *= 1.3;
    }

    let drawX = player.x - (drawWidth - player.width) / 2;
    let drawY = (player.y + player.height) - drawHeight;

    drawSprite(currentKey, drawX, drawY, drawWidth, drawHeight, player.direction, player.isInvincible ? 0.6 : 1);

    // 7-5: 투사체
    if (typeof projectile !== 'undefined' && projectile.active) {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(projectile.x + 10, projectile.y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    // 7-6: UI (카메라 변환 밖에서 그림)
    if (typeof drawUI === 'function') drawUI();
    if (typeof drawDialogue === 'function') drawDialogue();
}

function drawSprite(key, x, y, w, h, dir, alpha) {
    const img = sprites[key];
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
// [SECTION 11] 대화 시스템 (Dialogue System)
const dialogue = {
    active: false,
    lines: [],
    currentLine: 0,
    displayText: '',
    charIndex: 0,
    typingSpeed: 2,
    typingTimer: 0,
    isFinished: false,
    speakerName: ''
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
                dialogue.displayText = '';
                dialogue.charIndex = 0;
                dialogue.isFinished = false;
            }
        }
        return;
    }

    const playerCX = player.x + player.width / 2;
    const playerBottom = player.y + player.height; // 플레이어 발바닥 Y

    for (const sign of signs) {
        const signCX = sign.x + sign.width / 2;
        const signBottom = sign.y + sign.height;   // 표지판 바닥 Y

        const inRangeX = Math.abs(playerCX - signCX) < sign.interactRange;
        const inRangeY = playerBottom >= sign.y && playerBottom <= signBottom + 80; // 표지판 높이 ± 여유

        if (inRangeX && inRangeY) {
            const firstLine = sign.dialogue[0];
            dialogue.active = true;
            dialogue.lines = sign.dialogue;
            dialogue.currentLine = 0;
            dialogue.speakerName = firstLine.speaker || '';
            dialogue.displayText = '';
            dialogue.charIndex = 0;
            dialogue.typingTimer = 0;
            dialogue.isFinished = false;
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
        if (dialogue.charIndex >= fullText.length) {
            dialogue.isFinished = true;
        }
    }
}

function drawDialogue() {
    if (!dialogue.active) return;

    const boxH = 200;
    const boxY = canvas.height - boxH;
    const boxW = canvas.width;

    const illust = sprites['STORY1'];
    const illustH = 480;
    const illustW = 260;
    const illustX = 60;
    const illustY = canvas.height - illustH;

    if (illust && illust.complete && illust.naturalWidth !== 0) {
        ctx.drawImage(illust, illustX, illustY, illustW, illustH);
    } else {
        ctx.fillStyle = 'rgba(80, 60, 120, 0.5)';
        ctx.fillRect(illustX, illustY, illustW, illustH);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '13px monospace';
        ctx.fillText('player_story1', illustX + 10, illustY + illustH / 2);
    }

    ctx.fillStyle = 'rgba(8, 8, 18, 0.92)';
    ctx.fillRect(0, boxY, boxW, boxH);

    ctx.strokeStyle = 'rgba(160, 130, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, boxY);
    ctx.lineTo(boxW, boxY);
    ctx.stroke();

    if (dialogue.speakerName) {
        const nameBoxX = 60;
        const nameBoxY = boxY - 36;
        const nameBoxPadX = 16;
        const nameBoxPadY = 8;
        ctx.font = 'bold 15px "Malgun Gothic", sans-serif';
        const nameW = ctx.measureText(dialogue.speakerName).width + nameBoxPadX * 2;

        ctx.fillStyle = 'rgba(8, 8, 18, 0.95)';
        ctx.strokeStyle = 'rgba(160, 130, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(nameBoxX, nameBoxY, nameW, 34, [6, 6, 0, 0]);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(210, 190, 255, 1)';
        ctx.fillText(dialogue.speakerName, nameBoxX + nameBoxPadX, nameBoxY + nameBoxPadY + 13);
    }

    const textX = 80;
    const textY = boxY + 48;
    const textMaxW = boxW - 160;

    ctx.fillStyle = 'rgba(235, 230, 245, 1)';
    ctx.font = '17px "Malgun Gothic", sans-serif';
    wrapText(ctx, dialogue.displayText, textX, textY, textMaxW, 28);

    if (dialogue.isFinished) {
        const blink = Math.floor(Date.now() / 500) % 2 === 0;
        if (blink) {
            ctx.fillStyle = 'rgba(200, 175, 255, 0.9)';
            ctx.font = '13px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('▼', boxW - 30, canvas.height - 20);
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
// [START] 게임 엔진 구동
loadAssets(() => { update(); });