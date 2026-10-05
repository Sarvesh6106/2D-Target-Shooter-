/**
 * Cyber Target Shooter - 2D Canvas Game
 * Clean, modular Vanilla JS implementation.
 */

// --- Game Engine Setup & State ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('gameContainer');

// UI DOM Elements
const hudScore = document.getElementById('hudScore');
const hudLives = document.getElementById('hudLives');
const hudTimer = document.getElementById('hudTimer');
const hudAccuracy = document.getElementById('hudAccuracy');
const hudHighScore = document.getElementById('hudHighScore');
const pauseBtn = document.getElementById('pauseBtn');

// Screens
const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const pauseRestartBtn = document.getElementById('pauseRestartBtn');
const restartBtn = document.getElementById('restartBtn');
const quitBtn = document.getElementById('quitBtn');
const gameOverQuitBtn = document.getElementById('gameOverQuitBtn');

// Game Over DOM
const finalScore = document.getElementById('finalScore');
const finalAccuracy = document.getElementById('finalAccuracy');
const finalHits = document.getElementById('finalHits');
const finalHighScore = document.getElementById('finalHighScore');
const startHighScore = document.getElementById('startHighScore');
const newRecordBanner = document.getElementById('newRecordBanner');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverBadge = document.getElementById('gameOverBadge');

// Game States
const STATE = {
    START: 'START',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER'
};

let currentState = STATE.START;

// Game Metrics & Variables
let score = 0;
let lives = 3;
let timer = 60; // 60 seconds game timer
let shotsFired = 0;
let shotsHit = 0;
let highScore = parseInt(localStorage.getItem('cyber_shooter_highscore')) || 0;

let lastTime = 0;
let spawnTimer = 0;
let spawnInterval = 1.3; // Seconds between target spawns
let timerAccumulator = 0;

// Input State
const mouse = {
    x: 0,
    y: 0,
    down: false
};

// --- Web Audio API Synthesizer (No external assets required) ---
class SoundManager {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playShoot() {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.12);
            
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.12);
        } catch (e) {}
    }

    playHit() {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.08);
            osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.2);
            
            gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
        } catch (e) {}
    }

    playLifeLost() {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, this.ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 0.35);
            
            gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.35);
        } catch (e) {}
    }
}

const sounds = new SoundManager();

