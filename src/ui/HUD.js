// HUD.js — manages all DOM HUD elements

export class HUD {
  constructor() {
    this.el = {
      level:       document.getElementById('hud-level'),
      score:       document.getElementById('score-display'),
      high:        document.getElementById('high-display'),
      lives:       Array.from({ length: 5 }, (_, i) => document.getElementById(`life-${i}`)),
      weapon:      document.getElementById('weapon-display'),
      radFill:     document.getElementById('rad-bar-fill'),
      zone:        document.getElementById('zone-display'),
      coinDisplay: document.getElementById('coin-display'),
      coinFill:    document.getElementById('coin-bar-fill'),
      combo:       document.getElementById('combo-display'),
      countdown:   document.getElementById('exit-countdown'),
      countdownSecs: document.getElementById('countdown-secs'),
      radWarning:  document.getElementById('rad-warning'),
      popup:       document.getElementById('popup-msg'),
      specialBar:  document.getElementById('special-bar'),
      specialLabel:document.getElementById('special-label'),
      specialFill: document.getElementById('special-fill'),
      minimap:     document.getElementById('minimap-canvas'),
    };

    this._minimapCtx = this.el.minimap?.getContext('2d');
    this._popupTimer = null;
    this._warningFlash = false;
  }

  update({ level, score, highScore, lives, weapon, radPct, inBuilding, radDangerous,
           coins, coinsNeeded, combo, exitMs, special, speedBoost, worldW, worldH,
           playerPos, zombies, doorPos, doorOpen, safeZones }) {

    if (this.el.level)  this.el.level.textContent  = level;
    if (this.el.score)  this.el.score.textContent   = String(score).padStart(7, '0');
    if (this.el.high)   this.el.high.textContent    = highScore.toLocaleString();
    if (this.el.weapon) this.el.weapon.textContent  = weapon;

    // Lives
    lives = Math.max(0, lives);
    this.el.lives.forEach((el, i) => {
      el.classList.toggle('dead', i >= lives);
    });

    // Radiation bar
    if (this.el.radFill) {
      const pct = Math.max(0, Math.min(1, radPct));
      this.el.radFill.style.width = `${pct * 100}%`;
      this.el.radFill.style.background = pct > 0.55 ? '#00ff44' : pct > 0.3 ? '#ffcc00' : '#ff2200';
    }

    // Zone
    if (this.el.zone) {
      this.el.zone.textContent = inBuilding ? 'INSIDE ☢' : 'OUTSIDE';
      this.el.zone.style.color = inBuilding ? '#ffcc00' : '#00ff88';
    }

    // Rad warning center
    if (this.el.radWarning) {
      if (inBuilding && radDangerous) {
        this.el.radWarning.style.display = 'block';
        this._warningFlash = !this._warningFlash;
        this.el.radWarning.style.opacity = this._warningFlash ? '1' : '0.3';
      } else {
        this.el.radWarning.style.display = 'none';
      }
    }

    // Coins
    if (this.el.coinDisplay) this.el.coinDisplay.textContent = `${coins} / ${coinsNeeded}`;
    if (this.el.coinFill) {
      this.el.coinFill.style.width = `${Math.min(1, coins / coinsNeeded) * 100}%`;
    }

    // Combo
    if (this.el.combo) {
      this.el.combo.textContent = combo > 1 ? `x${combo} COMBO!` : '';
    }

    // Exit countdown
    if (this.el.countdown && this.el.countdownSecs) {
      if (exitMs !== null && exitMs > 0) {
        this.el.countdown.style.display = 'block';
        const secs = Math.ceil(exitMs / 1000);
        this.el.countdownSecs.textContent = secs;
        this.el.countdown.style.color = secs > 20 ? '#ffcc00' : secs > 10 ? '#ff8800' : '#ff2200';
        this.el.countdown.style.borderColor = this.el.countdown.style.color;
        if (secs <= 10) {
          const scale = 1 + 0.05 * Math.sin(Date.now() / 120);
          this.el.countdown.style.transform = `translateX(-50%) scale(${scale})`;
        } else {
          this.el.countdown.style.transform = 'translateX(-50%)';
        }
      } else {
        this.el.countdown.style.display = 'none';
      }
    }

    // Special weapon
    if (this.el.specialBar) {
      if (special) {
        this.el.specialBar.style.display = 'flex';
        let label = special.name;
        let pct = 0;
        if (special.timer !== null) { label += ` ${special.timer}s`; pct = special.timer / 8; }
        if (special.ammo  !== null) { label += ` x${special.ammo}`;  pct = special.ammo / 30; }
        if (this.el.specialLabel) this.el.specialLabel.textContent = label;
        if (this.el.specialFill)  this.el.specialFill.style.width = `${Math.min(1, pct) * 100}%`;
        if (this.el.specialFill)  this.el.specialFill.style.background = special.name.includes('OMNI') ? '#ff8800' : '#aa00ff';
      } else {
        this.el.specialBar.style.display = 'none';
      }
    }

    // Minimap
    this._drawMinimap({ worldW, worldH, playerPos, zombies, doorPos, doorOpen, safeZones });
  }

  _drawMinimap({ worldW, worldH, playerPos, zombies, doorPos, doorOpen, safeZones }) {
    const ctx = this._minimapCtx;
    if (!ctx) return;
    const mw = 160, mh = 120;
    ctx.clearRect(0, 0, mw, mh);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, mw, mh);

    const toMapX = x => Math.round(((x + worldW / 2) / worldW) * mw);
    const toMapZ = z => Math.round(((z + worldH / 2) / worldH) * mh);

