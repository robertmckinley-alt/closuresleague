/* ============================================================================
 * effects.jsx — Confetti, Achievement banners, Flash overlays.
 * Premium / Apple+F1, not casino. Pure-CSS / canvas, no deps.
 * ============================================================================ */
(function () {
  const { useState, useEffect, useRef } = React;
  const C = window.BclCore;

  // ---------- Confetti (canvas) ----------
  function ConfettiBurst({ id, palette }) {
    const ref = useRef(null);
    useEffect(() => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width = window.innerWidth;
      const H = canvas.height = window.innerHeight;
      const colors = palette || ['#10b981','#34d399','#eab308','#a78bfa','#ef4444','#0ea5e9','#fff'];
      const N = 120;
      const parts = Array.from({ length: N }).map(() => {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 0.6);
        const speed = 8 + Math.random() * 10;
        return {
          x: W * (0.18 + Math.random() * 0.64),
          y: H * 0.18 + Math.random() * H * 0.05,
          vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1),
          vy: Math.sin(angle) * speed,
          g: 0.32 + Math.random() * 0.18,
          r: 4 + Math.random() * 6,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.4,
          c: colors[Math.floor(Math.random() * colors.length)],
          a: 1,
          shape: Math.random() < 0.5 ? 'rect' : 'circle',
        };
      });
      let raf = 0; const T0 = performance.now();
      function tick(t) {
        const elapsed = t - T0;
        ctx.clearRect(0, 0, W, H);
        parts.forEach(p => {
          p.vy += p.g;
          p.x += p.vx; p.y += p.vy;
          p.rot += p.vr;
          if (elapsed > 1200) p.a = Math.max(0, p.a - 0.02);
          ctx.save();
          ctx.globalAlpha = p.a;
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          if (p.shape === 'rect') ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r * 0.6);
          else { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.5, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        });
        if (elapsed < 2400) raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [id]);
    return <canvas ref={ref} className="confetti-host" />;
  }

  // ---------- Toast / Achievement banner ----------
  function AchievementBanner({ event, onClose }) {
    // Auto-dismiss after 6s (gives time to read + tap X).
    useEffect(() => {
      const t = setTimeout(onClose, 6000);
      return () => clearTimeout(t);
    }, [event, onClose]);
    const palette = event.palette || 'ink';
    const grad = palette === 'gold' ? 'gold-grad'
      : palette === 'fire' ? 'fire-grad'
      : palette === 'plat' ? 'plat-grad'
      : palette === 'emerald' ? 'emerald-grad'
      : 'ink-grad';
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] no-print" style={{ pointerEvents: 'none' }}>
        <div className={`banner-in ${grad} text-white rounded-xl pl-5 pr-2 py-3 flex items-center gap-3 shadow-2xl`}
             style={{
               minWidth: 320, maxWidth: '92vw',
               boxShadow: '0 12px 36px rgba(15,23,42,.32), inset 0 1px 0 rgba(255,255,255,.18)',
               pointerEvents: 'auto',
             }}>
          <div className="text-[26px] crown-glow flex-shrink-0">{event.icon || '🏆'}</div>
          <div className="leading-tight flex-1 min-w-0">
            <div className="font-display text-[15px] font-semibold tracking-tight">{event.title}</div>
            {event.subtitle && <div className="text-[11px] font-mono opacity-90 mt-0.5">{event.subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Dismiss notification"
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/15 transition text-[18px] leading-none focus:outline-none focus:ring-2 focus:ring-white/40"
            style={{ marginLeft: 4 }}
          >×</button>
        </div>
      </div>
    );
  }

  // ---------- Effects host ----------
  function EffectsHost({ emitter }) {
    const [banners, setBanners] = useState([]);
    const [confetti, setConfetti] = useState([]);
    useEffect(() => {
      const off = emitter.on((evt) => {
        const id = Math.random().toString(36).slice(2);
        setBanners(b => [...b, { id, ...evt }]);
        if (evt.confetti) setConfetti(c => [...c, { id, palette: evt.palette === 'gold' ? ['#fbbf24','#eab308','#fff'] : null }]);
        try {
          if (evt.kind === 'newLeader') C.Audio.newLeader();
          else if (evt.kind === 'goalHit') C.Audio.goalHit();
          else if (evt.kind === 'badge') C.Audio.badgeEarned();
          else if (evt.kind === 'teamHit') C.Audio.teamHit();
          else if (evt.kind === 'rankUp') C.Audio.rankUp();
        } catch (e) {}
      });
      return off;
    }, [emitter]);
    const dismissBanner = (id) => setBanners(b => b.filter(x => x.id !== id));
    const dismissConfetti = (id) => setConfetti(c => c.filter(x => x.id !== id));
    return (
      <React.Fragment>
        {/* Stack multiple banners vertically so newest sits on top */}
        <div className="fixed top-0 left-0 right-0 flex flex-col items-center gap-2 pt-3 z-[70] no-print" style={{ pointerEvents: 'none' }}>
          {banners.map(b => (
            <div key={b.id} style={{ pointerEvents: 'auto' }}>
              <AchievementBannerStacked event={b} onClose={() => dismissBanner(b.id)} />
            </div>
          ))}
        </div>
        {confetti.map((c) => (
          <React.Fragment key={c.id}>
            <ConfettiBurst id={c.id} palette={c.palette} />
            <DismissAfter ms={2400} onDone={() => dismissConfetti(c.id)} />
          </React.Fragment>
        ))}
      </React.Fragment>
    );
  }

  // Same look as AchievementBanner but rendered inside a flow container (no fixed positioning).
  function AchievementBannerStacked({ event, onClose }) {
    useEffect(() => {
      const t = setTimeout(onClose, 6000);
      return () => clearTimeout(t);
    }, [event, onClose]);
    const palette = event.palette || 'ink';
    const grad = palette === 'gold' ? 'gold-grad'
      : palette === 'fire' ? 'fire-grad'
      : palette === 'plat' ? 'plat-grad'
      : palette === 'emerald' ? 'emerald-grad'
      : 'ink-grad';
    return (
      <div
        className={`banner-in ${grad} text-white rounded-xl pl-5 pr-2 py-3 flex items-center gap-3 shadow-2xl`}
        style={{
          minWidth: 320, maxWidth: '92vw',
          boxShadow: '0 12px 36px rgba(15,23,42,.32), inset 0 1px 0 rgba(255,255,255,.18)',
        }}
      >
        <div className="text-[26px] crown-glow flex-shrink-0">{event.icon || '🏆'}</div>
        <div className="leading-tight flex-1 min-w-0">
          <div className="font-display text-[15px] font-semibold tracking-tight">{event.title}</div>
          {event.subtitle && <div className="text-[11px] font-mono opacity-90 mt-0.5">{event.subtitle}</div>}
        </div>
        <button
          onClick={onClose}
          aria-label="Dismiss notification"
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/15 transition text-[18px] leading-none focus:outline-none focus:ring-2 focus:ring-white/40"
          style={{ marginLeft: 4 }}
        >×</button>
      </div>
    );
  }

  function DismissAfter({ ms, onDone }) {
    useEffect(() => { const t = setTimeout(onDone, ms); return () => clearTimeout(t); }, []);
    return null;
  }

  function CrownBadge() {
    return <span className="crown-glow" style={{ fontSize: 14 }}>👑</span>;
  }

  window.BclEffects = { ConfettiBurst, AchievementBanner, EffectsHost, CrownBadge };
})();