// --- Responsive Canvas Resizing ---
function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Position mouse initially at canvas center if not moved yet
    if (mouse.x === 0 && mouse.y === 0) {
        mouse.x = canvas.width / 2;
        mouse.y = canvas.height / 2;
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Update High Score Display
hudHighScore.textContent = highScore;
startHighScore.textContent = highScore;

// --- Entity Classes ---

// Background Starfield Particle
class Star {
    constructor() {
        this.reset(true);
    }

    reset(initial = false) {
        this.x = Math.random() * canvas.width;
        this.y = initial ? Math.random() * canvas.height : -10;
        this.size = Math.random() * 2 + 0.5;
        this.speed = Math.random() * 45 + 15;
        this.opacity = Math.random() * 0.7 + 0.3;
    }

    update(dt) {
        this.y += this.speed * dt;
        if (this.y > canvas.height + 10) {
            this.reset(false);
        }
    }

    draw() {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Turret Class
class Turret {
    constructor() {
        this.barrelLength = 45;
        this.width = 36;
        this.recoil = 0;
        this.angle = -Math.PI / 2;
    }

    get x() { return canvas.width / 2; }
    get y() { return canvas.height - 35; }

    update(dt) {
        // Calculate aiming angle based on mouse
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        this.angle = Math.atan2(dy, dx);

        // Clamp angle so turret cannot point below horizon
        const maxAngle = -Math.PI + 0.15;
        const minAngle = -0.15;
        if (this.angle < maxAngle) this.angle = maxAngle;
        if (this.angle > minAngle && this.angle < Math.PI / 2) this.angle = minAngle;

        // Smooth recoil recovery
        if (this.recoil > 0) {
            this.recoil = Math.max(0, this.recoil - dt * 60);
        }
    }

    fire() {
        this.recoil = 12; // Recoil offset in pixels
    }

    getMuzzlePosition() {
        const effectiveLength = this.barrelLength - this.recoil;
        return {
            x: this.x + Math.cos(this.angle) * effectiveLength,
            y: this.y + Math.sin(this.angle) * effectiveLength
        };
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Base platform aura
        const baseGlow = ctx.createRadialGradient(0, 0, 5, 0, 0, 45);
        baseGlow.addColorStop(0, 'rgba(0, 242, 254, 0.4)');
        baseGlow.addColorStop(1, 'rgba(0, 242, 254, 0)');
        ctx.fillStyle = baseGlow;
        ctx.beginPath();
        ctx.arc(0, 0, 45, 0, Math.PI * 2);
        ctx.fill();

        // Base dome
        ctx.fillStyle = '#161c33';
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 10, 32, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Rotating Barrel
        ctx.save();
        ctx.rotate(this.angle);

        // Barrel shadow / recoil shift
        const barrelRecoilX = -this.recoil;
        ctx.fillStyle = '#00f2fe';
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 12;
        ctx.fillRect(barrelRecoilX, -this.width / 4, this.barrelLength, this.width / 2);

        // Dark inner barrel accent
        ctx.fillStyle = '#0a0d1a';
        ctx.fillRect(barrelRecoilX + 5, -this.width / 6, this.barrelLength - 10, this.width / 3);

        ctx.restore();

        // Center Pivot Gem
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, 5, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Bullet Class
class Bullet {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.speed = 900; // Pixels per second
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.radius = 4;
        this.trail = [];
        this.maxTrail = 6;
        this.toRemove = false;
    }

    update(dt) {
        // Record trail positions
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrail) {
            this.trail.shift();
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Boundary check
        if (this.x < -20 || this.x > canvas.width + 20 || this.y < -20 || this.y > canvas.height + 20) {
            this.toRemove = true;
        }
    }

    draw() {
        // Render Trail
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            const progress = i / this.trail.length;
            ctx.fillStyle = `rgba(0, 242, 254, ${progress * 0.6})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.radius * progress, 0, Math.PI * 2);
            ctx.fill();
        }

        // Bullet Glow & Core
        ctx.save();
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Target Class
class Target {
    constructor(speedMultiplier = 1) {
        this.radius = Math.floor(Math.random() * 14) + 18; // Radius between 18 and 32
        this.x = Math.random() * (canvas.width - this.radius * 4) + this.radius * 2;
        this.y = -this.radius * 2;

        // Velocity scaled by game progression
        const baseSpeed = Math.random() * 60 + 70;
        this.speedY = baseSpeed * speedMultiplier;
        
        // Slight horizontal sway movement
        this.swayFreq = Math.random() * 2 + 1;
        this.swayAmp = Math.random() * 40 + 10;
        this.startX = this.x;
        this.time = Math.random() * 100;

        // Color palette choices
        const colorSchemes = [
            { ring1: '#ff0844', ring2: '#ff4e50', core: '#ffffff' }, // Neon Red
            { ring1: '#00f2fe', ring2: '#4facfe', core: '#ffffff' }, // Cyber Cyan
            { ring1: '#ffb199', ring2: '#ff0844', core: '#ffcc00' }, // Gold Pink
            { ring1: '#9b51e0', ring2: '#e0c3fc', core: '#ffffff' }  // Purple Plasma
        ];
        this.color = colorSchemes[Math.floor(Math.random() * colorSchemes.length)];
        
        // Higher score value for smaller, faster targets
        this.points = Math.round((40 - this.radius) * 5 * speedMultiplier);
        this.toRemove = false;
        this.breachedBottom = false;
        this.pulse = 0;
    }

    update(dt) {
        this.time += dt;
        this.y += this.speedY * dt;
        this.x = this.startX + Math.sin(this.time * this.swayFreq) * this.swayAmp;
        
        // Clamp X to canvas boundaries
        if (this.x - this.radius < 10) this.x = this.radius + 10;
        if (this.x + this.radius > canvas.width - 10) this.x = canvas.width - this.radius - 10;

        // Check if reached player area / bottom
        if (this.y + this.radius >= canvas.height - 50) {
            this.breachedBottom = true;
            this.toRemove = true;
        }

        this.pulse += dt * 4;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        const pulseScale = 1 + Math.sin(this.pulse) * 0.05;

        // Outer Glow
        ctx.shadowColor = this.color.ring1;
        ctx.shadowBlur = 12;

        // Outer Ring
        ctx.fillStyle = this.color.ring1;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // Middle Ring
        ctx.fillStyle = '#0a0c16';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.7 * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // Inner Accent Ring
        ctx.fillStyle = this.color.ring2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.45 * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // Center Bullseye Dot
        ctx.fillStyle = this.color.core;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.2 * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Particle FX (Explosion & Hit visual flair)
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 250 + 50;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = Math.random() * 3.5 + 1.5;
        this.alpha = 1;
        this.decay = Math.random() * 2.5 + 1.5;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.alpha -= this.decay * dt;
    }

    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Scaling Explosion Shockwave Ring
class Shockwave {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 10;
        this.maxRadius = 55;
        this.alpha = 1;
        this.speed = 180;
    }

    update(dt) {
        this.radius += this.speed * dt;
        this.alpha = 1 - (this.radius / this.maxRadius);
    }

    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.strokeStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// Floating Score / Warning Popups
class FloatingText {
    constructor(x, y, text, color = '#00f2fe') {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.alpha = 1;
        this.vy = -60;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.alpha -= 1.2 * dt;
    }

    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.font = '700 18px "Rajdhani", sans-serif';
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// --- Master Game Object Collection ---
let stars = [];
let turret = new Turret();
let bullets = [];
let targets = [];
let particles = [];
let shockwaves = [];
let floatingTexts = [];

// Initialize Starfield background
for (let i = 0; i < 70; i++) {
    stars.push(new Star());
}

// --- Helper & Utility Functions ---

function updateHUD() {
    hudScore.textContent = score;
    hudTimer.textContent = `${Math.ceil(timer)}s`;
    
    // Timer Warning Style
    const timerCard = hudTimer.parentElement;
    if (timer <= 10) {
        timerCard.classList.add('warning');
    } else {
        timerCard.classList.remove('warning');
    }

    // Hearts HUD
    const hearts = hudLives.querySelectorAll('.heart');
    hearts.forEach((heart, idx) => {
        if (idx < lives) {
            heart.classList.remove('lost');
        } else {
            heart.classList.add('lost');
        }
    });

    // Accuracy
    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 100;
    hudAccuracy.textContent = `${accuracy}%`;

    // High Score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('cyber_shooter_highscore', highScore);
        hudHighScore.textContent = highScore;
    }
}

function triggerExplosion(x, y, color) {
    for (let i = 0; i < 20; i++) {
        particles.push(new Particle(x, y, color));
    }
    shockwaves.push(new Shockwave(x, y, color));
}

function shootBullet() {
    if (currentState !== STATE.PLAYING) return;

    sounds.init();
    turret.fire();
    const muzzle = turret.getMuzzlePosition();
    bullets.push(new Bullet(muzzle.x, muzzle.y, turret.angle));
    shotsFired++;
    sounds.playShoot();
    updateHUD();
}

function startGame() {
    sounds.init();
    score = 0;
    lives = 3;
    timer = 60;
    shotsFired = 0;
    shotsHit = 0;
    spawnTimer = 0;
    bullets = [];
    targets = [];
    particles = [];
    shockwaves = [];
    floatingTexts = [];

    currentState = STATE.PLAYING;

    startScreen.classList.remove('active');
    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    updateHUD();
}

function pauseGame() {
    if (currentState === STATE.PLAYING) {
        currentState = STATE.PAUSED;
        pauseScreen.classList.remove('hidden');
        pauseScreen.classList.add('active');
    } else if (currentState === STATE.PAUSED) {
        resumeGame();
    }
}

function resumeGame() {
    if (currentState === STATE.PAUSED) {
        currentState = STATE.PLAYING;
        pauseScreen.classList.remove('active');
        pauseScreen.classList.add('hidden');
        lastTime = performance.now();
    }
}

function quitToMainMenu() {
    currentState = STATE.START;

    pauseScreen.classList.remove('active');
    pauseScreen.classList.add('hidden');
    gameOverScreen.classList.remove('active');
    gameOverScreen.classList.add('hidden');

    startScreen.classList.remove('hidden');
    startScreen.classList.add('active');

    bullets = [];
    targets = [];
    particles = [];
    shockwaves = [];
    floatingTexts = [];

    startHighScore.textContent = highScore;
}

function gameOver(reason = 'time') {
    currentState = STATE.GAMEOVER;

    const isNewRecord = score > 0 && score >= highScore;
    if (isNewRecord) {
        highScore = score;
        localStorage.setItem('cyber_shooter_highscore', highScore);
        newRecordBanner.classList.remove('hidden');
    } else {
        newRecordBanner.classList.add('hidden');
    }

    if (reason === 'lives') {
        gameOverBadge.textContent = 'NO LIVES LEFT!';
        gameOverTitle.innerHTML = 'MISSION <span class="highlight-danger">FAILED</span>';
    } else {
        gameOverBadge.textContent = "TIME'S UP!";
        gameOverTitle.innerHTML = 'GAME <span class="highlight">OVER</span>';
    }

    finalScore.textContent = score;
    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 100;
    finalAccuracy.textContent = `${accuracy}%`;
    finalHits.textContent = shotsHit;
    finalHighScore.textContent = highScore;

    gameOverScreen.classList.remove('hidden');
    gameOverScreen.classList.add('active');
}

// --- Input Controls ---
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && currentState === STATE.PLAYING) {
        // Only shoot if not clicking UI buttons
        if (e.target === canvas) {
            shootBullet();
        }
    }
});

// Key Press Listeners
window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
        pauseGame();
    }
});

// UI Event Listeners
startBtn.addEventListener('click', startGame);
resumeBtn.addEventListener('click', resumeGame);
pauseBtn.addEventListener('click', pauseGame);
pauseRestartBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
quitBtn.addEventListener('click', quitToMainMenu);
gameOverQuitBtn.addEventListener('click', quitToMainMenu);

// Prevent context menu on game canvas
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- Main Physics Update Loop ---
function update(dt) {
    // Background stars update in all states for visual atmosphere
    stars.forEach(star => star.update(dt));

    if (currentState !== STATE.PLAYING) return;

    // Timer Countdown
    timer -= dt;
    if (timer <= 0) {
        timer = 0;
        updateHUD();
        gameOver('time');
        return;
    }

    // Update Turret
    turret.update(dt);

    // Target Spawning Mechanics (Speed increases with higher score)
    const currentSpeedMultiplier = 1 + Math.min(score / 800, 2.5); // Max 3.5x speed scaling
    spawnInterval = Math.max(0.45, 1.3 - (score / 1500)); // Dynamic spawn rate
    
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        targets.push(new Target(currentSpeedMultiplier));
    }

    // Update Bullets
    bullets.forEach(bullet => bullet.update(dt));
    bullets = bullets.filter(b => !b.toRemove);

    // Update Targets
    targets.forEach(target => {
        target.update(dt);

        if (target.breachedBottom) {
            lives--;
            sounds.playLifeLost();
            floatingTexts.push(new FloatingText(target.x, canvas.height - 70, 'LIFE LOST!', '#ff0844'));
            triggerExplosion(target.x, canvas.height - 40, '#ff0844');
            updateHUD();

            if (lives <= 0) {
                gameOver('lives');
            }
        }
    });
    targets = targets.filter(t => !t.toRemove);

    // Bullet-Target Collision Detection
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        for (let j = targets.length - 1; j >= 0; j--) {
            const t = targets[j];
            const dist = Math.hypot(b.x - t.x, b.y - t.y);

            // Radius collision check
            if (dist < b.radius + t.radius) {
                // Bullet hit target!
                shotsHit++;
                score += t.points;
                sounds.playHit();

                triggerExplosion(t.x, t.y, t.color.ring1);
                floatingTexts.push(new FloatingText(t.x, t.y, `+${t.points}`, t.color.ring1));

                b.toRemove = true;
                t.toRemove = true;
                updateHUD();
                break;
            }
        }
    }

    // Update Particle FX
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => p.alpha > 0);

    shockwaves.forEach(s => s.update(dt));
    shockwaves = shockwaves.filter(s => s.alpha > 0);

    floatingTexts.forEach(ft => ft.update(dt));
    floatingTexts = floatingTexts.filter(ft => ft.alpha > 0);
}

// --- Custom Crosshair Renderer ---
function drawCrosshair() {
    if (currentState !== STATE.PLAYING && currentState !== STATE.PAUSED) return;

    ctx.save();
    ctx.translate(mouse.x, mouse.y);

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 8;

    // Check if aiming at any target
    let targetLocked = false;
    for (const t of targets) {
        if (Math.hypot(mouse.x - t.x, mouse.y - t.y) < t.radius) {
            targetLocked = true;
            break;
        }
    }

    if (targetLocked) {
        ctx.strokeStyle = '#ff0844';
        ctx.shadowColor = '#ff0844';
    }

    // Outer rotating reticle ring
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs lines
    ctx.beginPath();
    ctx.moveTo(-22, 0); ctx.lineTo(-10, 0);
    ctx.moveTo(10, 0);  ctx.lineTo(22, 0);
    ctx.moveTo(0, -22); ctx.lineTo(0, -10);
    ctx.moveTo(0, 10);  ctx.lineTo(0, 22);
    ctx.stroke();

    // Center Aim Dot
    ctx.fillStyle = targetLocked ? '#ff0844' : '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// --- Main Render Loop ---
function render() {
    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background Elements
    stars.forEach(star => star.draw());

    // Draw Shockwaves & Particles
    shockwaves.forEach(s => s.draw());
    particles.forEach(p => p.draw());

    // Draw Targets
    targets.forEach(target => target.draw());

    // Draw Bullets
    bullets.forEach(bullet => bullet.draw());

    // Draw Floating Text FX
    floatingTexts.forEach(ft => ft.draw());

    // Draw Turret
    turret.draw();

    // Draw Custom Crosshair
    drawCrosshair();
}

// --- Animation Loop ---
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // Clamp dt to max 100ms
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

// Start Game Engine Loop
requestAnimationFrame(gameLoop);