    // Safe zones (buildings) — dark green fill
    if (safeZones) {
      safeZones.forEach(sz => {
        ctx.fillStyle = 'rgba(0,80,20,0.7)';
        const x = toMapX(sz.minX), z = toMapZ(sz.minZ);
        const w = toMapX(sz.maxX) - x, h = toMapZ(sz.maxZ) - z;
        ctx.fillRect(x, z, w, h);
        ctx.strokeStyle = '#00ff44';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, z, w, h);
      });
    }

    // Zombies
    if (zombies) {
      zombies.forEach(z => {
        if (z.isDead) return;
        const cols = ['#22cc44', '#ffcc00', '#aa44ff', '#ff2200'];
        ctx.fillStyle = cols[(z.level || 1) - 1] || '#22cc44';
        ctx.fillRect(toMapX(z.position.x) - 2, toMapZ(z.position.z) - 2, 4, 4);
      });
    }

    // Door marker
    if (doorPos) {
      ctx.fillStyle = doorOpen ? '#00ff66' : '#ff4400';
      const dx = toMapX(doorPos.x), dz = toMapZ(doorPos.z);
      ctx.fillRect(dx - 4, dz - 5, 8, 10);
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(doorOpen ? '🚪' : '🔒', dx, dz + 3);
    }

    // Player — bright white square with direction indicator
    if (playerPos) {
      ctx.fillStyle = '#ffffff';
      const px = toMapX(playerPos.x), pz = toMapZ(playerPos.z);
      ctx.fillRect(px - 4, pz - 4, 8, 8);
      // Pulsing border
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 4, pz - 4, 8, 8);
    }

    // Border
    ctx.strokeStyle = '#00ff44';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, mw, mh);
  }

  popup(text, color = '#ffffff', duration = 1600) {
    if (!this.el.popup) return;
    if (this._popupTimer) clearTimeout(this._popupTimer);
    this.el.popup.textContent = text;
    this.el.popup.style.color = color;
    this.el.popup.style.opacity = '1';
    this._popupTimer = setTimeout(() => {
      if (this.el.popup) this.el.popup.style.opacity = '0';
    }, duration);
  }

  setLevel(n) {
    if (this.el.level) this.el.level.textContent = n;
  }
}

// ─── TITLE SCREEN ────────────────────────────────────────────
export class TitleScreen {
  constructor(onStart) {
    this.el = document.getElementById('title-screen');
    const hi = parseInt(localStorage.getItem('ccHighScore') || '0');
    const hiEl = document.getElementById('title-high');
    if (hiEl) hiEl.textContent = hi.toLocaleString();

    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      // Use both click and touchend for iOS compatibility
      const doStart = (e) => { e.preventDefault(); e.stopPropagation(); this.hide(); onStart(); };
      btnStart.addEventListener('click', doStart);
      btnStart.addEventListener('touchend', doStart, { passive: false });
    }

    document.getElementById('btn-scores')?.addEventListener('click', () => {
      // Simple inline high score
      alert(`HIGH SCORE: ${hi.toLocaleString()}\n\nPlay more to beat it!`);
    });

    window.addEventListener('keydown', e => {
      if ((e.code === 'Space' || e.code === 'Enter') && this.el?.style.display !== 'none') {
        this.hide();
        onStart();
      }
    }, { once: true });
  }

  hide() { if (this.el) this.el.style.display = 'none'; }
  show() { if (this.el) this.el.style.display = 'flex'; }
}

// ─── GAME OVER SCREEN ────────────────────────────────────────
export class GameOverScreen {
  constructor(onReplay, onMenu) {
    this.el = document.getElementById('gameover-screen');

    document.getElementById('btn-replay')?.addEventListener('click', onReplay);
    document.getElementById('btn-menu')?.addEventListener('click', onMenu);
  }

  show({ score, level, won }) {
    if (!this.el) return;
    this.el.style.display = 'flex';

    const title = document.getElementById('gameover-title');
    const levelEl = document.getElementById('gameover-level');
    const scoreEl = document.getElementById('gameover-score');
    const highEl  = document.getElementById('gameover-high');
    const quoteEl = document.getElementById('gameover-quote');

    if (title) {
      title.textContent = won ? '🏆 VICTORY!' : 'GAME OVER';
      title.className   = won ? 'won-title' : '';
    }
    if (levelEl) levelEl.textContent = `LEVEL ${level} ${won ? 'COMPLETE' : 'REACHED'}`;
    if (scoreEl) scoreEl.textContent = String(score).padStart(7, '0');

    const hi = parseInt(localStorage.getItem('ccHighScore') || '0');
    const isNew = score > 0 && score >= hi;
    if (highEl) highEl.textContent = isNew ? '★ NEW HIGH SCORE! ★' : `BEST: ${hi.toLocaleString()}`;
    if (highEl) highEl.style.color = isNew ? '#ffcc00' : '#666';

    const quotes = [
      '"Get in. Get out. Or get cubed."',
      '"The radiation waits for no one."',
      '"One more run. You got this."',
      '"Survive. Shoot. Unlock. Escape."',
    ];
    if (quoteEl) quoteEl.textContent = quotes[Math.floor(Math.random() * quotes.length)];

    // Keyboard shortcuts
    const handler = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') { this.hide(); document.removeEventListener('keydown', handler); }
      if (e.code === 'Escape') { this.hide(); document.removeEventListener('keydown', handler); }
    };
    document.addEventListener('keydown', handler);
  }

  hide() { if (this.el) this.el.style.display = 'none'; }
}
